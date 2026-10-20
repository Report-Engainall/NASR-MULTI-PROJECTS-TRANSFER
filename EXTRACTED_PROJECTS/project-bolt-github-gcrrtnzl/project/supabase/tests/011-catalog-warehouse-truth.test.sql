begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email) values ('12121212-1212-4121-8121-121212121212', 'catalog-customer@test.local');
insert into public.organizations (id, name) values ('13131313-1313-4131-8131-131313131313', 'Catalog Tenant');
insert into public.branches (id, organization_id, name) values ('14141414-1414-4141-8141-141414141414', '13131313-1313-4131-8131-131313131313', 'Main');
insert into public.warehouses (id, organization_id, branch_id, name) values ('15151515-1515-4151-8151-151515151515', '13131313-1313-4131-8131-131313131313', '14141414-1414-4141-8141-141414141414', 'Warehouse A');
insert into public.warehouses (id, organization_id, branch_id, name) values ('16161616-1616-4161-8161-161616161616', '13131313-1313-4131-8131-131313131313', '14141414-1414-4141-8141-141414141414', 'Warehouse B');
insert into public.products (id, organization_id, sku, name, unit) values ('17171717-1717-4171-8171-171717171717', '13131313-1313-4131-8131-131313131313', 'CAT-001', 'Catalog Product', 'carton');
insert into public.customers (id, organization_id, name, tier) values ('18181818-1818-4181-8181-181818181818', '13131313-1313-4131-8131-131313131313', 'Catalog Customer', 'wholesale');
insert into public.profiles (id, organization_id, customer_id, role) values ('12121212-1212-4121-8121-121212121212', '13131313-1313-4131-8131-131313131313', '18181818-1818-4181-8181-181818181818', 'viewer');
insert into public.price_lists (id, organization_id, tier, name, currency) values ('19191919-1919-4191-8191-191919191919', '13131313-1313-4131-8131-131313131313', 'wholesale', 'Wholesale', 'YER');
insert into public.product_prices (organization_id, price_list_id, product_id, amount) values ('13131313-1313-4131-8131-131313131313', '19191919-1919-4191-8191-191919191919', '17171717-1717-4171-8171-171717171717', 250);
insert into public.inventory_balances(organization_id, warehouse_id, product_id, quantity) values
  ('13131313-1313-4131-8131-131313131313','15151515-1515-4151-8151-151515151515','17171717-1717-4171-8171-171717171717',5),
  ('13131313-1313-4131-8131-131313131313','16161616-1616-4161-8161-161616161616','17171717-1717-4171-8171-171717171717',40);

set local role authenticated;
set local request.jwt.claim.sub = '12121212-1212-4121-8121-121212121212';

select is((select available_quantity from public.get_catalog(null,null,24,0,'15151515-1515-4151-8151-151515151515') where sku='CAT-001'),5,'Catalog availability uses the selected checkout warehouse');
select is((select available_quantity from public.get_catalog(null,null,24,0,'16161616-1616-4161-8161-161616161616') where sku='CAT-001'),40,'Changing warehouse changes the authoritative availability');
select throws_ok(
  $$select * from public.get_catalog(null,null,24,0,'99999999-9999-4999-8999-999999999999')$$,
  '42501','warehouse not available','Catalog rejects a warehouse outside the active tenant boundary'
);

select * from finish();
rollback;
