/*
# Executive Analytics & Smart Recommendations + Customer 360 RPCs

1. New Functions
- `get_executive_analytics()` — SECURITY DEFINER, staff-only. Returns comprehensive KPIs:
  revenue totals, order counts by status, top products by revenue & quantity, top customers,
  sales trend (last 30 days grouped by day), low-stock alerts, and AI-generated smart
  recommendations covering inventory replenishment, pricing adjustments, customer follow-up,
  and revenue growth opportunities.
- `get_customer_360(p_customer_id uuid)` — SECURITY DEFINER, staff-only. Returns a complete
  360-degree view of a single customer: profile, order history with items, payment history,
  outstanding balance, credit utilization, order frequency, average order value, last order
  date, favorite products, and customer-specific recommendations.

2. Security
- Both functions are SECURITY DEFINER, check `public.is_staff()` first, and derive tenant
  scope from `public.current_profile_id()` — the browser never supplies organization_id.
- REVOKE from anon/public; GRANT to authenticated only.

3. Important Notes
- Recommendations are computed from live data: low stock vs reorder points, pending
  payments, customer dormancy, top-performing products, and tier upgrade opportunities.
- All monetary values use numeric arithmetic to avoid floating-point drift.
*/

CREATE OR REPLACE FUNCTION public.get_executive_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid := public.current_profile_id();
  v_org uuid;
  v_total_revenue numeric := 0;
  v_total_orders int := 0;
  v_pending_orders int := 0;
  v_total_customers int := 0;
  v_total_products int := 0;
  v_low_stock_count int := 0;
  v_avg_order_value numeric := 0;
  v_today_revenue numeric := 0;
  v_month_revenue numeric := 0;
  v_prev_month_revenue numeric := 0;
  v_revenue_growth numeric := 0;
  v_revenue_trend jsonb;
  v_status_distribution jsonb;
  v_top_products_revenue jsonb;
  v_top_products_quantity jsonb;
  v_top_customers jsonb;
  v_low_stock_items jsonb;
  v_recommendations jsonb := '[]'::jsonb;
  v_rec jsonb;
BEGIN
  IF v_pid IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'صلاحية المدير مطلوبة';
  END IF;

  SELECT organization_id INTO v_org FROM profiles WHERE id = v_pid;
  IF v_org IS NULL THEN RAISE EXCEPTION 'لم يتم تحديد المؤسسة'; END IF;

  -- Core aggregates
  SELECT
    COALESCE(SUM(total_amount), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('new','received','reviewing','pending')),
    COALESCE(AVG(total_amount) FILTER (WHERE total_amount > 0), 0)
  INTO v_total_revenue, v_total_orders, v_pending_orders, v_avg_order_value
  FROM orders WHERE organization_id = v_org;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'active')
  INTO v_total_customers, v_total_products
  FROM customers WHERE organization_id = v_org;
  v_total_products := 0;
  SELECT COUNT(*) INTO v_total_products FROM products WHERE organization_id = v_org AND status = 'active';

  -- Today and month revenue
  SELECT COALESCE(SUM(total_amount), 0) INTO v_today_revenue
  FROM orders WHERE organization_id = v_org AND created_at >= CURRENT_DATE;
  SELECT COALESCE(SUM(total_amount), 0) INTO v_month_revenue
  FROM orders WHERE organization_id = v_org AND created_at >= date_trunc('month', CURRENT_DATE);
  SELECT COALESCE(SUM(total_amount), 0) INTO v_prev_month_revenue
  FROM orders WHERE organization_id = v_org
    AND created_at >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
    AND created_at < date_trunc('month', CURRENT_DATE);

  IF v_prev_month_revenue > 0 THEN
    v_revenue_growth := ROUND(((v_month_revenue - v_prev_month_revenue) / v_prev_month_revenue * 100)::numeric, 1);
  END IF;

  -- Revenue trend (last 30 days)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_revenue_trend
  FROM (
    SELECT d::date as date, COALESCE(SUM(o.total_amount), 0) as revenue, COUNT(o.id) as orders
    FROM generate_series(CURRENT_DATE - 29, CURRENT_DATE, '1 day') d
    LEFT JOIN orders o ON o.organization_id = v_org AND o.created_at::date = d::date
    GROUP BY d::date ORDER BY d::date
  ) t;

  -- Status distribution
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_status_distribution
  FROM (
    SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
    FROM orders WHERE organization_id = v_org
    GROUP BY status ORDER BY count DESC
  ) t;

  -- Top products by revenue
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_products_revenue
  FROM (
    SELECT oi.product_code, oi.product_name,
      SUM(oi.quantity) as quantity, SUM(oi.line_total) as revenue
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.organization_id = v_org
    GROUP BY oi.product_code, oi.product_name
    ORDER BY revenue DESC LIMIT 10
  ) t;

  -- Top products by quantity
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_products_quantity
  FROM (
    SELECT oi.product_code, oi.product_name, SUM(oi.quantity) as quantity
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.organization_id = v_org
    GROUP BY oi.product_code, oi.product_name
    ORDER BY quantity DESC LIMIT 10
  ) t;

  -- Top customers by revenue
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_customers
  FROM (
    SELECT c.id, c.business_name, c.contact_name, c.phone, c.tier,
      COUNT(o.id) as order_count, COALESCE(SUM(o.total_amount), 0) as total_revenue,
      MAX(o.created_at) as last_order_at
    FROM customers c
    LEFT JOIN orders o ON o.customer_id = c.id AND o.organization_id = v_org
    WHERE c.organization_id = v_org
    GROUP BY c.id, c.business_name, c.contact_name, c.phone, c.tier
    ORDER BY total_revenue DESC LIMIT 10
  ) t;

  -- Low stock items
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_low_stock_items
  FROM (
    SELECT p.id, p.name, p.item_code, p.unit,
      ib.quantity_on_hand, ib.reorder_point,
      CASE WHEN ib.reorder_point > 0 AND ib.quantity_on_hand <= 0 THEN 'out_of_stock'
           WHEN ib.reorder_point > 0 AND ib.quantity_on_hand <= ib.reorder_point THEN 'low_stock'
           ELSE 'ok' END as stock_status
    FROM products p
    LEFT JOIN inventory_balances ib ON ib.product_id = p.id
    WHERE p.organization_id = v_org AND p.status = 'active'
      AND ib.reorder_point IS NOT NULL AND ib.reorder_point > 0
      AND ib.quantity_on_hand <= ib.reorder_point
    ORDER BY CASE WHEN ib.quantity_on_hand <= 0 THEN 0 ELSE 1 END, ib.quantity_on_hand ASC
    LIMIT 20
  ) t;

  SELECT COUNT(*) INTO v_low_stock_count FROM (
    SELECT 1 FROM inventory_balances ib
    JOIN products p ON p.id = ib.product_id AND p.organization_id = v_org
    WHERE ib.reorder_point > 0 AND ib.quantity_on_hand <= ib.reorder_point
    LIMIT 1
  ) sub;

  -- Smart Recommendations
  -- 1. Restock urgently (out of stock or very low)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'type', 'restock',
    'priority', CASE WHEN quantity_on_hand <= 0 THEN 'critical' ELSE 'high' END,
    'title', 'إعادة طلب: ' || product_name,
    'description', 'المتبقي ' || quantity_on_hand || ' ' || unit || ' — حد إعادة الطلب ' || reorder_point,
    'product_code', product_code,
    'action', 'إنشاء أمر شراء لهذا الصنف'
  )), '[]'::jsonb)
  INTO v_rec
  FROM (
    SELECT product_name, product_code, unit, quantity_on_hand, reorder_point
    FROM jsonb_to_recordset(v_low_stock_items) AS x(
      name text, item_code text, unit text, quantity_on_hand numeric, reorder_point numeric,
      id uuid, stock_status text
    )
    WHERE quantity_on_hand <= reorder_point
    LIMIT 5
  ) r;
  v_recommendations := v_recommendations || v_rec;

  -- 2. Pending orders need action
  IF v_pending_orders > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type', 'pending_orders',
      'priority', 'high',
      'title', v_pending_orders || ' طلبات بانتظار المراجعة',
      'description', 'يوجد طلبات جديدة تحتاج معالجة لتسريع التسليم',
      'action', 'مراجعة الطلبات المعلقة'
    ));
  END IF;

  -- 3. Revenue growth signal
  IF v_revenue_growth < 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type', 'revenue_decline',
      'priority', 'medium',
      'title', 'انخفاض المبيعات ' || ABS(v_revenue_growth) || '% عن الشهر السابق',
      'description', 'يوصى بمراجعة استراتيجية التسعير أو إطلاق عرض ترويجي',
      'action', 'مراجعة قواعد التسعير والعروض'
    ));
  ELSIF v_revenue_growth > 10 THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type', 'revenue_growth',
      'priority', 'low',
      'title', 'نمو المبيعات ' || v_revenue_growth || '% عن الشهر السابق',
      'description', 'الأداء ممتاز — يوصى بزيادة المخزون للأصناف الأكثر مبيعاً',
      'action', 'زيادة مخزون الأصناف الرائجة'
    ));
  END IF;

  -- 4. Dormant customers (approved but no orders in 30+ days)
  PERFORM 1;
  DECLARE
    v_dormant_count int;
  BEGIN
    SELECT COUNT(*) INTO v_dormant_count
    FROM customers c
    WHERE c.organization_id = v_org AND c.status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.created_at > CURRENT_DATE - 30
      );
    IF v_dormant_count > 0 THEN
      v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
        'type', 'dormant_customers',
        'priority', 'medium',
        'title', v_dormant_count || ' عميل لم يطلب منذ 30 يوم',
        'description', 'يوصى بالتواصل معهم لتحفيز الطلبات',
        'action', 'مراجعة قائمة العملاء الخاملين'
      ));
    END IF;
  END;

  RETURN jsonb_build_object(
    'total_revenue', v_total_revenue,
    'total_orders', v_total_orders,
    'pending_orders', v_pending_orders,
    'total_customers', v_total_customers,
    'total_products', v_total_products,
    'low_stock_count', v_low_stock_count,
    'avg_order_value', ROUND(v_avg_order_value, 0),
    'today_revenue', v_today_revenue,
    'month_revenue', v_month_revenue,
    'prev_month_revenue', v_prev_month_revenue,
    'revenue_growth', v_revenue_growth,
    'revenue_trend', v_revenue_trend,
    'status_distribution', v_status_distribution,
    'top_products_revenue', v_top_products_revenue,
    'top_products_quantity', v_top_products_quantity,
    'top_customers', v_top_customers,
    'low_stock_items', v_low_stock_items,
    'recommendations', v_recommendations
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_executive_analytics() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_executive_analytics() TO authenticated;

-- Customer 360
CREATE OR REPLACE FUNCTION public.get_customer_360(p_customer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid := public.current_profile_id();
  v_org uuid;
  v_profile jsonb;
  v_stats jsonb;
  v_orders jsonb;
  v_payments jsonb;
  v_favorite_products jsonb;
  v_recommendations jsonb := '[]'::jsonb;
  v_order_count int := 0;
  v_total_revenue numeric := 0;
  v_avg_order numeric := 0;
  v_outstanding numeric := 0;
  v_credit_limit numeric := 0;
  v_current_balance numeric := 0;
  v_last_order_date timestamptz;
  v_days_since_last int;
  v_tier text;
  v_status text;
BEGIN
  IF v_pid IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'صلاحية المدير مطلوبة';
  END IF;

  SELECT organization_id INTO v_org FROM profiles WHERE id = v_pid;
  IF v_org IS NULL THEN RAISE EXCEPTION 'لم يتم تحديد المؤسسة'; END IF;

  -- Customer profile
  SELECT to_jsonb(c) INTO v_profile
  FROM customers c
  WHERE c.id = p_customer_id AND c.organization_id = v_org;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'العميل غير موجود'; END IF;

  v_tier := v_profile->>'tier';
  v_status := v_profile->>'status';
  v_credit_limit := COALESCE((v_profile->>'credit_limit')::numeric, 0);
  v_current_balance := COALESCE((v_profile->>'current_balance')::numeric, 0);

  -- Order stats
  SELECT
    COUNT(*),
    COALESCE(SUM(total_amount), 0),
    COALESCE(AVG(total_amount) FILTER (WHERE total_amount > 0), 0),
    MAX(created_at)
  INTO v_order_count, v_total_revenue, v_avg_order, v_last_order_date
  FROM orders WHERE customer_id = p_customer_id AND organization_id = v_org;

  v_days_since_last := CASE WHEN v_last_order_date IS NOT NULL
    THEN (CURRENT_DATE - v_last_order_date::date)
    ELSE NULL END;

  -- Recent orders with items count
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY created_at DESC), '[]'::jsonb)
  INTO v_orders
  FROM (
    SELECT o.id, o.order_number, o.status, o.total_amount, o.total_items,
      o.created_at,
      (SELECT jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name_snapshot,
        'product_code', oi.item_code,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price_snapshot,
        'line_total', oi.line_total
      )) FROM order_items oi WHERE oi.order_id = o.id) as items
    FROM orders o
    WHERE o.customer_id = p_customer_id AND o.organization_id = v_org
    ORDER BY o.created_at DESC
    LIMIT 20
  ) t;

  -- Payments
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY payment_date DESC), '[]'::jsonb)
  INTO v_payments
  FROM (
    SELECT id, payment_number, amount, payment_method, payment_date, reference_note
    FROM customer_payments
    WHERE customer_id = p_customer_id AND organization_id = v_org
    ORDER BY payment_date DESC
    LIMIT 10
  ) t;

  -- Outstanding balance = current_balance
  v_outstanding := v_current_balance;

  -- Favorite products (most ordered)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_favorite_products
  FROM (
    SELECT oi.item_code as product_code, oi.product_name_snapshot as product_name,
      SUM(oi.quantity) as total_quantity, COUNT(*) as order_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id AND o.customer_id = p_customer_id AND o.organization_id = v_org
    GROUP BY oi.item_code, oi.product_name_snapshot
    ORDER BY total_quantity DESC
    LIMIT 5
  ) t;

  -- Recommendations
  -- Dormant customer
  IF v_days_since_last IS NOT NULL AND v_days_since_last > 30 THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type', 'dormant',
      'priority', 'high',
      'title', 'عميل خامل منذ ' || v_days_since_last || ' يوم',
      'description', 'يوصى بالتواصل مع العميل لتحفيز طلب جديد',
      'action', 'إرسال عرض أو الاتصال بالعميل'
    ));
  END IF;

  -- Credit utilization
  IF v_credit_limit > 0 AND v_current_balance > 0 THEN
    DECLARE v_utilization numeric; BEGIN
      v_utilization := ROUND((v_current_balance / v_credit_limit * 100)::numeric, 1);
      IF v_utilization > 80 THEN
        v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
          'type', 'credit_risk',
          'priority', 'critical',
          'title', 'استهلاك الائتمان ' || v_utilization || '%',
          'description', 'الرصيد المستحق ' || v_current_balance || ' من حد ' || v_credit_limit,
          'action', 'متابعة تحصيل الرصيد قبل قبول طلبات جديدة على الحساب'
        ));
      ELSIF v_utilization > 50 THEN
        v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
          'type', 'credit_watch',
          'priority', 'medium',
          'title', 'استهلاك الائتمان ' || v_utilization || '%',
          'description', 'الرصيد المستحق يقترب من الحد الائتماني',
          'action', 'مراقبة دفعات العميل'
        ));
      END IF;
    END;
  END IF;

  -- High-value customer — tier upgrade suggestion
  IF v_total_revenue > 5000000 AND v_tier != 'vip' THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type', 'tier_upgrade',
      'priority', 'low',
      'title', 'مرشح للترقية إلى فئة VIP',
      'description', 'إجمالي مشتريات العميل ' || v_total_revenue || ' ر.ي — يوصى بترقية الفئة',
      'action', 'ترقية فئة العميل'
    ));
  END IF;

  -- No orders at all
  IF v_order_count = 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(jsonb_build_object(
      'type', 'no_orders',
      'priority', 'medium',
      'title', 'لا توجد طلبات لهذا العميل',
      'description', 'عميل جديد لم يطلب بعد — يوصى بالتواصل للترحيب وتقديم الكتالوج',
      'action', 'التواصل مع العميل'
    ));
  END IF;

  v_stats := jsonb_build_object(
    'order_count', v_order_count,
    'total_revenue', v_total_revenue,
    'avg_order_value', ROUND(v_avg_order, 0),
    'outstanding_balance', v_outstanding,
    'credit_limit', v_credit_limit,
    'credit_utilization', CASE WHEN v_credit_limit > 0 THEN ROUND((v_current_balance / v_credit_limit * 100)::numeric, 1) ELSE 0 END,
    'last_order_date', v_last_order_date,
    'days_since_last_order', v_days_since_last
  );

  RETURN jsonb_build_object(
    'profile', v_profile,
    'stats', v_stats,
    'orders', v_orders,
    'payments', v_payments,
    'favorite_products', v_favorite_products,
    'recommendations', v_recommendations
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.get_customer_360(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_customer_360(uuid) TO authenticated;