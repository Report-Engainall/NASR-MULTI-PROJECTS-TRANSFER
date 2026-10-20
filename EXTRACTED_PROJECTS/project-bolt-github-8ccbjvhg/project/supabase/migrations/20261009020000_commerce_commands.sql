-- Server-authoritative quote responses, customer quote decisions, payment posting,
-- and safe profile provisioning. All monetary changes are transactional.
CREATE OR REPLACE FUNCTION public.ensure_profile(_full_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := pg_catalog.lower(coalesce(auth.jwt() ->> 'email',''));
  v_pid uuid;
  v_org uuid;
  v_name text;
  v_roles text[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='not authenticated'; END IF;

  SELECT p.id INTO v_pid FROM public.profiles p WHERE p.auth_user_id=v_uid;
  IF v_pid IS NULL THEN
    -- A pre-provisioned profile retains its existing roles when its owner verifies the matching email.
    SELECT p.id INTO v_pid FROM public.profiles p
     WHERE pg_catalog.lower(coalesce(p.email,''))=v_email AND p.auth_user_id IS NULL
     ORDER BY p.created_at LIMIT 1 FOR UPDATE;
    IF v_pid IS NOT NULL THEN
      UPDATE public.profiles SET auth_user_id=v_uid,
        full_name=coalesce(nullif(pg_catalog.btrim(_full_name),''),full_name),
        updated_at=pg_catalog.now()
       WHERE id=v_pid;
    ELSE
      SELECT o.id INTO v_org FROM public.organizations o WHERE o.is_active ORDER BY o.created_at LIMIT 1;
      IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='no active organization is configured'; END IF;
      INSERT INTO public.profiles(auth_user_id,organization_id,full_name,email)
      VALUES(v_uid,v_org,coalesce(nullif(pg_catalog.btrim(_full_name),''),nullif(pg_catalog.split_part(v_email,'@',1),''),'مستخدم'),nullif(v_email,''))
      RETURNING id INTO v_pid;
      -- New self-service registrations are customers, never the first administrator by accident.
      INSERT INTO public.user_roles(profile_id,role) VALUES(v_pid,'customer') ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  SELECT p.full_name INTO v_name FROM public.profiles p WHERE p.id=v_pid;
  SELECT array_agg(r.role ORDER BY r.role) INTO v_roles FROM public.user_roles r WHERE r.profile_id=v_pid;
  RETURN pg_catalog.jsonb_build_object('profile_id',v_pid,'full_name',v_name,'email',v_email,'roles',coalesce(v_roles,ARRAY[]::text[]));
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_profile(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_sales_quote(
  p_quote_id uuid,
  p_prices jsonb,
  p_response_note text DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_quote public.sales_quotes%ROWTYPE;
  v_line jsonb;
  v_item_id uuid;
  v_price numeric;
  v_count integer;
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff permission required'; END IF;
  SELECT q.* INTO v_quote FROM public.sales_quotes q WHERE q.id=p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='quote not found'; END IF;
  IF v_quote.status NOT IN ('requested','quoted') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote is not open for pricing'; END IF;
  IF p_prices IS NULL OR pg_catalog.jsonb_typeof(p_prices)<>'array' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='prices must be an array'; END IF;
  v_count:=pg_catalog.jsonb_array_length(p_prices);
  IF v_count<1 OR v_count>100 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid quote line count'; END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(p_prices) LOOP
    BEGIN
      v_item_id := (v_line->>'item_id')::uuid;
      v_price := (v_line->>'unit_price')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid quote item or price';
    END;
    IF v_price IS NULL OR v_price::text IN ('NaN','Infinity','-Infinity') OR v_price<0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote price must be a finite nonnegative amount';
    END IF;
    UPDATE public.sales_quote_items SET quoted_unit_price=v_price
     WHERE id=v_item_id AND quote_id=v_quote.id AND organization_id=v_quote.organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote item does not belong to this quote'; END IF;
  END LOOP;

  IF (SELECT count(*) FROM public.sales_quote_items i WHERE i.quote_id=v_quote.id AND i.organization_id=v_quote.organization_id)<>v_count
     OR EXISTS(SELECT 1 FROM public.sales_quote_items i WHERE i.quote_id=v_quote.id AND i.organization_id=v_quote.organization_id AND i.quoted_unit_price IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a price is required for every quote line';
  END IF;
  IF p_valid_until IS NOT NULL AND p_valid_until<pg_catalog.now() THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote validity must be in the future';
  END IF;
  UPDATE public.sales_quotes
     SET status='quoted', response_note=pg_catalog.left(pg_catalog.btrim(coalesce(p_response_note,'')),1000),
         responded_by=v_profile, quoted_at=pg_catalog.now(), valid_until=p_valid_until, updated_at=pg_catalog.now()
   WHERE id=v_quote.id;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_sales_quote(uuid,jsonb,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_sales_quote(uuid,jsonb,text,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_respond_to_quote(p_quote_id uuid,p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  SELECT c.id INTO v_customer FROM public.customers c WHERE c.profile_id=v_profile ORDER BY c.created_at LIMIT 1;
  IF v_customer IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account required'; END IF;
  UPDATE public.sales_quotes q
     SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END, updated_at=pg_catalog.now()
   WHERE q.id=p_quote_id AND q.customer_id=v_customer AND q.status='quoted';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='quote is unavailable or no longer awaiting a response'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.customer_respond_to_quote(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_respond_to_quote(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_invoice public.customer_invoices%ROWTYPE;
  v_paid numeric(15,2);
  v_payment uuid;
  v_method text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method,'')));
BEGIN
  IF NOT public.is_staff() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff permission required to record payments'; END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='payment amount must be finite and greater than zero'; END IF;
  IF v_method NOT IN ('cash','transfer','card','credit_adjustment','other') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid payment method'; END IF;
  SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=p_invoice_id FOR UPDATE;
  IF NOT FOUND OR v_invoice.status='void' THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='active invoice not found'; END IF;
  SELECT coalesce(sum(p.amount),0) INTO v_paid FROM public.customer_payments p WHERE p.invoice_id=v_invoice.id;
  IF v_paid+p_amount>v_invoice.total_amount THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='payment exceeds invoice balance'; END IF;
  INSERT INTO public.customer_payments(organization_id,customer_id,invoice_id,amount,payment_method,reference,notes,paid_at,created_by)
  VALUES(v_invoice.organization_id,v_invoice.customer_id,v_invoice.id,round(p_amount,2),v_method,nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_reference,'')),200),''),nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),1000),''),pg_catalog.now(),v_profile)
  RETURNING id INTO v_payment;
  RETURN v_payment;
END;
$$;
REVOKE ALL ON FUNCTION public.record_customer_payment(uuid,numeric,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(uuid,numeric,text,text,text) TO authenticated;

-- Payment writes are allowed only through record_customer_payment(), which locks the invoice and enforces its balance.
DROP POLICY IF EXISTS customer_payments_staff_all ON public.customer_payments;
DROP POLICY IF EXISTS customer_payments_staff_read ON public.customer_payments;
CREATE POLICY customer_payments_staff_read ON public.customer_payments FOR SELECT TO authenticated USING (public.is_staff());
