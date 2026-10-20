-- Additive customer finance, quotation, and reorder persistence.
-- Apply only to the Supabase project configured for this repository after verifying project identity.
CREATE TABLE IF NOT EXISTS public.customer_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','partially_paid','paid','void')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  currency text NOT NULL DEFAULT 'YER',
  subtotal numeric(15,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount numeric(15,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, invoice_number)
);
CREATE TABLE IF NOT EXISTS public.customer_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.customer_invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_code text,
  description text NOT NULL,
  unit text,
  quantity numeric(15,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(15,2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(15,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.customer_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.customer_invoices(id) ON DELETE RESTRICT,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','transfer','card','credit_adjustment','other')),
  reference text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sales_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  quote_number text NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','quoted','accepted','rejected','expired')),
  notes text,
  response_note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  quoted_at timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, quote_number)
);
CREATE TABLE IF NOT EXISTS public.sales_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_code text,
  product_name_snapshot text NOT NULL,
  unit_snapshot text,
  requested_quantity numeric(15,3) NOT NULL CHECK (requested_quantity > 0),
  target_unit_price numeric(15,2) CHECK (target_unit_price IS NULL OR target_unit_price >= 0),
  quoted_unit_price numeric(15,2) CHECK (quoted_unit_price IS NULL OR quoted_unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reorder_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 100),
  source_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reorder_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.reorder_templates(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  item_code text,
  product_name_snapshot text NOT NULL,
  quantity numeric(15,3) NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_invoices_customer_date_idx ON public.customer_invoices(customer_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS customer_payments_invoice_date_idx ON public.customer_payments(invoice_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS sales_quotes_customer_date_idx ON public.sales_quotes(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reorder_templates_customer_date_idx ON public.reorder_templates(customer_id, updated_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['customer_invoices','customer_invoice_items','customer_payments','sales_quotes','sales_quote_items','reorder_templates','reorder_template_items'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, public', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS customer_invoices_staff_all ON public.customer_invoices;
CREATE POLICY customer_invoices_staff_all ON public.customer_invoices FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS customer_invoices_own_read ON public.customer_invoices;
CREATE POLICY customer_invoices_own_read ON public.customer_invoices FOR SELECT TO authenticated
USING (customer_id IN (SELECT c.id FROM public.customers c WHERE c.profile_id = public.current_profile_id() AND c.organization_id = customer_invoices.organization_id));

DROP POLICY IF EXISTS customer_invoice_items_staff_all ON public.customer_invoice_items;
CREATE POLICY customer_invoice_items_staff_all ON public.customer_invoice_items FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS customer_invoice_items_own_read ON public.customer_invoice_items;
CREATE POLICY customer_invoice_items_own_read ON public.customer_invoice_items FOR SELECT TO authenticated
USING (invoice_id IN (SELECT i.id FROM public.customer_invoices i JOIN public.customers c ON c.id = i.customer_id WHERE c.profile_id = public.current_profile_id() AND i.organization_id = customer_invoice_items.organization_id));

DROP POLICY IF EXISTS customer_payments_staff_all ON public.customer_payments;
CREATE POLICY customer_payments_staff_all ON public.customer_payments FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS customer_payments_own_read ON public.customer_payments;
CREATE POLICY customer_payments_own_read ON public.customer_payments FOR SELECT TO authenticated
USING (customer_id IN (SELECT c.id FROM public.customers c WHERE c.profile_id = public.current_profile_id() AND c.organization_id = customer_payments.organization_id));

DROP POLICY IF EXISTS sales_quotes_staff_all ON public.sales_quotes;
CREATE POLICY sales_quotes_staff_all ON public.sales_quotes FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS sales_quotes_own_read ON public.sales_quotes;
CREATE POLICY sales_quotes_own_read ON public.sales_quotes FOR SELECT TO authenticated
USING (customer_id IN (SELECT c.id FROM public.customers c WHERE c.profile_id = public.current_profile_id() AND c.organization_id = sales_quotes.organization_id));

DROP POLICY IF EXISTS sales_quote_items_staff_all ON public.sales_quote_items;
CREATE POLICY sales_quote_items_staff_all ON public.sales_quote_items FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS sales_quote_items_own_read ON public.sales_quote_items;
CREATE POLICY sales_quote_items_own_read ON public.sales_quote_items FOR SELECT TO authenticated
USING (quote_id IN (SELECT q.id FROM public.sales_quotes q JOIN public.customers c ON c.id = q.customer_id WHERE c.profile_id = public.current_profile_id() AND q.organization_id = sales_quote_items.organization_id));

DROP POLICY IF EXISTS reorder_templates_staff_all ON public.reorder_templates;
CREATE POLICY reorder_templates_staff_all ON public.reorder_templates FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS reorder_templates_own_all ON public.reorder_templates;
CREATE POLICY reorder_templates_own_all ON public.reorder_templates FOR ALL TO authenticated
USING (customer_id IN (SELECT c.id FROM public.customers c WHERE c.profile_id = public.current_profile_id() AND c.organization_id = reorder_templates.organization_id))
WITH CHECK (customer_id IN (SELECT c.id FROM public.customers c WHERE c.profile_id = public.current_profile_id() AND c.organization_id = reorder_templates.organization_id));

DROP POLICY IF EXISTS reorder_template_items_staff_all ON public.reorder_template_items;
CREATE POLICY reorder_template_items_staff_all ON public.reorder_template_items FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS reorder_template_items_own_all ON public.reorder_template_items;
CREATE POLICY reorder_template_items_own_all ON public.reorder_template_items FOR ALL TO authenticated
USING (template_id IN (SELECT r.id FROM public.reorder_templates r WHERE r.customer_id IN (SELECT c.id FROM public.customers c WHERE c.profile_id = public.current_profile_id()) AND r.organization_id = reorder_template_items.organization_id))
WITH CHECK (template_id IN (SELECT r.id FROM public.reorder_templates r WHERE r.customer_id IN (SELECT c.id FROM public.customers c WHERE c.profile_id = public.current_profile_id()) AND r.organization_id = reorder_template_items.organization_id));

CREATE OR REPLACE FUNCTION public.request_sales_quote(p_lines jsonb, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
  v_org uuid;
  v_quote uuid;
  v_line jsonb;
  v_product public.products%ROWTYPE;
  v_qty numeric;
  v_count integer;
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote lines must be an array'; END IF;
  v_count := pg_catalog.jsonb_array_length(p_lines);
  IF v_count < 1 OR v_count > 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote must contain between 1 and 100 lines'; END IF;

  SELECT c.id, c.organization_id INTO v_customer, v_org
    FROM public.customers c
   WHERE c.profile_id = v_profile AND c.status = 'approved'
   ORDER BY c.created_at LIMIT 1;
  IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='approved customer account required'; END IF;

  INSERT INTO public.sales_quotes(organization_id, customer_id, quote_number, status, notes, created_by)
  VALUES (v_org, v_customer, 'Q-' || pg_catalog.to_char(pg_catalog.now(),'YYMMDD') || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)), 'requested', pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),1000), v_profile)
  RETURNING id INTO v_quote;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF nullif(pg_catalog.btrim(v_line->>'product_id'),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product_id required'; END IF;
    BEGIN
      v_qty := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid quantity';
    END;
    IF v_qty IS NULL OR v_qty <> pg_catalog.trunc(v_qty) OR v_qty < 1 OR v_qty > 10000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be a positive integer not exceeding 10000'; END IF;
    SELECT p.* INTO v_product FROM public.products p WHERE p.id = (v_line->>'product_id')::uuid AND p.organization_id = v_org AND p.status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product unavailable'; END IF;
    INSERT INTO public.sales_quote_items(organization_id, quote_id, product_id, item_code, product_name_snapshot, unit_snapshot, requested_quantity)
    VALUES (v_org, v_quote, v_product.id, v_product.item_code, v_product.name, v_product.unit, v_qty);
  END LOOP;
  RETURN v_quote;
END;
$$;
REVOKE ALL ON FUNCTION public.request_sales_quote(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_sales_quote(jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_reorder_template(p_name text, p_lines jsonb, p_source_order_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
  v_org uuid;
  v_template uuid;
  v_line jsonb;
  v_product public.products%ROWTYPE;
  v_qty numeric;
  v_name text := pg_catalog.btrim(coalesce(p_name,''));
  v_count integer;
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  IF length(v_name) < 2 OR length(v_name) > 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='template name must be 2 to 100 characters'; END IF;
  IF p_lines IS NULL OR pg_catalog.jsonb_typeof(p_lines) <> 'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='template lines must be an array'; END IF;
  v_count := pg_catalog.jsonb_array_length(p_lines);
  IF v_count < 1 OR v_count > 100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='template must contain between 1 and 100 lines'; END IF;
  SELECT c.id,c.organization_id INTO v_customer,v_org FROM public.customers c WHERE c.profile_id=v_profile ORDER BY c.created_at LIMIT 1;
  IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account required'; END IF;
  IF p_source_order_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.id=p_source_order_id AND o.customer_id=v_customer AND o.organization_id=v_org) THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='source order is not owned by this customer'; END IF;
  INSERT INTO public.reorder_templates(organization_id,customer_id,name,source_order_id) VALUES(v_org,v_customer,v_name,p_source_order_id) RETURNING id INTO v_template;
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_lines) LOOP
    IF nullif(pg_catalog.btrim(v_line->>'product_id'),'') IS NULL THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product_id required'; END IF;
    BEGIN v_qty := (v_line->>'quantity')::numeric; EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid quantity'; END;
    IF v_qty IS NULL OR v_qty <> pg_catalog.trunc(v_qty) OR v_qty < 1 OR v_qty > 10000 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be a positive integer not exceeding 10000'; END IF;
    SELECT p.* INTO v_product FROM public.products p WHERE p.id=(v_line->>'product_id')::uuid AND p.organization_id=v_org AND p.status='active';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product unavailable'; END IF;
    INSERT INTO public.reorder_template_items(organization_id,template_id,product_id,item_code,product_name_snapshot,quantity)
    VALUES(v_org,v_template,v_product.id,v_product.item_code,v_product.name,v_qty);
  END LOOP;
  RETURN v_template;
END;
$$;
REVOKE ALL ON FUNCTION public.save_reorder_template(text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_reorder_template(text,jsonb,uuid) TO authenticated;

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
    INSERT INTO public.customer_invoice_items(organization_id,invoice_id,product_id,item_code,description,unit,quantity,unit_price,line_total)
    SELECT NEW.organization_id, v_invoice, oi.product_id, oi.item_code, oi.product_name_snapshot,
           oi.unit_snapshot, oi.quantity, oi.unit_price_snapshot, oi.line_total
      FROM public.order_items oi WHERE oi.order_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_issue_invoice_after_confirmation ON public.orders;
CREATE TRIGGER orders_issue_invoice_after_confirmation
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.issue_invoice_for_confirmed_order();

CREATE OR REPLACE FUNCTION public.refresh_customer_invoice_payment_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_invoice_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_total numeric(15,2);
  v_paid numeric(15,2);
BEGIN
  SELECT i.total_amount, coalesce(sum(p.amount),0) INTO v_total,v_paid
  FROM public.customer_invoices i LEFT JOIN public.customer_payments p ON p.invoice_id=i.id
  WHERE i.id=v_invoice_id GROUP BY i.id,i.total_amount;
  IF NOT FOUND THEN RETURN COALESCE(NEW,OLD); END IF;
  UPDATE public.customer_invoices SET status=CASE WHEN v_paid >= v_total THEN 'paid' WHEN v_paid > 0 THEN 'partially_paid' ELSE 'issued' END WHERE id=v_invoice_id AND status <> 'void';
  RETURN COALESCE(NEW,OLD);
END;
$$;
DROP TRIGGER IF EXISTS customer_payments_update_invoice_status ON public.customer_payments;
CREATE TRIGGER customer_payments_update_invoice_status
AFTER INSERT OR UPDATE OR DELETE ON public.customer_payments
FOR EACH ROW EXECUTE FUNCTION public.refresh_customer_invoice_payment_status();
