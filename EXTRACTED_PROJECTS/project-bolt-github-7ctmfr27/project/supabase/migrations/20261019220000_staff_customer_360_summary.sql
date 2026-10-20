-- Staff-facing customer 360 summary adapted to the current tenant/order/invoice schema.
-- This returns full-ledger aggregates while deliberately bounding the detailed history arrays.
CREATE OR REPLACE FUNCTION public.get_staff_customer_360(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_customer jsonb;
  v_order_summary jsonb;
  v_finance_by_currency jsonb;
  v_recent_orders jsonb;
  v_recent_order_items jsonb;
  v_recent_invoices jsonb;
  v_recent_payments jsonb;
  v_top_products jsonb;
  v_recommendations jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() OR NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = v_actor
       AND p.auth_user_id = auth.uid()
       AND p.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'صلاحية موظف نشط مطلوبة لفتح ملف العميل 360.';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'المؤسسة النشطة غير متاحة لملف العميل.';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id', c.id,
    'customer_code', c.customer_code,
    'business_name', c.business_name,
    'contact_name', c.contact_name,
    'phone', c.phone,
    'email', c.email,
    'tier', c.tier,
    'status', c.status,
    'current_balance', c.current_balance,
    'credit_limit', c.credit_limit
  )
    INTO v_customer
    FROM public.customers c
   WHERE c.id = p_customer_id
     AND c.organization_id = v_org;

  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'العميل غير موجود ضمن المؤسسة الحالية.';
  END IF;

  -- Full-history order metrics; if any eligible order amount is NULL, totals are unavailable,
  -- not silently reduced or reported as zero.
  SELECT pg_catalog.jsonb_build_object(
    'order_count', pg_catalog.count(*)::integer,
    'pending_order_count', pg_catalog.count(*) FILTER (
      WHERE o.status IN ('new','received','reviewing','pending','processing','confirmed','approved','preparing','prepared','dispatched')
    )::integer,
    'fulfilled_order_count', pg_catalog.count(*) FILTER (WHERE o.status IN ('delivered','completed'))::integer,
    'cancelled_order_count', pg_catalog.count(*) FILTER (WHERE o.status IN ('cancelled','canceled','rejected'))::integer,
    'non_cancelled_order_value', CASE
      WHEN pg_catalog.count(*) FILTER (
        WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void') AND o.total_amount IS NULL
      ) > 0 THEN NULL
      ELSE COALESCE(pg_catalog.sum(o.total_amount) FILTER (
        WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void')
      ), 0)::numeric
    END,
    'average_order_value', CASE
      WHEN pg_catalog.count(*) FILTER (
        WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void') AND o.total_amount IS NULL
      ) > 0 THEN NULL
      ELSE pg_catalog.avg(o.total_amount) FILTER (
        WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void')
      )::numeric
    END,
    'invalid_order_amount_count', pg_catalog.count(*) FILTER (
      WHERE COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void') AND o.total_amount IS NULL
    )::integer,
    'last_order_at', pg_catalog.max(o.created_at),
    'days_since_last_order', CASE
      WHEN pg_catalog.max(o.created_at) IS NULL THEN NULL
      ELSE GREATEST(pg_catalog.floor(EXTRACT(epoch FROM (v_now - pg_catalog.max(o.created_at))) / 86400)::integer, 0)
    END,
    'average_days_between_orders', (
      SELECT pg_catalog.round(pg_catalog.avg(EXTRACT(epoch FROM (ordered.created_at - ordered.previous_at)) / 86400)::numeric, 1)
        FROM (
          SELECT o2.created_at,
                 pg_catalog.lag(o2.created_at) OVER (ORDER BY o2.created_at, o2.id) AS previous_at
            FROM public.orders o2
           WHERE o2.organization_id = v_org
             AND o2.customer_id = p_customer_id
             AND COALESCE(o2.status,'') NOT IN ('cancelled','canceled','rejected','void')
        ) ordered
       WHERE ordered.previous_at IS NOT NULL
    ),
    'status_distribution', (
      SELECT COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('status', status_rows.status, 'count', status_rows.status_count)
        ORDER BY status_rows.status_count DESC, status_rows.status
      ), '[]'::jsonb)
      FROM (
        SELECT o3.status, pg_catalog.count(*)::integer AS status_count
          FROM public.orders o3
         WHERE o3.organization_id = v_org AND o3.customer_id = p_customer_id
         GROUP BY o3.status
      ) status_rows
    )
  )
    INTO v_order_summary
    FROM public.orders o
   WHERE o.organization_id = v_org
     AND o.customer_id = p_customer_id;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', recent.id,
    'order_number', recent.order_number,
    'status', recent.status,
    'total_amount', recent.total_amount,
    'total_items', recent.total_items,
    'created_at', recent.created_at
  ) ORDER BY recent.created_at DESC, recent.id), '[]'::jsonb)
    INTO v_recent_orders
    FROM (
      SELECT o.id, o.order_number, o.status, o.total_amount, o.total_items, o.created_at
        FROM public.orders o
       WHERE o.organization_id = v_org AND o.customer_id = p_customer_id
       ORDER BY o.created_at DESC, o.id
       LIMIT 20
    ) recent;

  -- The 100 newest order lines are details only; aggregate amounts below always use the full ledger.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'order_id', recent_lines.order_id,
    'order_number', recent_lines.order_number,
    'item_code', recent_lines.item_code,
    'product_name', recent_lines.product_name,
    'quantity', recent_lines.quantity,
    'line_total', recent_lines.line_total,
    'created_at', recent_lines.created_at
  ) ORDER BY recent_lines.created_at DESC, recent_lines.order_id, recent_lines.item_code), '[]'::jsonb)
    INTO v_recent_order_items
    FROM (
      SELECT o.id AS order_id, o.order_number, o.created_at,
             COALESCE(NULLIF(pg_catalog.btrim(oi.item_code),''),'') AS item_code,
             COALESCE(NULLIF(pg_catalog.btrim(oi.product_name_snapshot),''),NULLIF(pg_catalog.btrim(oi.item_code),''),'صنف غير محدد') AS product_name,
             oi.quantity, oi.line_total
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE o.organization_id = v_org
         AND o.customer_id = p_customer_id
       ORDER BY o.created_at DESC, o.id, oi.id
       LIMIT 100
    ) recent_lines;

  -- Full-ledger, currency-separated invoice/payments summary. Recent detail arrays are capped separately.
  WITH payments_by_invoice AS (
    SELECT cp.invoice_id, COALESCE(pg_catalog.sum(cp.amount),0)::numeric AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id = v_org AND cp.customer_id = p_customer_id
     GROUP BY cp.invoice_id
  ),
  balances AS (
    SELECT ci.currency, ci.status, ci.due_at, ci.total_amount,
           COALESCE(pbi.paid_amount,0)::numeric AS paid_amount,
           CASE WHEN ci.status = 'void' THEN 0::numeric
                WHEN ci.total_amount IS NULL THEN NULL
                ELSE GREATEST(ci.total_amount - COALESCE(pbi.paid_amount,0),0)::numeric
           END AS outstanding_amount
      FROM public.customer_invoices ci
      LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id = ci.id
     WHERE ci.organization_id = v_org AND ci.customer_id = p_customer_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'currency', summary.currency,
    'invoice_count', summary.invoice_count,
    'invoiced_total', summary.invoiced_total,
    'paid_total', summary.paid_total,
    'outstanding_total', summary.outstanding_total,
    'overdue_invoice_count', summary.overdue_invoice_count,
    'overdue_outstanding', summary.overdue_outstanding,
    'unknown_due_date_invoice_count', summary.unknown_due_date_invoice_count,
    'unknown_due_date_outstanding', summary.unknown_due_date_outstanding,
    'invalid_total_amount_count', summary.invalid_total_amount_count
  ) ORDER BY summary.currency), '[]'::jsonb)
    INTO v_finance_by_currency
    FROM (
      SELECT b.currency,
             pg_catalog.count(*) FILTER (WHERE b.status <> 'void')::integer AS invoice_count,
             CASE WHEN pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.total_amount IS NULL) > 0 THEN NULL
                  ELSE COALESCE(pg_catalog.sum(b.total_amount) FILTER (WHERE b.status <> 'void'),0)::numeric END AS invoiced_total,
             COALESCE(pg_catalog.sum(b.paid_amount) FILTER (WHERE b.status <> 'void'),0)::numeric AS paid_total,
             CASE WHEN pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.outstanding_amount IS NULL) > 0 THEN NULL
                  ELSE COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.status <> 'void'),0)::numeric END AS outstanding_total,
             pg_catalog.count(*) FILTER (
               WHERE b.status NOT IN ('paid','void') AND b.outstanding_amount > 0 AND b.due_at IS NOT NULL
                 AND (b.due_at AT TIME ZONE 'UTC')::date < (v_now AT TIME ZONE 'UTC')::date
             )::integer AS overdue_invoice_count,
             CASE WHEN pg_catalog.count(*) FILTER (
               WHERE b.status NOT IN ('paid','void') AND b.outstanding_amount IS NULL AND b.due_at IS NOT NULL
                 AND (b.due_at AT TIME ZONE 'UTC')::date < (v_now AT TIME ZONE 'UTC')::date
             ) > 0 THEN NULL ELSE COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (
               WHERE b.status NOT IN ('paid','void') AND b.outstanding_amount > 0 AND b.due_at IS NOT NULL
                 AND (b.due_at AT TIME ZONE 'UTC')::date < (v_now AT TIME ZONE 'UTC')::date
             ),0)::numeric END AS overdue_outstanding,
             pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.outstanding_amount > 0 AND b.due_at IS NULL)::integer AS unknown_due_date_invoice_count,
             CASE WHEN pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.outstanding_amount IS NULL AND b.due_at IS NULL) > 0 THEN NULL
                  ELSE COALESCE(pg_catalog.sum(b.outstanding_amount) FILTER (WHERE b.status <> 'void' AND b.due_at IS NULL),0)::numeric END AS unknown_due_date_outstanding,
             pg_catalog.count(*) FILTER (WHERE b.status <> 'void' AND b.total_amount IS NULL)::integer AS invalid_total_amount_count
        FROM balances b
       GROUP BY b.currency
    ) summary;

  WITH payments_by_invoice AS (
    SELECT cp.invoice_id, COALESCE(pg_catalog.sum(cp.amount),0)::numeric AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id = v_org AND cp.customer_id = p_customer_id
     GROUP BY cp.invoice_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', inv.id,
    'invoice_number', inv.invoice_number,
    'status', inv.status,
    'issued_at', inv.issued_at,
    'due_at', inv.due_at,
    'currency', inv.currency,
    'total_amount', inv.total_amount,
    'paid_amount', inv.paid_amount,
    'outstanding_amount', inv.outstanding_amount
  ) ORDER BY inv.issued_at DESC, inv.id), '[]'::jsonb)
    INTO v_recent_invoices
    FROM (
      SELECT ci.id, ci.invoice_number, ci.status, ci.issued_at, ci.due_at, ci.currency, ci.total_amount,
             COALESCE(pbi.paid_amount,0)::numeric AS paid_amount,
             CASE WHEN ci.status = 'void' THEN 0::numeric
                  WHEN ci.total_amount IS NULL THEN NULL
                  ELSE GREATEST(ci.total_amount - COALESCE(pbi.paid_amount,0),0)::numeric
             END AS outstanding_amount
        FROM public.customer_invoices ci
        LEFT JOIN payments_by_invoice pbi ON pbi.invoice_id = ci.id
       WHERE ci.organization_id = v_org AND ci.customer_id = p_customer_id
       ORDER BY ci.issued_at DESC, ci.id
       LIMIT 20
    ) inv;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', recent.id, 'invoice_id', recent.invoice_id, 'amount', recent.amount,
    'paid_at', recent.paid_at, 'payment_method', recent.payment_method
  ) ORDER BY recent.paid_at DESC, recent.id), '[]'::jsonb)
    INTO v_recent_payments
    FROM (
      SELECT cp.id, cp.invoice_id, cp.amount, cp.paid_at, cp.payment_method
        FROM public.customer_payments cp
       WHERE cp.organization_id = v_org AND cp.customer_id = p_customer_id
       ORDER BY cp.paid_at DESC, cp.id
       LIMIT 20
    ) recent;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'item_code', top_products.item_code,
    'product_name', top_products.product_name,
    'quantity', top_products.quantity,
    'sales', top_products.sales,
    'last_purchased_at', top_products.last_purchased_at
  ) ORDER BY top_products.sales DESC, top_products.quantity DESC, top_products.product_name), '[]'::jsonb)
    INTO v_top_products
    FROM (
      SELECT COALESCE(NULLIF(pg_catalog.btrim(oi.item_code),''),'') AS item_code,
             COALESCE(NULLIF(pg_catalog.btrim(oi.product_name_snapshot),''),NULLIF(pg_catalog.btrim(oi.item_code),''),'صنف غير محدد') AS product_name,
             COALESCE(pg_catalog.sum(oi.quantity),0)::numeric AS quantity,
             CASE WHEN pg_catalog.count(*) FILTER (WHERE oi.line_total IS NULL) > 0 THEN NULL
                  ELSE COALESCE(pg_catalog.sum(oi.line_total),0)::numeric END AS sales,
             pg_catalog.max(o.created_at) AS last_purchased_at
        FROM public.order_items oi
        JOIN public.orders o ON o.id = oi.order_id
       WHERE o.organization_id = v_org
         AND o.customer_id = p_customer_id
         AND COALESCE(o.status,'') NOT IN ('cancelled','canceled','rejected','void')
       GROUP BY COALESCE(NULLIF(pg_catalog.btrim(oi.item_code),''),''),
                COALESCE(NULLIF(pg_catalog.btrim(oi.product_name_snapshot),''),NULLIF(pg_catalog.btrim(oi.item_code),''),'صنف غير محدد')
       ORDER BY COALESCE(pg_catalog.sum(oi.line_total),0) DESC, COALESCE(pg_catalog.sum(oi.quantity),0) DESC
       LIMIT 5
    ) top_products;

  -- These are deterministic prompts driven by ledger facts, not AI-generated claims.
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'type', 'overdue_follow_up',
    'priority', 'high',
    'title', 'متابعة تحصيل فواتير متأخرة',
    'description', 'توجد فواتير متأخرة بحسب تاريخ الاستحقاق والسجل المالي الكامل.',
    'action', 'مراجعة كشف حساب العميل',
    'currency', s.currency,
    'overdue_invoice_count', s.overdue_invoice_count,
    'overdue_outstanding', s.overdue_outstanding
  ) ORDER BY s.overdue_outstanding DESC NULLS LAST), '[]'::jsonb)
    INTO v_recommendations
    FROM pg_catalog.jsonb_to_recordset(v_finance_by_currency) AS s(
      currency text, overdue_invoice_count integer, overdue_outstanding numeric
    )
   WHERE s.overdue_invoice_count > 0
     AND s.overdue_outstanding IS NOT NULL
     AND s.overdue_outstanding > 0;

  IF COALESCE((v_order_summary->>'pending_order_count')::integer, 0) > 0 THEN
    v_recommendations := v_recommendations || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'type', 'pending_orders',
      'priority', 'medium',
      'title', 'مراجعة طلبات العميل المعلقة',
      'description', 'توجد طلبات ضمن حالات المعالجة المسجلة في النظام.',
      'action', 'فتح سجل الطلبات',
      'pending_order_count', (v_order_summary->>'pending_order_count')::integer
    ));
  END IF;

  IF COALESCE((v_order_summary->>'order_count')::integer, 0) > 0
     AND COALESCE((v_order_summary->>'days_since_last_order')::integer, 0) >= 30 THEN
    v_recommendations := v_recommendations || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'type', 'customer_follow_up',
      'priority', 'low',
      'title', 'مراجعة نشاط العميل',
      'description', 'مضت 30 يومًا على الأقل منذ آخر طلب مسجل للعميل.',
      'action', 'التواصل مع العميل ومراجعة احتياجه',
      'days_since_last_order', (v_order_summary->>'days_since_last_order')::integer,
      'last_order_at', v_order_summary->'last_order_at'
    ));
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'generated_at', v_now,
    'customer', v_customer,
    'order_summary', v_order_summary,
    'finance_by_currency', v_finance_by_currency,
    'recent_orders', v_recent_orders,
    'recent_order_items', v_recent_order_items,
    'recent_invoices', v_recent_invoices,
    'recent_payments', v_recent_payments,
    'top_products', v_top_products,
    'recommendations', v_recommendations
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_staff_customer_360(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_staff_customer_360(uuid) TO authenticated;
COMMENT ON FUNCTION public.get_staff_customer_360(uuid) IS
  'Staff-only, tenant-scoped customer 360 with full-ledger order/finance aggregates, bounded detail lists, frequently purchased products and deterministic follow-up signals.';

DO $block$
BEGIN
  IF has_function_privilege('anon', 'public.get_staff_customer_360(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute staff customer 360';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_staff_customer_360(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated staff customer 360 RPC must be executable';
  END IF;
END;
$block$;
