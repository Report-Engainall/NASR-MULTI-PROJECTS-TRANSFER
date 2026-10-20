/*
# Aghbari Commerce — RLS Policies

Enables RLS on all tables and creates ownership/membership-based policies.
Authenticated users access organization-scoped data through organization_members.
Catalog tables (categories, brands, products, variants, images) are publicly readable.
*/

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE reorder_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS
DROP POLICY IF EXISTS "org_select_authenticated" ON organizations;
CREATE POLICY "org_select_authenticated" ON organizations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = organizations.id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "org_insert_authenticated" ON organizations;
CREATE POLICY "org_insert_authenticated" ON organizations FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "org_update_owner" ON organizations;
CREATE POLICY "org_update_owner" ON organizations FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = organizations.id AND om.user_id = auth.uid() AND om.role IN ('owner','admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = organizations.id AND om.user_id = auth.uid() AND om.role IN ('owner','admin')));

-- ORGANIZATION MEMBERS
DROP POLICY IF EXISTS "orgmem_select_member" ON organization_members;
CREATE POLICY "orgmem_select_member" ON organization_members FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM organization_members om2 WHERE om2.organization_id = organization_members.organization_id AND om2.user_id = auth.uid()));

DROP POLICY IF EXISTS "orgmem_insert_self" ON organization_members;
CREATE POLICY "orgmem_insert_self" ON organization_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "orgmem_update_self" ON organization_members;
CREATE POLICY "orgmem_update_self" ON organization_members FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "orgmem_delete_self" ON organization_members;
CREATE POLICY "orgmem_delete_self" ON organization_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- CATEGORIES (public read)
DROP POLICY IF EXISTS "cat_select_all" ON categories;
CREATE POLICY "cat_select_all" ON categories FOR SELECT TO anon, authenticated USING (true);

-- BRANDS (public read)
DROP POLICY IF EXISTS "brand_select_all" ON brands;
CREATE POLICY "brand_select_all" ON brands FOR SELECT TO anon, authenticated USING (true);

-- PRODUCTS (public read)
DROP POLICY IF EXISTS "prod_select_all" ON products;
CREATE POLICY "prod_select_all" ON products FOR SELECT TO anon, authenticated USING (true);

-- PRODUCT VARIANTS (public read)
DROP POLICY IF EXISTS "var_select_all" ON product_variants;
CREATE POLICY "var_select_all" ON product_variants FOR SELECT TO anon, authenticated USING (true);

-- PRODUCT IMAGES (public read)
DROP POLICY IF EXISTS "img_select_all" ON product_images;
CREATE POLICY "img_select_all" ON product_images FOR SELECT TO anon, authenticated USING (true);

-- ADDRESSES
DROP POLICY IF EXISTS "addr_select_org" ON addresses;
CREATE POLICY "addr_select_org" ON addresses FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = addresses.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "addr_insert_org" ON addresses;
CREATE POLICY "addr_insert_org" ON addresses FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = addresses.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "addr_update_org" ON addresses;
CREATE POLICY "addr_update_org" ON addresses FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = addresses.organization_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = addresses.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "addr_delete_org" ON addresses;
CREATE POLICY "addr_delete_org" ON addresses FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = addresses.organization_id AND om.user_id = auth.uid()));

-- CART ITEMS
DROP POLICY IF EXISTS "cart_select_own" ON cart_items;
CREATE POLICY "cart_select_own" ON cart_items FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_insert_own" ON cart_items;
CREATE POLICY "cart_insert_own" ON cart_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_update_own" ON cart_items;
CREATE POLICY "cart_update_own" ON cart_items FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_delete_own" ON cart_items;
CREATE POLICY "cart_delete_own" ON cart_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ORDERS
DROP POLICY IF EXISTS "ord_select_org" ON orders;
CREATE POLICY "ord_select_org" ON orders FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = orders.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "ord_insert_org" ON orders;
CREATE POLICY "ord_insert_org" ON orders FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = orders.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "ord_update_org" ON orders;
CREATE POLICY "ord_update_org" ON orders FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = orders.organization_id AND om.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = orders.organization_id AND om.user_id = auth.uid()));

-- ORDER ITEMS
DROP POLICY IF EXISTS "orditem_select_org" ON order_items;
CREATE POLICY "orditem_select_org" ON order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o JOIN organization_members om ON om.organization_id = o.organization_id WHERE o.id = order_items.order_id AND om.user_id = auth.uid()));

-- ORDER STATUS HISTORY
DROP POLICY IF EXISTS "ordhist_select_org" ON order_status_history;
CREATE POLICY "ordhist_select_org" ON order_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM orders o JOIN organization_members om ON om.organization_id = o.organization_id WHERE o.id = order_status_history.order_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "ordhist_insert_org" ON order_status_history;
CREATE POLICY "ordhist_insert_org" ON order_status_history FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM orders o JOIN organization_members om ON om.organization_id = o.organization_id WHERE o.id = order_status_history.order_id AND om.user_id = auth.uid()));

-- INVOICES
DROP POLICY IF EXISTS "inv_select_org" ON invoices;
CREATE POLICY "inv_select_org" ON invoices FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = invoices.organization_id AND om.user_id = auth.uid()));

-- PAYMENTS
DROP POLICY IF EXISTS "pay_select_org" ON payments;
CREATE POLICY "pay_select_org" ON payments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = payments.organization_id AND om.user_id = auth.uid()));

-- STATEMENTS
DROP POLICY IF EXISTS "stmt_select_org" ON statements;
CREATE POLICY "stmt_select_org" ON statements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = statements.organization_id AND om.user_id = auth.uid()));

-- WISHLIST
DROP POLICY IF EXISTS "wish_select_own" ON wishlist_items;
CREATE POLICY "wish_select_own" ON wishlist_items FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wish_insert_own" ON wishlist_items;
CREATE POLICY "wish_insert_own" ON wishlist_items FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wish_delete_own" ON wishlist_items;
CREATE POLICY "wish_delete_own" ON wishlist_items FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- PRICE TIERS
DROP POLICY IF EXISTS "tier_select_org" ON price_tiers;
CREATE POLICY "tier_select_org" ON price_tiers FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = price_tiers.organization_id AND om.user_id = auth.uid()));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notif_select_own" ON notifications;
CREATE POLICY "notif_select_own" ON notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_insert_own" ON notifications;
CREATE POLICY "notif_insert_own" ON notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_update_own" ON notifications;
CREATE POLICY "notif_update_own" ON notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notif_delete_own" ON notifications;
CREATE POLICY "notif_delete_own" ON notifications FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- REORDER TEMPLATES
DROP POLICY IF EXISTS "tmpl_select_org" ON reorder_templates;
CREATE POLICY "tmpl_select_org" ON reorder_templates FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = reorder_templates.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "tmpl_insert_own" ON reorder_templates;
CREATE POLICY "tmpl_insert_own" ON reorder_templates FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = reorder_templates.organization_id AND om.user_id = auth.uid()));

DROP POLICY IF EXISTS "tmpl_update_own" ON reorder_templates;
CREATE POLICY "tmpl_update_own" ON reorder_templates FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "tmpl_delete_own" ON reorder_templates;
CREATE POLICY "tmpl_delete_own" ON reorder_templates FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- AI TASKS (authenticated read)
DROP POLICY IF EXISTS "ai_select_auth" ON ai_tasks;
CREATE POLICY "ai_select_auth" ON ai_tasks FOR SELECT TO authenticated USING (true);

-- AI ALERTS (authenticated read)
DROP POLICY IF EXISTS "aialert_select_auth" ON ai_alerts;
CREATE POLICY "aialert_select_auth" ON ai_alerts FOR SELECT TO authenticated USING (true);

-- AUDIT LOGS (authenticated read)
DROP POLICY IF EXISTS "audit_select_auth" ON audit_logs;
CREATE POLICY "audit_select_auth" ON audit_logs FOR SELECT TO authenticated USING (true);

-- IMPORT LOGS (authenticated read)
DROP POLICY IF EXISTS "implog_select_auth" ON import_logs;
CREATE POLICY "implog_select_auth" ON import_logs FOR SELECT TO authenticated USING (true);
