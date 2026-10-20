begin;

select plan(8);

create temp table fixture as
select gen_random_uuid() org_a, gen_random_uuid() org_b,
       gen_random_uuid() user_a, gen_random_uuid() user_b,
       gen_random_uuid() customer_a, gen_random_uuid() customer_b,
       gen_random_uuid() warehouse_a, gen_random_uuid() warehouse_b,
       gen_random_uuid() branch_a, gen_random_uuid() branch_b,
       gen_random_uuid() product_a, gen_random_uuid() product_b;
grant select on fixture to authenticated;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
select user_a,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','state-a@fixture.invalid','x',now(),now() from fixture
union all select user_b,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','state-b@fixture.invalid','x',now(),now() from fixture;
insert into public.organizations(id,name,is_active)
select org_a,'State Tenant A',true from fixture union all select org_b,'State Tenant B',true from fixture;
insert into public.customers(id,organization_id,name,tier,is_active)
select customer_a,org_a,'State Customer A','retail'::customer_tier,true from fixture union all select customer_b,org_b,'State Customer B','retail'::customer_tier,true from fixture;
insert into public.profiles(id,organization_id,customer_id,role)
select user_a,org_a,customer_a,'viewer'::user_role from fixture union all select user_b,org_b,customer_b,'viewer'::user_role from fixture;
insert into public.branches(id,organization_id,name,is_active)
select branch_a,org_a,'State Branch A',true from fixture union all select branch_b,org_b,'State Branch B',true from fixture;
insert into public.warehouses(id,organization_id,branch_id,name,is_active)
select warehouse_a,org_a,branch_a,'State Warehouse A',true from fixture union all select warehouse_b,org_b,branch_b,'State Warehouse B',true from fixture;
insert into public.products(id,organization_id,sku,name,unit,status)
select product_a,org_a,'STATE-A','State Product A','unit','active' from fixture union all select product_b,org_b,'STATE-B','State Product B','unit','active' from fixture;
insert into public.inventory_balances(organization_id,warehouse_id,product_id,quantity)
select org_a,warehouse_a,product_a,10 from fixture union all select org_b,warehouse_b,product_b,10 from fixture;
insert into public.price_lists(organization_id,tier,name,currency)
select org_a,'retail'::customer_tier,'State Retail A','YER' from fixture union all select org_b,'retail'::customer_tier,'State Retail B','YER' from fixture;
insert into public.product_prices(organization_id,price_list_id,product_id,amount,valid_from)
select org_a,(select id from public.price_lists where organization_id=org_a),product_a,100,now() from fixture union all select org_b,(select id from public.price_lists where organization_id=org_b),product_b,200,now() from fixture;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select user_a::text from fixture),true);
select ok(public.create_order('state-machine-a-0001',(select warehouse_a from fixture),jsonb_build_array(jsonb_build_object('product_id',(select product_a from fixture),'quantity',1))) is not null,'Tenant A creates its own order');
select throws_ok(format('select public.transition_order(%L,%L)',(select id from public.orders where organization_id=(select org_a from fixture) order by created_at desc limit 1),'cancelled'),'42501','order transition not authorized','viewer cannot transition order');

select set_config('request.jwt.claim.sub',(select user_b::text from fixture),true);
select throws_ok(format('select public.transition_order(%L,%L)',(select id from public.orders where organization_id=(select org_a from fixture) order by created_at desc limit 1),'cancelled'),'P0002','order not found','Tenant B cannot transition Tenant A order');
select ok(not exists(select 1 from public.orders where organization_id=(select org_a from fixture)),'Tenant B RLS hides Tenant A order');

select set_config('request.jwt.claim.sub',(select user_a::text from fixture),true);
select ok(exists(select 1 from public.orders where organization_id=(select org_a from fixture)),'Tenant A can still read own order');
select ok((select status from public.orders where organization_id=(select org_a from fixture) order by created_at desc limit 1)='pending'::order_status,'Failed viewer transition leaves order pending');
select ok((select quantity from public.inventory_balances where organization_id=(select org_a from fixture) and product_id=(select product_a from fixture))=9,'Order creation decrements Tenant A stock once');
select ok((select count(*) from public.order_status_history h join public.orders o on o.id=h.order_id where o.organization_id=(select org_a from fixture))>=1,'Order status history remains tenant-scoped');

select * from finish();
rollback;
