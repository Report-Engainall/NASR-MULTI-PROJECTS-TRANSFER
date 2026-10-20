-- NASR1-ORIGINAL-SPEC-PRICE-GRID-INVENTORY-001
-- Expose a minimal, tenant-scoped inventory summary in the active admin price grid.
-- No inventory writes are added to the pricing command; missing balance rows remain NULL,
-- distinct from a real zero stock balance.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_product_price_grid_with_inventory()
RETURNS TABLE (
  id uuid,
  name text,
  item_code text,
  unit text,
  is_active boolean,
  base_price numeric,
  price_wholesale_of_wholesale numeric,
  price_wholesale numeric,
  price_retail numeric,
  quantity_on_hand_total numeric(15,3),
  quantity_reserved_total numeric(15,3),
  quantity_available_total numeric(15,3),
  reorder_point_total numeric(15,3),
  inventory_warehouse_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_profile_id uuid := public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id = p.id
     WHERE p.id = v_profile_id
       AND p.organization_id = v_organization_id
       AND p.auth_user_id = auth.uid()
       AND p.is_active = true
       AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='Price grid inventory summary requires an active admin or manager in this organization';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.item_code,
    p.unit,
    (p.status = 'active'),
    p.base_price,
    coalesce((
      SELECT pp.price FROM public.product_prices pp
       WHERE pp.product_id = p.id AND pp.tier = 'vip' AND pp.is_active
       ORDER BY pp.min_quantity ASC LIMIT 1
    ), p.base_price),
    coalesce((
      SELECT pp.price FROM public.product_prices pp
       WHERE pp.product_id = p.id AND pp.tier = 'wholesale' AND pp.is_active
       ORDER BY pp.min_quantity ASC LIMIT 1
    ), p.wholesale_price),
    coalesce((
      SELECT pp.price FROM public.product_prices pp
       WHERE pp.product_id = p.id AND pp.tier = 'retail' AND pp.is_active
       ORDER BY pp.min_quantity ASC LIMIT 1
    ), p.retail_price),
    inv.quantity_on_hand_total,
    inv.quantity_reserved_total,
    inv.quantity_available_total,
    inv.reorder_point_total,
    inv.inventory_warehouse_count
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT
      count(*)::integer AS balance_rows,
      count(DISTINCT w.id)::integer AS inventory_warehouse_count,
      sum(ib.quantity_on_hand)::numeric(15,3) AS quantity_on_hand_total,
      sum(ib.quantity_reserved)::numeric(15,3) AS quantity_reserved_total,
      sum(ib.quantity_available)::numeric(15,3) AS quantity_available_total,
      sum(coalesce(ib.reorder_point,0))::numeric(15,3) AS reorder_point_total
    FROM public.inventory_balances ib
    JOIN public.warehouses w
      ON w.id = ib.warehouse_id
     AND w.organization_id = v_organization_id
     AND w.is_active = true
    WHERE ib.product_id = p.id
  ) inv ON true
  WHERE p.organization_id = v_organization_id
  ORDER BY p.name, p.item_code, p.id;

  -- This function is an aggregate read model only. No browser path can write stock
  -- through the price grid or read cross-tenant warehouse rows via this result.
END;
$function$;

REVOKE ALL ON FUNCTION public.get_admin_product_price_grid_with_inventory() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_product_price_grid_with_inventory() TO authenticated;

COMMENT ON FUNCTION public.get_admin_product_price_grid_with_inventory() IS
  'Active admin/manager only: returns saved price-grid values plus an aggregate over active warehouses in the current organization. NULL stock summaries mean no stock-balance rows exist; pricing import/save remains price-only.';

COMMIT;
