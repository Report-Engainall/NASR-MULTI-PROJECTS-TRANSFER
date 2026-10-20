-- Enforce customer order-price privacy at the PostgreSQL column privilege boundary.
-- Row-level policies limit rows, but do not hide individual columns from SELECT *.
-- Staff reads of full order/line rows must go through the tenant-bound RPCs below.

REVOKE SELECT ON TABLE public.orders, public.order_items FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  organization_id,
  customer_id,
  order_number,
  status,
  total_items,
  notes,
  created_at,
  quantity_review_required,
  customer_adjustment_note,
  customer_payment_requested_at,
  customer_confirmed_at,
  payment_request_status
) ON TABLE public.orders TO authenticated;

GRANT SELECT (
  id,
  order_id,
  product_id,
  item_code,
  product_name_snapshot,
  unit_snapshot,
  quantity,
  requested_quantity,
  approved_quantity,
  created_at
) ON TABLE public.order_items TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_staff_orders()
RETURNS SETOF public.orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff role required for order access';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization is required';
  END IF;

  RETURN QUERY
    SELECT o.*
      FROM public.orders o
     WHERE o.organization_id=v_org
     ORDER BY o.created_at DESC, o.id;
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_staff_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_orders() TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_staff_order_items(p_order_id uuid)
RETURNS SETOF public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff role required for order-line access';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.orders o
     WHERE o.id=p_order_id
       AND o.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='order is outside the active staff organization';
  END IF;

  RETURN QUERY
    SELECT oi.*
      FROM public.order_items oi
      JOIN public.orders o ON o.id=oi.order_id
     WHERE o.id=p_order_id
       AND o.organization_id=v_org
     ORDER BY oi.created_at, oi.id;
END;
$$;
REVOKE ALL ON FUNCTION public.fetch_staff_order_items(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_order_items(uuid) TO authenticated;

COMMENT ON FUNCTION public.fetch_staff_orders() IS
  'Staff-only, active-profile, tenant-bound read path for full order rows. Customers may select only granted non-financial order columns.';
COMMENT ON FUNCTION public.fetch_staff_order_items(uuid) IS
  'Staff-only, active-profile, tenant-bound read path for full order-line rows. Customers may select only granted non-financial order columns.';

DO $$
BEGIN
  IF has_column_privilege('authenticated','public.orders','total_amount','SELECT')
     OR has_column_privilege('authenticated','public.order_items','unit_price_snapshot','SELECT')
     OR has_column_privilege('authenticated','public.order_items','line_total','SELECT')
     OR has_column_privilege('authenticated','public.order_items','approved_unit_price','SELECT') THEN
    RAISE EXCEPTION 'Customer order-price column privacy grants are too broad';
  END IF;

  IF NOT has_column_privilege('authenticated','public.orders','status','SELECT')
     OR NOT has_column_privilege('authenticated','public.order_items','quantity','SELECT') THEN
    RAISE EXCEPTION 'Required non-financial customer order columns are missing SELECT grants';
  END IF;
END;
$$;
