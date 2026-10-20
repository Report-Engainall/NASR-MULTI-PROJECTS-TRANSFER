-- Adapt the legacy executive analytics capability to the current Nasr1 schema.
-- The archive's fetch_staff_products and AI budget RPCs already have newer, stricter
-- implementations in prior migrations; do not replace them. Do not DROP ... CASCADE.
CREATE OR REPLACE FUNCTION public.get_store_executive_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active;

  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'لا تملك صلاحية قراءة التحليلات التنفيذية للمؤسسة الحالية.';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'generated_at', pg_catalog.now(),
    'kpis', pg_catalog.jsonb_build_object(
      'total_orders', (
        SELECT count(*)::bigint FROM public.orders o
         WHERE o.organization_id = v_org
      ),
      'eligible_sales', (
        SELECT COALESCE(sum(o.total_amount), 0)::numeric
          FROM public.orders o
         WHERE o.organization_id = v_org
           AND COALESCE(o.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
      ),
      'pending_orders', (
        SELECT count(*)::bigint FROM public.orders o
         WHERE o.organization_id = v_org
           AND o.status IN ('new', 'received', 'reviewing', 'returned', 'approved',
                            'preparing', 'prepared', 'dispatched', 'pending', 'processing')
      ),
      'orders_last_30_days', (
        SELECT count(*)::bigint FROM public.orders o
         WHERE o.organization_id = v_org
           AND o.created_at >= (CURRENT_DATE - 29)::timestamp
           AND o.created_at < (CURRENT_DATE + 1)::timestamp
           AND COALESCE(o.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
      ),
      'sales_last_30_days', (
        SELECT COALESCE(sum(o.total_amount), 0)::numeric FROM public.orders o
         WHERE o.organization_id = v_org
           AND o.created_at >= (CURRENT_DATE - 29)::timestamp
           AND o.created_at < (CURRENT_DATE + 1)::timestamp
           AND COALESCE(o.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
      ),
      'customers_last_30_days', (
        SELECT count(DISTINCT o.customer_id)::bigint FROM public.orders o
         WHERE o.organization_id = v_org
           AND o.created_at >= (CURRENT_DATE - 29)::timestamp
           AND o.created_at < (CURRENT_DATE + 1)::timestamp
           AND COALESCE(o.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
      ),
      'active_products', (
        SELECT count(*)::bigint FROM public.products p
         WHERE p.organization_id = v_org AND p.status = 'active'
      )
    ),
    'sales_trend', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'day', days.day::date::text,
          'orders', COALESCE(rollup.order_count, 0),
          'sales', COALESCE(rollup.sales, 0)::numeric
        ) ORDER BY days.day
      )
      FROM pg_catalog.generate_series(
        (CURRENT_DATE - 29)::timestamp,
        CURRENT_DATE::timestamp,
        interval '1 day'
      ) AS days(day)
      LEFT JOIN (
        SELECT o.created_at::date AS day,
               count(*)::bigint AS order_count,
               COALESCE(sum(o.total_amount), 0)::numeric AS sales
          FROM public.orders o
         WHERE o.organization_id = v_org
           AND o.created_at >= (CURRENT_DATE - 29)::timestamp
           AND o.created_at < (CURRENT_DATE + 1)::timestamp
           AND COALESCE(o.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
         GROUP BY o.created_at::date
      ) AS rollup ON rollup.day = days.day::date
    ), '[]'::jsonb),
    'top_products', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'item_code', ranked.item_code,
          'product_name', ranked.product_name,
          'quantity', ranked.quantity,
          'sales', ranked.sales
        ) ORDER BY ranked.sales DESC, ranked.quantity DESC, ranked.product_name
      )
      FROM (
        SELECT COALESCE(NULLIF(pg_catalog.btrim(i.item_code), ''), '') AS item_code,
               COALESCE(NULLIF(pg_catalog.btrim(i.product_name_snapshot), ''),
                        NULLIF(pg_catalog.btrim(i.item_code), ''), 'صنف غير محدد') AS product_name,
               COALESCE(sum(i.quantity), 0)::numeric AS quantity,
               COALESCE(sum(i.line_total), 0)::numeric AS sales
          FROM public.order_items i
          JOIN public.orders o ON o.id = i.order_id
         WHERE o.organization_id = v_org
           AND COALESCE(o.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
         GROUP BY COALESCE(NULLIF(pg_catalog.btrim(i.item_code), ''), ''),
                  COALESCE(NULLIF(pg_catalog.btrim(i.product_name_snapshot), ''),
                           NULLIF(pg_catalog.btrim(i.item_code), ''), 'صنف غير محدد')
         ORDER BY COALESCE(sum(i.line_total), 0) DESC,
                  COALESCE(sum(i.quantity), 0) DESC,
                  COALESCE(NULLIF(pg_catalog.btrim(i.product_name_snapshot), ''),
                           NULLIF(pg_catalog.btrim(i.item_code), ''), 'صنف غير محدد')
         LIMIT 5
      ) AS ranked
    ), '[]'::jsonb),
    'top_customers', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'customer_id', ranked.customer_id,
          'customer_name', ranked.customer_name,
          'order_count', ranked.order_count,
          'sales', ranked.sales
        ) ORDER BY ranked.sales DESC, ranked.order_count DESC, ranked.customer_name
      )
      FROM (
        SELECT c.id AS customer_id,
               COALESCE(NULLIF(pg_catalog.btrim(c.company_name), ''),
                        NULLIF(pg_catalog.btrim(c.full_name), ''), 'عميل غير محدد') AS customer_name,
               count(*)::bigint AS order_count,
               COALESCE(sum(o.total_amount), 0)::numeric AS sales
          FROM public.orders o
          JOIN public.customers c
            ON c.id = o.customer_id AND c.organization_id = o.organization_id
         WHERE o.organization_id = v_org
           AND COALESCE(o.status, '') NOT IN ('cancelled', 'canceled', 'rejected')
         GROUP BY c.id, c.company_name, c.full_name
         ORDER BY COALESCE(sum(o.total_amount), 0) DESC, count(*) DESC,
                  COALESCE(NULLIF(pg_catalog.btrim(c.company_name), ''),
                           NULLIF(pg_catalog.btrim(c.full_name), ''), 'عميل غير محدد')
         LIMIT 5
      ) AS ranked
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_store_executive_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_store_executive_analytics() TO authenticated;
COMMENT ON FUNCTION public.get_store_executive_analytics() IS
  'Tenant-scoped aggregate analytics for current store orders; excludes cancelled/rejected orders from sales and ranks products/customers from order snapshots.';

DO $block$
BEGIN
  IF has_function_privilege('anon', 'public.get_store_executive_analytics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute store executive analytics';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_store_executive_analytics()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute store executive analytics';
  END IF;
END;
$block$;
