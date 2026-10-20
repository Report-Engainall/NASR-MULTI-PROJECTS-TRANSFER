-- Close the legacy two-request order creation path.
-- Every new order and line must be written in one server transaction using server-resolved prices.
-- Staff can change status through the guarded transition trigger, but cannot write financial
-- order columns or line prices directly through the PostgREST table API.

REVOKE INSERT, UPDATE, DELETE ON TABLE public.orders FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status) ON TABLE public.orders TO authenticated;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.order_items FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_staff_order(
  p_customer_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_payment_terms text DEFAULT 'cash_on_delivery'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_customer public.customers%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_order uuid;
  v_order_no text;
  v_key text := nullif(pg_catalog.btrim(coalesce(p_idempotency_key,'')),'');
  v_terms text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_terms,'cash_on_delivery')));
  v_payload_hash text;
  v_existing_hash text;
  v_existing public.orders%ROWTYPE;
  v_line jsonb;
  v_agg record;
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_price numeric(15,2);
  v_line_total numeric(15,2);
  v_total numeric(15,2) := 0;
  v_count integer := 0;
  v_return jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff permission required to create orders';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization is required';
  END IF;

  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer is required';
  END IF;
  IF v_key IS NULL OR pg_catalog.length(v_key)<16 OR pg_catalog.length(v_key)>128
     OR v_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='valid idempotency key is required';
  END IF;
  IF v_terms NOT IN ('cash_on_delivery','credit') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid payment terms';
  END IF;
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items)<>'array'
     OR pg_catalog.jsonb_array_length(p_items)<1 OR pg_catalog.jsonb_array_length(p_items)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='order must contain between 1 and 100 item rows';
  END IF;
  IF pg_catalog.length(coalesce(p_notes,''))>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='order notes exceed the allowed length';
  END IF;

  -- Validate product IDs and quantities. Client prices, item codes and product names are ignored.
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      v_quantity := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid product id or quantity';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<>pg_catalog.trunc(v_quantity)
       OR v_quantity<1 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be an integer between 1 and 10000';
    END IF;
  END LOOP;

  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'customer_id',p_customer_id::text,
    'items',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'product_id',item.product_id::text,'quantity',item.quantity
      ) ORDER BY item.product_id)
      FROM (
        SELECT (entry.value->>'product_id')::uuid AS product_id,
               sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
          FROM pg_catalog.jsonb_array_elements(p_items) AS entry(value)
         GROUP BY (entry.value->>'product_id')::uuid
      ) AS item
    ),'[]'::jsonb),
    'notes',pg_catalog.left(coalesce(p_notes,''),1000),
    'payment_terms',v_terms
  )::text) INTO v_payload_hash;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || v_key,0));

  -- A retry with the same key returns the original record only if the normalized payload matches.
  SELECT o.* INTO v_existing
    FROM public.orders o
   WHERE o.organization_id=v_org AND o.created_by=v_actor AND o.idempotency_key=v_key
   LIMIT 1
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing.idempotency_payload_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='idempotency key was already used for a different order payload';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing.id,'organization_id',v_existing.organization_id,'customer_id',v_existing.customer_id,
      'order_number',v_existing.order_number,'status',v_existing.status,'total_amount',v_existing.total_amount,
      'total_items',v_existing.total_items,'notes',v_existing.notes,'created_at',v_existing.created_at,
      'payment_terms',v_existing.payment_terms,'idempotent_replay',true
    );
  END IF;

  SELECT c.* INTO v_customer
    FROM public.customers c
   WHERE c.id=p_customer_id AND c.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer does not belong to the active staff organization';
  END IF;
  IF v_customer.status<>'approved' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account must be approved before order creation';
  END IF;
  IF v_terms='credit' AND (
       coalesce(v_customer.credit_limit,0)<=0
       OR coalesce(v_customer.current_balance,0)>=coalesce(v_customer.credit_limit,0)
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer has no available credit limit';
  END IF;

  v_order_no := 'ORD-'||pg_catalog.to_char(pg_catalog.now(),'YYMMDD')||'-'||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8));

  INSERT INTO public.orders(
    organization_id,customer_id,order_number,status,notes,created_by,idempotency_key,
    payment_terms,business_name_snapshot,contact_name_snapshot,phone_snapshot,idempotency_payload_hash,
    total_amount,total_items
  )
  VALUES(
    v_org,v_customer.id,v_order_no,'pending',pg_catalog.left(coalesce(p_notes,''),1000),v_actor,v_key,
    v_terms,v_customer.business_name,v_customer.contact_name,v_customer.phone,v_payload_hash,0,0
  )
  RETURNING id INTO v_order;

  FOR v_agg IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(p_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
     ORDER BY (entry.value->>'product_id')::uuid
  LOOP
    IF v_agg.quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='combined quantity for an item exceeds 10000';
    END IF;

    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_agg.product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product is not active in the staff organization';
    END IF;

    v_price := public.customer_product_unit_price(
      v_product.id,v_org,coalesce(nullif(v_customer.tier,''),'retail'),v_agg.quantity
    );
    v_line_total := pg_catalog.round(v_price*v_agg.quantity,2);

    INSERT INTO public.order_items(
      order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,
      unit_price_snapshot,line_total,requested_quantity,approved_quantity,approved_unit_price
    )
    VALUES(
      v_order,v_product.id,v_product.item_code,v_product.name,v_product.unit,v_agg.quantity,
      v_price,v_line_total,v_agg.quantity,v_agg.quantity,v_price
    );

    v_total := v_total+v_line_total;
    v_count := v_count+1;
  END LOOP;

  IF v_terms='credit' AND coalesce(v_customer.current_balance,0)+v_total>coalesce(v_customer.credit_limit,0) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='order exceeds available customer credit';
  END IF;

  UPDATE public.orders SET total_amount=v_total,total_items=v_count,updated_at=pg_catalog.now()
   WHERE id=v_order;

  INSERT INTO public.order_status_history(order_id,to_status,changed_by,notes)
  VALUES(v_order,'pending',v_actor,'طلب أنشأه موظف مخوّل');

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at)
  VALUES(
    v_org,v_actor,'order.created_by_staff','order',v_order,NULL,
    pg_catalog.jsonb_build_object('customer_id',v_customer.id,'total_items',v_count,'idempotency_key',v_key),
    pg_catalog.now()
  );

  SELECT pg_catalog.jsonb_build_object(
    'id',o.id,'organization_id',o.organization_id,'customer_id',o.customer_id,
    'order_number',o.order_number,'status',o.status,'total_amount',o.total_amount,
    'total_items',o.total_items,'notes',o.notes,'created_at',o.created_at,
    'payment_terms',o.payment_terms,'idempotent_replay',false
  ) INTO v_return FROM public.orders o WHERE o.id=v_order;
  RETURN v_return;
END;
$$;

REVOKE ALL ON FUNCTION public.create_staff_order(uuid,jsonb,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_staff_order(uuid,jsonb,text,text,text) TO authenticated;

DO $$
BEGIN
  IF has_table_privilege('authenticated','public.orders','INSERT')
     OR has_column_privilege('authenticated','public.orders','total_amount','UPDATE')
     OR has_table_privilege('authenticated','public.order_items','INSERT')
     OR has_column_privilege('authenticated','public.order_items','unit_price_snapshot','UPDATE')
     OR has_column_privilege('authenticated','public.order_items','line_total','UPDATE') THEN
    RAISE EXCEPTION 'Direct authenticated order creation or financial writes remain enabled';
  END IF;
  IF NOT has_column_privilege('authenticated','public.orders','status','UPDATE') THEN
    RAISE EXCEPTION 'Order status update permission required by guarded transition flow';
  END IF;
END $$;

COMMENT ON FUNCTION public.create_staff_order(uuid,jsonb,text,text,text) IS
  'Atomic tenant-bound staff order creation. Ignores all client-supplied prices and product descriptors, resolves prices using the shared server resolver, and binds idempotency to a normalized payload.';
