/*
# متجر الأغبري — Initial Schema

## Overview
Creates the core database schema for Aghbari Commerce (متجر الأغبري), a wholesale/retail commerce platform.

## Tables Created
1. `categories` — product categories (hierarchical)
2. `brands` — product brands
3. `products` — catalog items with triple pricing, SKU, barcode, stock
4. `customers` — customer profiles linked to auth.users, with tier and approval status
5. `orders` — order header with status workflow
6. `order_items` — order line items with price snapshots
7. `settings` — key-value app configuration
8. `banners` — daily promotional banners

## Security
- RLS enabled on all tables
- Customers can browse products/categories/brands (read)
- Customers can create orders and view their own orders
- Admin role (from JWT user_role claim) gets full access
*/

-- ============ CATEGORIES ============
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  icon text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_categories" ON categories;
CREATE POLICY "read_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_categories" ON categories;
CREATE POLICY "admin_manage_categories" ON categories FOR ALL
  TO authenticated USING (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  ) WITH CHECK (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  );

-- ============ BRANDS ============
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_brands" ON brands;
CREATE POLICY "read_brands" ON brands FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_brands" ON brands;
CREATE POLICY "admin_manage_brands" ON brands FOR ALL
  TO authenticated USING (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  ) WITH CHECK (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  );

-- ============ PRODUCTS ============
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_en text,
  item_code text NOT NULL,
  sku text,
  barcode text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  unit text NOT NULL DEFAULT 'قطعة',
  description text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  is_featured boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  price_wholesale_of_wholesale numeric(14,2) NOT NULL DEFAULT 0,
  price_wholesale numeric(14,2) NOT NULL DEFAULT 0,
  price_retail numeric(14,2) NOT NULL DEFAULT 0,
  base_price numeric(14,2) NOT NULL DEFAULT 0,
  stock_quantity numeric(14,2) NOT NULL DEFAULT 0,
  reserved_quantity numeric(14,2) NOT NULL DEFAULT 0,
  min_stock_level numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_products" ON products;
CREATE POLICY "read_products" ON products FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_manage_products" ON products;
CREATE POLICY "admin_manage_products" ON products FOR ALL
  TO authenticated USING (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  ) WITH CHECK (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  );

-- ============ CUSTOMERS ============
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name text NOT NULL,
  company_name text,
  phone text NOT NULL,
  email text,
  address text,
  city text,
  customer_tier int NOT NULL DEFAULT 3,
  customer_code text,
  status text NOT NULL DEFAULT 'pending',
  credit_limit numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_customer" ON customers;
CREATE POLICY "read_own_customer" ON customers FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_customer" ON customers;
CREATE POLICY "update_own_customer" ON customers FOR UPDATE
  TO authenticated USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "admin_manage_customers" ON customers;
CREATE POLICY "admin_manage_customers" ON customers FOR ALL
  TO authenticated USING (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  ) WITH CHECK (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  );

-- ============ ORDERS ============
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_code text UNIQUE NOT NULL,
  customer_id uuid REFERENCES customers(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL DEFAULT 'new',
  notes text,
  admin_notes text,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  total_items int NOT NULL DEFAULT 0,
  idempotency_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_orders" ON orders;
CREATE POLICY "read_own_orders" ON orders FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = orders.customer_id
      AND customers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_orders" ON orders;
CREATE POLICY "insert_own_orders" ON orders FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = orders.customer_id
      AND customers.user_id = auth.uid()
      AND customers.status = 'approved'
    )
  );

DROP POLICY IF EXISTS "update_own_orders" ON orders;
CREATE POLICY "update_own_orders" ON orders FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = orders.customer_id
      AND customers.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM customers
      WHERE customers.id = orders.customer_id
      AND customers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_manage_orders" ON orders;
CREATE POLICY "admin_manage_orders" ON orders FOR ALL
  TO authenticated USING (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  ) WITH CHECK (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  );

-- ============ ORDER ITEMS ============
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  product_code text NOT NULL,
  unit text NOT NULL,
  quantity numeric(14,2) NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  line_total numeric(14,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_own_order_items" ON order_items;
CREATE POLICY "read_own_order_items" ON order_items FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM orders
      JOIN customers ON customers.id = orders.customer_id
      WHERE orders.id = order_items.order_id
      AND customers.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admin_manage_order_items" ON order_items;
CREATE POLICY "admin_manage_order_items" ON order_items FOR ALL
  TO authenticated USING (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  ) WITH CHECK (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  );

-- ============ SETTINGS ============
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_settings" ON settings;
CREATE POLICY "read_settings" ON settings FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "admin_manage_settings" ON settings;
CREATE POLICY "admin_manage_settings" ON settings FOR ALL
  TO authenticated USING (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  ) WITH CHECK (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  );

-- ============ BANNERS ============
CREATE TABLE IF NOT EXISTS banners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  content text,
  link text,
  color text DEFAULT '#d4af37',
  priority int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  start_date timestamptz,
  end_date timestamptz,
  audience text NOT NULL DEFAULT 'all',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_banners" ON banners;
CREATE POLICY "read_banners" ON banners FOR SELECT
  TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS "admin_manage_banners" ON banners;
CREATE POLICY "admin_manage_banners" ON banners FOR ALL
  TO authenticated USING (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  ) WITH CHECK (
    COALESCE(auth.jwt() ->> 'user_role', '') = 'admin'
  );

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_item_code ON products(item_code);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- ============ SEED DEFAULT SETTINGS ============
INSERT INTO settings (key, value, category) VALUES
  ('store_name', 'متجر الأغبري', 'general'),
  ('store_name_en', 'Aghbari Commerce', 'general'),
  ('currency_symbol', 'ر.ي', 'general'),
  ('currency_code', 'YER', 'general'),
  ('currency_decimals', '2', 'general'),
  ('show_price_on_cards', 'true', 'pricing'),
  ('show_price_in_cart', 'false', 'pricing'),
  ('show_price_in_orders', 'false', 'pricing'),
  ('show_price_in_invoice', 'false', 'pricing'),
  ('primary_color', '#1a4d2e', 'design'),
  ('secondary_color', '#2d7a46', 'design'),
  ('accent_color', '#d4af37', 'design'),
  ('bg_color', '#faf8f1', 'design'),
  ('welcome_message', 'مرحباً بكم في متجر الأغبري', 'general'),
  ('min_order_qty', '1', 'orders'),
  ('default_customer_tier', '3', 'pricing')
ON CONFLICT (key) DO NOTHING;

-- ============ SEED CATEGORIES ============
INSERT INTO categories (name, name_en, sort_order) VALUES
  ('مواد غذائية', 'Food', 1),
  ('مشروبات', 'Beverages', 2),
  ('منظفات', 'Cleaning', 3),
  ('مواد بناء', 'Construction', 4),
  ('إكسسوارات', 'Accessories', 5)
ON CONFLICT DO NOTHING;

-- ============ SEED BRANDS ============
INSERT INTO brands (name) VALUES
  ('محلي'),
  ('مستورد'),
  ('عام')
ON CONFLICT DO NOTHING;

-- ============ SEED PRODUCTS (DEMO) ============
INSERT INTO products (name, item_code, sku, unit, category_id, brand_id, base_price, price_wholesale_of_wholesale, price_wholesale, price_retail, stock_quantity, min_stock_level, description, is_featured) VALUES
  ('أرز بسمتي 5كجم', 'RICE-005', 'RICE005', 'كيس',
    (SELECT id FROM categories WHERE name = 'مواد غذائية' LIMIT 1),
    (SELECT id FROM brands WHERE name = 'مستورد' LIMIT 1),
    4000, 4200, 4500, 5000, 150, 20, 'أرز بسمتي فاخر 5 كجم', true),
  ('سكر ناعم 1كجم', 'SUG-001', 'SUG001', 'كيس',
    (SELECT id FROM categories WHERE name = 'مواد غذائية' LIMIT 1),
    (SELECT id FROM brands WHERE name = 'محلي' LIMIT 1),
    800, 850, 900, 1000, 300, 50, 'سكر ناعم أبيض 1 كجم', true),
  ('زيت دوار الشمس 1.5ل', 'OIL-015', 'OIL015', 'عبوة',
    (SELECT id FROM categories WHERE name = 'مواد غذائية' LIMIT 1),
    (SELECT id FROM brands WHERE name = 'مستورد' LIMIT 1),
    2500, 2700, 2900, 3200, 80, 15, 'زيت دوار الشمس مكرر 1.5 لتر', true),
  ('شاي أحمر 450جم', 'TEA-450', 'TEA450', 'علبة',
    (SELECT id FROM categories WHERE name = 'مشروبات' LIMIT 1),
    (SELECT id FROM brands WHERE name = 'مستورد' LIMIT 1),
    1800, 1950, 2100, 2400, 120, 30, 'شاي أحمر فاخر 450 جم', false),
  ('مسحوق غسيل 3كجم', 'DET-003', 'DET003', 'كيس',
    (SELECT id FROM categories WHERE name = 'منظفات' LIMIT 1),
    (SELECT id FROM brands WHERE name = 'مستورد' LIMIT 1),
    3000, 3200, 3500, 3900, 60, 10, 'مسحوق غسيل أوتوماتيك 3 كجم', true),
  ('ماء معدني 600مل (كرتون)', 'WTR-600', 'WTR600', 'كرتون',
    (SELECT id FROM categories WHERE name = 'مشروبات' LIMIT 1),
    (SELECT id FROM brands WHERE name = 'محلي' LIMIT 1),
    1200, 1300, 1400, 1600, 200, 40, 'كرتون ماء معدني 600 مل 12 قارورة', false)
ON CONFLICT DO NOTHING;

-- ============ SEED BANNERS ============
INSERT INTO banners (title, content, color, priority) VALUES
  ('عرض الأسبوع', 'خصومات خاصة على المواد الغذائية هذا الأسبوع', '#d4af37', 1),
  ('ترحيب', 'مرحباً بكم في متجر الأغبري — جودة وأسعار تنافسية', '#2d7a46', 2)
ON CONFLICT DO NOTHING;
