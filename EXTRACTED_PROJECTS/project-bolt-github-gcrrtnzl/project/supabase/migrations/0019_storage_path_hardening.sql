-- Storage policy expressions must validate UUID path segments before casting.
-- Uploads also require the referenced product to belong to the same tenant,
-- preventing orphan or cross-tenant object registration at the storage boundary.

 drop policy if exists product_media_select on storage.objects;
 drop policy if exists product_media_insert on storage.objects;
 drop policy if exists product_media_update on storage.objects;
 drop policy if exists product_media_delete on storage.objects;

create policy product_media_select on storage.objects for select to authenticated
using (
  bucket_id = 'product-media'
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name,'/',1)::uuid = public.current_organization_id()
);

create policy product_media_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-media'
  and public.is_staff()
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name,'/',1)::uuid = public.current_organization_id()
  and split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.products p
    where p.id = split_part(name,'/',2)::uuid
      and p.organization_id = public.current_organization_id()
  )
);

create policy product_media_update on storage.objects for update to authenticated
using (
  bucket_id = 'product-media'
  and public.is_staff()
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name,'/',1)::uuid = public.current_organization_id()
)
with check (
  bucket_id = 'product-media'
  and public.is_staff()
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name,'/',1)::uuid = public.current_organization_id()
  and split_part(name,'/',2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and exists (
    select 1 from public.products p
    where p.id = split_part(name,'/',2)::uuid
      and p.organization_id = public.current_organization_id()
  )
);

create policy product_media_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'product-media'
  and public.is_staff()
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and split_part(name,'/',1)::uuid = public.current_organization_id()
);
