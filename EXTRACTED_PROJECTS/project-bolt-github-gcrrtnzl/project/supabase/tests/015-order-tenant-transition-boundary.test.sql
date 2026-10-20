begin;

select plan(8);

create temp table fixture as
select gen_random_uuid() org_a, gen_random_uuid() org_b,
       gen_random_uuid() admin_a, gen_random_uuid() admin_b,
       gen_random_uuid() viewer_a, gen_random_uuid() customer_a,
       gen_random_uuid() customer_b, gen_random_uuid() branch_a,
       gen_random_uuid() branch_b, gen_random_uuid() warehouse_a,
       gen_random_uuid() warehouse_b, gen_random_uuid() product_a,
       gen_random_uuid() product_b, gen_random_uuid() order_a,
       gen_random_uuid() order_b;

grant select on fixture to authenticated;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
select admin_a,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','order-admin-a@fixture.invalid','x',now(),now() from fixture
union all select admin_b,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','order-admin-b@fixture.invalid','x',now(),now() from fixture
union all select viewer_a,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','order-viewer-a@fixture.invalid','x',now(),now() from fixture;
insert into public.organizations(id,name,is_active)
select org_a,'Order Tenant A',true from fixture union all select org_b,'Order Tenant B',true from fixture;
insert into public.customers(id,organization_id,name,tier,is_active)
select customer_a,org_a,'Order Customer A','wholesale',true from fixture union all select customer_b,org_b,'Order Customer B','wholesale',true from fixture;
insert into public.profiles(id,organization_id,customer_id,role)
select admin_a,org_a,customer_a,'admin'::user_role from fixture union all
select admin_b,org_b,customer_b,'admin'::user_role from fixture union all
select viewer_a,org_a,customer_a,'viewer'::user_role from fixture;
insert into public.branches(id,organization_id,name,is_active)
select branch_a,org_a,'Order Branch A',true from fixture union all select branch_b,org_b,'Order Branch B',true from fixture;
insert into public.warehouses(id,organization_id,branch_id,name,is_active)
select warehouse_a,org_a,branch_a,'Order Warehouse A',true from fixture union all select warehouse_b,org_b,branch_b,'Order Warehouse B',true from fixture;
insert into public.products(id,organization_id,sku,name,unit,status)
select product_a,org_a,'ORDER-A','Order Product A','unit','active' from fixture union all select product_b,org_b,'ORDER-B','Order Product B','unit','active' from fixture;
insert into public.inventory_balances(organization_id,warehouse_id,product_id,quantity)
select org_a,warehouse_a,product_a,10 from fixture union all select org_b,warehouse_b,product_b,20 from fixture;
insert into public.orders(id,organization_id,customer_id,warehouse_id,order_number,status,currency,subtotal,total,idempotency_key,created_by)
select order_a,org_a,customer_a,warehouse_a,900001,'pending','YER',10,10,'order-a-key-123456',admin_a from fixture union all
select order_b,org_b,customer_b,warehouse_b,900002,'pending','YER',20,20,'order-b-key-123456',admin_b from fixture;
insert into public.order_items(organization_id,order_id,product_id,quantity,unit_price,pricing_tier,line_total)
select org_a,order_a,product_a,2,5,'wholesale'::customer_tier,10 from fixture union all select org_b,order_b,product_b,2,10,'wholesale'::customer_tier,20 from fixture;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select viewer_a::text from fixture),true);
select throws_ok(format('select public.transition_order(%L,%L)',order_a,'confirmed'::order_status),'42501','viewer cannot transition an order') from fixture;
select throws_ok(format('select public.transition_order(%L,%L)',order_b,'confirmed'::order_status),'P0002','Tenant A viewer cannot target Tenant B order') from fixture;

select set_config('request.jwt.claim.sub',(select admin_a::text from fixture),true);
select throws_ok(format('select public.transition_order(%L,%L)',order_b,'confirmed'::order_status),'P0002','Tenant A admin cannot target Tenant B order') from fixture;
select public.transition_order(order_a,'confirmed'::order_status) from fixture;
select is((select status from public.orders where id=(select order_a from fixture)),'confirmed'::order_status,'Tenant A admin can transition own order');
select is((select count(*) from public.order_status_history h where h.order_id=(select order_a from fixture) and h.to_status='confirmed'),1::bigint,'Own order transition creates history');
select is((select count(*) from public.audit_events a where a.target_id=(select order_a from fixture) and a.action='order.transition'),1::bigint,'Own order transition creates audit evidence');
select is((select count(*) from public.outbox_events o where o.aggregate_id=(select order_a from fixture) and o.event_type='order.status_changed'),1::bigint,'Own order transition creates outbox evidence');

select * from finish();
rollback;
