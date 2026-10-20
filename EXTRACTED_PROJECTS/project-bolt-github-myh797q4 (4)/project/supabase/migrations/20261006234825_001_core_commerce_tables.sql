/*
# Aghbari Commerce — Core B2B Commerce Schema (Tables Only)

Creates all core tables for the B2B commerce platform.
Policies are added in a separate migration after all tables exist.
*/

-- ORGANIZATIONS
CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  legal_name text,
  tax_number text,
  cr_number text,
  email text,
  phone text,
  website text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','inactive')),
  credit_limit numeric(14,2) DEFAULT 0,
  payment_terms_days integer DEFAULT 30,
  tier text DEFAULT 'standard' CHECK (tier IN ('standard','silver','gold','platinum')),
  city text,
  country text DEFAULT 'السعودية',
  address text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ORGANIZATION MEMBERS
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'buyer' CHECK (role IN ('owner','admin','buyer','viewer')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','invited','suspended')),
  invited_email text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  icon text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- BRANDS
CREATE TABLE IF NOT EXISTS brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- PRODUCTS
CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  name_ar text,
  slug text NOT NULL UNIQUE,
  description text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  brand_id uuid REFERENCES brands(id) ON DELETE SET NULL,
  unit text DEFAULT 'قطعة',
  box_quantity integer DEFAULT 1,
  carton_quantity integer DEFAULT 1,
  min_order_qty integer DEFAULT 1,
  price numeric(12,2) NOT NULL DEFAULT 0,
  bulk_price numeric(12,2) DEFAULT 0,
  cost_price numeric(12,2) DEFAULT 0,
  stock_quantity integer DEFAULT 0,
  reserved_stock integer DEFAULT 0,
  weight numeric(8,2),
  barcode text,
  image_url text,
  is_active boolean DEFAULT true,
  is_featured boolean DEFAULT false,
  is_new boolean DEFAULT false,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- PRODUCT VARIANTS
CREATE TABLE IF NOT EXISTS product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  name text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity integer DEFAULT 0,
  attributes jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- PRODUCT IMAGES
CREATE TABLE IF NOT EXISTS product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ADDRESSES
CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  label text NOT NULL DEFAULT 'العنوان الرئيسي',
  recipient_name text,
  phone text,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  district text,
  postal_code text,
  country text DEFAULT 'السعودية',
  is_default boolean DEFAULT false,
  is_billing boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- CART ITEMS
CREATE TABLE IF NOT EXISTS cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  unit_type text DEFAULT 'piece' CHECK (unit_type IN ('piece','box','carton')),
  created_at timestamptz DEFAULT now()
);

-- ORDERS
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending','review','approved','processing','fulfilled','dispatched','delivered','cancelled','rejected')),
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  tax numeric(14,2) DEFAULT 0,
  shipping_cost numeric(14,2) DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  currency text DEFAULT 'SAR',
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid','overdue','refunded')),
  shipping_address jsonb,
  billing_address jsonb,
  notes text,
  internal_notes text,
  expected_delivery date,
  delivered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ORDER ITEMS
CREATE TABLE IF NOT EXISTS order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  sku text,
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_type text DEFAULT 'piece',
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount numeric(12,2) DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ORDER STATUS HISTORY
CREATE TABLE IF NOT EXISTS order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- INVOICES
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount numeric(14,2) DEFAULT 0,
  tax numeric(14,2) DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','partial','paid','overdue','cancelled')),
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- PAYMENTS
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number text NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  method text DEFAULT 'transfer' CHECK (method IN ('transfer','cash','check','card','wallet')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','refunded')),
  reference text,
  paid_date date,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- STATEMENTS
CREATE TABLE IF NOT EXISTS statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_number text NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  opening_balance numeric(14,2) DEFAULT 0,
  closing_balance numeric(14,2) DEFAULT 0,
  total_invoiced numeric(14,2) DEFAULT 0,
  total_paid numeric(14,2) DEFAULT 0,
  status text DEFAULT 'generated' CHECK (status IN ('generated','sent','acknowledged','disputed')),
  created_at timestamptz DEFAULT now()
);

-- WISHLIST ITEMS
CREATE TABLE IF NOT EXISTS wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- PRICE TIERS
CREATE TABLE IF NOT EXISTS price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tier_price numeric(12,2) NOT NULL DEFAULT 0,
  min_quantity integer DEFAULT 1,
  valid_from date DEFAULT CURRENT_DATE,
  valid_to date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, product_id)
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info','success','warning','error','order','payment','system')),
  title text NOT NULL,
  body text,
  link text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- REORDER TEMPLATES
CREATE TABLE IF NOT EXISTS reorder_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- AI TASKS
CREATE TABLE IF NOT EXISTS ai_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','cancelled')),
  input jsonb DEFAULT '{}',
  output jsonb,
  result text,
  confidence numeric(5,2),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- AI ALERTS
CREATE TABLE IF NOT EXISTS ai_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','low','medium','high','critical')),
  title text NOT NULL,
  description text,
  entity_type text,
  entity_id uuid,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb DEFAULT '{}',
  ip_address text,
  created_at timestamptz DEFAULT now()
);

-- IMPORT LOGS
CREATE TABLE IF NOT EXISTS import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  type text NOT NULL DEFAULT 'products' CHECK (type IN ('products','customers','orders','pricing')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  total_rows integer DEFAULT 0,
  success_rows integer DEFAULT 0,
  failed_rows integer DEFAULT 0,
  errors jsonb DEFAULT '[]',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_orders_org ON orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_status ON ai_tasks(status);
