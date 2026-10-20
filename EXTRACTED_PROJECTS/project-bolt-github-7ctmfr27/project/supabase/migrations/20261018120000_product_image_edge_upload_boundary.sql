-- Storage writes for catalog images are owned by the authenticated product-image-upload Edge Function.
-- The Edge Function verifies the user's token, active profile, role, tenant and product before
-- using the service-role key. Do not grant browser clients direct storage.objects writes.
DROP POLICY IF EXISTS product_images_tenant_insert ON storage.objects;
DROP POLICY IF EXISTS product_images_tenant_delete ON storage.objects;
REVOKE INSERT, UPDATE, DELETE ON TABLE storage.objects FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.can_manage_product_image(text);
