-- NASR1-FINANCE-COLLECTION-AGING-001
-- Authoritative aging report: compute balances from the invoice and payment ledger,
-- scoped to the active finance-authorized profile and organization.
CREATE OR REPLACE FUNCTION public.fetch_staff_receivables_aging(
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_as_of_utc date := (pg_catalog.now() AT TIME ZONE 'UTC')::date;
  v_total_open bigint := 0;
  v_summary jsonb := '[]'::jsonb;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required';
  END IF;

  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization is required';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 10000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='limit must be 1-500 and offset must be between 0 and 10000000';
  END IF;

  WITH payments_by_invoice AS (
    SELECT cp.invoice_id, pg_catalog.sum(cp.amount)::numeric(15,2) AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id=v_org
     GROUP BY cp.invoice_id
  ),
  invoice_balances AS (
    SELECT
      ci.id,
      ci.invoice_number,
      ci.customer_id,
      COALESCE(
        NULLIF(pg_catalog.btrim(c.business_name), ''),
        NULLIF(pg_catalog.btrim(c.contact_name), ''),
        ci.customer_id::text
      ) AS customer_name,
      ci.issued_at,
      ci.due_at,
      COALESCE(NULLIF(pg_catalog.upper(pg_catalog.btrim(ci.currency)), ''), 'UNSPECIFIED') AS currency,
      ci.total_amount::numeric(15,2) AS total_amount,
      COALESCE(pbi.paid_amount, 0)::numeric(15,2) AS paid_amount,
      GREATEST(ci.total_amount - COALESCE(pbi.paid_amount, 0), 0)::numeric(15,2) AS outstanding_amount,
      CASE WHEN ci.due_at IS NULL THEN NULL
           ELSE (ci.due_at AT TIME ZONE 'UTC')::date
      END AS due_date_utc
    FROM public.customer_invoices ci
    LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id=ci.id
    LEFT JOIN public.customers c
      ON c.id=ci.customer_id AND c.organization_id=ci.organization_id
    WHERE ci.organization_id=v_org
      AND ci.status <> 'void'
  ),
  aged AS (
    SELECT
      ib.*,
      CASE WHEN ib.due_date_utc IS NULL THEN NULL
           WHEN ib.due_date_utc < v_as_of_utc THEN v_as_of_utc - ib.due_date_utc
           ELSE 0
      END AS days_overdue
    FROM invoice_balances ib
  ),
  bucketed AS (
    SELECT
      a.*,
      CASE
        WHEN a.due_date_utc IS NULL THEN 'unknown_due_date'
        WHEN a.days_overdue=0 THEN 'current'
        WHEN a.days_overdue <= 30 THEN 'days_1_30'
        WHEN a.days_overdue <= 60 THEN 'days_31_60'
        WHEN a.days_overdue <= 90 THEN 'days_61_90'
        ELSE 'over_90'
      END AS aging_bucket
    FROM aged a
    WHERE a.outstanding_amount > 0
  ),
  summary_by_currency AS (
    SELECT
      b.currency,
      pg_catalog.count(*)::integer AS open_invoice_count,
      pg_catalog.count(*) FILTER (WHERE b.aging_bucket NOT IN ('current','unknown_due_date'))::integer AS overdue_invoice_count,
      pg_catalog.count(*) FILTER (WHERE b.aging_bucket='unknown_due_date')::integer AS unknown_due_date_count,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.aging_bucket='current'),0)::numeric(15,2) AS current_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.aging_bucket='days_1_30'),0)::numeric(15,2) AS days_1_30_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.aging_bucket='days_31_60'),0)::numeric(15,2) AS days_31_60_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.aging_bucket='days_61_90'),0)::numeric(15,2) AS days_61_90_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.aging_bucket='over_90'),0)::numeric(15,2) AS over_90_amount,
      COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.aging_bucket='unknown_due_date'),0)::numeric(15,2) AS unknown_due_date_amount,
      pg_catalog.sum(b.outstanding_amount)::numeric(15,2) AS total_outstanding_amount
    FROM bucketed b
    GROUP BY b.currency
  ),
  page_items AS (
    SELECT * FROM bucketed
    ORDER BY days_overdue DESC NULLS LAST, due_at ASC NULLS LAST, issued_at ASC, id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    (SELECT pg_catalog.count(*) FROM bucketed),
    (SELECT COALESCE(
      pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'currency',s.currency,
        'open_invoice_count',s.open_invoice_count,
        'overdue_invoice_count',s.overdue_invoice_count,
        'unknown_due_date_count',s.unknown_due_date_count,
        'current_amount',s.current_amount,
        'days_1_30_amount',s.days_1_30_amount,
        'days_31_60_amount',s.days_31_60_amount,
        'days_61_90_amount',s.days_61_90_amount,
        'over_90_amount',s.over_90_amount,
        'unknown_due_date_amount',s.unknown_due_date_amount,
        'total_outstanding_amount',s.total_outstanding_amount
      ) ORDER BY s.currency),
      '[]'::jsonb
    ) FROM summary_by_currency s),
    (SELECT COALESCE(
      pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',p.id,
        'invoice_number',p.invoice_number,
        'customer_id',p.customer_id,
        'customer_name',p.customer_name,
        'issued_at',p.issued_at,
        'due_at',p.due_at,
        'currency',p.currency,
        'total_amount',p.total_amount,
        'paid_amount',p.paid_amount,
        'outstanding_amount',p.outstanding_amount,
        'days_overdue',p.days_overdue,
        'aging_bucket',p.aging_bucket
      ) ORDER BY p.days_overdue DESC NULLS LAST, p.due_at ASC NULLS LAST, p.issued_at ASC, p.id),
      '[]'::jsonb
    ) FROM page_items p)
  INTO v_total_open, v_summary, v_items;

  RETURN pg_catalog.jsonb_build_object(
    'as_of_utc', v_as_of_utc,
    'limit', p_limit,
    'offset', p_offset,
    'total_open_invoices', v_total_open,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total_open,
    'summary', v_summary,
    'items', v_items
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_staff_receivables_aging(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_receivables_aging(integer,integer) TO authenticated;
