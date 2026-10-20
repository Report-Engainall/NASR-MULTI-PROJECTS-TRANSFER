-- Transactional, idempotent stock transfer. Inventory balances remain the canonical
-- stock state; each completed transfer writes paired movement entries and an audit event.
CREATE TABLE IF NOT EXISTS public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  source_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  destination_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  quantity numeric(15,3) NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventory_transfers_distinct_warehouses CHECK (source_warehouse_id <> destination_warehouse_id),
  CONSTRAINT inventory_transfers_org_idempotency_unique UNIQUE (organization_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS inventory_transfers_org_created_idx
  ON public.inventory_transfers(organization_id, created_at DESC);
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inventory_transfers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_transfers TO authenticated;
GRANT ALL ON TABLE public.inventory_transfers TO service_role;
DROP POLICY IF EXISTS inventory_transfers_tenant_read ON public.inventory_transfers;
CREATE POLICY inventory_transfers_tenant_read ON public.inventory_transfers
  FOR SELECT TO authenticated
  USING (public.is_staff() AND organization_id = public.current_organization_id());

CREATE OR REPLACE FUNCTION public.transfer_inventory(
  p_product_id uuid,
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_quantity numeric,
  p_reason text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_product public.products%ROWTYPE;
  v_existing public.inventory_transfers%ROWTYPE;
  v_balance record;
  v_source_on_hand numeric(15,3);
  v_source_reserved numeric(15,3);
  v_source_available numeric(15,3);
  v_destination_on_hand numeric(15,3);
  v_destination_reserved numeric(15,3);
  v_source_available_after numeric(15,3);
  v_destination_available_after numeric(15,3);
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
  v_source_found boolean := false;
  v_destination_found boolean := false;
  v_warehouse_count integer := 0;
  v_transfer_id uuid;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required for inventory transfer';
  END IF;
  IF p_product_id IS NULL OR p_source_warehouse_id IS NULL OR p_destination_warehouse_id IS NULL
     OR p_source_warehouse_id=p_destination_warehouse_id THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product and two different warehouses are required';
  END IF;
  IF v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid inventory transfer idempotency key';
  END IF;
  IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity<=0 OR p_quantity>999999999999.999
     OR pg_catalog.round(p_quantity,3)<>p_quantity THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='transfer quantity must be positive with at most three decimals';
  END IF;
  IF v_reason IS NULL OR pg_catalog.char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='transfer reason must contain between 1 and 1000 characters';
  END IF;

  -- Serialize retries with the same key. A reused key with a changed payload is rejected.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':inventory-transfer:' || v_key,0)
  );
  SELECT t.* INTO v_existing
    FROM public.inventory_transfers t
   WHERE t.organization_id=v_org AND t.idempotency_key=v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.product_id IS DISTINCT FROM p_product_id
       OR v_existing.source_warehouse_id IS DISTINCT FROM p_source_warehouse_id
       OR v_existing.destination_warehouse_id IS DISTINCT FROM p_destination_warehouse_id
       OR v_existing.quantity IS DISTINCT FROM p_quantity
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'transfer_id',v_existing.id,'product_id',v_existing.product_id,
      'source_warehouse_id',v_existing.source_warehouse_id,
      'destination_warehouse_id',v_existing.destination_warehouse_id,
      'quantity',v_existing.quantity,'idempotent_replay',true
    );
  END IF;

  SELECT p.* INTO v_product
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_org AND p.status='active'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='product is unavailable in this organization';
  END IF;

  FOR v_balance IN
    SELECT w.id FROM public.warehouses w
     WHERE w.id IN (p_source_warehouse_id,p_destination_warehouse_id)
       AND w.organization_id=v_org AND w.is_active
     ORDER BY w.id
     FOR SHARE
  LOOP
    v_warehouse_count:=v_warehouse_count+1;
  END LOOP;
  IF v_warehouse_count<>2 THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='source and destination warehouses must be active in this organization';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.inventory_balances ib
     WHERE ib.product_id=p_product_id AND ib.warehouse_id=p_source_warehouse_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='source warehouse has no stock balance for this product';
  END IF;

  -- The pair lock makes opposite-direction transfers for the same product deterministic
  -- and lets us safely create a zero destination balance when one does not yet exist.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_org::text || ':inventory-transfer-balance:' || p_product_id::text || ':' ||
      LEAST(p_source_warehouse_id::text,p_destination_warehouse_id::text) || ':' ||
      GREATEST(p_source_warehouse_id::text,p_destination_warehouse_id::text),1
    )
  );
  INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point)
  VALUES(p_product_id,p_destination_warehouse_id,0,0,coalesce(v_product.min_stock,0))
  ON CONFLICT(product_id,warehouse_id) DO NOTHING;

  FOR v_balance IN
    SELECT ib.warehouse_id,ib.quantity_on_hand,ib.quantity_reserved,ib.quantity_available
      FROM public.inventory_balances ib
     WHERE ib.product_id=p_product_id
       AND ib.warehouse_id IN (p_source_warehouse_id,p_destination_warehouse_id)
     ORDER BY ib.warehouse_id
     FOR UPDATE
  LOOP
    IF v_balance.warehouse_id=p_source_warehouse_id THEN
      v_source_found:=true;
      v_source_on_hand:=v_balance.quantity_on_hand;
      v_source_reserved:=v_balance.quantity_reserved;
      v_source_available:=v_balance.quantity_available;
    ELSIF v_balance.warehouse_id=p_destination_warehouse_id THEN
      v_destination_found:=true;
      v_destination_on_hand:=v_balance.quantity_on_hand;
      v_destination_reserved:=v_balance.quantity_reserved;
    END IF;
  END LOOP;
  IF NOT v_source_found OR NOT v_destination_found THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='could not lock both stock balances for transfer';
  END IF;
  IF v_source_reserved<0 OR v_source_on_hand<v_source_reserved OR v_source_available<p_quantity THEN
    RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='insufficient available stock for transfer';
  END IF;

  INSERT INTO public.inventory_transfers(
    organization_id,product_id,source_warehouse_id,destination_warehouse_id,
    quantity,reason,idempotency_key,created_by
  ) VALUES(
    v_org,p_product_id,p_source_warehouse_id,p_destination_warehouse_id,
    p_quantity,v_reason,v_key,v_actor
  ) RETURNING id INTO v_transfer_id;

  UPDATE public.inventory_balances
     SET quantity_on_hand=quantity_on_hand-p_quantity,
         last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE product_id=p_product_id AND warehouse_id=p_source_warehouse_id
   RETURNING quantity_available INTO v_source_available_after;
  UPDATE public.inventory_balances
     SET quantity_on_hand=quantity_on_hand+p_quantity,
         last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
   WHERE product_id=p_product_id AND warehouse_id=p_destination_warehouse_id
   RETURNING quantity_available INTO v_destination_available_after;

  INSERT INTO public.inventory_movements(
    product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
  ) VALUES
    (p_product_id,p_source_warehouse_id,'transfer_out',-p_quantity,v_source_available_after,'inventory_transfer',v_transfer_id,v_reason,v_actor),
    (p_product_id,p_destination_warehouse_id,'transfer_in',p_quantity,v_destination_available_after,'inventory_transfer',v_transfer_id,v_reason,v_actor);

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(
    v_org,v_actor,'inventory.transfer','inventory_transfer',v_transfer_id,
    pg_catalog.jsonb_build_object('source_quantity_on_hand',v_source_on_hand,'source_quantity_reserved',v_source_reserved,
      'destination_quantity_on_hand',v_destination_on_hand,'destination_quantity_reserved',v_destination_reserved),
    pg_catalog.jsonb_build_object('quantity',p_quantity,'source_warehouse_id',p_source_warehouse_id,
      'destination_warehouse_id',p_destination_warehouse_id,'source_quantity_available_after',v_source_available_after,
      'destination_quantity_available_after',v_destination_available_after,'reason',v_reason,'idempotency_key',v_key)
  );

  RETURN pg_catalog.jsonb_build_object(
    'transfer_id',v_transfer_id,'product_id',p_product_id,
    'source_warehouse_id',p_source_warehouse_id,
    'destination_warehouse_id',p_destination_warehouse_id,
    'quantity',p_quantity,'idempotent_replay',false,
    'source_quantity_available_after',v_source_available_after,
    'destination_quantity_available_after',v_destination_available_after
  );
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_inventory(uuid,uuid,uuid,numeric,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.transfer_inventory(uuid,uuid,uuid,numeric,text,text) TO authenticated;
COMMENT ON FUNCTION public.transfer_inventory(uuid,uuid,uuid,numeric,text,text) IS
  'Atomic tenant-bound stock transfer with reserved-stock protection, deterministic row locking, idempotent replay, paired movement ledger entries and audit logging.';
