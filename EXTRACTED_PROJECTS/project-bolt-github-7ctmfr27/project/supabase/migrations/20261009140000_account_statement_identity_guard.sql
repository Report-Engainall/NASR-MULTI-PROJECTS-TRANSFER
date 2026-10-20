-- Close the disabled-profile path on the explicitly authorized customer statement RPC.
-- Replacing the function keeps the guard server-side and leaves prior migrations immutable.
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
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id=v_profile
       AND p.auth_user_id=auth.uid()
       AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated active customer required for account statement';
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
COMMENT ON FUNCTION public.get_customer_account_statement() IS
  'Returns the authenticated active customer own account statement, including financial amounts authorized for that statement surface.';