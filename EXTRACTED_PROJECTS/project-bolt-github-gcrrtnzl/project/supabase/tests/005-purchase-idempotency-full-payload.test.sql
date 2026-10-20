begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email)
values ('66666666-6666-4666-8666-666666666666', 'purchase-idempotency@test.local');
insert into public.organizations (id, name)
values ('12121212-1212-4121-8121-121212121212', 'Purchase Idempotency Tenant');
insert into public.branches (id, organization_id, name)
values ('12121212-1212-4121-8121-121212121213', '12121212-1212-4121-8121-121212121212', 'Main');
insert into public.warehouses (id, organization_id, branch_id, name)
values ('12121212-1212-4121-8121-121212121214', '12121212-1212-4121-8121-121212121212', '12121212-1212-4121-8121-121212121213', 'Warehouse');
insert into public.products (id, organization_id, sku, name, unit)
values ('12121212-1212-4121-8121-121212121215', '12121212-1212-4121-8121-121212121212', 'IDEMP-001', 'Idempotency Product', 'carton');
insert into public.suppliers (id, organization_id, name)
values ('12121212-1212-4121-8121-121212121216', '12121212-1212-4121-8121-121212121212', 'Idempotency Supplier');
insert into public.profiles (id, organization_id, role)
values ('66666666-6666-4666-8666-666666666666', '12121212-1212-4121-8121-121212121212', 'admin');

set local role authenticated;
set local request.jwt.claim.sub = '66666666-6666-4666-8666-666666666666';

select is(
  (select total from public.create_purchase_order(
    '12121212-1212-4121-8121-121212121216'::uuid,
    '12121212-1212-4121-8121-121212121214'::uuid,
    'full-payload-idempotency-01',
    jsonb_build_array(jsonb_build_object('product_id','12121212-1212-4121-8121-121212121215','quantity',2,'unit_cost',100)),
    'YER', 'first payload'
  )),
  200::numeric,
  'Initial purchase command succeeds'
);
select throws_ok(
  $$select * from public.create_purchase_order('12121212-1212-4121-8121-121212121216'::uuid,'12121212-1212-4121-8121-121212121214'::uuid,'full-payload-idempotency-01',jsonb_build_array(jsonb_build_object('product_id','12121212-1212-4121-8121-121212121215','quantity',2,'unit_cost',100)),'USD','first payload')$$,
  '40001','idempotency key payload conflict','Changing currency under an existing key is rejected'
);
select throws_ok(
  $$select * from public.create_purchase_order('12121212-1212-4121-8121-121212121216'::uuid,'12121212-1212-4121-8121-121212121214'::uuid,'full-payload-idempotency-01',jsonb_build_array(jsonb_build_object('product_id','12121212-1212-4121-8121-121212121215','quantity',2,'unit_cost',100)),'YER','changed payload')$$,
  '40001','idempotency key payload conflict','Changing notes under an existing key is rejected'
);

select * from finish();
rollback;
