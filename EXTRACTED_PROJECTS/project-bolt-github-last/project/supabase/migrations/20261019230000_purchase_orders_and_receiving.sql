-- Tenant-bound purchase orders and inventory receipts.
-- Supplier commitments and physical receiving are separate events. Receipt posting and
-- stock movements commit atomically; unrecorded unit costs remain NULL, never zero.
CREATE SEQUENCE IF NOT EXISTS public.purchase_order_number_seq;
CREATE SEQUENCE IF NOT EXISTS public.purchase_receipt_number_seq;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  purchase_order_number text NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','partially_received','received','cancelled')),
  notes text,
  total_cost numeric(15,2),
  idempotency_key text NOT NULL,
  payload_fingerprint text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  cancelled_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,purchase_order_number),
  UNIQUE(organization_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  item_code_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  quantity_ordered numeric(15,3) NOT NULL CHECK (quantity_ordered > 0),
  quantity_received numeric(15,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost numeric(15,2),
  line_total numeric(15,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(purchase_order_id,product_id),
  CHECK (quantity_received <= quantity_ordered)
);

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  notes text,
  received_cost numeric(15,2),
  idempotency_key text NOT NULL,
  payload_fingerprint text NOT NULL,
  received_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,receipt_number),
  UNIQUE(organization_id,idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.purchase_receipt_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  receipt_id uuid NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE RESTRICT,
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity_received numeric(15,3) NOT NULL CHECK (quantity_received > 0),
  unit_cost numeric(15,2),
  line_total numeric(15,2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_orders_inbox_idx
  ON public.purchase_orders(organization_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_order_items_parent_idx
  ON public.purchase_order_items(organization_id,purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_receipts_parent_idx
  ON public.purchase_receipts(organization_id,purchase_order_id,received_at DESC);
CREATE INDEX IF NOT EXISTS purchase_receipt_items_parent_idx
  ON public.purchase_receipt_items(organization_id,receipt_id);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.purchase_orders,public.purchase_order_items,public.purchase_receipts,public.purchase_receipt_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.purchase_orders,public.purchase_order_items,public.purchase_receipts,public.purchase_receipt_items TO service_role;
REVOKE ALL ON SEQUENCE public.purchase_order_number_seq,public.purchase_receipt_number_seq FROM PUBLIC,anon,authenticated;
GRANT USAGE,SELECT,UPDATE ON SEQUENCE public.purchase_order_number_seq,public.purchase_receipt_number_seq TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_orders_can_manage()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.id=public.current_profile_id()
       AND p.auth_user_id=auth.uid()
       AND p.is_active
       AND p.organization_id=public.current_organization_id()
       AND r.role IN ('admin','manager')
  );
$function$;
REVOKE ALL ON FUNCTION public.purchase_orders_can_manage() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purchase_orders_can_manage() TO authenticated;

-- Private serializer; callers can only reach it through the tenant-checked RPC commands below.
CREATE OR REPLACE FUNCTION public.purchase_order_detail(p_purchase_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',po.id,
    'organization_id',po.organization_id,
    'purchase_order_number',po.purchase_order_number,
    'supplier_id',po.supplier_id,
    'supplier_name',s.name,
    'supplier_code',s.supplier_code,
    'warehouse_id',po.warehouse_id,
    'warehouse_name',w.name,
    'status',po.status,
    'notes',po.notes,
    'total_cost',po.total_cost,
    'created_by',po.created_by,
    'submitted_by',po.submitted_by,
    'submitted_at',po.submitted_at,
    'cancelled_by',po.cancelled_by,
    'cancelled_at',po.cancelled_at,
    'cancellation_reason',po.cancellation_reason,
    'created_at',po.created_at,
    'updated_at',po.updated_at,
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',poi.id,
        'product_id',poi.product_id,
        'item_code',poi.item_code_snapshot,
        'product_name',poi.product_name_snapshot,
        'unit',poi.unit_snapshot,
        'quantity_ordered',poi.quantity_ordered,
        'quantity_received',poi.quantity_received,
        'remaining_quantity',poi.quantity_ordered-poi.quantity_received,
        'unit_cost',poi.unit_cost,
        'line_total',poi.line_total
      ) ORDER BY poi.product_name_snapshot,poi.item_code_snapshot,poi.id)
      FROM public.purchase_order_items poi
      WHERE poi.purchase_order_id=po.id AND poi.organization_id=po.organization_id
    ),'[]'::jsonb)
  )
  FROM public.purchase_orders po
  JOIN public.suppliers s ON s.id=po.supplier_id AND s.organization_id=po.organization_id
  JOIN public.warehouses w ON w.id=po.warehouse_id AND w.organization_id=po.organization_id
  WHERE po.id=p_purchase_order_id;
$function$;
REVOKE ALL ON FUNCTION public.purchase_order_detail(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fetch_purchase_orders()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_org uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required for purchase orders';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required for purchase orders';
  END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(public.purchase_order_detail(listed.id)
    ORDER BY listed.created_at DESC,listed.id DESC),'[]'::jsonb)
    INTO v_result
    FROM (
      SELECT po.id,po.created_at
        FROM public.purchase_orders po
       WHERE po.organization_id=v_org
       ORDER BY po.created_at DESC,po.id DESC
       LIMIT 500
    ) listed;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.fetch_purchase_orders() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_purchase_orders() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_purchase_order(
  p_supplier_id uuid,p_warehouse_id uuid,p_lines jsonb,p_notes text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_line jsonb;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_unit_cost numeric(15,2);
  v_line_total numeric(15,2);
  v_total numeric(15,2):=0;
  v_costs_complete boolean:=true;
  v_count integer:=0;
  v_po_id uuid;
  v_fingerprint text;
  v_existing public.purchase_orders%ROWTYPE;
  v_po_number text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to create purchase orders';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization required'; END IF;
  IF p_supplier_id IS NULL OR p_warehouse_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='supplier and warehouse are required';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid purchase order idempotency key';
  END IF;
  IF p_notes IS NOT NULL AND pg_catalog.char_length(p_notes)>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='purchase order notes exceed 2000 characters';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.jsonb_array_length(p_lines)<1 OR pg_catalog.jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='purchase order must contain between 1 and 100 items';
  END IF;
  PERFORM 1 FROM public.suppliers s
   WHERE s.id=p_supplier_id AND s.organization_id=v_org AND s.status='active'
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active supplier is not available in this organization'; END IF;
  PERFORM 1 FROM public.warehouses w
   WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active warehouse is not available in this organization'; END IF;

  v_fingerprint:=pg_catalog.md5(p_supplier_id::text||'|'||p_warehouse_id::text||'|'||COALESCE(p_notes,'')||'|'||p_lines::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':purchase-order:'||p_idempotency_key,0));
  SELECT po.* INTO v_existing FROM public.purchase_orders po
   WHERE po.organization_id=v_org AND po.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='purchase order idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object('purchase_order',public.purchase_order_detail(v_existing.id),'idempotent_replay',true);
  END IF;

  INSERT INTO public.purchase_orders(
    organization_id,purchase_order_number,supplier_id,warehouse_id,status,notes,idempotency_key,
    payload_fingerprint,created_by
  ) VALUES(
    v_org,'PO-'||pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD')||'-'||
      pg_catalog.lpad(pg_catalog.nextval('public.purchase_order_number_seq'::regclass)::text,6,'0'),
    p_supplier_id,p_warehouse_id,'draft',NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),''),p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING id,purchase_order_number INTO v_po_id,v_po_number;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF pg_catalog.jsonb_typeof(v_line)<>'object'
       OR pg_catalog.jsonb_typeof(v_line->'product_id')<>'string'
       OR pg_catalog.jsonb_typeof(v_line->'quantity')<>'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each purchase order item requires product_id and numeric quantity';
    END IF;
    v_product_id:=(v_line->>'product_id')::uuid;
    v_quantity:=(v_line->>'quantity')::numeric;
    IF v_quantity<=0 OR v_quantity>999999999999.999 OR pg_catalog.round(v_quantity,3)<>v_quantity THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='ordered quantity must be positive with at most three decimals';
    END IF;
    IF EXISTS (SELECT 1 FROM public.purchase_order_items poi WHERE poi.purchase_order_id=v_po_id AND poi.product_id=v_product_id) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate product line in purchase order';
    END IF;
    SELECT p.* INTO v_product FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='product is unavailable in the active organization'; END IF;
    v_unit_cost:=NULL;
    IF v_line ? 'unit_cost' AND v_line->'unit_cost'<>'null'::jsonb THEN
      IF pg_catalog.jsonb_typeof(v_line->'unit_cost')<>'number' THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unit cost must be numeric or null';
      END IF;
      v_unit_cost:=(v_line->>'unit_cost')::numeric;
      IF v_unit_cost<0 OR v_unit_cost>9999999999999.99 OR pg_catalog.round(v_unit_cost,2)<>v_unit_cost THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unit cost must be non-negative with at most two decimals';
      END IF;
    END IF;
    v_line_total:=CASE WHEN v_unit_cost IS NULL THEN NULL ELSE (v_quantity*v_unit_cost)::numeric(15,2) END;
    IF v_line_total IS NULL THEN v_costs_complete:=false; ELSE v_total:=v_total+v_line_total; END IF;
    INSERT INTO public.purchase_order_items(
      organization_id,purchase_order_id,product_id,item_code_snapshot,product_name_snapshot,unit_snapshot,
      quantity_ordered,unit_cost,line_total
    ) VALUES(v_org,v_po_id,v_product.id,v_product.item_code,v_product.name,v_product.unit,v_quantity,v_unit_cost,v_line_total);
    v_count:=v_count+1;
  END LOOP;
  UPDATE public.purchase_orders SET total_cost=CASE WHEN v_costs_complete THEN v_total ELSE NULL END,updated_at=now()
   WHERE id=v_po_id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'purchase_order.created','purchase_order',v_po_id,
    pg_catalog.jsonb_build_object('purchase_order_number',v_po_number,'supplier_id',p_supplier_id,
      'warehouse_id',p_warehouse_id,'line_count',v_count,'total_cost',CASE WHEN v_costs_complete THEN v_total ELSE NULL END));
  RETURN pg_catalog.jsonb_build_object('purchase_order',public.purchase_order_detail(v_po_id),'idempotent_replay',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_purchase_order(p_purchase_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid; v_po public.purchase_orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to submit purchase orders';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id=p_purchase_order_id AND po.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='purchase order is not available in this organization'; END IF;
  IF v_po.status='draft' THEN
    UPDATE public.purchase_orders SET status='submitted',submitted_by=v_actor,submitted_at=now(),updated_at=now() WHERE id=v_po.id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES(v_org,v_actor,'purchase_order.submitted','purchase_order',v_po.id,
      pg_catalog.jsonb_build_object('status','draft'),pg_catalog.jsonb_build_object('status','submitted'));
  ELSIF v_po.status NOT IN ('submitted','partially_received') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only draft purchase orders can be submitted';
  END IF;
  RETURN pg_catalog.jsonb_build_object('purchase_order',public.purchase_order_detail(v_po.id),'idempotent_replay',v_po.status<>'draft');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_purchase_order(p_purchase_order_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid; v_po public.purchase_orders%ROWTYPE; v_reason text:=pg_catalog.btrim(COALESCE(p_reason,''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to cancel purchase orders';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id=p_purchase_order_id AND po.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='purchase order is not available in this organization'; END IF;
  IF v_po.status='cancelled' THEN RETURN pg_catalog.jsonb_build_object('purchase_order',public.purchase_order_detail(v_po.id),'idempotent_replay',true); END IF;
  IF v_po.status NOT IN ('draft','submitted') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='purchase order cannot be cancelled after receiving has begun';
  END IF;
  IF v_reason='' OR pg_catalog.char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a cancellation reason between 1 and 1000 characters is required';
  END IF;
  UPDATE public.purchase_orders SET status='cancelled',cancelled_by=v_actor,cancelled_at=now(),cancellation_reason=v_reason,updated_at=now()
   WHERE id=v_po.id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'purchase_order.cancelled','purchase_order',v_po.id,
    pg_catalog.jsonb_build_object('status',v_po.status),pg_catalog.jsonb_build_object('status','cancelled','reason',v_reason));
  RETURN pg_catalog.jsonb_build_object('purchase_order',public.purchase_order_detail(v_po.id),'idempotent_replay',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.receive_purchase_order(
  p_purchase_order_id uuid,p_lines jsonb,p_notes text,p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid; v_po public.purchase_orders%ROWTYPE;
  v_line jsonb; v_item public.purchase_order_items%ROWTYPE;
  v_item_id uuid; v_qty numeric(15,3); v_seen uuid[]:=ARRAY[]::uuid[];
  v_receipt_id uuid; v_receipt_number text; v_existing public.purchase_receipts%ROWTYPE;
  v_fingerprint text; v_total numeric(15,2):=0; v_line_total numeric(15,2); v_costs_complete boolean:=true;
  v_balance public.inventory_balances%ROWTYPE; v_new_available numeric(15,3);
BEGIN
  IF auth.uid() IS NULL OR NOT public.purchase_orders_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager role required to receive purchase orders';
  END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT po.* INTO v_po FROM public.purchase_orders po WHERE po.id=p_purchase_order_id AND po.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='purchase order is not available in this organization'; END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid receipt idempotency key';
  END IF;
  IF p_notes IS NOT NULL AND pg_catalog.char_length(p_notes)>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt notes exceed 2000 characters';
  END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines)<>'array'
     OR pg_catalog.jsonb_array_length(p_lines)<1 OR pg_catalog.jsonb_array_length(p_lines)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt must contain between 1 and 100 item quantities';
  END IF;
  v_fingerprint:=pg_catalog.md5(v_po.id::text||'|'||COALESCE(p_notes,'')||'|'||p_lines::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':purchase-receipt:'||p_idempotency_key,0));
  SELECT r.* INTO v_existing FROM public.purchase_receipts r
   WHERE r.organization_id=v_org AND r.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='purchase receipt idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'purchase_order',public.purchase_order_detail(v_existing.purchase_order_id),
      'receipt',pg_catalog.jsonb_build_object('id',v_existing.id,'receipt_number',v_existing.receipt_number,'purchase_order_id',v_existing.purchase_order_id,'received_at',v_existing.received_at),
      'idempotent_replay',true
    );
  END IF;
  IF v_po.status NOT IN ('submitted','partially_received') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only submitted purchase orders with outstanding items can be received';
  END IF;
  -- Serialize stock intake to a warehouse, then lock ordered lines. This prevents concurrent
  -- receipts from racing the same available balance while preserving atomic ledger posting.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':purchase-receiving-warehouse:'||v_po.warehouse_id::text,0));

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF pg_catalog.jsonb_typeof(v_line)<>'object'
       OR pg_catalog.jsonb_typeof(v_line->'item_id')<>'string'
       OR pg_catalog.jsonb_typeof(v_line->'quantity')<>'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each receipt line requires item_id and numeric quantity';
    END IF;
    v_item_id:=(v_line->>'item_id')::uuid; v_qty:=(v_line->>'quantity')::numeric;
    IF v_item_id=ANY(v_seen) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate purchase order line in one receipt'; END IF;
    v_seen:=pg_catalog.array_append(v_seen,v_item_id);
    IF v_qty<=0 OR v_qty>999999999999.999 OR pg_catalog.round(v_qty,3)<>v_qty THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt quantity must be positive with at most three decimals';
    END IF;
    SELECT poi.* INTO v_item FROM public.purchase_order_items poi
     WHERE poi.id=v_item_id AND poi.purchase_order_id=v_po.id AND poi.organization_id=v_org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='receipt line does not belong to this purchase order'; END IF;
    IF v_item.quantity_received+v_qty>v_item.quantity_ordered THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='receipt quantity exceeds outstanding ordered quantity';
    END IF;
  END LOOP;

  INSERT INTO public.purchase_receipts(
    organization_id,purchase_order_id,receipt_number,warehouse_id,notes,idempotency_key,payload_fingerprint,received_by
  ) VALUES(
    v_org,v_po.id,'PR-'||pg_catalog.to_char(pg_catalog.now(),'YYYYMMDD')||'-'||
      pg_catalog.lpad(pg_catalog.nextval('public.purchase_receipt_number_seq'::regclass)::text,6,'0'),
    v_po.warehouse_id,NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),''),p_idempotency_key,v_fingerprint,v_actor
  ) RETURNING id,receipt_number INTO v_receipt_id,v_receipt_number;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    v_item_id:=(v_line->>'item_id')::uuid; v_qty:=(v_line->>'quantity')::numeric;
    SELECT poi.* INTO v_item FROM public.purchase_order_items poi
     WHERE poi.id=v_item_id AND poi.purchase_order_id=v_po.id AND poi.organization_id=v_org FOR UPDATE;
    UPDATE public.purchase_order_items SET quantity_received=quantity_received+v_qty
     WHERE id=v_item.id;
    v_seen:=ARRAY[]::uuid[];

    INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point)
    SELECT p.id,v_po.warehouse_id,0,0,COALESCE(p.min_stock,0)
      FROM public.products p WHERE p.id=v_item.product_id AND p.organization_id=v_org
    ON CONFLICT(product_id,warehouse_id) DO NOTHING;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
     WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_po.warehouse_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0001',MESSAGE='could not initialize inventory balance for receipt'; END IF;
    UPDATE public.inventory_balances SET quantity_on_hand=quantity_on_hand+v_qty,last_movement_at=now(),updated_at=now()
     WHERE id=v_balance.id RETURNING quantity_available INTO v_new_available;

    v_item_id:=v_item.id;
    v_line_total:=CASE WHEN v_item.unit_cost IS NULL THEN NULL ELSE (v_qty*v_item.unit_cost)::numeric(15,2) END;
    IF v_line_total IS NULL THEN v_costs_complete:=false; ELSE v_total:=v_total+v_line_total; END IF;
    INSERT INTO public.purchase_receipt_items(
      organization_id,receipt_id,purchase_order_item_id,product_id,quantity_received,unit_cost,line_total
    ) VALUES(v_org,v_receipt_id,v_item.id,v_item.product_id,v_qty,v_item.unit_cost,v_line_total);
    INSERT INTO public.inventory_movements(
      product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
    ) VALUES(v_item.product_id,v_po.warehouse_id,'purchase_receipt',v_qty,v_new_available,'purchase_receipt',v_receipt_id,
      COALESCE(NULLIF(pg_catalog.btrim(COALESCE(p_notes,'')),''),'استلام أمر شراء '||v_po.purchase_order_number),v_actor);
  END LOOP;

  UPDATE public.purchase_receipts SET received_cost=CASE WHEN v_costs_complete THEN v_total ELSE NULL END WHERE id=v_receipt_id;
  UPDATE public.purchase_orders po SET
    status=CASE WHEN NOT EXISTS(
      SELECT 1 FROM public.purchase_order_items poi WHERE poi.purchase_order_id=po.id AND poi.quantity_received<poi.quantity_ordered
    ) THEN 'received' ELSE 'partially_received' END,
    updated_at=now()
   WHERE po.id=v_po.id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'purchase_order.received','purchase_receipt',v_receipt_id,
    pg_catalog.jsonb_build_object('purchase_order_id',v_po.id,'prior_status',v_po.status),
    pg_catalog.jsonb_build_object('receipt_number',v_receipt_number,'purchase_order_number',v_po.purchase_order_number,
      'received_lines',pg_catalog.jsonb_array_length(p_lines),'received_cost',CASE WHEN v_costs_complete THEN v_total ELSE NULL END));

  RETURN pg_catalog.jsonb_build_object(
    'purchase_order',public.purchase_order_detail(v_po.id),
    'receipt',pg_catalog.jsonb_build_object('id',v_receipt_id,'receipt_number',v_receipt_number,'purchase_order_id',v_po.id,'received_at',now()),
    'idempotent_replay',false
  );
END;
$function$;

-- Link purchasing execution to the existing idempotent task center through persisted order events.
CREATE OR REPLACE FUNCTION public.operational_tasks_from_purchase_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_label text:=NEW.purchase_order_number;
BEGIN
  IF TG_OP='UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status IN ('submitted','partially_received') THEN
    PERFORM public.upsert_operational_task(NEW.organization_id,'استلام أمر الشراء '||v_label,
      'أمر شراء معتمد للتوريد وبانتظار الاستلام؛ لم يُرسل بريد أو رسالة للمورد تلقائيًا. راجع الكميات المستلمة والمتبقية في وحدة أوامر الشراء.',
      'warehouse','high','purchase_order_receiving','purchase-order-receiving:'||NEW.id::text,'purchase_orders',NEW.id,NULL,
      pg_catalog.jsonb_build_object('purchase_order_number',v_label,'status',NEW.status,'warehouse_id',NEW.warehouse_id),true);
  ELSIF NEW.status IN ('received','cancelled') THEN
    UPDATE public.ai_tasks SET status='completed',completed_at=COALESCE(completed_at,now()),completed_by=NULL,
      resolution_note=CASE WHEN NEW.status='received' THEN 'أُغلق تلقائيًا بعد استلام كامل أمر الشراء.' ELSE 'أُغلق تلقائيًا بعد إلغاء أمر الشراء.' END,
      updated_at=now()
    WHERE organization_id=NEW.organization_id AND source_entity_type='purchase_orders' AND source_entity_id=NEW.id
      AND task_role='warehouse' AND status IN ('pending','in_progress');
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS operational_tasks_purchase_order_event ON public.purchase_orders;
CREATE TRIGGER operational_tasks_purchase_order_event AFTER INSERT OR UPDATE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.operational_tasks_from_purchase_order();

REVOKE ALL ON FUNCTION public.create_purchase_order(uuid,uuid,jsonb,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.submit_purchase_order(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_purchase_order(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.receive_purchase_order(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order(uuid,uuid,jsonb,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_purchase_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_purchase_order(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order(uuid,jsonb,text,text) TO authenticated;

COMMENT ON TABLE public.purchase_orders IS 'Tenant-scoped supplier purchase orders with server-derived identity, price snapshots, and idempotent status transitions.';
COMMENT ON TABLE public.purchase_receipts IS 'Posted physical receipts with unique idempotency keys and transactional stock ledger writes.';
COMMENT ON FUNCTION public.receive_purchase_order(uuid,jsonb,text,text) IS 'Atomic partial/full receiving; reconciles ordered quantities, locks stock state, writes inventory movements, audits the action, and replays identical requests safely.';

DO $block$
BEGIN
  IF has_table_privilege('anon','public.purchase_orders','SELECT')
     OR has_table_privilege('authenticated','public.purchase_orders','SELECT')
     OR has_table_privilege('anon','public.purchase_receipts','SELECT')
     OR has_table_privilege('authenticated','public.purchase_receipts','SELECT') THEN
    RAISE EXCEPTION 'purchase order/receipt table privileges must remain RPC-only';
  END IF;
  IF has_function_privilege('anon','public.create_purchase_order(uuid,uuid,jsonb,text,text)','EXECUTE')
     OR has_function_privilege('anon','public.receive_purchase_order(uuid,jsonb,text,text)','EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute purchasing commands';
  END IF;
END;
$block$;
