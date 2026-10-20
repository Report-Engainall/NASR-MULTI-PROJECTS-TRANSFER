begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

-- Isolated identities and tenant data. The test transaction rolls everything back.
insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'storage-a@test.local'),
  ('22222222-2222-4222-8222-222222222222', 'storage-b@test.local');

insert into public.organizations (id, name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Storage Tenant A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Storage Tenant B');

insert into public.customers (id, organization_id, name, tier)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Customer A', 'wholesale'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Customer B', 'wholesale');

insert into public.profiles (id, organization_id, customer_id, role)
values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'admin'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01', 'admin');

insert into public.products (id, organization_id, sku, name, unit, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A-1', 'Product A', 'كرتون', 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B-1', 'Product B', 'كرتون', 'active');

-- Seed storage metadata as the database owner; application users are tested below.
insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('product-media', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21.webp', '11111111-1111-4111-8111-111111111111', '{"mimetype":"image/webp","size":1024}'::jsonb),
  ('product-media', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb21.webp', '22222222-2222-4222-8222-222222222222', '{"mimetype":"image/webp","size":1024}'::jsonb),
  ('product-media', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa29.webp', '11111111-1111-4111-8111-111111111111', '{"mimetype":"image/webp","size":1024}'::jsonb);

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';

select results_eq(
  $$select count(*) from storage.objects where bucket_id='product-media'$$,
  $$values (1::bigint)$$,
  'Tenant A can read only its active product media'
);

select results_eq(
  $$select count(*) from storage.objects where bucket_id='product-media' and name like 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/%'$$,
  $$values (0::bigint)$$,
  'Tenant A cannot read Tenant B media'
);

select lives_ok(
  $$insert into storage.objects (bucket_id,name,owner_id,metadata)
    values ('product-media','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31.webp','11111111-1111-4111-8111-111111111111','{"mimetype":"image/webp","size":2048}'::jsonb)$$,
  'Tenant A staff can create valid media for its own product'
);

select throws_ok(
  $$insert into storage.objects (bucket_id,name,owner_id,metadata)
    values ('product-media','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa32.webp','11111111-1111-4111-8111-111111111111','{"mimetype":"image/webp","size":2048}'::jsonb)$$,
  '42501', null,
  'Tenant A cannot upload media under a Tenant B product'
);

select throws_ok(
  $$insert into storage.objects (bucket_id,name,owner_id,metadata)
    values ('product-media','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11/not-a-uuid.webp','11111111-1111-4111-8111-111111111111','{"mimetype":"image/webp","size":2048}'::jsonb)$$,
  '42501', null,
  'Media filenames must be UUID-based WebP objects'
);

select results_eq(
  $$select count(*) from storage.objects where name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa99/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa29.webp'$$,
  $$values (0::bigint)$$,
  'Orphan product path is not readable'
);

select throws_ok(
  $$insert into storage.objects (bucket_id,name,owner_id,metadata)
    values ('product-media','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa33.webp','11111111-1111-4111-8111-111111111111','{"mimetype":"image/webp","size":2048}'::jsonb)$$,
  '42501', null,
  'Tenant A cannot upload into Tenant B organization prefix'
);

select throws_ok(
  $$update storage.objects set name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa34.webp'
    where name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21.webp'$$,
  '42501', null,
  'Direct storage object UPDATE is not an application capability'
);

select lives_ok(
  $$select public.register_product_media(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31.webp',
    'image/webp', 1200, 900, 2048
  )$$,
  'Server registers a valid owned WebP object'
);

select throws_ok(
  $$select public.register_product_media(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa31/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa35.webp',
    'image/webp', 1200, 900, 2048
  )$$,
  '42501', null,
  'Server rejects a product ID from another tenant'
);

select throws_ok(
  $$select public.register_product_media(
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'::uuid,
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa21.webp',
    'image/png', 1200, 900, 1024
  )$$,
  '22023', null,
  'Server registration accepts only the canonical WebP format'
);

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
select results_eq(
  $$select count(*) from storage.objects where bucket_id='product-media'$$,
  $$values (1::bigint)$$,
  'Tenant B sees only its own active product media'
);

select * from finish();
rollback;
