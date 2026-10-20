-- Resolve displayed catalog unit prices under the authenticated customer's approved tier.
-- No tier, customer id, organization id, or raw product price is accepted from the browser.
CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(
  p_product_ids uuid[],
  p_quantity numeric DEFAULT 1
)
RETURNS TABLE(product_id uuid, unit_price numeric(15,2))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_customer_id uuid;
  v_tier text := 'retail';
  v_customer_status text;
  v_is_staff boolean := false;
BEGIN
  IF p_product_ids IS NULL OR pg_catalog.cardinality(p_product_ids) = 0 THEN
    RETURN;
  END IF;

  IF pg_catalog.cardinality(p_product_ids) > 500
     OR pg_catalog.array_position(p_product_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product batch must contain at most 500 non-null ids';
  END IF;

  IF p_quantity IS NULL
     OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity <> pg_catalog.trunc(p_quantity)
     OR p_quantity < 1
     OR p_quantity > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='price quantity must be an integer between 1 and 10000';
  END IF;

  IF auth.uid() IS NULL THEN
    v_organization_id := public.public_storefront_organization_id();
  ELSE
    SELECT p.id, p.organization_id,
           EXISTS (
             SELECT 1
               FROM public.user_roles r
              WHERE r.profile_id = p.id
                AND r.role IN ('admin','manager','staff','accountant')
           )
      INTO v_profile_id, v_organization_id, v_is_staff
      FROM public.profiles p
     WHERE p.auth_user_id = auth.uid()
       AND p.is_active = true
     ORDER BY p.created_at, p.id
     LIMIT 1;

    IF v_profile_id IS NULL OR v_organization_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active profile and organization required to resolve catalog prices';
    END IF;

    IF NOT v_is_staff THEN
      v_customer_id := public.current_customer_id();
      IF v_customer_id IS NOT NULL THEN
        SELECT c.status, c.tier
          INTO v_customer_status, v_tier
          FROM public.customers c
         WHERE c.id = v_customer_id
           AND c.organization_id = v_organization_id;
        IF NOT FOUND OR v_customer_status IS DISTINCT FROM 'approved' THEN
          v_tier := 'retail';
        ELSE
          v_tier := coalesce(nullif(v_tier,''),'retail');
        END IF;
      ELSE
        v_tier := 'retail';
      END IF;
    END IF;
  END IF;

  IF v_organization_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.organizations o
        WHERE o.id = v_organization_id
          AND o.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active storefront organization is required';
  END IF;

  RETURN QUERY
    SELECT p.id,
           CASE WHEN v_is_staff THEN pg_catalog.round(p.base_price,2)
                ELSE public.customer_product_unit_price(p.id, v_organization_id, v_tier, p_quantity)
           END::numeric(15,2)
      FROM public.products p
     WHERE p.id = ANY(p_product_ids)
       AND p.organization_id = v_organization_id
       AND p.status = 'active'
     ORDER BY p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) TO anon, authenticated;

COMMENT ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) IS
  'Returns only product_id and the caller-specific unit price. Organization and approved customer tier are derived server-side; raw tier-price rows remain inaccessible to browser roles.';
