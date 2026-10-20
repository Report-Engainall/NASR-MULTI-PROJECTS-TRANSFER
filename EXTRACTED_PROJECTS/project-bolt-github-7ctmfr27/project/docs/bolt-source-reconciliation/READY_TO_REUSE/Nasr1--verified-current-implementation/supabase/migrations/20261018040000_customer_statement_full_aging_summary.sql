-- Full-ledger customer statement summaries, with bounded invoice/payment detail arrays.
-- Identity and tenant scope remain derived only from the authenticated active profile.
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
  v_summary jsonb;
  v_summary_as_of_utc timestamptz := pg_catalog.clock_timestamp();
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

  -- Detail is capped, but each invoice carries a full-ledger payment aggregate
  -- so old payments remain reflected even when omitted from the 500-row payment list.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
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
    'total_amount',i.total_amount,
    'paid_amount',i.paid_amount::text,
    'outstanding_amount',(CASE WHEN i.status='void' THEN 0 ELSE GREATEST(i.total_amount-i.paid_amount,0) END)::text
  ) ORDER BY i.issued_at DESC),'[]'::jsonb)
    INTO v_invoices
    FROM (
      SELECT ci.*,
             COALESCE(payments_by_invoice.paid_amount,0) AS paid_amount
        FROM public.customer_invoices ci
        LEFT JOIN (
          SELECT cp.invoice_id, SUM(cp.amount) AS paid_amount
            FROM public.customer_payments cp
           WHERE cp.organization_id=v_org
             AND cp.customer_id=v_customer
           GROUP BY cp.invoice_id
        ) payments_by_invoice ON payments_by_invoice.invoice_id=ci.id
       WHERE ci.organization_id=v_org AND ci.customer_id=v_customer
       ORDER BY ci.issued_at DESC, ci.id
       LIMIT 200
    ) i;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
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

  WITH payments_by_invoice AS (
    SELECT cp.invoice_id, SUM(cp.amount) AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id=v_org
       AND cp.customer_id=v_customer
     GROUP BY cp.invoice_id
  ),
  invoice_balances AS (
    SELECT
      ci.currency,
      ci.due_at,
      ci.total_amount AS invoiced_amount,
      COALESCE(pbi.paid_amount,0) AS paid_amount,
      GREATEST(ci.total_amount-COALESCE(pbi.paid_amount,0),0) AS outstanding_amount
    FROM public.customer_invoices ci
    LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id=ci.id
    WHERE ci.organization_id=v_org
      AND ci.customer_id=v_customer
      AND ci.status <> 'void'
  ),
  summary_by_currency AS (
    SELECT
      ib.currency,
      COALESCE(SUM(ib.invoiced_amount),0) AS invoiced,
      COALESCE(SUM(ib.paid_amount),0) AS paid,
      COALESCE(SUM(ib.outstanding_amount),0) AS outstanding,
      COUNT(*) FILTER (
        WHERE ib.outstanding_amount > 0 AND ib.due_at IS NOT NULL AND ib.due_at < v_summary_as_of_utc
      )::integer AS overdue_invoice_count,
      COALESCE(SUM(ib.outstanding_amount) FILTER (
        WHERE ib.outstanding_amount > 0 AND ib.due_at IS NOT NULL AND ib.due_at < v_summary_as_of_utc
      ),0) AS overdue_outstanding,
      COUNT(*) FILTER (
        WHERE ib.outstanding_amount > 0 AND ib.due_at IS NULL
      )::integer AS unknown_due_date_invoice_count,
      COALESCE(SUM(ib.outstanding_amount) FILTER (
        WHERE ib.outstanding_amount > 0 AND ib.due_at IS NULL
      ),0) AS unknown_due_date_outstanding
    FROM invoice_balances ib
    GROUP BY ib.currency
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency',s.currency,
    'invoiced',s.invoiced::text,
    'paid',s.paid::text,
    'outstanding',s.outstanding::text,
    'overdue_invoice_count',s.overdue_invoice_count,
    'overdue_outstanding',s.overdue_outstanding::text,
    'unknown_due_date_invoice_count',s.unknown_due_date_invoice_count,
    'unknown_due_date_outstanding',s.unknown_due_date_outstanding::text
  ) ORDER BY s.currency),'[]'::jsonb)
    INTO v_summary
    FROM summary_by_currency s;

  RETURN pg_catalog.jsonb_build_object(
    'invoices',v_invoices,
    'payments',v_payments,
    'summary_as_of_utc',v_summary_as_of_utc,
    'summary',v_summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_account_statement() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_account_statement() TO authenticated;
COMMENT ON FUNCTION public.get_customer_account_statement() IS
  'Returns the authenticated active customer own account statement with full-ledger currency-separated aggregates and bounded detail lists.';
