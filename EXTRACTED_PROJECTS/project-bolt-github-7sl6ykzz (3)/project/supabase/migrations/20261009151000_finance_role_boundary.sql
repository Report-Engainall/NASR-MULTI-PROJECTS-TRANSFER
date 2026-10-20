-- Restrict staff finance visibility and writes to the existing admin/manager roles.

-- Generic staff can still process orders but cannot read financial aggregates, record payments,

-- or directly mutate invoice and payment ledgers through PostgREST.

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.auth_user_id=auth.uid()
       AND p.is_active
       AND r.role IN ('admin','manager')
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_finance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated;


CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_invoice_id uuid,p_amount numeric,p_payment_method text,p_reference text DEFAULT NULL,p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_invoice public.customer_invoices%ROWTYPE;
  v_paid numeric(15,2);
  v_payment uuid;
  v_method text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method,'')));
BEGIN
  IF NOT public.can_manage_finance() THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to record payments'; END IF;
  SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active finance organization context required'; END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity') OR p_amount<=0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='payment amount must be finite and greater than zero'; END IF;
  IF v_method NOT IN ('cash','transfer','card','credit_adjustment','other') THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid payment method'; END IF;
  SELECT i.* INTO v_invoice FROM public.customer_invoices i WHERE i.id=p_invoice_id AND i.organization_id=v_org FOR UPDATE;
  IF NOT FOUND OR v_invoice.status='void' THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='active invoice not found in this organization'; END IF;
  SELECT coalesce(sum(p.amount),0) INTO v_paid FROM public.customer_payments p WHERE p.invoice_id=v_invoice.id;
  IF v_paid+round(p_amount,2)>v_invoice.total_amount THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='payment exceeds invoice balance'; END IF;
  INSERT INTO public.customer_payments(organization_id,customer_id,invoice_id,amount,payment_method,reference,notes,paid_at,created_by)
  VALUES(v_invoice.organization_id,v_invoice.customer_id,v_invoice.id,round(p_amount,2),v_method,
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_reference,'')),200),''),
    nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),1000),''),pg_catalog.now(),v_profile)
  RETURNING id INTO v_payment;
  RETURN v_payment;
END;
$$;
REVOKE ALL ON FUNCTION public.record_customer_payment(uuid,numeric,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(uuid,numeric,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_staff_finance_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_invoices jsonb;
  v_payments jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization is required';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'organization_id',i.organization_id,
    'customer_id',i.customer_id,
    'order_id',i.order_id,
    'invoice_number',i.invoice_number,
    'status',i.status,
    'issued_at',i.issued_at,
    'due_at',i.due_at,
    'currency',i.currency,
    'subtotal',i.subtotal,
    'tax_amount',i.tax_amount,
    'total_amount',i.total_amount
  ) ORDER BY i.issued_at DESC),'[]'::jsonb)
    INTO v_invoices
    FROM (
      SELECT ci.*
        FROM public.customer_invoices ci
       WHERE ci.organization_id=v_org
       ORDER BY ci.issued_at DESC, ci.id
       LIMIT 500
    ) i;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'organization_id',p.organization_id,
    'customer_id',p.customer_id,
    'invoice_id',p.invoice_id,
    'amount',p.amount,
    'paid_at',p.paid_at,
    'payment_method',p.payment_method
  ) ORDER BY p.paid_at DESC),'[]'::jsonb)
    INTO v_payments
    FROM (
      SELECT cp.*
        FROM public.customer_payments cp
       WHERE cp.organization_id=v_org
       ORDER BY cp.paid_at DESC, cp.id
       LIMIT 1000
    ) p;

  RETURN jsonb_build_object('invoices',v_invoices,'payments',v_payments);
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_staff_finance_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_finance_data() TO authenticated;

-- Finance is not a generic staff capability. Staff may process orders, but cannot
-- inspect financial aggregates or mutate invoice/payment ledgers with table-level access.
DROP POLICY IF EXISTS customer_invoices_staff_all ON public.customer_invoices;
DROP POLICY IF EXISTS customer_invoices_staff_read ON public.customer_invoices;
CREATE POLICY customer_invoices_staff_read ON public.customer_invoices
  FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id=public.current_profile_id()
         AND p.auth_user_id=auth.uid()
         AND p.is_active
    )
  );

DROP POLICY IF EXISTS customer_invoice_items_staff_all ON public.customer_invoice_items;
DROP POLICY IF EXISTS customer_invoice_items_staff_read ON public.customer_invoice_items;
CREATE POLICY customer_invoice_items_staff_read ON public.customer_invoice_items
  FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id=public.current_profile_id()
         AND p.auth_user_id=auth.uid()
         AND p.is_active
    )
  );

DROP POLICY IF EXISTS customer_payments_staff_read ON public.customer_payments;
CREATE POLICY customer_payments_staff_read ON public.customer_payments
  FOR SELECT TO authenticated
  USING (
    public.can_manage_finance()
    AND organization_id = (
      SELECT p.organization_id FROM public.profiles p
       WHERE p.id=public.current_profile_id()
         AND p.auth_user_id=auth.uid()
         AND p.is_active
    )
  );

-- Issuance and payment writes occur in SECURITY DEFINER database commands/triggers only.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.customer_invoices,
  public.customer_invoice_items,
  public.customer_payments
FROM PUBLIC, anon, authenticated;


COMMENT ON FUNCTION public.can_manage_finance() IS

  'Allows only authenticated active profiles with the existing admin or manager role to access accounting operations.';

COMMENT ON FUNCTION public.record_customer_payment(uuid,numeric,text,text,text) IS

  'Records a payment only for an authenticated active admin/manager within their organization.';