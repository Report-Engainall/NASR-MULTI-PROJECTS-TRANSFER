CREATE OR REPLACE FUNCTION public.place_order(_items jsonb, _notes text, _business_name text, _contact_name text, _phone text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_pid uuid := public.current_profile_id(); v_cust uuid; c customers%ROWTYPE; v_org uuid := 'a0000000-0000-0000-0000-000000000001'; v_order uuid; v_no text; v_total numeric := 0; v_count int := 0; it jsonb; p products%ROWTYPE; q numeric; v_price numeric;
BEGIN
  IF v_pid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF jsonb_array_length(coalesce(_items,'[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'السلة فارغة'; END IF;
  IF length(coalesce(_contact_name,'')) < 2 OR length(coalesce(_phone,'')) < 6 THEN RAISE EXCEPTION 'الاسم ورقم الهاتف مطلوبان'; END IF;
  SELECT id INTO v_cust FROM customers WHERE profile_id = v_pid LIMIT 1;
  IF v_cust IS NULL THEN
    INSERT INTO customers (organization_id, profile_id, customer_code, business_name, contact_name, phone, email, tier, status)
    VALUES (v_org, v_pid, 'CUST-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)), left(coalesce(nullif(_business_name,''), _contact_name),200), left(_contact_name,120), left(_phone,40), (SELECT email FROM profiles WHERE id = v_pid), 'retail', 'pending')
    RETURNING id INTO v_cust;
  END IF;
  SELECT * INTO c FROM customers WHERE id = v_cust;
  IF c.status IN ('suspended','blocked','inactive') THEN RAISE EXCEPTION 'حسابك موقوف، يرجى التواصل مع الإدارة'; END IF;
  v_no := 'ORD-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  INSERT INTO orders (organization_id, customer_id, order_number, status, notes, created_by) VALUES (v_org, v_cust, v_no, 'pending', left(_notes,1000), v_pid) RETURNING id INTO v_order;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    q := (it->>'quantity')::numeric;
    IF q IS NULL OR q <= 0 OR q > 100000 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
    SELECT * INTO p FROM products WHERE id = (it->>'product_id')::uuid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'منتج غير متاح'; END IF;
    SELECT pp.price INTO v_price FROM product_prices pp WHERE pp.product_id = p.id AND pp.tier = c.tier AND pp.is_active AND pp.min_quantity <= q ORDER BY pp.min_quantity DESC LIMIT 1;
    v_price := coalesce(v_price, p.base_price);
    INSERT INTO order_items (order_id, product_id, item_code, product_name_snapshot, unit_snapshot, quantity, unit_price_snapshot, line_total)
    VALUES (v_order, p.id, p.item_code, p.name, p.unit, q, v_price, v_price * q);
    v_total := v_total + v_price * q; v_count := v_count + 1;
  END LOOP;
  IF coalesce(c.credit_limit,0) > 0 AND coalesce(c.current_balance,0) + v_total > c.credit_limit THEN
    RAISE EXCEPTION 'الطلب يتجاوز حد الائتمان المتاح (المتاح: %)', round(c.credit_limit - coalesce(c.current_balance,0), 2);
  END IF;
  UPDATE orders SET total_amount = v_total, total_items = v_count WHERE id = v_order;
  INSERT INTO order_status_history (order_id, to_status, changed_by, notes) VALUES (v_order, 'pending', v_pid, 'طلب من متجر العميل');
  INSERT INTO notifications (organization_id, profile_id, title, body, type) VALUES (v_org, v_pid, 'تم استلام طلبك ' || v_no, 'سنراجع طلبك ونبلغك بأي تحديث.', 'order');
  RETURN jsonb_build_object('id', v_order, 'order_number', v_no, 'total_amount', v_total);
END $function$;