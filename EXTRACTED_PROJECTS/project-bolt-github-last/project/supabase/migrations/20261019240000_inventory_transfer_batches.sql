-- Source-adapted batch transfer. The existing transfer_inventory(uuid,uuid,uuid,numeric,text,text)
-- command remains unchanged; this envelope records multi-item batches atomically.
CREATE TABLE IF NOT EXISTS public.inventory_transfer_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  destination_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'array'),
  line_count integer NOT NULL CHECK (line_count BETWEEN 1 AND 200),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_warehouse_id <> destination_warehouse_id),
  UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS inventory_transfer_batches_org_created_idx
  ON public.inventory_transfer_batches(organization_id, created_at DESC);

ALTER TABLE public.inventory_transfers
  ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.inventory_transfer_batches(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS inventory_transfers_batch_idx
  ON public.inventory_transfers(organization_id, batch_id, created_at DESC)
  WHERE batch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_transfers_batch_product_unique
  ON public.inventory_transfers(batch_id, product_id)
  WHERE batch_id IS NOT NULL;

ALTER TABLE public.inventory_transfer_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_transfer_batches FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.inventory_transfer_batches TO service_role;
CREATE OR REPLACE FUNCTION public.transfer_inventory_batch(
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_idempotency_key text,
  p_lines jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_line jsonb;
  v_product_text text;
  v_product_id uuid;
  v_quantity numeric;
  v_product_ids uuid[] := ARRAY[]::uuid[];
  v_quantities numeric[] := ARRAY[]::numeric[];
  v_canonical_lines jsonb := '[]'::jsonb;
  v_line_count integer;
  v_index integer;
  v_warehouse record;
  v_warehouse_count integer := 0;
  v_product public.products%ROWTYPE;
  v_existing public.inventory_transfer_batches%ROWTYPE;
  v_batch public.inventory_transfer_batches%ROWTYPE;
  v_source_on_hand numeric(15,3);
  v_source_reserved numeric(15,3);
  v_source_available_after numeric(15,3);
  v_destination_available_after numeric(15,3);
  v_transfer_id uuid;
  v_transfer_ids jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active staff organization required for batch inventory transfer';
  END IF;
  IF p_source_warehouse_id IS NULL OR p_destination_warehouse_id IS NULL
     OR p_source_warehouse_id = p_destination_warehouse_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'two different warehouses are required';
  END IF;
  IF v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid batch-transfer idempotency key';
  END IF;
  IF v_reason IS NULL OR pg_catalog.char_length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a transfer reason between 1 and 1000 characters is required';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'transfer lines must be a JSON array';
  END IF;
  v_line_count := pg_catalog.jsonb_array_length(p_lines);
  IF v_line_count < 1 OR v_line_count > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a batch must contain between 1 and 200 product lines';
  END IF;

  -- Sorted product ids give all batches a stable lock order and stable retry payload.
  FOR v_line IN
    SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) AS j(value)
    ORDER BY value ->> 'product_id'
  LOOP
    IF pg_catalog.jsonb_typeof(v_line) <> 'object'
       OR v_line - 'product_id' - 'quantity' <> '{}'::jsonb
       OR pg_catalog.jsonb_typeof(v_line -> 'product_id') <> 'string'
       OR pg_catalog.jsonb_typeof(v_line -> 'quantity') <> 'number' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'each transfer line must contain only product_id and numeric quantity';
    END IF;
    v_product_text := v_line ->> 'product_id';
    IF v_product_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid product UUID in batch transfer';
    END IF;
    v_product_id := v_product_text::uuid;
    IF v_product_id = ANY(v_product_ids) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'a product may appear only once in a batch transfer';
    END IF;
    v_quantity := (v_line ->> 'quantity')::numeric;
    IF v_quantity::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_quantity <= 0 OR v_quantity > 999999999999.999
       OR pg_catalog.round(v_quantity, 3) <> v_quantity THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'transfer quantity must be positive with at most three decimals';
    END IF;
    v_product_ids := pg_catalog.array_append(v_product_ids, v_product_id);
    v_quantities := pg_catalog.array_append(v_quantities, v_quantity);
    v_canonical_lines := v_canonical_lines || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('product_id', v_product_id, 'quantity', v_quantity)
    );
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':inventory-transfer-batch:' || v_key, 0)
  );
  SELECT b.* INTO v_existing
    FROM public.inventory_transfer_batches b
   WHERE b.organization_id = v_org AND b.idempotency_key = v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.source_warehouse_id IS DISTINCT FROM p_source_warehouse_id
       OR v_existing.destination_warehouse_id IS DISTINCT FROM p_destination_warehouse_id
       OR v_existing.reason IS DISTINCT FROM v_reason
       OR v_existing.payload IS DISTINCT FROM v_canonical_lines THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'batch-transfer idempotency key payload conflict';
    END IF;
    SELECT coalesce(pg_catalog.jsonb_agg(t.id ORDER BY t.product_id), '[]'::jsonb)
      INTO v_transfer_ids
      FROM public.inventory_transfers t
     WHERE t.organization_id = v_org AND t.batch_id = v_existing.id;
    RETURN pg_catalog.jsonb_build_object(
      'batch_id', v_existing.id, 'line_count', v_existing.line_count,
      'idempotent_replay', true, 'transfer_ids', v_transfer_ids
    );
  END IF;

  FOR v_warehouse IN
    SELECT w.id FROM public.warehouses w
     WHERE w.id IN (p_source_warehouse_id, p_destination_warehouse_id)
       AND w.organization_id = v_org AND w.is_active
     ORDER BY w.id
     FOR SHARE
  LOOP
    v_warehouse_count := v_warehouse_count + 1;
  END LOOP;
  IF v_warehouse_count <> 2 THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'source and destination warehouses must be active in the current organization';
  END IF;

  -- Product locks precede the same pair lock used by transfer_inventory, preventing
  -- overselling when a single-line transfer and a batch race for the same stock.
  FOR v_index IN 1..v_line_count LOOP
    v_product_id := v_product_ids[v_index];
    v_quantity := v_quantities[v_index];
    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id = v_product_id AND p.organization_id = v_org AND p.status = 'active'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'a batch product is unavailable in this organization';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_org::text || ':inventory-transfer-balance:' || v_product_id::text || ':' ||
        LEAST(p_source_warehouse_id::text, p_destination_warehouse_id::text) || ':' ||
        GREATEST(p_source_warehouse_id::text, p_destination_warehouse_id::text), 1
      )
    );
    SELECT ib.quantity_on_hand, ib.quantity_reserved
      INTO v_source_on_hand, v_source_reserved
      FROM public.inventory_balances ib
     WHERE ib.product_id = v_product_id AND ib.warehouse_id = p_source_warehouse_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'source warehouse has no verified stock balance for a batch product';
    END IF;
    IF v_source_reserved < 0 OR v_source_on_hand < v_source_reserved
       OR v_source_on_hand - v_source_reserved < v_quantity THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'insufficient available stock for a batch product';
    END IF;
    INSERT INTO public.inventory_balances(product_id, warehouse_id, quantity_on_hand, quantity_reserved, reorder_point)
    VALUES (v_product_id, p_destination_warehouse_id, 0, 0, coalesce(v_product.min_stock, 0))
    ON CONFLICT (product_id, warehouse_id) DO NOTHING;
    PERFORM 1 FROM public.inventory_balances ib
     WHERE ib.product_id = v_product_id AND ib.warehouse_id = p_destination_warehouse_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'destination stock balance could not be locked';
    END IF;
  END LOOP;

  INSERT INTO public.inventory_transfer_batches(
    organization_id, source_warehouse_id, destination_warehouse_id,
    reason, idempotency_key, payload, line_count, created_by
  ) VALUES (v_org, p_source_warehouse_id, p_destination_warehouse_id, v_reason, v_key, v_canonical_lines, v_line_count, v_actor)
  RETURNING * INTO v_batch;

  FOR v_index IN 1..v_line_count LOOP
    v_product_id := v_product_ids[v_index];
    v_quantity := v_quantities[v_index];
    INSERT INTO public.inventory_transfers(
      organization_id, product_id, source_warehouse_id, destination_warehouse_id,
      quantity, reason, idempotency_key, created_by, batch_id
    ) VALUES (
      v_org, v_product_id, p_source_warehouse_id, p_destination_warehouse_id,
      v_quantity, v_reason,
      'batch-line-' || pg_catalog.replace(v_batch.id::text, '-', '') || '-' ||
        pg_catalog.replace(v_product_id::text, '-', ''),
      v_actor, v_batch.id
    ) RETURNING id INTO v_transfer_id;

    UPDATE public.inventory_balances
       SET quantity_on_hand = quantity_on_hand - v_quantity,
           last_movement_at = pg_catalog.now(), updated_at = pg_catalog.now()
     WHERE product_id = v_product_id AND warehouse_id = p_source_warehouse_id
     RETURNING quantity_available INTO v_source_available_after;
    UPDATE public.inventory_balances
       SET quantity_on_hand = quantity_on_hand + v_quantity,
           last_movement_at = pg_catalog.now(), updated_at = pg_catalog.now()
     WHERE product_id = v_product_id AND warehouse_id = p_destination_warehouse_id
     RETURNING quantity_available INTO v_destination_available_after;

    INSERT INTO public.inventory_movements(
      product_id, warehouse_id, movement_type, quantity, balance_after,
      reference_type, reference_id, reason, created_by
    ) VALUES
      (v_product_id, p_source_warehouse_id, 'transfer_out', -v_quantity, v_source_available_after,
       'inventory_transfer', v_transfer_id, v_reason, v_actor),
      (v_product_id, p_destination_warehouse_id, 'transfer_in', v_quantity, v_destination_available_after,
       'inventory_transfer', v_transfer_id, v_reason, v_actor);
  END LOOP;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (
    v_org, v_actor, 'inventory.transfer.batch', 'inventory_transfer_batch', v_batch.id,
    pg_catalog.jsonb_build_object('source_warehouse_id', p_source_warehouse_id, 'destination_warehouse_id', p_destination_warehouse_id),
    pg_catalog.jsonb_build_object('line_count', v_line_count, 'reason', v_reason, 'idempotency_key', v_key, 'lines', v_canonical_lines)
  );
  SELECT coalesce(pg_catalog.jsonb_agg(t.id ORDER BY t.product_id), '[]'::jsonb)
    INTO v_transfer_ids
    FROM public.inventory_transfers t
   WHERE t.organization_id = v_org AND t.batch_id = v_batch.id;
  RETURN pg_catalog.jsonb_build_object(
    'batch_id', v_batch.id, 'line_count', v_line_count,
    'idempotent_replay', false, 'transfer_ids', v_transfer_ids
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_inventory_batch(uuid, uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_inventory_batch(uuid, uuid, text, jsonb, text) TO authenticated;
COMMENT ON FUNCTION public.transfer_inventory_batch(uuid, uuid, text, jsonb, text) IS
  'Atomic multi-product stock transfer with target-tenant authorization, sorted locking, reserved-stock protection, idempotent replay, per-product movements and one batch audit event.';
COMMENT ON TABLE public.inventory_transfer_batches IS
  'Audited multi-product transfer envelopes; each product transfer remains in inventory_transfers and its paired movement ledger.';

CREATE OR REPLACE FUNCTION public.list_inventory_transfer_history(p_limit integer DEFAULT 500)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  product_id uuid,
  source_warehouse_id uuid,
  destination_warehouse_id uuid,
  quantity numeric,
  reason text,
  created_by uuid,
  created_at timestamptz,
  batch_id uuid,
  product_name text,
  item_code text,
  unit text,
  source_warehouse_name text,
  destination_warehouse_name text,
  batch_line_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active staff organization required to read inventory transfer history';
  END IF;

  RETURN QUERY
  SELECT t.id, t.organization_id, t.product_id, t.source_warehouse_id, t.destination_warehouse_id,
         t.quantity::numeric, t.reason, t.created_by, t.created_at, t.batch_id,
         p.name::text, p.item_code::text, p.unit::text,
         sw.name::text, dw.name::text, b.line_count
    FROM public.inventory_transfers t
    LEFT JOIN public.products p
      ON p.id = t.product_id AND p.organization_id = t.organization_id
    LEFT JOIN public.warehouses sw
      ON sw.id = t.source_warehouse_id AND sw.organization_id = t.organization_id
    LEFT JOIN public.warehouses dw
      ON dw.id = t.destination_warehouse_id AND dw.organization_id = t.organization_id
    LEFT JOIN public.inventory_transfer_batches b
      ON b.id = t.batch_id AND b.organization_id = t.organization_id
   WHERE t.organization_id = v_org
   ORDER BY t.created_at DESC, t.id DESC
   LIMIT least(greatest(coalesce(p_limit, 500), 1), 500);
END;
$$;
REVOKE ALL ON FUNCTION public.list_inventory_transfer_history(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_inventory_transfer_history(integer) TO authenticated;
COMMENT ON FUNCTION public.list_inventory_transfer_history(integer) IS
  'Bounded read-only inventory transfer history for the authenticated active staff member and current organization; no client table SELECT is required.';
