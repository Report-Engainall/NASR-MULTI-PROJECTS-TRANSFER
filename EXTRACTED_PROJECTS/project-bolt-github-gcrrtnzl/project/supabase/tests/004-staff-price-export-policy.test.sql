begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (id, email)
values ('55555555-5555-4555-8555-555555555555', 'export-admin@test.local');
insert into public.organizations (id, name)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Export Tenant A'),
       ('abababab-abab-4bab-8bab-abababababab', 'Export Tenant B');
insert into public.branches (id, organization_id, name)
values ('ffffffff-ffff-4fff-8fff-fffffffffff1', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Branch A'),
       ('abababab-abab-4bab-8bab-abababababac', 'abababab-abab-4bab-8bab-abababababab', 'Branch B');
insert into public.price_lists (id, organization_id, tier, name, currency)
values ('ffffffff-ffff-4fff-8fff-fffffffffff2', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'retail', 'Retail A', 'YER'),
       ('ffffffff-ffff-4fff-8fff-fffffffffff3', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'wholesale', 'Wholesale A', 'YER'),
       ('ffffffff-ffff-4fff-8fff-fffffffffff4', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'distributor', 'Distributor A', 'YER'),
       ('abababab-abab-4bab-8bab-abababababad', 'abababab-abab-4bab-8bab-abababababab', 'retail', 'Retail B', 'YER');
insert into public.products (id, organization_id, sku, name, unit)
values ('ffffffff-ffff-4fff-8fff-fffffffffff5', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'EXP-001', 'Export Product A', 'carton'),
       ('abababab-abab-4bab-8bab-abababababae', 'abababab-abab-4bab-8bab-abababababab', 'EXP-002', 'Export Product B', 'carton');
insert into public.customers (id, organization_id, name, tier)
values ('ffffffff-ffff-4fff-8fff-fffffffffff6', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'Customer A', 'retail');
insert into public.profiles (id, organization_id, customer_id, role)
values ('55555555-5555-4555-8555-555555555555', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'ffffffff-ffff-4fff-8fff-fffffffffff6', 'admin');
insert into public.product_prices (organization_id, price_list_id, product_id, amount)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'ffffffff-ffff-4fff-8fff-fffffffffff2', 'ffffffff-ffff-4fff-8fff-fffffffffff5', 100),
       ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'ffffffff-ffff-4fff-8fff-fffffffffff3', 'ffffffff-ffff-4fff-8fff-fffffffffff5', 90),
       ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'ffffffff-ffff-4fff-8fff-fffffffffff4', 'ffffffff-ffff-4fff-8fff-fffffffffff5', 80),
       ('abababab-abab-4bab-8bab-abababababab', 'abababab-abab-4bab-8bab-abababababad', 'abababab-abab-4bab-8bab-abababababae', 70);

set local role authenticated;
set local request.jwt.claim.sub = '55555555-5555-4555-8555-555555555555';

select is(
  (select count(*) from public.product_prices where organization_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff'),
  3::bigint,
  'Staff export reads every price tier in the current tenant only'
);
select is(
  (select count(*) from public.product_prices),
  3::bigint,
  'Staff export cannot cross the tenant boundary'
);

select * from finish();
rollback;
