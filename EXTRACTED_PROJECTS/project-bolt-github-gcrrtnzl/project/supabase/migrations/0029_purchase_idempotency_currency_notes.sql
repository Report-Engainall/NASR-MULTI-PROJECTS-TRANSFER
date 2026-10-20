-- Forensic repair: the purchase idempotency contract must bind every material input.
-- 0027 compared supplier/warehouse/lines but omitted currency and notes.

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_idempotency_key text,
  p_lines jsonb,
  p_currency text DEFAULT 'YER',
  p_notes text DEFAULT NULL
)
RETURNS TABLE(purchase_order_id uuid,purchase_order_number bigint,status public.purchase_order_status,total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_role public.user_role:=public.current_role();
  v_key text:=trim(coalesce(p_idempotency_key,''));
  v_currency text:=upper(trim(coalesce(p_currency,'')));
  v_notes text:=nullif(trim(p_notes),'');
  v_po public.purchase_orders%rowtype;
  v_existing public.purchase_orders%rowtype;
  v_line jsonb;
  v_product uuid;
  v_qty numeric;
  v_cost numeric(18,2);
  v_total numeric(18,2):=0;
  v_count integer;
  v_existing_count integer;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','warehouse') THEN
    RAISE EXCEPTION USING errcode='42501',message='purchasing access required';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND organization_id=v_org AND is_active) THEN
    RAISE EXCEPTION USING errcode='P0002',message='supplier not found';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND organization_id=v_org AND is_active) THEN
    RAISE EXCEPTION USING errcode='P0002',message='warehouse not found';
  END IF;
  IF length(v_key)<16 OR length(v_key)>128 THEN
    RAISE EXCEPTION USING errcode='22023',message='invalid idempotency key';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN
    RAISE EXCEPTION USING errcode='22023',message='purchase lines required';
  END IF;
  v_count:=jsonb_array_length(p_lines);
  IF v_count=0 OR v_count>100 THEN
    RAISE EXCEPTION USING errcode='22023',message='purchase order must contain between 1 and 100 lines';
  END IF;
  IF length(v_currency)<>3 THEN
    RAISE EXCEPTION USING errcode='22023',message='invalid currency';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||':purchase:'||v_key,0));
  SELECT * INTO v_existing FROM public.purchase_orders WHERE organization_id=v_org AND idempotency_key=v_key;
  IF FOUND THEN
    SELECT count(*) INTO v_existing_count FROM public.purchase_order_items WHERE organization_id=v_org AND purchase_order_id=v_existing.id;
    IF v_existing.supplier_id<>p_supplier_id
       OR v_existing.warehouse_id<>p_warehouse_id
       OR v_existing.currency<>v_currency
       OR coalesce(v_existing.notes,'')<>coalesce(v_notes,'')
       OR v_existing_count<>v_count THEN
      RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lines) x
      WHERE NOT EXISTS (
        SELECT 1 FROM public.purchase_order_items i
        WHERE i.organization_id=v_org
          AND i.purchase_order_id=v_existing.id
          AND i.product_id=(x->>'product_id')::uuid
          AND i.quantity_ordered=(x->>'quantity')::integer
          AND i.unit_cost=round((x->>'unit_cost')::numeric,2)
      )
    ) THEN
      RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict';
    END IF;
    RETURN QUERY SELECT v_existing.id,v_existing.purchase_order_number,v_existing.status,v_existing.total;
    RETURN;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    BEGIN
      v_product:=(v_line->>'product_id')::uuid;
      v_qty:=(v_line->>'quantity')::numeric;
      v_cost:=round((v_line->>'unit_cost')::numeric,2);
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING errcode='22023',message='invalid product, quantity or unit cost';
    END;
    IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=v_product AND organization_id=v_org) THEN
      RAISE EXCEPTION USING errcode='P0002',message='product not found';
    END IF;
    IF v_qty IS NULL OR v_qty<>trunc(v_qty) OR v_qty<=0 OR v_qty>100000 THEN
      RAISE EXCEPTION USING errcode='22023',message='quantity must be a positive integer not exceeding 100000';
    END IF;
    IF v_cost IS NULL OR v_cost<0 OR v_cost>99999999999999.99 THEN
      RAISE EXCEPTION USING errcode='22023',message='invalid unit cost';
    END IF;
    IF EXISTS(
      SELECT 1 FROM jsonb_array_elements(p_lines) x
      WHERE x->>'product_id'=v_product::text
      GROUP BY x->>'product_id'
      HAVING count(*)>1
    ) THEN
      RAISE EXCEPTION USING errcode='22023',message='duplicate product line';
    END IF;
    v_total:=v_total+v_cost*v_qty::integer;
  END LOOP;

  INSERT INTO public.purchase_orders(
    organization_id,supplier_id,warehouse_id,status,currency,subtotal,total,idempotency_key,notes,created_by
  ) VALUES(
    v_org,p_supplier_id,p_warehouse_id,'draft',v_currency,v_total,v_total,v_key,v_notes,auth.uid()
  ) RETURNING * INTO v_po;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.purchase_order_items(
      organization_id,purchase_order_id,product_id,quantity_ordered,unit_cost
    ) VALUES(
      v_org,v_po.id,(v_line->>'product_id')::uuid,(v_line->>'quantity')::integer,round((v_line->>'unit_cost')::numeric,2)
    );
  END LOOP;

  INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata)
  VALUES(v_org,auth.uid(),'purchase_order.create','purchase_order',v_po.id,'success',jsonb_build_object(
    'supplier_id',p_supplier_id,
    'warehouse_id',p_warehouse_id,
    'purchase_order_number',v_po.purchase_order_number
  ));
  INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload)
  VALUES(v_org,'purchase_order',v_po.id,'purchase_order.created',jsonb_build_object(
    'purchase_order_id',v_po.id,
    'purchase_order_number',v_po.purchase_order_number
  ));
  RETURN QUERY SELECT v_po.id,v_po.purchase_order_number,v_po.status,v_po.total;
END; $$;
