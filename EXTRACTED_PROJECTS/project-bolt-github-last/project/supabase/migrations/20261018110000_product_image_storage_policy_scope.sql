-- Centralize product-image authorization to avoid ambiguous column binding in RLS subqueries.
-- The browser can only write an opaque image key for an existing product in its active tenant.
CREATE OR REPLACE FUNCTION public.can_manage_product_image(p_object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $image_scope$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_parts text[];
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT public.is_staff() OR p_object_name IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_profile
     AND p.auth_user_id = auth.uid()
     AND p.is_active;
  IF v_org IS NULL THEN RETURN false; END IF;

  v_parts := string_to_array(p_object_name, '/');
  IF cardinality(v_parts) <> 3
     OR v_parts[1] <> v_org::text
     OR v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR v_parts[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.products product_record
     WHERE product_record.id::text = v_parts[2]
       AND product_record.organization_id = v_org
  );
END
$image_scope$;

REVOKE ALL ON FUNCTION public.can_manage_product_image(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_product_image(text) TO authenticated;

DROP POLICY IF EXISTS product_images_tenant_insert ON storage.objects;
DROP POLICY IF EXISTS product_images_tenant_delete ON storage.objects;

CREATE POLICY product_images_tenant_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND public.can_manage_product_image(storage.objects.name)
);

CREATE POLICY product_images_tenant_delete ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.can_manage_product_image(storage.objects.name)
);

COMMENT ON FUNCTION public.can_manage_product_image(text) IS
  'SECURITY DEFINER tenant-bound storage authorization: requires active authenticated staff, exact organization/product/object UUID path and an existing product owned by the caller organization.';
