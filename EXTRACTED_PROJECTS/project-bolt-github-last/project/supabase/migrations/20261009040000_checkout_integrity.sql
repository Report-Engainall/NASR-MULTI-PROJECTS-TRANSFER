-- Checkout integrity: tenant-safe tier pricing, request idempotency, credit checks,
-- and stock reservation/consumption inside the order status transaction.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_terms text NOT NULL DEFAULT 'cash_on_delivery',
  ADD COLUMN IF NOT EXISTS business_name_snapshot text,
  ADD COLUMN IF NOT EXISTS contact_name_snapshot text,
  ADD COLUMN IF NOT EXISTS phone_snapshot text,
  ADD COLUMN IF NOT EXISTS idempotency_payload_hash text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.orders'::regclass AND conname='orders_payment_terms_check'
  ) THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_terms_check
      CHECK (payment_terms IN ('cash_on_delivery','credit'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS orders_creator_idempotency_uidx
  ON public.orders(organization_id, created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- One price resolver shared by checkout and the pre-submit price preview.
CREATE OR REPLACE FUNCTION public.customer_product_unit_price(
  p_product_id uuid,
  p_organization_id uuid,
  p_tier text,
  p_quantity numeric
)
RETURNS numeric(15,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base_price numeric(15,2);
  v_price numeric(15,2);
BEGIN
  IF p_quantity IS NULL OR p_quantity<=0 OR p_quantity>10000
     OR p_quantity::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid pricing quantity';
  END IF;
  SELECT p.base_price INTO v_base_price
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=p_organization_id AND p.status='active';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product unavailable in this organization'; END IF;

  SELECT pp.price INTO v_price
    FROM public.product_prices pp
   WHERE pp.product_id=p_product_id AND pp.tier=coalesce(nullif(p_tier,''),'retail')
     AND pp.is_active AND pp.min_quantity<=p_quantity
   ORDER BY pp.min_quantity DESC
   LIMIT 1;
  IF NOT FOUND AND coalesce(nullif(p_tier,''),'retail')<>'retail' THEN
    SELECT pp.price INTO v_price
      FROM public.product_prices pp
     WHERE pp.product_id=p_product_id AND pp.tier='retail'
       AND pp.is_active AND pp.min_quantity<=p_quantity
     ORDER BY pp.min_quantity DESC
     LIMIT 1;
  END IF;
  IF NOT FOUND THEN v_price:=v_base_price; END IF;
  IF v_price IS NULL OR v_price<0 OR v_price::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid configured product price';
  END IF;
  RETURN pg_catalog.round(v_price,2);
END;
$$;
REVOKE ALL ON FUNCTION public.customer_product_unit_price(uuid,uuid,text,numeric) FROM PUBLIC,anon,authenticated;

DROP FUNCTION IF EXISTS public.place_order(jsonb,text,text,text,text);

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

    v_line_total := pg_catalog.round(v_unit_price*v_quantity,2);
    INSERT INTO public.order_items(
      order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,unit_price_snapshot,line_total
    )
    VALUES(v_order,v_product.id,v_product.item_code,v_product.name,v_product.unit,v_quantity,v_unit_price,v_line_total);
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

REVOKE ALL ON FUNCTION public.place_order(jsonb,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb,text,text,text,text,text,text) TO authenticated;

-- Quote the server's current tier/quantity price before the customer submits checkout.
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
    v_line_total:=pg_catalog.round(v_unit_price*v_quantity,2);
    v_total:=v_total+v_line_total;
    v_count:=v_count+1;
    v_items:=v_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id',v_product.id,
      'name',v_product.name,
      'item_code',v_product.item_code,
      'unit',v_product.unit,
      'quantity',v_quantity,
      'unit_price',v_unit_price,
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
REVOKE ALL ON FUNCTION public.preview_order_pricing(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_order_pricing(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_order_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_customer public.customers%ROWTYPE;
  v_line record;
  v_balance record;
  v_remaining numeric(15,3);
  v_take numeric(15,3);
  v_after numeric(15,3);
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status='confirmed' AND OLD.status NOT IN ('confirmed','processing','shipped','delivered') THEN
    IF NOT public.is_staff() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='اعتماد الطلب يتطلب صلاحية موظف'; END IF;
    SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_profile AND p.is_active;
    IF v_org IS NULL OR v_org<>NEW.organization_id THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='لا يمكنك اعتماد طلب تابع لمؤسسة أخرى';
    END IF;

    SELECT c.* INTO v_customer FROM public.customers c
     WHERE c.id=NEW.customer_id AND c.organization_id=NEW.organization_id
     FOR UPDATE;
    IF NOT FOUND OR v_customer.status<>'approved' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='يجب اعتماد حساب العميل قبل تأكيد الطلب';
    END IF;

    IF NEW.payment_terms='credit' THEN
      IF coalesce(v_customer.credit_limit,0)<=0
         OR coalesce(v_customer.current_balance,0)+NEW.total_amount>v_customer.credit_limit THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تجاوز الطلب حد الائتمان المتاح؛ لا يمكن اعتماد الطلب';
      END IF;
    END IF;

    FOR v_line IN
      SELECT oi.product_id,sum(oi.quantity)::numeric(15,3) AS quantity
        FROM public.order_items oi
       WHERE oi.order_id=NEW.id AND oi.product_id IS NOT NULL
       GROUP BY oi.product_id ORDER BY oi.product_id
    LOOP
      v_remaining:=v_line.quantity;
      FOR v_balance IN
        SELECT ib.id,ib.product_id,ib.warehouse_id,ib.quantity_available
          FROM public.inventory_balances ib
          JOIN public.warehouses w ON w.id=ib.warehouse_id
         WHERE ib.product_id=v_line.product_id
           AND w.organization_id=NEW.organization_id AND w.is_active
           AND ib.quantity_available>0
         ORDER BY ib.quantity_available DESC,ib.warehouse_id
         FOR UPDATE OF ib
      LOOP
        EXIT WHEN v_remaining<=0;
        v_take:=least(v_remaining,v_balance.quantity_available);
        UPDATE public.inventory_balances
           SET quantity_reserved=quantity_reserved+v_take,
               last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
         WHERE id=v_balance.id
         RETURNING quantity_available INTO v_after;
        INSERT INTO public.inventory_movements(
          product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
        )
        VALUES(v_line.product_id,v_balance.warehouse_id,'reserve',v_take,v_after,'order',NEW.id,
          'حجز المخزون عند اعتماد الطلب',v_profile);
        v_remaining:=v_remaining-v_take;
      END LOOP;
      IF v_remaining>0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='المخزون المتاح لا يكفي لتأكيد الطلب؛ تم إلغاء التغييرات بالكامل';
      END IF;
    END LOOP;
  END IF;

  IF NEW.status='delivered' AND OLD.status NOT IN ('confirmed','processing','shipped','delivered') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا يمكن تسليم طلب قبل اعتماده وتجهيزه';
  END IF;

  IF NEW.status='cancelled' AND OLD.status='delivered' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا يمكن إلغاء طلب تم تسليمه؛ استخدم إجراء مرتجع موثق';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_order_confirmation() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS orders_guard_confirmation_before_status_update ON public.orders;
CREATE TRIGGER orders_guard_confirmation_before_status_update
BEFORE UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.guard_order_confirmation();

CREATE OR REPLACE FUNCTION public.finalize_order_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_move record;
  v_after numeric(15,3);
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  IF NEW.status='delivered' AND OLD.status IN ('confirmed','processing','shipped') THEN
    FOR v_move IN
      SELECT im.product_id,im.warehouse_id,sum(im.quantity)::numeric(15,3) AS quantity
        FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
       GROUP BY im.product_id,im.warehouse_id
       ORDER BY im.product_id,im.warehouse_id
    LOOP
      UPDATE public.inventory_balances
         SET quantity_on_hand=quantity_on_hand-v_move.quantity,
             quantity_reserved=quantity_reserved-v_move.quantity,
             last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
       WHERE product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id
         AND quantity_on_hand>=v_move.quantity AND quantity_reserved>=v_move.quantity
       RETURNING quantity_available INTO v_after;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تعذر تسوية مخزون الطلب؛ لم يتم إكمال التسليم'; END IF;
      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
      )
      VALUES(v_move.product_id,v_move.warehouse_id,'sale',-v_move.quantity,v_after,'order',NEW.id,
        'خصم المخزون عند التسليم',v_profile);
    END LOOP;
  ELSIF NEW.status='cancelled' AND OLD.status IN ('confirmed','processing','shipped') THEN
    FOR v_move IN
      SELECT im.product_id,im.warehouse_id,sum(im.quantity)::numeric(15,3) AS quantity
        FROM public.inventory_movements im
       WHERE im.reference_type='order' AND im.reference_id=NEW.id AND im.movement_type='reserve'
       GROUP BY im.product_id,im.warehouse_id
       ORDER BY im.product_id,im.warehouse_id
    LOOP
      UPDATE public.inventory_balances
         SET quantity_reserved=quantity_reserved-v_move.quantity,
             last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
       WHERE product_id=v_move.product_id AND warehouse_id=v_move.warehouse_id
         AND quantity_reserved>=v_move.quantity
       RETURNING quantity_available INTO v_after;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تعذر تحرير حجز المخزون؛ لم يتم إكمال الإلغاء'; END IF;
      INSERT INTO public.inventory_movements(
        product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by
      )
      VALUES(v_move.product_id,v_move.warehouse_id,'release_reservation',v_move.quantity,v_after,'order',NEW.id,
        'تحرير حجز المخزون عند إلغاء الطلب',v_profile);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_finalize_inventory_after_status_update ON public.orders;
CREATE TRIGGER orders_finalize_inventory_after_status_update
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.finalize_order_inventory();

-- Issue a single invoice after staff confirmation and keep the legacy account balance synchronized.
CREATE OR REPLACE FUNCTION public.issue_invoice_for_confirmed_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invoice uuid;
  v_subtotal numeric(15,2);
  v_currency text;
  v_org uuid;
BEGIN
  IF NEW.status<>'confirmed' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NOT public.is_staff() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff confirmation required to issue invoice'; END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=public.current_profile_id() AND p.is_active;
  IF v_org IS NULL OR v_org<>NEW.organization_id THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='order belongs to a different organization';
  END IF;
  SELECT coalesce(sum(oi.line_total),0)::numeric(15,2) INTO v_subtotal
    FROM public.order_items oi WHERE oi.order_id=NEW.id;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=NEW.organization_id;
  INSERT INTO public.customer_invoices(
    organization_id,customer_id,order_id,invoice_number,status,issued_at,currency,subtotal,tax_amount,total_amount
  )
  VALUES(
    NEW.organization_id,NEW.customer_id,NEW.id,
    'INV-'||pg_catalog.to_char(pg_catalog.now(),'YYMMDD')||'-'||
       pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
    'issued',pg_catalog.now(),coalesce(v_currency,'YER'),v_subtotal,0,v_subtotal
  )
  ON CONFLICT(order_id) DO NOTHING
  RETURNING id INTO v_invoice;

  IF v_invoice IS NOT NULL THEN
    INSERT INTO public.customer_invoice_items(
      organization_id,invoice_id,product_id,item_code,description,unit,quantity,unit_price,line_total
    )
    SELECT NEW.organization_id,v_invoice,oi.product_id,oi.item_code,oi.product_name_snapshot,
           oi.unit_snapshot,oi.quantity,oi.unit_price_snapshot,oi.line_total
      FROM public.order_items oi WHERE oi.order_id=NEW.id;

    UPDATE public.customers
       SET current_balance=coalesce(current_balance,0)+v_subtotal,updated_at=pg_catalog.now()
     WHERE id=NEW.customer_id AND organization_id=NEW.organization_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_invoice_for_confirmed_order() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.refresh_customer_invoice_payment_status() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_customer_payment_balance_delta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    UPDATE public.customers SET current_balance=coalesce(current_balance,0)-NEW.amount,updated_at=pg_catalog.now()
     WHERE id=NEW.customer_id AND organization_id=NEW.organization_id;
    RETURN NEW;
  ELSIF TG_OP='UPDATE' THEN
    UPDATE public.customers SET current_balance=coalesce(current_balance,0)+OLD.amount-NEW.amount,updated_at=pg_catalog.now()
     WHERE id=NEW.customer_id AND organization_id=NEW.organization_id;
    RETURN NEW;
  ELSE
    UPDATE public.customers SET current_balance=coalesce(current_balance,0)+OLD.amount,updated_at=pg_catalog.now()
     WHERE id=OLD.customer_id AND organization_id=OLD.organization_id;
    RETURN OLD;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_customer_payment_balance_delta() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS customer_payments_account_balance_delta ON public.customer_payments;
CREATE TRIGGER customer_payments_account_balance_delta
AFTER INSERT OR UPDATE OR DELETE ON public.customer_payments
FOR EACH ROW EXECUTE FUNCTION public.apply_customer_payment_balance_delta();
