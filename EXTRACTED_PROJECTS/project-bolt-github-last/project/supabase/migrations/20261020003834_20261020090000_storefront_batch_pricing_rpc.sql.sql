/*
# Create get_storefront_product_prices batch RPC

## Purpose
The frontend's `fetchResolvedProductPrices` function calls this RPC to resolve
customer-specific prices for a batch of product IDs in a single round-trip.
It wraps the existing `customer_product_unit_price` single-product function.

## How it works
1. Derives the caller's organization_id, profile_id, and is_staff flag from
   `get_current_tenant_context()` (SECURITY DEFINER, auth-required).
2. For staff users, returns `base_price` for each product (staff see cost/base).
3. For customer users, looks up the customer's `tier` from the `customers` table
   by `profile_id`, then calls `customer_product_unit_price` for each product.
4. Returns an array of `{ product_id, unit_price }` rows.

## Security
- SECURITY DEFINER, auth-required via `get_current_tenant_context()`.
- The client never supplies tier, organization_id, or customer_id.
- Fail-closed: if any product has no valid price, the entire call raises an error.
*/

CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(
  p_product_ids uuid[],
  p_quantity numeric DEFAULT 1
)
RETURNS TABLE (product_id uuid, unit_price numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_ctx jsonb;
  v_org_id uuid;
  v_profile_id uuid;
  v_is_staff boolean;
  v_tier text;
  v_qty numeric;
  v_pid uuid;
  v_price numeric;
BEGIN
  IF p_product_ids IS NULL OR array_length(p_product_ids, 1) IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::numeric WHERE FALSE;
    RETURN;
  END IF;

  v_qty := COALESCE(p_quantity, 1);
  IF v_qty <= 0 OR v_qty > 10000 OR v_qty::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid pricing quantity';
  END IF;

  v_ctx := public.get_current_tenant_context();
  v_org_id := (v_ctx->>'organization_id')::uuid;
  v_profile_id := (v_ctx->>'profile_id')::uuid;
  v_is_staff := (v_ctx->>'is_staff')::boolean;

  IF v_is_staff THEN
    FOR v_pid IN SELECT unnest(p_product_ids) LOOP
      SELECT p.base_price INTO v_price
      FROM public.products p
      WHERE p.id = v_pid AND p.organization_id = v_org_id AND p.status = 'active';
      IF v_price IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product unavailable: ' || v_pid::text;
      END IF;
      RETURN QUERY SELECT v_pid, round(v_price, 2);
    END LOOP;
    RETURN;
  END IF;

  -- Customer session: resolve tier from the customers table
  SELECT c.tier INTO v_tier
  FROM public.customers c
  WHERE c.profile_id = v_profile_id AND c.status = 'approved'
  LIMIT 1;

  IF v_tier IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'No approved customer profile for this account';
  END IF;

  FOR v_pid IN SELECT unnest(p_product_ids) LOOP
    v_price := public.customer_product_unit_price(v_pid, v_org_id, v_tier, v_qty);
    IF v_price IS NULL OR v_price < 0 OR v_price::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid price for product: ' || v_pid::text;
    END IF;
    RETURN QUERY SELECT v_pid, round(v_price, 2);
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_storefront_product_prices(uuid[], numeric) TO authenticated;
