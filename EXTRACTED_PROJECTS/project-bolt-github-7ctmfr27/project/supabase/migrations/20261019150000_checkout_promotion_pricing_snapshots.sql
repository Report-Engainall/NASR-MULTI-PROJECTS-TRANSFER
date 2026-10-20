-- Apply a single, tenant-scoped campaign at order price resolution time.
-- Persist exact terms on each new order line. Old lines retain zero discount defaults;
-- historical invoices are not recalculated or manufactured.
BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS promotion_discount_per_unit_snapshot numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS promotion_title_snapshot text,
  ADD COLUMN IF NOT EXISTS promotion_discount_type_snapshot text,
  ADD COLUMN IF NOT EXISTS promotion_discount_value_snapshot numeric(15,2);

ALTER TABLE public.customer_invoice_items
  ADD COLUMN IF NOT EXISTS discount_snapshot numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_discount_per_unit_snapshot numeric(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS promotion_title_snapshot text,
  ADD COLUMN IF NOT EXISTS promotion_discount_type_snapshot text,
  ADD COLUMN IF NOT EXISTS promotion_discount_value_snapshot numeric(15,2);

CREATE OR REPLACE FUNCTION public.resolve_active_promotion_price(
  p_product_id uuid,
  p_organization_id uuid,
  p_gross_unit_price numeric
)
RETURNS TABLE(
  net_unit_price numeric(15,2),
  discount_per_unit numeric(15,2),
  promotion_id uuid,
  promotion_title text,
  discount_type text,
  discount_value numeric(15,2)
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_product public.products%ROWTYPE;
  v_gross numeric(15,2) := pg_catalog.round(p_gross_unit_price,2);
  v_floor numeric(15,2);
BEGIN
  IF p_product_id IS NULL OR p_organization_id IS NULL OR p_gross_unit_price IS NULL
     OR p_gross_unit_price < 0 OR p_gross_unit_price::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid promotion price context';
  END IF;
  SELECT p.* INTO v_product
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=p_organization_id AND p.status='active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Product is unavailable in the current organization';
  END IF;
  v_floor := GREATEST(coalesce(v_product.cost_price,0),0);
  IF v_gross <= v_floor THEN
    RETURN QUERY SELECT v_gross,0::numeric(15,2),NULL::uuid,NULL::text,NULL::text,NULL::numeric(15,2);
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT pr.id AS candidate_id,pr.title AS candidate_title,pr.discount_type AS candidate_type,
           pr.discount_value AS candidate_value,pr.created_at AS candidate_created_at,
           CASE WHEN pr.discount_type='percentage'
             THEN pg_catalog.round(v_gross*pr.discount_value/100,2)
             ELSE pg_catalog.round(pr.discount_value,2)
           END::numeric(15,2) AS requested_discount
      FROM public.promotions pr
     WHERE pr.organization_id=p_organization_id
       AND pr.is_active=true
       AND pr.start_date<=CURRENT_DATE
       AND pr.end_date>=CURRENT_DATE
       AND (
         (coalesce(pg_catalog.cardinality(pr.product_ids),0)=0
          AND coalesce(pg_catalog.cardinality(pr.category_ids),0)=0)
         OR p_product_id=ANY(coalesce(pr.product_ids,ARRAY[]::uuid[]))
         OR (v_product.category_id IS NOT NULL
             AND v_product.category_id=ANY(coalesce(pr.category_ids,ARRAY[]::uuid[])))
       )
  ), allowed AS (
    SELECT c.*,
           LEAST(c.requested_discount,GREATEST(v_gross-v_floor,0))::numeric(15,2) AS actual_discount
      FROM candidates c
     WHERE c.requested_discount>0
  )
  SELECT pg_catalog.round(v_gross-a.actual_discount,2),a.actual_discount,
         a.candidate_id,a.candidate_title,a.candidate_type,a.candidate_value
    FROM allowed a
   WHERE a.actual_discount>0
   ORDER BY a.actual_discount DESC,a.candidate_created_at DESC,a.candidate_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_gross,0::numeric(15,2),NULL::uuid,NULL::text,NULL::text,NULL::numeric(15,2);
  END IF;
END
$function$;

CREATE OR REPLACE FUNCTION public.resolve_promotion_snapshot_discount(
  p_product_id uuid,
  p_gross_unit_price numeric,
  p_discount_type text,
  p_discount_value numeric
)
RETURNS numeric(15,2)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_cost numeric(15,2);
  v_requested numeric(15,2);
  v_gross numeric(15,2) := pg_catalog.round(p_gross_unit_price,2);
BEGIN
  IF p_product_id IS NULL OR p_gross_unit_price IS NULL OR v_gross<0
     OR v_gross::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Invalid promotion snapshot price';
  END IF;
  IF p_discount_type IS NULL OR p_discount_value IS NULL OR p_discount_value<=0
     OR p_discount_type NOT IN ('percentage','fixed') THEN RETURN 0; END IF;
  SELECT GREATEST(coalesce(p.cost_price,0),0)::numeric(15,2)
    INTO v_cost FROM public.products p WHERE p.id=p_product_id AND p.status='active';
  IF NOT FOUND OR v_gross<=v_cost THEN RETURN 0; END IF;
  IF p_discount_type='percentage' THEN
    v_requested:=pg_catalog.round(v_gross*p_discount_value/100,2);
  ELSE
    v_requested:=pg_catalog.round(p_discount_value,2);
  END IF;
  RETURN LEAST(GREATEST(v_requested,0),GREATEST(v_gross-v_cost,0))::numeric(15,2);
END
$function$;

REVOKE ALL ON FUNCTION public.resolve_active_promotion_price(uuid,uuid,numeric) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.resolve_promotion_snapshot_discount(uuid,numeric,text,numeric) FROM PUBLIC,anon,authenticated;
-- Internal order review helper remains uncallable from browser roles.

CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _notes text,
  _business_name text,
  _contact_name text,
  _phone text,
  _payment_terms text DEFAULT 'cash_on_delivery',
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_customer uuid;
  v_tier text := 'retail';
  v_customer_status text := 'pending';
  v_credit_limit numeric(15,2) := 0;
  v_current_balance numeric(15,2) := 0;
  v_order uuid;
  v_order_no text;
  v_total numeric(15,2) := 0;
  v_total_items integer := 0;
  v_line jsonb;
  v_aggregated record;
  v_payload_hash text;
  v_existing_hash text;
  v_existing_terms text;
  v_existing_order uuid;
  v_existing_order_no text;
  v_existing_total numeric(15,2);
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_product public.products%ROWTYPE;
  v_unit_price numeric(15,2);
  v_line_total numeric(15,2);
  v_discount_per_unit numeric(15,2) := 0;
  v_discount_total numeric(15,2) := 0;
  v_promotion record;
  v_key text := nullif(pg_catalog.btrim(coalesce(_idempotency_key,'')),'');
  v_terms text := pg_catalog.lower(pg_catalog.btrim(coalesce(_payment_terms,'cash_on_delivery')));
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='يجب تسجيل الدخول'; END IF;
  IF v_key IS NULL OR pg_catalog.length(v_key)<16 OR pg_catalog.length(v_key)>128
     OR v_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح محاولة الطلب غير صالح؛ حدّث الصفحة وحاول مرة أخرى';
  END IF;
  IF v_terms NOT IN ('cash_on_delivery','credit') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='شروط الدفع غير صالحة';
  END IF;
  IF _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array'
     OR pg_catalog.jsonb_array_length(_items)<1 OR pg_catalog.jsonb_array_length(_items)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب أن تحتوي السلة على صنف واحد إلى 100 صنف';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(coalesce(_contact_name,'')))<2
     OR pg_catalog.length(pg_catalog.btrim(coalesce(_phone,'')))<6 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الاسم ورقم الهاتف مطلوبان';
  END IF;

  -- Validate all lines before computing a stable payload fingerprint or looking up a replay.
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(_items) LOOP
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      v_quantity := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='رمز المنتج أو الكمية غير صالح';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<>pg_catalog.trunc(v_quantity)
       OR v_quantity<1 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000';
    END IF;
  END LOOP;

  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'items',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('product_id',item.product_id::text,'quantity',item.quantity) ORDER BY item.product_id),'[]'::jsonb),
    'notes',pg_catalog.left(coalesce(_notes,''),1000),
    'business_name',pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
    'contact_name',pg_catalog.left(pg_catalog.btrim(_contact_name),120),
    'phone',pg_catalog.left(pg_catalog.btrim(_phone),40),
    'payment_terms',v_terms
  )::text) INTO v_payload_hash
  FROM (
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
  ) AS item;

  -- Serialize submissions from the same authenticated profile using the same retry key.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profile::text || ':' || v_key,0));

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
   FOR UPDATE;
  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='حسابك غير مرتبط بمؤسسة نشطة';
  END IF;

  -- If the same submission already committed, return the original server result.
  SELECT o.id,o.order_number,o.total_amount,o.idempotency_payload_hash,o.payment_terms
    INTO v_existing_order,v_existing_order_no,v_existing_total,v_existing_hash,v_existing_terms
    FROM public.orders o
   WHERE o.organization_id=v_org AND o.created_by=v_profile AND o.idempotency_key=v_key
   LIMIT 1;
  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح منع التكرار استُخدم سابقًا لبيانات طلب مختلفة؛ راجع طلباتك قبل إنشاء طلب جديد';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing_order,'order_number',v_existing_order_no,'total_amount',v_existing_total,
      'payment_terms',v_existing_terms,'idempotent_replay',true
    );
  END IF;

  SELECT c.id,c.tier,c.status,coalesce(c.credit_limit,0),coalesce(c.current_balance,0)
    INTO v_customer,v_tier,v_customer_status,v_credit_limit,v_current_balance
    FROM public.customers c
   WHERE c.profile_id=v_profile AND c.organization_id=v_org
   ORDER BY c.created_at
   LIMIT 1
   FOR UPDATE;

  IF v_customer IS NULL THEN
    INSERT INTO public.customers(
      organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,status
    )
    VALUES(
      v_org,v_profile,
      'CUST-'||pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
      pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
      pg_catalog.left(pg_catalog.btrim(_contact_name),120),
      pg_catalog.left(pg_catalog.btrim(_phone),40),
      (SELECT p.email FROM public.profiles p WHERE p.id=v_profile),
      'retail','pending'
    )
    RETURNING id,tier,status,coalesce(credit_limit,0),coalesce(current_balance,0)
      INTO v_customer,v_tier,v_customer_status,v_credit_limit,v_current_balance;
  END IF;

  v_tier := coalesce(nullif(v_tier,''),'retail');
  IF v_customer_status<>'approved' THEN v_tier:='retail'; END IF;
  v_order_no := 'ORD-'||pg_catalog.to_char(pg_catalog.now(),'YYMMDD')||'-'||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8));

  INSERT INTO public.orders(
    organization_id,customer_id,order_number,status,notes,created_by,idempotency_key,payment_terms,
    business_name_snapshot,contact_name_snapshot,phone_snapshot,idempotency_payload_hash
  )
  VALUES(
    v_org,v_customer,v_order_no,'pending',
    pg_catalog.left(coalesce(_notes,''),1000),v_profile,v_key,v_terms,
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
    pg_catalog.left(pg_catalog.btrim(_contact_name),120),pg_catalog.left(pg_catalog.btrim(_phone),40),v_payload_hash
  )
  RETURNING id INTO v_order;

  -- Consolidate duplicate product rows and price each aggregate using the customer's tier.
  FOR v_aggregated IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
     ORDER BY (entry.value->>'product_id')::uuid
  LOOP
    v_product_id := v_aggregated.product_id;
    v_quantity := v_aggregated.quantity;
    IF v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='إجمالي كمية الصنف الواحد لا يمكن أن يتجاوز 10000';
    END IF;

    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='أحد المنتجات غير متاح في مؤسستك'; END IF;

    v_unit_price:=public.customer_product_unit_price(v_product.id,v_org,v_tier,v_quantity);
    SELECT * INTO v_promotion
      FROM public.resolve_active_promotion_price(v_product.id,v_org,v_unit_price);
    v_discount_per_unit := v_promotion.discount_per_unit;
    v_discount_total := pg_catalog.round(v_discount_per_unit*v_quantity,2);
    v_line_total := pg_catalog.round((v_unit_price-v_discount_per_unit)*v_quantity,2);
    INSERT INTO public.order_items(
      order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,
      unit_price_snapshot,discount_snapshot,promotion_discount_per_unit_snapshot,
      promotion_id_snapshot,promotion_title_snapshot,promotion_discount_type_snapshot,
      promotion_discount_value_snapshot,line_total
    )
    VALUES(
      v_order,v_product.id,v_product.item_code,v_product.name,v_product.unit,v_quantity,
      v_unit_price,v_discount_total,v_discount_per_unit,
      v_promotion.promotion_id,v_promotion.promotion_title,v_promotion.discount_type,
      v_promotion.discount_value,v_line_total
    );
    v_total := v_total+v_line_total;
    v_total_items := v_total_items+1;
  END LOOP;

  IF v_terms='credit' THEN
    IF v_customer_status<>'approved' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الدفع الآجل متاح للحسابات التجارية المعتمدة فقط';
    END IF;
    IF v_credit_limit<=0 OR v_current_balance+v_total>v_credit_limit THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تجاوز الطلب حد الائتمان المتاح؛ اختر الدفع عند الاستلام أو تواصل مع إدارة الحساب';
    END IF;
  END IF;

  UPDATE public.orders SET total_amount=v_total,total_items=v_total_items,updated_at=pg_catalog.now() WHERE id=v_order;
  INSERT INTO public.order_status_history(order_id,to_status,changed_by,notes)
  VALUES(v_order,'pending',v_profile,'طلب من متجر العميل');

  RETURN pg_catalog.jsonb_build_object(
    'id',v_order,'order_number',v_order_no,'total_amount',v_total,
    'payment_terms',v_terms,'idempotent_replay',false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_order_pricing(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_tier text := 'retail';
  v_customer_status text := 'pending';
  v_currency text := 'YER';
  v_line jsonb;
  v_aggregated record;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_unit_price numeric(15,2);
  v_line_total numeric(15,2);
  v_discount_per_unit numeric(15,2) := 0;
  v_promotion record;
  v_total numeric(15,2):=0;
  v_items jsonb:='[]'::jsonb;
  v_count integer:=0;
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  IF _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='items must be an array';
  END IF;
  IF pg_catalog.jsonb_array_length(_items)<1 OR pg_catalog.jsonb_array_length(_items)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cart must contain between 1 and 100 items';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization context required';
  END IF;

  SELECT c.tier,c.status INTO v_tier,v_customer_status
    FROM public.customers c
   WHERE c.profile_id=v_profile AND c.organization_id=v_org
   ORDER BY c.created_at LIMIT 1;
  IF NOT FOUND THEN
    v_tier:='retail';
    v_customer_status:='pending';
  END IF;
  v_tier:=coalesce(nullif(v_tier,''),'retail');
  IF v_customer_status<>'approved' THEN v_tier:='retail'; END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(_items) LOOP
    BEGIN
      v_product_id:=(v_line->>'product_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid product id or quantity';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<>pg_catalog.trunc(v_quantity)
       OR v_quantity<1 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be a positive integer not exceeding 10000';
    END IF;
  END LOOP;

  FOR v_aggregated IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
     ORDER BY (entry.value->>'product_id')::uuid
  LOOP
    v_product_id:=v_aggregated.product_id;
    v_quantity:=v_aggregated.quantity;
    IF v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='aggregate quantity exceeds 10000 for one product';
    END IF;
    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product is unavailable in this organization'; END IF;

    v_unit_price:=public.customer_product_unit_price(v_product.id,v_org,v_tier,v_quantity);
    SELECT * INTO v_promotion
      FROM public.resolve_active_promotion_price(v_product.id,v_org,v_unit_price);
    v_discount_per_unit:=v_promotion.discount_per_unit;
    v_line_total:=pg_catalog.round((v_unit_price-v_discount_per_unit)*v_quantity,2);
    v_total:=v_total+v_line_total;
    v_count:=v_count+1;
    v_items:=v_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id',v_product.id,
      'name',v_product.name,
      'item_code',v_product.item_code,
      'unit',v_product.unit,
      'quantity',v_quantity,
      'unit_price',pg_catalog.round(v_unit_price-v_discount_per_unit,2),
      'original_unit_price',v_unit_price,
      'discount_per_unit',v_discount_per_unit,
      'discount_amount',pg_catalog.round(v_discount_per_unit*v_quantity,2),
      'promotion_title',v_promotion.promotion_title,
      'line_total',v_line_total
    ));
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,
    'total_amount',v_total,
    'currency',coalesce(v_currency,'YER'),
    'customer_tier',v_tier,
    'price_basis','server'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(
  p_product_ids uuid[],
  p_quantity numeric DEFAULT 1
)
RETURNS TABLE(product_id uuid, unit_price numeric(15,2))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_customer_id uuid;
  v_tier text := 'retail';
  v_customer_status text;
  v_is_staff boolean := false;
BEGIN
  IF p_product_ids IS NULL OR pg_catalog.cardinality(p_product_ids) = 0 THEN
    RETURN;
  END IF;

  IF pg_catalog.cardinality(p_product_ids) > 500
     OR pg_catalog.array_position(p_product_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product batch must contain at most 500 non-null ids';
  END IF;

  IF p_quantity IS NULL
     OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity <> pg_catalog.trunc(p_quantity)
     OR p_quantity < 1
     OR p_quantity > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='price quantity must be an integer between 1 and 10000';
  END IF;

  IF auth.uid() IS NULL THEN
    v_organization_id := public.public_storefront_organization_id();
  ELSE
    SELECT p.id, p.organization_id,
           EXISTS (
             SELECT 1
               FROM public.user_roles r
              WHERE r.profile_id = p.id
                AND r.role IN ('admin','manager','staff','accountant')
           )
      INTO v_profile_id, v_organization_id, v_is_staff
      FROM public.profiles p
     WHERE p.auth_user_id = auth.uid()
       AND p.is_active = true
     ORDER BY p.created_at, p.id
     LIMIT 1;

    IF v_profile_id IS NULL OR v_organization_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active profile and organization required to resolve catalog prices';
    END IF;

    IF NOT v_is_staff THEN
      v_customer_id := public.current_customer_id();
      IF v_customer_id IS NOT NULL THEN
        SELECT c.status, c.tier
          INTO v_customer_status, v_tier
          FROM public.customers c
         WHERE c.id = v_customer_id
           AND c.organization_id = v_organization_id;
        IF NOT FOUND OR v_customer_status IS DISTINCT FROM 'approved' THEN
          v_tier := 'retail';
        ELSE
          v_tier := coalesce(nullif(v_tier,''),'retail');
        END IF;
      ELSE
        v_tier := 'retail';
      END IF;
    END IF;
  END IF;

  IF v_organization_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.organizations o
        WHERE o.id = v_organization_id
          AND o.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active storefront organization is required';
  END IF;

  RETURN QUERY
    SELECT p.id,
           CASE WHEN v_is_staff THEN pg_catalog.round(p.base_price,2)
                ELSE (
                  SELECT resolved.net_unit_price
                    FROM public.resolve_active_promotion_price(
                      p.id,
                      v_organization_id,
                      public.customer_product_unit_price(p.id, v_organization_id, v_tier, p_quantity)
                    ) AS resolved
                )
           END::numeric(15,2)
      FROM public.products p
     WHERE p.id = ANY(p_product_ids)
       AND p.organization_id = v_organization_id
       AND p.status = 'active'
     ORDER BY p.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_order_lines(
  p_order_id uuid,
  p_lines jsonb,
  p_action text,
  p_customer_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_order public.orders%ROWTYPE;
  v_item public.order_items%ROWTYPE;
  v_line jsonb;
  v_line_id uuid;
  v_quantity numeric(15,3);
  v_price numeric(15,2);
  v_discount_per_unit numeric(15,2) := 0;
  v_reason text;
  v_changed boolean;
  v_adjusted boolean := false;
  v_changed_lines integer := 0;
  v_total numeric(15,2);
  v_total_items integer;
  v_submitted integer := 0;
  v_existing integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='إذن مراجعة الطلب مطلوب';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='المؤسسة المرتبطة بالحساب غير صالحة';
  END IF;
  IF p_action NOT IN ('stage','approve','discard') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='إجراء مراجعة الطلب غير صالح';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines)>500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='قائمة بنود المراجعة غير صالحة';
  END IF;
  IF coalesce(p_customer_note,'')<>'' AND length(p_customer_note)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ملاحظة العميل تتجاوز الحد المسموح';
  END IF;

  SELECT o.* INTO v_order
    FROM public.orders o
   WHERE o.id=p_order_id AND o.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='الطلب غير موجود في المؤسسة الحالية'; END IF;
  IF v_order.status NOT IN ('pending','draft') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مراجعة الكميات مسموحة قبل تأكيد الطلب فقط';
  END IF;
  IF p_action='discard' THEN
    UPDATE public.order_items
       SET proposed_quantity=NULL,proposed_unit_price=NULL,proposed_price_reason=NULL
     WHERE order_id=v_order.id;
    UPDATE public.orders SET quantity_review_required=false,updated_at=pg_catalog.now() WHERE id=v_order.id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    VALUES(v_org,v_actor,'order.review.discarded','order',v_order.id,jsonb_build_object('order_id',v_order.id));
    RETURN jsonb_build_object('order_id',v_order.id,'action','discard','quantity_review_required',false);
  END IF;

  SELECT count(*)::integer INTO v_existing FROM public.order_items oi WHERE oi.order_id=v_order.id;
  SELECT count(*)::integer INTO v_submitted
    FROM (
      SELECT value->>'item_id' AS item_id
        FROM jsonb_array_elements(p_lines)
    ) lines
   WHERE item_id IS NOT NULL;
  IF v_existing=0 OR v_submitted<>v_existing OR EXISTS (
    SELECT 1 FROM (
      SELECT value->>'item_id' AS item_id,count(*) AS duplicates
        FROM jsonb_array_elements(p_lines)
       GROUP BY value->>'item_id'
    ) lines
     WHERE item_id IS NULL OR duplicates<>1
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب إرسال كل بند من بنود الطلب مرة واحدة دون تكرار';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    IF coalesce(v_line->>'quantity','') !~ '^[0-9]+([.][0-9]{1,3})?$'
       OR coalesce(v_line->>'unit_price','') !~ '^[0-9]+([.][0-9]{1,2})?$' THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية أو السعر المقترح غير صالح';
    END IF;
    v_line_id:=(v_line->>'item_id')::uuid;
    v_quantity:=(v_line->>'quantity')::numeric;
    v_price:=(v_line->>'unit_price')::numeric;
    v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
    IF v_quantity<=0 OR v_quantity>10000 OR v_price<0 OR v_price>=1000000000000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية أو السعر خارج الحدود المسموحة';
    END IF;
    SELECT oi.* INTO v_item FROM public.order_items oi
     WHERE oi.id=v_line_id AND oi.order_id=v_order.id
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بند لا يتبع هذا الطلب'; END IF;
    IF round(v_price,2) IS DISTINCT FROM round(coalesce(v_item.unit_price_snapshot,0),2) AND v_reason IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سبب تعديل السعر مطلوب عند تغييره';
    END IF;
  END LOOP;

  IF p_action='stage' THEN
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_id:=(v_line->>'item_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
      v_price:=(v_line->>'unit_price')::numeric;
      v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
      UPDATE public.order_items
         SET proposed_quantity=v_quantity,
             proposed_unit_price=round(v_price,2),
             proposed_price_reason=CASE WHEN round(v_price,2) IS DISTINCT FROM (SELECT oi.unit_price_snapshot FROM public.order_items oi WHERE oi.id=v_line_id) THEN v_reason ELSE NULL END
       WHERE id=v_line_id AND order_id=v_order.id;
    END LOOP;
    SELECT EXISTS (
      SELECT 1 FROM public.order_items oi
       WHERE oi.order_id=v_order.id
         AND (
           oi.proposed_quantity IS DISTINCT FROM coalesce(oi.approved_quantity,oi.quantity)
           OR oi.proposed_unit_price IS DISTINCT FROM coalesce(oi.approved_unit_price,oi.unit_price_snapshot)
         )
    ) INTO v_changed;
    UPDATE public.orders SET quantity_review_required=v_changed,updated_at=pg_catalog.now() WHERE id=v_order.id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
    VALUES(v_org,v_actor,'order.review.staged','order',v_order.id,
      jsonb_build_object('line_count',v_submitted,'quantity_review_required',v_changed));
    RETURN jsonb_build_object('order_id',v_order.id,'action','stage','quantity_review_required',v_changed,'line_count',v_submitted);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items oi
     WHERE oi.order_id=v_order.id
       AND (oi.proposed_quantity IS NULL OR oi.proposed_unit_price IS NULL)
  ) THEN
    -- The final command must carry the complete, current review grid; staging is an explicit step.
    FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
    LOOP
      v_line_id:=(v_line->>'item_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
      v_price:=(v_line->>'unit_price')::numeric;
      v_reason:=nullif(left(btrim(coalesce(v_line->>'price_reason','')),500),'');
      UPDATE public.order_items
         SET proposed_quantity=v_quantity,
             proposed_unit_price=round(v_price,2),
             proposed_price_reason=CASE WHEN round(v_price,2) IS DISTINCT FROM (SELECT oi.unit_price_snapshot FROM public.order_items oi WHERE oi.id=v_line_id) THEN v_reason ELSE NULL END
       WHERE id=v_line_id AND order_id=v_order.id;
    END LOOP;
  ELSE
    -- Use the exact submitted grid to prevent approving stale or partial edits.
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lines) l
      JOIN public.order_items oi ON oi.id=(l.value->>'item_id')::uuid AND oi.order_id=v_order.id
      WHERE (l.value->>'quantity')::numeric IS DISTINCT FROM oi.proposed_quantity
         OR (l.value->>'unit_price')::numeric IS DISTINCT FROM oi.proposed_unit_price
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تغيرت مسودة الكميات؛ احفظ المسودة الحالية ثم أعد الاعتماد';
    END IF;
  END IF;

  FOR v_item IN SELECT oi.* FROM public.order_items oi WHERE oi.order_id=v_order.id ORDER BY oi.id FOR UPDATE
  LOOP
    IF v_item.proposed_quantity IS NULL OR v_item.proposed_unit_price IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='كل الكميات والأسعار يجب أن تكون محددة قبل الاعتماد';
    END IF;
    v_changed := v_item.proposed_quantity IS DISTINCT FROM coalesce(v_item.requested_quantity,v_item.quantity)
      OR v_item.proposed_unit_price IS DISTINCT FROM coalesce(v_item.unit_price_snapshot,v_item.proposed_unit_price);
    IF v_changed THEN
      v_adjusted:=true;
      v_changed_lines:=v_changed_lines+1;
    END IF;
    v_discount_per_unit := public.resolve_promotion_snapshot_discount(
      v_item.product_id,
      v_item.proposed_unit_price,
      v_item.promotion_discount_type_snapshot,
      v_item.promotion_discount_value_snapshot
    );
    UPDATE public.order_items
       SET quantity=v_item.proposed_quantity,
           approved_quantity=v_item.proposed_quantity,
           approved_unit_price=v_item.proposed_unit_price,
           unit_price_snapshot=v_item.proposed_unit_price,
           promotion_discount_per_unit_snapshot=v_discount_per_unit,
           discount_snapshot=round(v_discount_per_unit*v_item.proposed_quantity,2),
           line_total=round((v_item.proposed_unit_price-v_discount_per_unit)*v_item.proposed_quantity,2),
           price_override_reason=v_item.proposed_price_reason,
           adjusted_by=CASE WHEN v_changed THEN v_actor ELSE adjusted_by END,
           adjusted_at=CASE WHEN v_changed THEN pg_catalog.now() ELSE adjusted_at END,
           proposed_quantity=NULL,proposed_unit_price=NULL,proposed_price_reason=NULL
     WHERE id=v_item.id;
  END LOOP;

  SELECT coalesce(sum(oi.line_total),0)::numeric(15,2),count(*)::integer
    INTO v_total,v_total_items FROM public.order_items oi WHERE oi.order_id=v_order.id;

  UPDATE public.orders
     SET total_amount=v_total,
         total_items=v_total_items,
         quantity_review_required=false,
         customer_adjustment_note=CASE WHEN v_adjusted THEN
           coalesce(nullif(btrim(p_customer_note),''),'تنبيه: تم تعديل الأصناف/الكميات بحسب الكميات المتوفرة.')
           ELSE NULL END,
         admin_adjusted_at=CASE WHEN v_adjusted THEN pg_catalog.now() ELSE admin_adjusted_at END,
         updated_at=pg_catalog.now()
   WHERE id=v_order.id;

  -- Existing status trigger checks the customer, credit and available inventory. It then reserves stock,
  -- while the existing invoice trigger creates accounting documents in the same transaction.
  UPDATE public.orders SET status='confirmed',updated_at=pg_catalog.now() WHERE id=v_order.id;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'order.review.approved','order',v_order.id,
    jsonb_build_object('previous_status',v_order.status,'previous_total',v_order.total_amount),
    jsonb_build_object('status','confirmed','total_amount',v_total,'changed_lines',v_changed_lines,'adjusted',v_adjusted,
      'payment_request_status','requested'));

  RETURN jsonb_build_object(
    'order_id',v_order.id,'status','confirmed','total_amount',v_total,'total_items',v_total_items,
    'quantity_review_required',false,'adjusted',v_adjusted,'changed_lines',v_changed_lines,
    'payment_request_status','requested'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_invoice_for_confirmed_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invoice uuid;
  v_subtotal numeric(15,2);
BEGIN
  IF NEW.status <> 'confirmed' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff confirmation required to issue invoice'; END IF;
  SELECT coalesce(sum(oi.line_total),0)::numeric(15,2) INTO v_subtotal
    FROM public.order_items oi WHERE oi.order_id=NEW.id;
  INSERT INTO public.customer_invoices(organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,subtotal,tax_amount,total_amount)
  VALUES (NEW.organization_id, NEW.customer_id, NEW.id,
    'INV-' || pg_catalog.to_char(pg_catalog.now(),'YYMMDD') || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
    'issued', pg_catalog.now(), 'YER', v_subtotal, 0, v_subtotal)
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_invoice;
  IF v_invoice IS NOT NULL THEN
    INSERT INTO public.customer_invoice_items(
      organization_id,invoice_id,product_id,item_code,description,unit,quantity,unit_price,
      discount_snapshot,promotion_discount_per_unit_snapshot,promotion_id_snapshot,
      promotion_title_snapshot,promotion_discount_type_snapshot,promotion_discount_value_snapshot,line_total
    )
    SELECT NEW.organization_id, v_invoice, oi.product_id, oi.item_code, oi.product_name_snapshot,
           oi.unit_snapshot, oi.quantity, oi.unit_price_snapshot,oi.discount_snapshot,
           oi.promotion_discount_per_unit_snapshot,oi.promotion_id_snapshot,oi.promotion_title_snapshot,
           oi.promotion_discount_type_snapshot,oi.promotion_discount_value_snapshot,oi.line_total
      FROM public.order_items oi WHERE oi.order_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_customer_invoice_pdf(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid := public.current_customer_id();
  v_org uuid := public.current_organization_id();
  v_invoice jsonb;
  v_lines jsonb;
  v_customer_document jsonb;
  v_line_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_customer IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = v_profile
          AND p.auth_user_id = auth.uid()
          AND p.is_active
          AND p.organization_id = v_org
     )
     OR NOT public.current_customer_can('invoices.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='authenticated active customer with invoice-read permission required';
  END IF;

  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice id required';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'customer_id', i.customer_id,
    'status', i.status,
    'issued_at', i.issued_at,
    'due_at', i.due_at,
    'currency', i.currency,
    'subtotal', i.subtotal,
    'tax_amount', i.tax_amount,
    'total_amount', i.total_amount
  )
    INTO v_invoice
    FROM public.customer_invoices i
   WHERE i.id = p_invoice_id
     AND i.customer_id = v_customer
     AND i.organization_id = v_org;

  IF v_invoice IS NULL THEN
    -- Do not disclose whether another customer's invoice exists.
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='الفاتورة غير موجودة أو غير متاحة لهذا الحساب';
  END IF;

  SELECT count(*)::integer
    INTO v_line_count
    FROM public.customer_invoice_items i
   WHERE i.invoice_id = p_invoice_id
     AND i.organization_id = v_org;

  IF v_line_count > 500 THEN
    RAISE EXCEPTION USING ERRCODE='54000',
      MESSAGE='invoice contains too many lines for a complete PDF';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', i.id,
        'item_code', i.item_code,
        'description', i.description,
        'unit', i.unit,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'discount_snapshot', i.discount_snapshot,
        'promotion_discount_per_unit_snapshot', i.promotion_discount_per_unit_snapshot,
        'promotion_title_snapshot', i.promotion_title_snapshot,
        'line_total', i.line_total
      ) ORDER BY i.created_at, i.id
    ),
    '[]'::jsonb
  )
    INTO v_lines
    FROM public.customer_invoice_items i
   WHERE i.invoice_id = p_invoice_id
     AND i.organization_id = v_org;

  SELECT pg_catalog.jsonb_build_object(
    'customer_code', c.customer_code,
    'business_name', c.business_name,
    'contact_name', c.contact_name
  )
    INTO v_customer_document
    FROM public.customers c
   WHERE c.id = v_customer
     AND c.organization_id = v_org;

  IF v_customer_document IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='customer account is not linked to the active profile';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'invoice', v_invoice,
    'lines', v_lines,
    'customer', v_customer_document
  );
END;
$function$;

COMMIT;
