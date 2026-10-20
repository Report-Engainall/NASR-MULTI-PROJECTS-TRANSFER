-- R5 adversarial hardening: idempotency is operation + tenant + exact payload, not key-only replay.

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_supplier_id uuid,p_warehouse_id uuid,p_idempotency_key text,p_lines jsonb,p_currency text DEFAULT 'YER',p_notes text DEFAULT NULL
)
RETURNS TABLE(purchase_order_id uuid,purchase_order_number bigint,status public.purchase_order_status,total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_org uuid:=public.current_organization_id(); v_role public.user_role:=public.current_role(); v_key text:=trim(coalesce(p_idempotency_key,''));
 v_po public.purchase_orders%rowtype; v_existing public.purchase_orders%rowtype; v_line jsonb; v_product uuid; v_qty numeric; v_cost numeric(18,2); v_total numeric(18,2):=0; v_count integer; v_existing_count integer;
BEGIN
 IF v_org IS NULL OR v_role NOT IN ('owner','admin','warehouse') THEN RAISE EXCEPTION USING errcode='42501',message='purchasing access required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.suppliers WHERE id=p_supplier_id AND organization_id=v_org AND is_active) THEN RAISE EXCEPTION USING errcode='P0002',message='supplier not found'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.warehouses WHERE id=p_warehouse_id AND organization_id=v_org AND is_active) THEN RAISE EXCEPTION USING errcode='P0002',message='warehouse not found'; END IF;
 IF length(v_key)<16 OR length(v_key)>128 THEN RAISE EXCEPTION USING errcode='22023',message='invalid idempotency key'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION USING errcode='22023',message='purchase lines required'; END IF;
 v_count:=jsonb_array_length(p_lines); IF v_count=0 OR v_count>100 THEN RAISE EXCEPTION USING errcode='22023',message='purchase order must contain between 1 and 100 lines'; END IF;
 IF p_currency IS NULL OR length(trim(p_currency))<>3 THEN RAISE EXCEPTION USING errcode='22023',message='invalid currency'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||':purchase:'||v_key,0));
 SELECT * INTO v_existing FROM public.purchase_orders WHERE organization_id=v_org AND idempotency_key=v_key;
 IF FOUND THEN
   SELECT count(*) INTO v_existing_count FROM public.purchase_order_items WHERE organization_id=v_org AND purchase_order_id=v_existing.id;
   IF v_existing.supplier_id<>p_supplier_id OR v_existing.warehouse_id<>p_warehouse_id OR v_existing_count<>v_count THEN RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict'; END IF;
   IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_lines) x
     WHERE NOT EXISTS (
       SELECT 1 FROM public.purchase_order_items i
       WHERE i.organization_id=v_org AND i.purchase_order_id=v_existing.id
         AND i.product_id=(x->>'product_id')::uuid
         AND i.quantity_ordered=(x->>'quantity')::integer
         AND i.unit_cost=round((x->>'unit_cost')::numeric,2)
     )
   ) THEN RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict'; END IF;
   RETURN QUERY SELECT v_existing.id,v_existing.purchase_order_number,v_existing.status,v_existing.total; RETURN;
 END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   BEGIN v_product:=(v_line->>'product_id')::uuid; v_qty:=(v_line->>'quantity')::numeric; v_cost:=round((v_line->>'unit_cost')::numeric,2); EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING errcode='22023',message='invalid product, quantity or unit cost'; END;
   IF NOT EXISTS(SELECT 1 FROM public.products WHERE id=v_product AND organization_id=v_org) THEN RAISE EXCEPTION USING errcode='P0002',message='product not found'; END IF;
   IF v_qty IS NULL OR v_qty<>trunc(v_qty) OR v_qty<=0 OR v_qty>100000 THEN RAISE EXCEPTION USING errcode='22023',message='quantity must be a positive integer not exceeding 100000'; END IF;
   IF v_cost IS NULL OR v_cost<0 OR v_cost>99999999999999.99 THEN RAISE EXCEPTION USING errcode='22023',message='invalid unit cost'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines) x WHERE x->>'product_id'=v_product::text GROUP BY x->>'product_id' HAVING count(*)>1) THEN RAISE EXCEPTION USING errcode='22023',message='duplicate product line'; END IF;
   v_total:=v_total+v_cost*v_qty::integer;
 END LOOP;
 INSERT INTO public.purchase_orders(organization_id,supplier_id,warehouse_id,status,currency,subtotal,total,idempotency_key,notes,created_by) VALUES(v_org,p_supplier_id,p_warehouse_id,'draft',upper(trim(p_currency)),v_total,v_total,v_key,nullif(trim(p_notes),''),auth.uid()) RETURNING * INTO v_po;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP INSERT INTO public.purchase_order_items(organization_id,purchase_order_id,product_id,quantity_ordered,unit_cost) VALUES(v_org,v_po.id,(v_line->>'product_id')::uuid,(v_line->>'quantity')::integer,round((v_line->>'unit_cost')::numeric,2)); END LOOP;
 INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata) VALUES(v_org,auth.uid(),'purchase_order.create','purchase_order',v_po.id,'success',jsonb_build_object('supplier_id',p_supplier_id,'warehouse_id',p_warehouse_id,'purchase_order_number',v_po.purchase_order_number));
 INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload) VALUES(v_org,'purchase_order',v_po.id,'purchase_order.created',jsonb_build_object('purchase_order_id',v_po.id,'purchase_order_number',v_po.purchase_order_number));
 RETURN QUERY SELECT v_po.id,v_po.purchase_order_number,v_po.status,v_po.total;
END; $$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(p_purchase_order_id uuid,p_idempotency_key text,p_lines jsonb,p_notes text DEFAULT NULL)
RETURNS TABLE(receipt_id uuid,receipt_number bigint,purchase_order_id uuid,purchase_order_status public.purchase_order_status,received_total numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 v_org uuid:=public.current_organization_id(); v_role public.user_role:=public.current_role(); v_key text:=trim(coalesce(p_idempotency_key,''));
 v_po public.purchase_orders%rowtype; v_receipt public.purchase_receipts%rowtype; v_existing public.purchase_receipts%rowtype; v_line jsonb; v_item public.purchase_order_items%rowtype; v_item_id uuid; v_product uuid; v_qty integer; v_remaining integer; v_inventory integer; v_total numeric(18,2):=0; v_existing_count integer;
BEGIN
 IF v_org IS NULL OR v_role NOT IN ('owner','admin','warehouse') THEN RAISE EXCEPTION USING errcode='42501',message='receiving access required'; END IF;
 IF length(v_key)<16 OR length(v_key)>128 THEN RAISE EXCEPTION USING errcode='22023',message='invalid idempotency key'; END IF;
 IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)=0 OR jsonb_array_length(p_lines)>100 THEN RAISE EXCEPTION USING errcode='22023',message='receipt lines required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text||':receipt:'||v_key,0));
 SELECT * INTO v_existing FROM public.purchase_receipts WHERE organization_id=v_org AND idempotency_key=v_key;
 IF FOUND THEN
   IF v_existing.purchase_order_id<>p_purchase_order_id THEN RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict'; END IF;
   SELECT count(*) INTO v_existing_count FROM public.purchase_receipt_items WHERE organization_id=v_org AND receipt_id=v_existing.id;
   IF v_existing_count<>jsonb_array_length(p_lines) THEN RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict'; END IF;
   IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_lines) x
     WHERE NOT EXISTS (
       SELECT 1 FROM public.purchase_receipt_items r
       WHERE r.organization_id=v_org AND r.receipt_id=v_existing.id
         AND r.purchase_order_item_id=(x->>'purchase_order_item_id')::uuid
         AND r.product_id=(x->>'product_id')::uuid
         AND r.quantity_received=(x->>'quantity')::integer
     )
   ) THEN RAISE EXCEPTION USING errcode='40001',message='idempotency key payload conflict'; END IF;
   SELECT * INTO v_po FROM public.purchase_orders WHERE id=v_existing.purchase_order_id AND organization_id=v_org;
   SELECT coalesce(sum(line_total),0) INTO v_total FROM public.purchase_receipt_items WHERE organization_id=v_org AND receipt_id=v_existing.id;
   RETURN QUERY SELECT v_existing.id,v_existing.receipt_number,v_existing.purchase_order_id,v_po.status,v_total; RETURN;
 END IF;
 SELECT * INTO v_po FROM public.purchase_orders WHERE id=p_purchase_order_id AND organization_id=v_org FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='purchase order not found'; END IF;
 IF v_po.status NOT IN ('approved','partially_received') THEN RAISE EXCEPTION USING errcode='22023',message='purchase order is not receivable'; END IF;
 INSERT INTO public.purchase_receipts(organization_id,purchase_order_id,warehouse_id,idempotency_key,received_by,notes) VALUES(v_org,v_po.id,v_po.warehouse_id,v_key,auth.uid(),nullif(trim(p_notes),'')) RETURNING * INTO v_receipt;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   BEGIN v_item_id:=(v_line->>'purchase_order_item_id')::uuid; v_product:=(v_line->>'product_id')::uuid; v_qty:=(v_line->>'quantity')::integer; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING errcode='22023',message='invalid receipt line'; END;
   IF v_qty IS NULL OR v_qty<=0 THEN RAISE EXCEPTION USING errcode='22023',message='received quantity must be positive'; END IF;
   SELECT * INTO v_item FROM public.purchase_order_items WHERE id=v_item_id AND organization_id=v_org AND purchase_order_id=v_po.id AND product_id=v_product FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION USING errcode='P0002',message='purchase order item not found'; END IF;
   v_remaining:=v_item.quantity_ordered-v_item.quantity_received; IF v_qty>v_remaining THEN RAISE EXCEPTION USING errcode='22023',message='received quantity exceeds remaining quantity'; END IF;
   INSERT INTO public.inventory_balances(organization_id,warehouse_id,product_id,quantity) VALUES(v_org,v_po.warehouse_id,v_product,0) ON CONFLICT(warehouse_id,product_id) DO NOTHING;
   SELECT quantity INTO v_inventory FROM public.inventory_balances WHERE organization_id=v_org AND warehouse_id=v_po.warehouse_id AND product_id=v_product FOR UPDATE;
   UPDATE public.inventory_balances SET quantity=v_inventory+v_qty,updated_at=now() WHERE organization_id=v_org AND warehouse_id=v_po.warehouse_id AND product_id=v_product;
   INSERT INTO public.inventory_movements(organization_id,warehouse_id,product_id,delta,source_type,source_id,actor_id) VALUES(v_org,v_po.warehouse_id,v_product,v_qty,'purchase_receipt',v_receipt.id,auth.uid());
   UPDATE public.purchase_order_items SET quantity_received=quantity_received+v_qty WHERE id=v_item.id;
   INSERT INTO public.purchase_receipt_items(organization_id,receipt_id,purchase_order_item_id,product_id,quantity_received,unit_cost) VALUES(v_org,v_receipt.id,v_item.id,v_product,v_qty,v_item.unit_cost);
   v_total:=v_total+v_item.unit_cost*v_qty;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.purchase_order_items WHERE organization_id=v_org AND purchase_order_id=v_po.id AND quantity_received<quantity_ordered) THEN UPDATE public.purchase_orders SET status='received',updated_at=now() WHERE id=v_po.id;
 ELSE UPDATE public.purchase_orders SET status='partially_received',updated_at=now() WHERE id=v_po.id; END IF;
 SELECT * INTO v_po FROM public.purchase_orders WHERE id=v_po.id;
 INSERT INTO public.audit_events(organization_id,actor_id,action,target_type,target_id,result,metadata) VALUES(v_org,auth.uid(),'purchase_receipt.create','purchase_receipt',v_receipt.id,'success',jsonb_build_object('purchase_order_id',v_po.id,'received_total',v_total));
 INSERT INTO public.outbox_events(organization_id,aggregate_type,aggregate_id,event_type,payload) VALUES(v_org,'purchase_order',v_po.id,'purchase.received',jsonb_build_object('purchase_order_id',v_po.id,'receipt_id',v_receipt.id,'receipt_number',v_receipt.receipt_number));
 RETURN QUERY SELECT v_receipt.id,v_receipt.receipt_number,v_po.id,v_po.status,v_total;
END; $$;
