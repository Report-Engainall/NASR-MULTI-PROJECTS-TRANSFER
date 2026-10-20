-- Separate invoice document privacy from the explicitly authorized account statement.
-- Customers can read invoice metadata and line descriptions, but no invoice/line/payment amounts
-- directly from PostgREST tables. Statement and staff-finance amounts are explicit, scoped RPCs.

REVOKE SELECT ON TABLE public.customer_invoices, public.customer_invoice_items, public.customer_payments
  FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  organization_id,
  customer_id,
  order_id,
  invoice_number,
  status,
  issued_at,
  due_at,
  currency,
  created_at
) ON TABLE public.customer_invoices TO authenticated;

GRANT SELECT (
  id,
  invoice_id,
  product_id,
  item_code,
  description,
  unit,
  quantity,
  created_at
) ON TABLE public.customer_invoice_items TO authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_account_statement()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
  v_org uuid;
  v_invoices jsonb;
  v_payments jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated customer required for account statement';
  END IF;

  SELECT c.id, c.organization_id INTO v_customer, v_org
    FROM public.customers c
   WHERE c.profile_id=v_profile
   ORDER BY c.created_at, c.id
   LIMIT 1;

  IF v_customer IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account is not linked to the active profile';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'invoice_number',i.invoice_number,
    'order_id',i.order_id,
    'customer_id',i.customer_id,
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
       WHERE ci.organization_id=v_org AND ci.customer_id=v_customer
       ORDER BY ci.issued_at DESC, ci.id
       LIMIT 200
    ) i;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,
    'invoice_id',p.invoice_id,
    'amount',p.amount,
    'paid_at',p.paid_at
  ) ORDER BY p.paid_at DESC),'[]'::jsonb)
    INTO v_payments
    FROM (
      SELECT cp.*
        FROM public.customer_payments cp
       WHERE cp.organization_id=v_org AND cp.customer_id=v_customer
       ORDER BY cp.paid_at DESC, cp.id
       LIMIT 500
    ) p;

  RETURN jsonb_build_object('invoices',v_invoices,'payments',v_payments);
END;
$$;
REVOKE ALL ON FUNCTION public.get_customer_account_statement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_account_statement() TO authenticated;

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
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff role required for finance data';
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

DO $$
BEGIN
  IF has_column_privilege('authenticated','public.customer_invoices','total_amount','SELECT')
     OR has_column_privilege('authenticated','public.customer_invoices','subtotal','SELECT')
     OR has_column_privilege('authenticated','public.customer_invoice_items','unit_price','SELECT')
     OR has_column_privilege('authenticated','public.customer_invoice_items','line_total','SELECT')
     OR has_column_privilege('authenticated','public.customer_payments','amount','SELECT') THEN
    RAISE EXCEPTION 'Customer invoice/payment amount privacy grants are too broad';
  END IF;

  IF NOT has_column_privilege('authenticated','public.customer_invoices','invoice_number','SELECT')
     OR NOT has_column_privilege('authenticated','public.customer_invoice_items','quantity','SELECT') THEN
    RAISE EXCEPTION 'Required non-financial invoice display columns are missing SELECT grants';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_customer_account_statement() IS
  'Returns only the authenticated customer own account statement, including financial amounts authorized for that statement surface.';
COMMENT ON FUNCTION public.fetch_staff_finance_data() IS
  'Returns financial invoice and payment rows only for the active staff profile organization.';
