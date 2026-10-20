-- Authorize financial invoice PDF fields through a customer-bound RPC only.
-- Direct PostgREST column grants remain non-financial; the response is scoped to the
-- active customer identity and the explicit invoices.read capability.
CREATE OR REPLACE FUNCTION public.get_customer_invoice_pdf(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid := public.current_customer_id();
  v_org uuid := public.current_organization_id();
  v_invoice jsonb;
  v_lines jsonb;
  v_customer_document jsonb;
  v_line_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_customer IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = v_profile
          AND p.auth_user_id = auth.uid()
          AND p.is_active
          AND p.organization_id = v_org
     )
     OR NOT public.current_customer_can('invoices.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='authenticated active customer with invoice-read permission required';
  END IF;

  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice id required';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', i.id,
    'invoice_number', i.invoice_number,
    'customer_id', i.customer_id,
    'status', i.status,
    'issued_at', i.issued_at,
    'due_at', i.due_at,
    'currency', i.currency,
    'subtotal', i.subtotal,
    'tax_amount', i.tax_amount,
    'total_amount', i.total_amount
  )
    INTO v_invoice
    FROM public.customer_invoices i
   WHERE i.id = p_invoice_id
     AND i.customer_id = v_customer
     AND i.organization_id = v_org;

  IF v_invoice IS NULL THEN
    -- Do not disclose whether another customer's invoice exists.
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='الفاتورة غير موجودة أو غير متاحة لهذا الحساب';
  END IF;

  SELECT count(*)::integer
    INTO v_line_count
    FROM public.customer_invoice_items i
   WHERE i.invoice_id = p_invoice_id
     AND i.organization_id = v_org;

  IF v_line_count > 500 THEN
    RAISE EXCEPTION USING ERRCODE='54000',
      MESSAGE='invoice contains too many lines for a complete PDF';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', i.id,
        'item_code', i.item_code,
        'description', i.description,
        'unit', i.unit,
        'quantity', i.quantity,
        'unit_price', i.unit_price,
        'line_total', i.line_total
      ) ORDER BY i.created_at, i.id
    ),
    '[]'::jsonb
  )
    INTO v_lines
    FROM public.customer_invoice_items i
   WHERE i.invoice_id = p_invoice_id
     AND i.organization_id = v_org;

  SELECT pg_catalog.jsonb_build_object(
    'customer_code', c.customer_code,
    'business_name', c.business_name,
    'contact_name', c.contact_name
  )
    INTO v_customer_document
    FROM public.customers c
   WHERE c.id = v_customer
     AND c.organization_id = v_org;

  IF v_customer_document IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='customer account is not linked to the active profile';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'invoice', v_invoice,
    'lines', v_lines,
    'customer', v_customer_document
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_invoice_pdf(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_invoice_pdf(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_customer_invoice_pdf(uuid) IS
  'Returns financial fields for one invoice belonging to the active customer only when the authenticated profile has invoices.read; does not broaden direct table column grants.';
