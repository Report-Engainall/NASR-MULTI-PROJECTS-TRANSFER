-- Inventory operational hardening: atomic warehouse transfers + actionable stock thresholds.

CREATE TABLE public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_warehouse_id uuid NOT NULL,
  destination_warehouse_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'posted' CHECK (status='posted'),
  idempotency_key text NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (id,organization_id),
  FOREIGN KEY (source_warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id) ON DELETE RESTRICT,
  FOREIGN KEY (destination_warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id) ON DELETE RESTRICT,
  CHECK (source_warehouse_id <> destination_warehouse_id)
);
CREATE INDEX inventory_transfers_time_idx ON public.inventory_transfers(organization_id,created_at DESC);

CREATE TABLE public.inventory_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  transfer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (transfer_id,product_id),
  UNIQUE (id,organization_id),
  FOREIGN KEY (transfer_id,organization_id) REFERENCES public.inventory_transfers(id,organization_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id,organization_id) REFERENCES public.products(id,organization_id) ON DELETE RESTRICT
);
CREATE INDEX inventory_transfer_items_product_idx ON public.inventory_transfer_items(organization_id,product_id,created_at DESC);

CREATE TABLE public.stock_thresholds (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL,
  product_id uuid NOT NULL,
  min_quantity integer NOT NULL DEFAULT 0 CHECK (min_quantity >= 0),
  reorder_quantity integer NOT NULL DEFAULT 1 CHECK (reorder_quantity > 0),
  max_quantity integer CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id,product_id),
  FOREIGN KEY (warehouse_id,organization_id) REFERENCES public.warehouses(id,organization_id) ON DELETE CASCADE,
  FOREIGN KEY (product_id,organization_id) REFERENCES public.products(id,organization_id) ON DELETE CASCADE
);
CREATE INDEX stock_thresholds_low_stock_idx ON public.stock_thresholds(organization_id,warehouse_id,min_quantity);

ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_thresholds ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_transfers_staff_read ON public.inventory_transfers FOR SELECT TO authenticated
  USING (organization_id=public.current_organization_id() AND public.is_staff());
CREATE POLICY inventory_transfer_items_staff_read ON public.inventory_transfer_items FOR SELECT TO authenticated
  USING (organization_id=public.current_organization_id() AND public.is_staff());
CREATE POLICY stock_thresholds_staff_read ON public.stock_thresholds FOR SELECT TO authenticated
  USING (organization_id=public.current_organization_id() AND public.is_staff());

CREATE OR REPLACE FUNCTION public.transfer_inventory(
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid,
  p_idempotency_key text,
  p_lines jsonb,
  p_notes text DEFAULT NULL
)
RETURNS TABLE(transfer_id uuid,transfer_status text,total_quantity bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_key text:=trim(coalesce(p_idempotency_key,''));
  v_notes text:=nullif(trim(p_notes),'');
  v_transfer public.inventory_transfers%rowtype;
  v_existing public.inventory_transfers%rowtype;
  v_line jsonb;
  v_product uuid;
  v_qty integer;
  v_count integer;
  v_existing_count integer;
  v_source integer;
  v_total bigint:=0;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','warehouse') THEN
    RAISE EXCEPTION USING errcode='42501',message='inventory transfer access required';
  END IF;
  IF p_source_warehouse_id=p_destination_warehouse_id THEN
    RAISE EXCEPTION USING errcode='22023',message='source and destination warehouses must differ';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_source_warehouse_id AND organization_id=v_org AND is_active) THEN
    RAISE EXCEPTION USING errcode='P0002',message='source warehouse not found';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_destination_warehouse_id AND organization_id=v_org AND is_active) THEN
    RAISE EXCEPTION USING errcode='P0002',message='destination warehouse not found';
  END IF;
  IF length(v_key)<16 OR length(v_key)>128 THEN
    RAISE EXCEPTION USING errcode='22023',message='invalid idempotency key';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN
    RAISE EXCEPTION USING errcode='22023',message='transfer lines required';
  END IF;
  v_count:=jsonb_array_length(p_lines);
  IF v_count=0 OR v_count>100 THEN
    RAISE EXCEPTION USING errcode='22023',message='transfer must contain between 1 and 100 lines';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||':transfer:'||v_key,0));
  SELECT * INTO v_existing FROM public.inventory_transfers WHERE organization_id=v_org AND idempotency_key=v_key;
  IF FOUND THEN
    SELECT count(*) INTO v_existing_count FROM public.inventory_transfer_items WHERE organization_id=v_org AND transfer_id=v_existing.id;
    IF v_existing.source_warehouse_id<>p_source_warehouse_id OR v_existing.destination_warehouse_id<>p_destination_warehouse_id
       OR coalesce(v_existing.notes,'')<>coalesce(v_notes,'') OR v_existing_count<>v_count THEN
      RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lines) x
      WHERE NOT EXISTS (
        SELECT 1 FROM public.inventory_transfer_items i
        WHERE i.organization_id=v_org AND i.transfer_id=v_existing.id
          AND i.product_id=(x->>'product_id')::uuid
          AND i.quantity=(x->>'quantity')::integer
      )
    ) THEN RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict'; END IF;
    SELECT coalesce(sum(quantity),0) INTO v_total FROM public.inventory_transfer_items WHERE organization_id=v_org AND transfer_id=v_existing.id;
    RETURN QUERY SELECT v_existing.id,v_existing.status,v_total; RETURN;
  END IF;

  -- Materialize missing destination/source balance rows, then lock every affected balance
  -- in deterministic warehouse/product order before validating or mutating quantities.
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) ORDER BY value->>'product_id' LOOP
    BEGIN
      v_product:=(v_line->>'product_id')::uuid;
      v_qty:=(v_line->>'quantity')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING errcode='22023',message='invalid transfer line';
    END;
    IF v_product IS NULL OR v_qty IS NULL OR v_qty<=0 OR v_qty>100000 THEN
      RAISE EXCEPTION USING errcode='22023',message='invalid transfer quantity';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=v_product AND organization_id=v_org AND status='active') THEN
      RAISE EXCEPTION USING errcode='P0002',message='product not found';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE x->>'product_id'=v_product::text GROUP BY x->>'product_id' HAVING count(*)>1) THEN
      RAISE EXCEPTION USING errcode='22023',message='duplicate product line';
    END IF;
    INSERT INTO public.inventory_balances(organization_id,warehouse_id,product_id,quantity)
    VALUES(v_org,p_source_warehouse_id,v_product,0) ON CONFLICT(warehouse_id,product_id) DO NOTHING;
    INSERT INTO public.inventory_balances(organization_id,warehouse_id,product_id,quantity)
    VALUES(v_org,p_destination_warehouse_id,v_product,0) ON CONFLICT(warehouse_id,product_id) DO NOTHING;
  END LOOP;

  PERFORM 1 FROM public.inventory_balances
  WHERE organization_id=v_org
    AND warehouse_id IN (p_source_warehouse_id,p_destination_warehouse_id)
    AND product_id IN (SELECT (value->>'product_id')::uuid FROM jsonb_array_elements(p_lines) value)
  ORDER BY warehouse_id,product_id
  FOR UPDATE;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_product:=(v_line->>'product_id')::uuid;
    v_qty:=(v_line->>'quantity')::integer;
    SELECT quantity INTO v_source FROM public.inventory_balances
    WHERE organization_id=v_org AND warehouse_id=p_source_warehouse_id AND product_id=v_product;
    IF coalesce(v_source,0)<v_qty THEN
      RAISE EXCEPTION USING errcode='22003',message='insufficient inventory for transfer';
    END IF;
    v_total:=v_total+v_qty;
  END LOOP;

  INSERT INTO public.inventory_transfers(organization_id,source_warehouse_id,destination_warehouse_id,status,idempotency_key,notes,created_by)
  VALUES(v_org,p_source_warehouse_id,p_destination_warehouse_id,'posted',v_key,v_notes,auth.uid()) RETURNING * INTO v_transfer;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_product:=(v_line->>'product_id')::uuid;
    v_qty:=(v_line->>'quantity')::integer;
    UPDATE public.inventory_balances SET quantity=quantity-v_qty,updated_at=now()
    WHERE organization_id=v_org AND warehouse_id=p_source_warehouse_id AND product_id=v_product;
    UPDATE public.inventory_balances SET quantity=quantity+v_qty,updated_at=now()
    WHERE organization_id=v_org AND warehouse_id=p_destination_warehouse_id AND product_id=v_product;
    INSERT INTO public.inventory_transfer_items(organization_id,transfer_id,product_id,quantity)
    VALUES(v_org,v_transfer.id,v_product,v_qty);
    INSERT INTO public.inventory_movements(organization_id,warehouse_id,product_id,delta,source_type,source_id,actor_id)
    VALUES(v_org,p_source_warehouse_id,v_product,-v_qty,'inventory_transfer',v_transfer.id,auth.uid()),
          (v_org,p_destination_warehouse_id,v_product,v_qty,'inventory_transfer',v_transfer.id,auth.uid());
  END LOOP;

  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'inventory.transfer','inventory_transfer',v_transfer.id,'success',jsonb_build_object(
    'source_warehouse_id',p_source_warehouse_id,'destination_warehouse_id',p_destination_warehouse_id,'total_quantity',v_total
  ));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload)
  VALUES(v_org,'inventory_transfer',v_transfer.id,'inventory.transferred',jsonb_build_object(
    'transfer_id',v_transfer.id,'source_warehouse_id',p_source_warehouse_id,'destination_warehouse_id',p_destination_warehouse_id,'total_quantity',v_total
  ));
  RETURN QUERY SELECT v_transfer.id,v_transfer.status,v_total;
END; $$;

CREATE OR REPLACE FUNCTION public.set_stock_threshold(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_min_quantity integer,
  p_reorder_quantity integer DEFAULT 1,
  p_max_quantity integer DEFAULT NULL
)
RETURNS public.stock_thresholds
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_row public.stock_thresholds%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','warehouse') THEN RAISE EXCEPTION USING errcode='42501',message='stock threshold access required'; END IF;
  IF p_min_quantity IS NULL OR p_min_quantity<0 OR p_reorder_quantity IS NULL OR p_reorder_quantity<=0 OR (p_max_quantity IS NOT NULL AND p_max_quantity<p_min_quantity) THEN
    RAISE EXCEPTION USING errcode='22023',message='invalid stock threshold';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND organization_id=v_org AND is_active) THEN RAISE EXCEPTION USING errcode='P0002',message='warehouse not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=p_product_id AND organization_id=v_org AND status='active') THEN RAISE EXCEPTION USING errcode='P0002',message='product not found'; END IF;
  INSERT INTO public.stock_thresholds(organization_id,warehouse_id,product_id,min_quantity,reorder_quantity,max_quantity,updated_at)
  VALUES(v_org,p_warehouse_id,p_product_id,p_min_quantity,p_reorder_quantity,p_max_quantity,now())
  ON CONFLICT(warehouse_id,product_id) DO UPDATE SET min_quantity=excluded.min_quantity,reorder_quantity=excluded.reorder_quantity,max_quantity=excluded.max_quantity,updated_at=now()
  RETURNING * INTO v_row;
  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'stock.threshold.set','stock_threshold',NULL,'success',jsonb_build_object('warehouse_id',p_warehouse_id,'product_id',p_product_id,'min_quantity',p_min_quantity,'reorder_quantity',p_reorder_quantity));
  RETURN v_row;
END; $$;

CREATE OR REPLACE FUNCTION public.get_low_stock()
RETURNS TABLE(warehouse_id uuid,warehouse_name text,product_id uuid,sku text,product_name text,current_quantity integer,min_quantity integer,reorder_quantity integer)
LANGUAGE sql STABLE AS $$
  SELECT b.warehouse_id,w.name,b.product_id,p.sku,p.name,b.quantity,t.min_quantity,t.reorder_quantity
  FROM public.inventory_balances b
  JOIN public.stock_thresholds t ON t.organization_id=b.organization_id AND t.warehouse_id=b.warehouse_id AND t.product_id=b.product_id
  JOIN public.warehouses w ON w.id=b.warehouse_id AND w.organization_id=b.organization_id
  JOIN public.products p ON p.id=b.product_id AND p.organization_id=b.organization_id
  WHERE b.organization_id=public.current_organization_id()
    AND public.is_staff()
    AND b.quantity<=t.min_quantity
  ORDER BY (b.quantity-t.min_quantity),w.name,p.name;
$$;

REVOKE ALL ON FUNCTION public.transfer_inventory(uuid,uuid,text,jsonb,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_stock_threshold(uuid,uuid,integer,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_low_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transfer_inventory(uuid,uuid,text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stock_threshold(uuid,uuid,integer,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_low_stock() TO authenticated;
