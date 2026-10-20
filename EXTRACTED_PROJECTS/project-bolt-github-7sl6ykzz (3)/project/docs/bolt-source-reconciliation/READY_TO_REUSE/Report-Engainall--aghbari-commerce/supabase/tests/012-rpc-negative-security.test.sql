begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id,email) values
  ('33333333-3333-4333-8333-333333333333','sec-a-customer@test.local'),
  ('44444444-4444-4444-8444-444444444444','sec-a-admin@test.local');
insert into public.organizations(id,name) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Security Tenant A');
insert into public.customers(id,organization_id,name,tier) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc01','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Security Customer A','wholesale');
insert into public.profiles(id,organization_id,customer_id,role) values
  ('33333333-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-cccc-4ccc-8ccc-cccccccccc01','viewer'),
  ('44444444-4444-4444-8444-444444444444','cccccccc-cccc-4ccc-8ccc-cccccccccccc',null,'admin');
insert into public.branches(id,organization_id,name) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc02','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Security A Main');
insert into public.warehouses(id,organization_id,branch_id,name,is_active) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc03','cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-cccc-4ccc-8ccc-cccccccccc02','Security A Warehouse',true);
insert into public.products(id,organization_id,sku,name,unit,status) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccc11','cccccccc-cccc-4ccc-8ccc-cccccccccccc','SEC-A-001','Security A Product','carton','active');
insert into public.inventory_balances(organization_id,warehouse_id,product_id,quantity) values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-cccc-4ccc-8ccc-cccccccccc03','cccccccc-cccc-4ccc-8ccc-cccccccccc11',10);

set local role authenticated;
set local request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
select throws_ok($$select public.adjust_inventory('cccccccc-cccc-4ccc-8ccc-cccccccccc03','cccccccc-cccc-4ccc-8ccc-cccccccccc11',1,'forbidden')$$,'42501',null,'viewer cannot execute staff inventory mutation');
select throws_ok($$select public.create_category('Forbidden','forbidden',null)$$,'42501',null,'viewer cannot execute staff category mutation');
select lives_ok($$select public.get_or_create_cart()$$,'customer can execute customer cart RPC');
select is((select count(*) from public.get_catalog(null,null,24,0,'cccccccc-cccc-4ccc-8ccc-cccccccccc03') where sku='SEC-A-001'),1::bigint,'customer can read own tenant catalog');

set local request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
select lives_ok($$select public.adjust_inventory('cccccccc-cccc-4ccc-8ccc-cccccccccc03','cccccccc-cccc-4ccc-8ccc-cccccccccc11',1,'authorized')$$,'admin can mutate own tenant inventory');
select is((select quantity from public.inventory_balances where warehouse_id='cccccccc-cccc-4ccc-8ccc-cccccccccc03' and product_id='cccccccc-cccc-4ccc-8ccc-cccccccccc11'),11,'authorized inventory mutation is applied');
select is(has_function_privilege('anon','public.adjust_inventory(uuid,uuid,integer,text)','execute'),false,'anonymous inventory mutation remains denied');
select is(has_function_privilege('authenticated','public.current_organization_id()','execute'),true,'authenticated tenant context helper is executable for RLS');
select is(has_function_privilege('authenticated','public.current_role()','execute'),true,'authenticated role context helper is executable for RLS');

select * from finish();
rollback;
