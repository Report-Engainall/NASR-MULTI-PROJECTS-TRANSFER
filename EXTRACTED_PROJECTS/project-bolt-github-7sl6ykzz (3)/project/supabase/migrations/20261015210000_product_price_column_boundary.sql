-- Raw product price/cost fields are not browser table projections.
-- Browser clients receive a safe catalog allowlist; staff detail reads use a tenant-bound RPC.
REVOKE SELECT ON TABLE public.products FROM PUBLIC, anon, authenticated;
REVOKE SELECT (base_price, cost_price, min_stock, max_stock, retail_price, wholesale_price)
  ON TABLE public.products FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id, organization_id, category_id, name, item_code, barcode,
  description, unit, status, image_url, created_at
) ON TABLE public.products TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.fetch_staff_products(p_product_id uuid DEFAULT NULL)
RETURNS SETOF public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff role required for product details';
  END IF;

  SELECT p.organization_id
    INTO v_organization_id
    FROM public.profiles p
   WHERE p.id=public.current_profile_id()
     AND p.auth_user_id=auth.uid()
     AND p.is_active=true
     AND EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=p.id AND r.role IN ('admin','manager','staff')
     )
   ORDER BY p.created_at, p.id
   LIMIT 1;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff role and organization required for product details';
  END IF;

  RETURN QUERY
    SELECT p.*
      FROM public.products p
     WHERE p.organization_id=v_organization_id
       AND (p_product_id IS NULL OR p.id=p_product_id)
     ORDER BY p.name, p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_staff_products(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_products(uuid) TO authenticated;

-- Fail closed if any direct table or column grant exposes financial product fields.
DO $block$
DECLARE
  v_role text;
  v_column text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon','authenticated']
  LOOP
    IF has_table_privilege(v_role, 'public.products', 'SELECT') THEN
      RAISE EXCEPTION '% must not have table-level SELECT on public.products', v_role;
    END IF;
    FOR v_column IN
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='products'
         AND column_name IN ('base_price','cost_price','min_stock','max_stock','retail_price','wholesale_price')
    LOOP
      IF has_column_privilege(v_role, 'public.products', v_column, 'SELECT') THEN
        RAISE EXCEPTION '% must not directly SELECT public.products.%', v_role, v_column;
      END IF;
    END LOOP;
  END LOOP;
END;
$block$;

COMMENT ON FUNCTION public.fetch_staff_products(uuid) IS
  'Returns sensitive product detail fields only to active admin/manager/staff identities, scoped server-side to the caller organization. Anonymous and customer roles cannot SELECT raw product price columns.';
