/*
# Phase 1 production commerce foundations

1. Purpose
- Establish one durable import pipeline record, one server-authoritative order mutation, pricing rules, idempotency, and transactional outbox records.
- Preserve all existing tables and rows while adding backward-compatible columns and tables.

2. New tables
- `import_profiles`: versioned import contracts, columns, synonyms, validation, and matching rules.
- `import_uploads`: privacy-safe upload metadata, SHA-256 identity, quality score, processing status, and final snapshot.
- `import_chunks`: resumable upload and processing progress without retaining raw files.
- `import_records`: normalized structured rows retained after raw-file disposal.
- `pricing_rules`: organization pricing rules for retail and wholesale price levels.
- `idempotency_keys`: server-side duplicate request protection.
- `outbox_events`: durable event records for downstream processing and recovery.

3. Modified tables
- `products`: adds `base_price`, `retail_price`, and `wholesale_price`; existing values are preserved and used to backfill the new fields.
- `orders`: adds `idempotency_key` and `customer_adjustment_note`.
- `order_items`: adds immutable commercial snapshots for item code, name, unit, discount, and tax.
- `invoices`: adds `customer_code`, `customer_name_snapshot`, and `main_description`.

4. Server behavior
- `create_order_from_cart` derives the organization from the authenticated membership, ignores client organization IDs and client prices, validates stock and minimum quantities, calculates prices from server data, creates the order/items/invoice/outbox event atomically, and returns the existing order for a repeated idempotency key.
- `apply_pricing_rule` computes retail or wholesale prices from the product base price using explicit methods.

5. Security
- RLS is enabled on every new table.
- Organization-scoped policies use the private membership helper and authenticated sessions.
- Direct client inserts into orders and order items are not used by the application; the privileged RPC validates the caller and owns the transaction.
*/

ALTER TABLE products ADD COLUMN IF NOT EXISTS base_price numeric(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS retail_price numeric(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price numeric(12,2);
UPDATE products SET base_price = COALESCE(base_price, price), retail_price = COALESCE(retail_price, price), wholesale_price = COALESCE(wholesale_price, NULLIF(bulk_price, 0), price) WHERE base_price IS NULL OR retail_price IS NULL OR wholesale_price IS NULL;
ALTER TABLE products ALTER COLUMN base_price SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN retail_price SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN wholesale_price SET DEFAULT 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_adjustment_note text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_code text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_snapshot text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_snapshot text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS discount_snapshot numeric(12,2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tax_snapshot numeric(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_code text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_name_snapshot text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS main_description text;

CREATE TABLE IF NOT EXISTS import_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_name text NOT NULL,
  report_type text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  version integer NOT NULL DEFAULT 1,
  required_columns jsonb NOT NULL DEFAULT '[]',
  optional_columns jsonb NOT NULL DEFAULT '[]',
  ignored_columns jsonb NOT NULL DEFAULT '[]',
  synonyms jsonb NOT NULL DEFAULT '{}',
  transformation_rules jsonb NOT NULL DEFAULT '{}',
  validation_rules jsonb NOT NULL DEFAULT '{}',
  matching_key text NOT NULL DEFAULT 'item_code',
  merge_strategy text NOT NULL DEFAULT 'existing_wins' CHECK (merge_strategy IN ('auto_accept','existing_wins','incoming_wins','manual_review','reject_row')),
  date_rules jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, profile_name, version)
);

CREATE TABLE IF NOT EXISTS import_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES import_profiles(id) ON DELETE RESTRICT,
  file_name text NOT NULL,
  file_type text NOT NULL,
  file_size bigint NOT NULL CHECK (file_size >= 0 AND file_size <= 104857600),
  file_hash text NOT NULL CHECK (length(file_hash) = 64),
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','detecting','mapping','validating','normalizing','deduplicating','chunking','merging','snapshotted','completed','failed','manual_review','rejected')),
  quality_score numeric(5,2) CHECK (quality_score >= 0 AND quality_score <= 100),
  quality_breakdown jsonb NOT NULL DEFAULT '{}',
  error_code text,
  error_message text,
  snapshot jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz,
  UNIQUE(organization_id, profile_id, file_hash, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS import_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES import_uploads(id) ON DELETE CASCADE,
  chunk_number integer NOT NULL CHECK (chunk_number >= 0),
  byte_start bigint NOT NULL CHECK (byte_start >= 0),
  byte_end bigint NOT NULL CHECK (byte_end > byte_start),
  row_start integer,
  row_end integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','processing','completed','failed')),
  rows_processed integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(upload_id, chunk_number)
);

CREATE TABLE IF NOT EXISTS import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id uuid NOT NULL REFERENCES import_uploads(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  matching_key text,
  normalized_record jsonb NOT NULL,
  validation_errors jsonb NOT NULL DEFAULT '[]',
  validation_warnings jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted','warning','rejected','duplicate','manual_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(upload_id, row_number)
);

CREATE TABLE IF NOT EXISTS pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_level text NOT NULL CHECK (price_level IN ('retail','wholesale','both')),
  calculation_method text NOT NULL CHECK (calculation_method IN ('markup_percent','margin_percent','fixed_price','amount_adjustment')),
  value numeric(14,4) NOT NULL,
  min_quantity integer NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
  active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  operation_type text NOT NULL,
  response_reference uuid,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  UNIQUE(organization_id, idempotency_key, operation_type)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_uploads_org_status ON import_uploads(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_import_records_upload ON import_records(upload_id);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, available_at);
CREATE INDEX IF NOT EXISTS idx_pricing_rules_org_active ON pricing_rules(organization_id, active, priority);

ALTER TABLE import_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_profiles_select_org" ON import_profiles;
CREATE POLICY "import_profiles_select_org" ON import_profiles FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "import_profiles_insert_admin" ON import_profiles;
CREATE POLICY "import_profiles_insert_admin" ON import_profiles FOR INSERT TO authenticated WITH CHECK (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "import_profiles_update_admin" ON import_profiles;
CREATE POLICY "import_profiles_update_admin" ON import_profiles FOR UPDATE TO authenticated USING (private.is_org_member(organization_id)) WITH CHECK (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "import_profiles_delete_admin" ON import_profiles;
CREATE POLICY "import_profiles_delete_admin" ON import_profiles FOR DELETE TO authenticated USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS "import_uploads_select_org" ON import_uploads;
CREATE POLICY "import_uploads_select_org" ON import_uploads FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "import_uploads_insert_org" ON import_uploads;
CREATE POLICY "import_uploads_insert_org" ON import_uploads FOR INSERT TO authenticated WITH CHECK (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "import_uploads_update_org" ON import_uploads;
CREATE POLICY "import_uploads_update_org" ON import_uploads FOR UPDATE TO authenticated USING (private.is_org_member(organization_id)) WITH CHECK (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "import_uploads_delete_org" ON import_uploads;
CREATE POLICY "import_uploads_delete_org" ON import_uploads FOR DELETE TO authenticated USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS "import_chunks_select_org" ON import_chunks;
CREATE POLICY "import_chunks_select_org" ON import_chunks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_chunks.upload_id AND private.is_org_member(u.organization_id)));
DROP POLICY IF EXISTS "import_chunks_insert_org" ON import_chunks;
CREATE POLICY "import_chunks_insert_org" ON import_chunks FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_chunks.upload_id AND private.is_org_member(u.organization_id)));
DROP POLICY IF EXISTS "import_chunks_update_org" ON import_chunks;
CREATE POLICY "import_chunks_update_org" ON import_chunks FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_chunks.upload_id AND private.is_org_member(u.organization_id))) WITH CHECK (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_chunks.upload_id AND private.is_org_member(u.organization_id)));
DROP POLICY IF EXISTS "import_chunks_delete_org" ON import_chunks;
CREATE POLICY "import_chunks_delete_org" ON import_chunks FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_chunks.upload_id AND private.is_org_member(u.organization_id)));

DROP POLICY IF EXISTS "import_records_select_org" ON import_records;
CREATE POLICY "import_records_select_org" ON import_records FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_records.upload_id AND private.is_org_member(u.organization_id)));
DROP POLICY IF EXISTS "import_records_insert_org" ON import_records;
CREATE POLICY "import_records_insert_org" ON import_records FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_records.upload_id AND private.is_org_member(u.organization_id)));
DROP POLICY IF EXISTS "import_records_update_org" ON import_records;
CREATE POLICY "import_records_update_org" ON import_records FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_records.upload_id AND private.is_org_member(u.organization_id))) WITH CHECK (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_records.upload_id AND private.is_org_member(u.organization_id)));
DROP POLICY IF EXISTS "import_records_delete_org" ON import_records;
CREATE POLICY "import_records_delete_org" ON import_records FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM import_uploads u WHERE u.id = import_records.upload_id AND private.is_org_member(u.organization_id)));

DROP POLICY IF EXISTS "pricing_rules_select_org" ON pricing_rules;
CREATE POLICY "pricing_rules_select_org" ON pricing_rules FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "pricing_rules_insert_org" ON pricing_rules;
CREATE POLICY "pricing_rules_insert_org" ON pricing_rules FOR INSERT TO authenticated WITH CHECK (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "pricing_rules_update_org" ON pricing_rules;
CREATE POLICY "pricing_rules_update_org" ON pricing_rules FOR UPDATE TO authenticated USING (private.is_org_member(organization_id)) WITH CHECK (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "pricing_rules_delete_org" ON pricing_rules;
CREATE POLICY "pricing_rules_delete_org" ON pricing_rules FOR DELETE TO authenticated USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS "idempotency_select_org" ON idempotency_keys;
CREATE POLICY "idempotency_select_org" ON idempotency_keys FOR SELECT TO authenticated USING (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "idempotency_insert_org" ON idempotency_keys;
CREATE POLICY "idempotency_insert_org" ON idempotency_keys FOR INSERT TO authenticated WITH CHECK (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "idempotency_update_org" ON idempotency_keys;
CREATE POLICY "idempotency_update_org" ON idempotency_keys FOR UPDATE TO authenticated USING (private.is_org_member(organization_id)) WITH CHECK (private.is_org_member(organization_id));
DROP POLICY IF EXISTS "idempotency_delete_org" ON idempotency_keys;
CREATE POLICY "idempotency_delete_org" ON idempotency_keys FOR DELETE TO authenticated USING (private.is_org_member(organization_id));

DROP POLICY IF EXISTS "outbox_select_org" ON outbox_events;
CREATE POLICY "outbox_select_org" ON outbox_events FOR SELECT TO authenticated USING (organization_id IS NULL OR private.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.create_order_from_cart(
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_notes text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_order_id uuid;
  v_invoice_id uuid;
  v_existing uuid;
  v_order_number text := 'ORD-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  v_invoice_number text := 'INV-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  v_subtotal numeric(14,2) := 0;
  v_line_total numeric(14,2);
  v_unit_price numeric(12,2);
  v_multiplier integer;
  v_request_hash text := md5(coalesce(p_shipping_address::text, '') || coalesce(p_billing_address::text, '') || coalesce(p_notes, ''));
  item record;
BEGIN
  IF v_user_id IS NULL OR p_idempotency_key IS NULL OR length(trim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'invalid_request';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM organization_members
  WHERE user_id = v_user_id AND status = 'active'
  ORDER BY created_at
  LIMIT 1;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'organization_required'; END IF;

  SELECT response_reference INTO v_existing
  FROM idempotency_keys
  WHERE organization_id = v_org_id AND idempotency_key = p_idempotency_key AND operation_type = 'create_order' AND expires_at > now();
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO idempotency_keys (organization_id, idempotency_key, request_hash, operation_type)
  VALUES (v_org_id, p_idempotency_key, v_request_hash, 'create_order')
  ON CONFLICT (organization_id, idempotency_key, operation_type) DO NOTHING;

  SELECT response_reference INTO v_existing
  FROM idempotency_keys
  WHERE organization_id = v_org_id AND idempotency_key = p_idempotency_key AND operation_type = 'create_order';
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  INSERT INTO orders (order_number, organization_id, user_id, status, shipping_address, billing_address, notes, idempotency_key)
  VALUES (v_order_number, v_org_id, v_user_id, 'pending', p_shipping_address, p_billing_address, p_notes, p_idempotency_key)
  RETURNING id INTO v_order_id;

  FOR item IN
    SELECT ci.*, p.sku, p.name, p.name_ar, p.unit, p.price, p.bulk_price, p.retail_price, p.wholesale_price, p.stock_quantity, p.min_order_qty, p.box_quantity, p.carton_quantity
    FROM cart_items ci JOIN products p ON p.id = ci.product_id
    WHERE ci.user_id = v_user_id
    FOR UPDATE OF p
  LOOP
    IF item.quantity < item.min_order_qty OR item.quantity > item.stock_quantity THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
    v_multiplier := CASE item.unit_type WHEN 'carton' THEN greatest(item.carton_quantity, 1) WHEN 'box' THEN greatest(item.box_quantity, 1) ELSE 1 END;
    v_unit_price := CASE WHEN item.quantity >= 10 THEN coalesce(nullif(item.wholesale_price, 0), nullif(item.bulk_price, 0), item.price) ELSE coalesce(nullif(item.retail_price, 0), item.price) END;
    v_line_total := v_unit_price * item.quantity * v_multiplier;
    v_subtotal := v_subtotal + v_line_total;
    INSERT INTO order_items (order_id, product_id, sku, item_code, name, product_name_snapshot, unit_type, unit_snapshot, quantity, unit_price, unit_price_snapshot, discount, discount_snapshot, tax_snapshot, line_total)
    VALUES (v_order_id, item.product_id, item.sku, item.sku, coalesce(item.name_ar, item.name), coalesce(item.name_ar, item.name), item.unit_type, item.unit, item.quantity, v_unit_price, v_unit_price, 0, 0, 0, v_line_total);
  END LOOP;

  IF v_subtotal = 0 THEN RAISE EXCEPTION 'empty_cart'; END IF;
  UPDATE orders SET subtotal = v_subtotal, total = v_subtotal WHERE id = v_order_id;
  INSERT INTO invoices (invoice_number, order_id, organization_id, subtotal, total, status, customer_name_snapshot, main_description)
  SELECT v_invoice_number, v_order_id, v_org_id, v_subtotal, v_subtotal, 'issued', o.name, 'طلب شراء من منصة الأغبري'
  FROM organizations o WHERE o.id = v_org_id;
  SELECT id INTO v_invoice_id FROM invoices WHERE order_id = v_order_id;
  INSERT INTO outbox_events (organization_id, event_key, event_type, aggregate_type, aggregate_id, payload)
  VALUES (v_org_id, 'order-created:' || v_order_id::text, 'order.created', 'order', v_order_id, jsonb_build_object('order_id', v_order_id, 'invoice_id', v_invoice_id));
  UPDATE idempotency_keys SET response_reference = v_order_id, status = 'completed' WHERE organization_id = v_org_id AND idempotency_key = p_idempotency_key AND operation_type = 'create_order';
  DELETE FROM cart_items WHERE user_id = v_user_id;
  RETURN v_order_id;
EXCEPTION WHEN OTHERS THEN
  UPDATE idempotency_keys SET status = 'failed' WHERE organization_id = v_org_id AND idempotency_key = p_idempotency_key AND operation_type = 'create_order' AND response_reference IS NULL;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(jsonb, jsonb, text, text) TO authenticated;
