CREATE TABLE organizations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, legal_name text, tax_number text, currency text NOT NULL DEFAULT 'YER', phone text, email text, address text, logo_url text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE branches (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name text NOT NULL, code text, address text, phone text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE warehouses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, branch_id uuid REFERENCES branches(id) ON DELETE SET NULL, name text NOT NULL, code text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), auth_user_id uuid UNIQUE, organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL, full_name text NOT NULL, email text UNIQUE, phone text, avatar_url text, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE, role text NOT NULL DEFAULT 'customer', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(profile_id, role));
CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL, customer_code text NOT NULL, business_name text NOT NULL, contact_name text, phone text, email text, address text, tier text NOT NULL DEFAULT 'retail', credit_limit numeric(15,2) DEFAULT 0, current_balance numeric(15,2) DEFAULT 0, status text NOT NULL DEFAULT 'pending', approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id, customer_code));
CREATE TABLE suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, supplier_code text NOT NULL, name text NOT NULL, contact_name text, phone text, email text, address text, status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id, supplier_code));
CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, parent_id uuid REFERENCES categories(id) ON DELETE CASCADE, name text NOT NULL, code text, description text, sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE products (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, category_id uuid REFERENCES categories(id) ON DELETE SET NULL, name text NOT NULL, item_code text NOT NULL, barcode text, description text, unit text NOT NULL DEFAULT 'كرتون', base_price numeric(15,2) NOT NULL DEFAULT 0, cost_price numeric(15,2) DEFAULT 0, min_stock int DEFAULT 0, max_stock int, status text NOT NULL DEFAULT 'active', image_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id, item_code));
CREATE TABLE product_media (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, url text NOT NULL, alt_text text, sort_order int NOT NULL DEFAULT 0, is_primary boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE product_prices (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, tier text NOT NULL DEFAULT 'retail', price numeric(15,2) NOT NULL DEFAULT 0, min_quantity int NOT NULL DEFAULT 1, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_id, tier));
CREATE TABLE pricing_rules (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name text NOT NULL, scope_type text NOT NULL DEFAULT 'default', scope_value text, base_type text NOT NULL DEFAULT 'base_price', adjustment_type text NOT NULL DEFAULT 'percentage', adjustment_value numeric(10,2) NOT NULL DEFAULT 0, min_price numeric(15,2), max_price numeric(15,2), is_active boolean NOT NULL DEFAULT true, priority int NOT NULL DEFAULT 100, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE price_change_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid REFERENCES products(id) ON DELETE SET NULL, old_price numeric(15,2), new_price numeric(15,2), changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL, reason text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE inventory_balances (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE, quantity_on_hand numeric(15,3) NOT NULL DEFAULT 0, quantity_reserved numeric(15,3) NOT NULL DEFAULT 0, quantity_available numeric(15,3) GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED, reorder_point int DEFAULT 0, last_movement_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(product_id, warehouse_id));
CREATE TABLE inventory_movements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE, warehouse_id uuid NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE, movement_type text NOT NULL, quantity numeric(15,3) NOT NULL, balance_after numeric(15,3), reference_type text, reference_id uuid, reason text, created_by uuid REFERENCES profiles(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE orders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE, order_number text NOT NULL, status text NOT NULL DEFAULT 'draft', total_amount numeric(15,2) NOT NULL DEFAULT 0, total_items int NOT NULL DEFAULT 0, notes text, idempotency_key text, created_by uuid REFERENCES profiles(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id, order_number));
CREATE TABLE order_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id uuid REFERENCES products(id) ON DELETE SET NULL, item_code text, product_name_snapshot text NOT NULL, unit_snapshot text, quantity numeric(15,3) NOT NULL DEFAULT 1, unit_price_snapshot numeric(15,2) NOT NULL DEFAULT 0, discount_snapshot numeric(15,2) NOT NULL DEFAULT 0, line_total numeric(15,2) NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE order_status_history (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE, from_status text, to_status text NOT NULL, changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL, notes text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE notifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE, profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE, title text NOT NULL, body text, type text NOT NULL DEFAULT 'info', is_read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE, actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL, action text NOT NULL, entity_type text, entity_id uuid, old_value jsonb, new_value jsonb, ip_address text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE outbox_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE, event_type text NOT NULL, aggregate_id uuid, payload jsonb, idempotency_key text, status text NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0, last_attempt_at timestamptz, provider_reference text, error_class text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE import_jobs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE, job_type text NOT NULL, file_name text, file_hash text, file_size bigint, status text NOT NULL DEFAULT 'pending', total_rows int DEFAULT 0, processed_rows int DEFAULT 0, success_rows int DEFAULT 0, failed_rows int DEFAULT 0, data_quality_score int, error_summary jsonb, created_by uuid REFERENCES profiles(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);
CREATE TABLE import_job_rows (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE, row_number int NOT NULL, status text NOT NULL DEFAULT 'pending', data jsonb, errors jsonb, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE admin_settings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE, key text NOT NULL, value jsonb, category text NOT NULL DEFAULT 'general', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id, key));
CREATE TABLE promotions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, title text NOT NULL, description text, discount_type text NOT NULL DEFAULT 'percentage', discount_value numeric(10,2) NOT NULL DEFAULT 0, product_ids uuid[] DEFAULT '{}', category_ids uuid[] DEFAULT '{}', start_date date NOT NULL, end_date date NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ai_alerts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE, alert_type text NOT NULL, severity text NOT NULL DEFAULT 'info', title text NOT NULL, body text, entity_type text, entity_id uuid, is_resolved boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE ai_tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE, title text NOT NULL, description text, task_type text, priority text NOT NULL DEFAULT 'medium', status text NOT NULL DEFAULT 'pending', assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_orders_org_status ON orders(organization_id, status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_inventory_product ON inventory_balances(product_id);
CREATE INDEX idx_customers_profile ON customers(profile_id);
CREATE INDEX idx_notifications_profile ON notifications(profile_id);

-- Helper functions
CREATE OR REPLACE FUNCTION public.current_profile_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM profiles WHERE auth_user_id = auth.uid() LIMIT 1 $$;
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p JOIN user_roles r ON r.profile_id = p.id WHERE p.auth_user_id = auth.uid() AND r.role IN ('admin','manager','staff')) $$;

-- Grants + RLS + policies
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['organizations','branches','warehouses','profiles','user_roles','customers','suppliers','categories','products','product_media','product_prices','pricing_rules','price_change_log','inventory_balances','inventory_movements','orders','order_items','order_status_history','notifications','audit_logs','outbox_events','import_jobs','import_job_rows','admin_settings','promotions','ai_alerts','ai_tasks']) LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "staff_all_%s" ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())', t, t);
  END LOOP;
  FOR t IN SELECT unnest(ARRAY['organizations','warehouses','categories','products','product_media','product_prices','inventory_balances','promotions']) LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
    EXECUTE format('CREATE POLICY "public_read_%s" ON public.%I FOR SELECT TO anon, authenticated USING (true)', t, t);
  END LOOP;
END $$;

CREATE POLICY "own_profile_read" ON profiles FOR SELECT TO authenticated USING (auth_user_id = auth.uid());
CREATE POLICY "own_profile_update" ON profiles FOR UPDATE TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "own_roles_read" ON user_roles FOR SELECT TO authenticated USING (profile_id = public.current_profile_id());
CREATE POLICY "own_customer_read" ON customers FOR SELECT TO authenticated USING (profile_id = public.current_profile_id());
CREATE POLICY "own_orders_read" ON orders FOR SELECT TO authenticated USING (customer_id IN (SELECT id FROM customers WHERE profile_id = public.current_profile_id()));
CREATE POLICY "own_order_items_read" ON order_items FOR SELECT TO authenticated USING (order_id IN (SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.profile_id = public.current_profile_id()));
CREATE POLICY "own_order_history_read" ON order_status_history FOR SELECT TO authenticated USING (order_id IN (SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.profile_id = public.current_profile_id()));
CREATE POLICY "own_notifications_read" ON notifications FOR SELECT TO authenticated USING (profile_id = public.current_profile_id());
CREATE POLICY "own_notifications_update" ON notifications FOR UPDATE TO authenticated USING (profile_id = public.current_profile_id()) WITH CHECK (profile_id = public.current_profile_id());

-- Ensure profile exists for the signed-in user; first user becomes admin
CREATE OR REPLACE FUNCTION public.ensure_profile(_full_name text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_email text; v_pid uuid; v_name text; v_roles text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  SELECT id INTO v_pid FROM profiles WHERE auth_user_id = v_uid;
  IF v_pid IS NULL THEN
    INSERT INTO profiles (auth_user_id, organization_id, full_name, email)
    VALUES (v_uid, 'a0000000-0000-0000-0000-000000000001', coalesce(nullif(_full_name,''), split_part(v_email,'@',1), 'مستخدم'), nullif(v_email,''))
    ON CONFLICT (email) DO UPDATE SET auth_user_id = v_uid WHERE profiles.auth_user_id IS NULL
    RETURNING id INTO v_pid;
    IF v_pid IS NULL THEN RAISE EXCEPTION 'email already linked'; END IF;
    IF NOT EXISTS (SELECT 1 FROM user_roles r JOIN profiles p ON p.id = r.profile_id WHERE r.role = 'admin' AND p.auth_user_id IS NOT NULL AND p.id <> v_pid) THEN
      INSERT INTO user_roles (profile_id, role) VALUES (v_pid, 'admin') ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO user_roles (profile_id, role) VALUES (v_pid, 'customer') ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  SELECT full_name INTO v_name FROM profiles WHERE id = v_pid;
  SELECT array_agg(role) INTO v_roles FROM user_roles WHERE profile_id = v_pid;
  RETURN jsonb_build_object('profile_id', v_pid, 'full_name', v_name, 'email', v_email, 'roles', coalesce(v_roles, ARRAY[]::text[]));
END $$;
REVOKE EXECUTE ON FUNCTION public.ensure_profile(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;

-- Secure order placement: prices computed server-side
CREATE OR REPLACE FUNCTION public.place_order(_items jsonb, _notes text, _business_name text, _contact_name text, _phone text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pid uuid := public.current_profile_id(); v_cust uuid; v_org uuid := 'a0000000-0000-0000-0000-000000000001'; v_order uuid; v_no text; v_total numeric := 0; v_count int := 0; it jsonb; p products%ROWTYPE; q numeric;
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
  v_no := 'ORD-' || to_char(now(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  INSERT INTO orders (organization_id, customer_id, order_number, status, notes, created_by) VALUES (v_org, v_cust, v_no, 'pending', left(_notes,1000), v_pid) RETURNING id INTO v_order;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    q := (it->>'quantity')::numeric;
    IF q IS NULL OR q <= 0 OR q > 100000 THEN RAISE EXCEPTION 'كمية غير صالحة'; END IF;
    SELECT * INTO p FROM products WHERE id = (it->>'product_id')::uuid AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'منتج غير متاح'; END IF;
    INSERT INTO order_items (order_id, product_id, item_code, product_name_snapshot, unit_snapshot, quantity, unit_price_snapshot, line_total)
    VALUES (v_order, p.id, p.item_code, p.name, p.unit, q, p.base_price, p.base_price * q);
    v_total := v_total + p.base_price * q; v_count := v_count + 1;
  END LOOP;
  UPDATE orders SET total_amount = v_total, total_items = v_count WHERE id = v_order;
  INSERT INTO order_status_history (order_id, to_status, changed_by, notes) VALUES (v_order, 'pending', v_pid, 'طلب من متجر العميل');
  RETURN jsonb_build_object('id', v_order, 'order_number', v_no, 'total_amount', v_total);
END $$;
REVOKE EXECUTE ON FUNCTION public.place_order(jsonb, text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb, text, text, text, text) TO authenticated;

-- Seed data
DO $$
DECLARE
  v_org uuid := 'a0000000-0000-0000-0000-000000000001'; v_br1 uuid := 'b0000000-0000-0000-0000-000000000001'; v_br2 uuid := 'b0000000-0000-0000-0000-000000000002';
  v_wh1 uuid := 'd0000000-0000-0000-0000-000000000001'; v_wh2 uuid := 'd0000000-0000-0000-0000-000000000002'; v_prof uuid := 'f0000000-0000-0000-0000-000000000001';
  v_cat1 uuid := 'ca000000-0000-0000-0000-000000000001'; v_cat2 uuid := 'ca000000-0000-0000-0000-000000000002'; v_cat3 uuid := 'ca000000-0000-0000-0000-000000000003'; v_cat4 uuid := 'ca000000-0000-0000-0000-000000000004'; v_cat10 uuid := 'ca000000-0000-0000-0000-000000000010'; v_cat11 uuid := 'ca000000-0000-0000-0000-000000000011';
BEGIN
  INSERT INTO organizations (id, name, legal_name, currency, phone, email, address) VALUES (v_org, 'الأغبري للمواد الغذائية', 'شركة الأغبري للمواد الغذائية ذ.م.م', 'YER', '+967-1-234567', 'info@aghbari.ye', 'صنعاء - اليمن');
  INSERT INTO branches (id, organization_id, name, code, address, phone) VALUES (v_br1, v_org, 'الفرع الرئيسي - صنعاء', 'BR-SANA', 'صنعاء - شارع حدة', '+967-1-234567'), (v_br2, v_org, 'فرع عدن', 'BR-ADEN', 'عدن - خور مكسر', '+967-2-345678');
  INSERT INTO warehouses (id, organization_id, branch_id, name, code) VALUES (v_wh1, v_org, v_br1, 'مخزن صنعاء الرئيسي', 'WH-SANA-01'), (v_wh2, v_org, v_br2, 'مخزن عدن', 'WH-ADEN-01');
  INSERT INTO profiles (id, organization_id, full_name, email, phone) VALUES (v_prof, v_org, 'محمد الأغبري', 'admin@aghbari.ye', '+967-777-123456');
  INSERT INTO user_roles (profile_id, role) VALUES (v_prof, 'admin');
  INSERT INTO customers (id, organization_id, customer_code, business_name, contact_name, phone, tier, credit_limit, current_balance, status, approved_at) VALUES
  ('c0000000-0000-0000-0000-000000000001', v_org, 'CUST-001', 'سوق الوادي - فرع صنعاء', 'عامر محمد', '+967-777-111111', 'wholesale', 5000000, 1250000, 'approved', now()),
  ('c0000000-0000-0000-0000-000000000002', v_org, 'CUST-002', 'سوق الوادي - فرع عدن', 'أحمد عامر', '+967-777-222222', 'wholesale', 3000000, 850000, 'approved', now()),
  ('c0000000-0000-0000-0000-000000000003', v_org, 'CUST-003', 'بقالة النور', 'سعيد النور', '+967-777-333333', 'retail', 500000, 0, 'approved', now()),
  ('c0000000-0000-0000-0000-000000000004', v_org, 'CUST-004', 'مجمّع الأغبري التجاري', 'فهد الأغبري', '+967-777-444444', 'vip', 10000000, 3200000, 'approved', now()),
  ('c0000000-0000-0000-0000-000000000005', v_org, 'CUST-005', 'سوبر ماركت الأمل', 'منى الأمل', '+967-777-555555', 'wholesale', 2000000, 0, 'pending', NULL);
  INSERT INTO suppliers (id, organization_id, supplier_code, name, contact_name, phone, email) VALUES
  ('a2000000-0000-0000-0000-000000000001', v_org, 'SUP-001', 'مصنع السكر البرازيلي', 'Carlos Silva', '+55-11-12345678', 'sales@brasilsugar.br'),
  ('a2000000-0000-0000-0000-000000000002', v_org, 'SUP-002', 'شركة الأرز الباكستاني', 'Imran Khan', '+92-21-1234567', 'export@rice.pk'),
  ('a2000000-0000-0000-0000-000000000003', v_org, 'SUP-003', 'مطاحن اليمن للدقيق', 'عبدالله المطحن', '+967-1-987654', 'sales@yemenflour.ye');
  INSERT INTO categories (id, organization_id, parent_id, name, code, sort_order) VALUES
  (v_cat1, v_org, NULL, 'المواد الغذائية الأساسية', 'FOOD', 1), (v_cat2, v_org, NULL, 'المشروبات', 'BEV', 2), (v_cat3, v_org, NULL, 'المنظفات', 'CLEAN', 3), (v_cat4, v_org, NULL, 'المعلبات', 'CANNED', 4), (v_cat10, v_org, v_cat1, 'الحبوب والبقول', 'GRAINS', 1), (v_cat11, v_org, v_cat1, 'الزيوت', 'OILS', 2);
  INSERT INTO products (id, organization_id, category_id, name, item_code, barcode, description, unit, base_price, cost_price, min_stock, status) VALUES
  ('a1000000-0000-0000-0000-000000000001', v_org, v_cat10, 'سكر برازيلي 50ك', '10301002', '6001234500017', 'سكر أبيض مكرر برازيلي - كيس 50 كجم', 'كرتون', 38500, 35000, 50, 'active'),
  ('a1000000-0000-0000-0000-000000000002', v_org, v_cat10, 'أرز بسمتي فاخر', '10301015', '6001234500024', 'أرز بسمتي باكستاني فاخر - كيس 25 كجم', 'كرتون', 28000, 24000, 30, 'active'),
  ('a1000000-0000-0000-0000-000000000003', v_org, v_cat11, 'زيت دوار الشمس 1 لتر', '10301028', '6001234500031', 'زيت دوار شمس مكرر - عبوة 1 لتر', 'كرتون', 12500, 10000, 100, 'active'),
  ('a1000000-0000-0000-0000-000000000004', v_org, v_cat10, 'دقيق أبيض 50 كجم', '10301041', '6001234500048', 'دقيق قمح أبيض فاخر - كيس 50 كجم', 'كرتون', 17500, 15000, 40, 'active'),
  ('a1000000-0000-0000-0000-000000000005', v_org, v_cat2, 'معكرونة إيطالية 500ج', '10301054', '6001234500055', 'معكرونة إيطالية درجة أولى - عبوة 500 جم', 'كرتون', 4200, 3500, 80, 'active'),
  ('a1000000-0000-0000-0000-000000000006', v_org, v_cat2, 'عصير برتقال 1 لتر', '10301067', '6001234500062', 'عصير برتقال طبيعي 100% - عبوة 1 لتر', 'كرتون', 8500, 7000, 60, 'active'),
  ('a1000000-0000-0000-0000-000000000007', v_org, v_cat3, 'مسحوق غسيل 5ك', '10301070', '6001234500079', 'مسحوق غسيل أوتوماتيك - كيس 5 كجم', 'كرتون', 15000, 12000, 25, 'active'),
  ('a1000000-0000-0000-0000-000000000008', v_org, v_cat4, 'تونة قطع 185ج', '10301083', '6001234500086', 'تونة مصبرة قطع في زيت - علبة 185 جم', 'كرتون', 9500, 7500, 100, 'active'),
  ('a1000000-0000-0000-0000-000000000009', v_org, v_cat10, 'عدس أحمر 25ك', '10301096', '6001234500093', 'عدس أحمر مصري فاخر - كيس 25 كجم', 'كرتون', 22000, 18000, 35, 'active'),
  ('a1000000-0000-0000-0000-000000000010', v_org, v_cat11, 'زيت زيتون بكر 1 لتر', '10301109', '6001234500109', 'زيت زيتون بكر ممتاز - عبوة 1 لتر', 'كرتون', 35000, 28000, 20, 'active');
  INSERT INTO product_prices (product_id, tier, price, min_quantity) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'retail', 38500, 1), ('a1000000-0000-0000-0000-000000000001', 'wholesale', 37000, 10), ('a1000000-0000-0000-0000-000000000001', 'vip', 35500, 20),
  ('a1000000-0000-0000-0000-000000000002', 'retail', 28000, 1), ('a1000000-0000-0000-0000-000000000002', 'wholesale', 26500, 10), ('a1000000-0000-0000-0000-000000000002', 'vip', 25000, 20),
  ('a1000000-0000-0000-0000-000000000003', 'retail', 12500, 1), ('a1000000-0000-0000-0000-000000000003', 'wholesale', 11500, 10),
  ('a1000000-0000-0000-0000-000000000004', 'retail', 17500, 1), ('a1000000-0000-0000-0000-000000000004', 'wholesale', 16500, 10),
  ('a1000000-0000-0000-0000-000000000005', 'retail', 4200, 1), ('a1000000-0000-0000-0000-000000000006', 'retail', 8500, 1), ('a1000000-0000-0000-0000-000000000007', 'retail', 15000, 1),
  ('a1000000-0000-0000-0000-000000000008', 'retail', 9500, 1), ('a1000000-0000-0000-0000-000000000009', 'retail', 22000, 1), ('a1000000-0000-0000-0000-000000000010', 'retail', 35000, 1);
  INSERT INTO inventory_balances (product_id, warehouse_id, quantity_on_hand, quantity_reserved, reorder_point) VALUES
  ('a1000000-0000-0000-0000-000000000001', v_wh1, 548, 0, 50), ('a1000000-0000-0000-0000-000000000002', v_wh1, 324, 0, 30), ('a1000000-0000-0000-0000-000000000003', v_wh1, 89, 0, 100),
  ('a1000000-0000-0000-0000-000000000004', v_wh1, 276, 0, 40), ('a1000000-0000-0000-0000-000000000005', v_wh1, 12, 0, 80), ('a1000000-0000-0000-0000-000000000006', v_wh1, 450, 0, 60),
  ('a1000000-0000-0000-0000-000000000007', v_wh1, 180, 0, 25), ('a1000000-0000-0000-0000-000000000008', v_wh1, 620, 0, 100), ('a1000000-0000-0000-0000-000000000009', v_wh1, 95, 0, 35),
  ('a1000000-0000-0000-0000-000000000010', v_wh1, 45, 0, 20), ('a1000000-0000-0000-0000-000000000001', v_wh2, 320, 0, 50), ('a1000000-0000-0000-0000-000000000002', v_wh2, 210, 0, 30);
  INSERT INTO pricing_rules (organization_id, name, scope_type, adjustment_type, adjustment_value, is_active, priority) VALUES
  (v_org, 'تسعير تلقائي حسب التغطية', 'default', 'percentage', 2, true, 100), (v_org, 'خصم الكميات الكبيرة', 'default', 'percentage', -5, true, 200), (v_org, 'تسعير العملاء المميزين', 'tier', 'percentage', -3, false, 300), (v_org, 'تسعير حسب المواسم', 'seasonal', 'percentage', 5, true, 400);
  INSERT INTO promotions (organization_id, title, description, discount_type, discount_value, start_date, end_date, is_active) VALUES
  (v_org, 'عرض رمضان الكريم', 'خصم على المواد الغذائية الأساسية', 'percentage', 25, '2026-03-01', '2026-03-30', true), (v_org, 'خصم نهاية الأسبوع', 'خصم أسبوعي على المشروبات', 'percentage', 15, '2026-01-01', '2026-12-31', true), (v_org, 'عرض الأصناف الجديدة', 'خصم على المنتجات الجديدة', 'percentage', 10, '2026-09-01', '2026-09-15', false);
  INSERT INTO orders (id, organization_id, customer_id, order_number, status, total_amount, total_items, created_by, created_at) VALUES
  ('a3000000-0000-0000-0000-000000000001', v_org, 'c0000000-0000-0000-0000-000000000001', 'ORD-2026-001', 'processing', 84750, 3, v_prof, '2026-09-08T08:00:00Z'),
  ('a3000000-0000-0000-0000-000000000002', v_org, 'c0000000-0000-0000-0000-000000000002', 'ORD-2026-002', 'confirmed', 56000, 2, v_prof, '2026-09-08T09:30:00Z'),
  ('a3000000-0000-0000-0000-000000000003', v_org, 'c0000000-0000-0000-0000-000000000004', 'ORD-2026-003', 'delivered', 192500, 5, v_prof, '2026-09-07T14:00:00Z'),
  ('a3000000-0000-0000-0000-000000000004', v_org, 'c0000000-0000-0000-0000-000000000003', 'ORD-2026-004', 'draft', 0, 0, v_prof, '2026-09-08T10:00:00Z'),
  ('a3000000-0000-0000-0000-000000000005', v_org, 'c0000000-0000-0000-0000-000000000001', 'ORD-2026-005', 'pending', 125000, 4, v_prof, '2026-09-08T11:00:00Z');
  INSERT INTO order_items (order_id, product_id, item_code, product_name_snapshot, unit_snapshot, quantity, unit_price_snapshot, line_total) VALUES
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', '10301002', 'سكر برازيلي 50ك', 'كرتون', 2, 38500, 77000),
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', '10301028', 'زيت دوار الشمس 1 لتر', 'كرتون', 1, 7750, 7750),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000002', '10301015', 'أرز بسمتي فاخر', 'كرتون', 2, 28000, 56000),
  ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', '10301002', 'سكر برازيلي 50ك', 'كرتون', 3, 38500, 115500),
  ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004', '10301041', 'دقيق أبيض 50 كجم', 'كرتون', 2, 17500, 35000),
  ('a3000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000008', '10301083', 'تونة قطع 185ج', 'كرتون', 4, 9500, 38000),
  ('a3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000001', '10301002', 'سكر برازيلي 50ك', 'كرتون', 2, 38500, 77000),
  ('a3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000005', '10301054', 'معكرونة إيطالية 500ج', 'كرتون', 5, 4200, 21000),
  ('a3000000-0000-0000-0000-000000000005', 'a1000000-0000-0000-0000-000000000006', '10301067', 'عصير برتقال 1 لتر', 'كرتون', 3, 8500, 25500);
  INSERT INTO ai_alerts (organization_id, alert_type, severity, title, body) VALUES
  (v_org, 'low_stock', 'critical', 'مخزون منخفض: معكرونة إيطالية', 'الكمية المتبقية 12 كرتون — أقل من حد إعادة الطلب (80)'),
  (v_org, 'low_stock', 'warning', 'مخزون منخفض: زيت دوار الشمس', 'الكمية المتبقية 89 كرتون — اقترب من حد إعادة الطلب (100)'),
  (v_org, 'price_change', 'info', 'توصية تسعير: سكر برازيلي', 'محرك التسعير يقترح رفع السعر 2% بسبب انخفاض أيام التغطية'),
  (v_org, 'payment', 'warning', 'متابعة دفع: سوق الوادي - صنعاء', 'فاتورة مستحقة بقيمة 1,250,000 ر.ي متأخرة 5 أيام');
  INSERT INTO ai_tasks (organization_id, title, description, task_type, priority, status) VALUES
  (v_org, 'مراجعة طلبات العملاء الجديدة', 'طلبات جديدة بانتظار المراجعة', 'review', 'high', 'pending'), (v_org, 'متابعة مخزون الأصناف المنخفضة', '3 أصناف تحتاج إعادة طلب', 'inventory', 'high', 'in_progress'), (v_org, 'مراجعة تقرير السيولة الأسبوعي', 'تقرير السيولة جاهز للمراجعة', 'finance', 'medium', 'pending');
  INSERT INTO notifications (organization_id, profile_id, title, body, type) VALUES
  (v_org, v_prof, 'تنبيه: 3 أصناف اقتربت من النفاد', 'يرجى مراجعة مخزون المعكرونة والزيت', 'warning'), (v_org, v_prof, 'طلب جديد من سوق الوادي', 'طلب رقم ORD-2026-005 بانتظار المراجعة', 'info'), (v_org, v_prof, 'عميل جديد بانتظار الموافقة', 'سوبر ماركت الأمل يطلب التسجيل كعميل', 'info');
  INSERT INTO admin_settings (organization_id, key, value, category) VALUES
  (v_org, 'brand_name', '"الأغبري للمواد الغذائية"', 'general'), (v_org, 'currency', '"YER"', 'general'), (v_org, 'default_language', '"ar"', 'general'), (v_org, 'low_stock_threshold', '50', 'inventory'), (v_org, 'auto_pricing_enabled', 'true', 'pricing'), (v_org, 'order_auto_confirm', 'false', 'orders');
END $$;