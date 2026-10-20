begin;

select plan(8);

create temp table fixture as
select gen_random_uuid() org_a, gen_random_uuid() org_b,
       gen_random_uuid() user_a, gen_random_uuid() user_b,
       gen_random_uuid() customer_a, gen_random_uuid() customer_b,
       gen_random_uuid() product_a, gen_random_uuid() product_b;

grant select on fixture to authenticated;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,created_at,updated_at)
select user_a,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','cart-a@fixture.invalid','x',now(),now() from fixture
union all
select user_b,'00000000-0000-0000-0000-000000000000'::uuid,'authenticated','authenticated','cart-b@fixture.invalid','x',now(),now() from fixture;
insert into public.organizations(id,name,is_active)
select org_a,'Cart Tenant A',true from fixture union all select org_b,'Cart Tenant B',true from fixture;
insert into public.customers(id,organization_id,name,tier,is_active)
select customer_a,org_a,'Customer A','wholesale',true from fixture union all select customer_b,org_b,'Customer B','wholesale',true from fixture;
insert into public.profiles(id,organization_id,customer_id,role)
select user_a,org_a,customer_a,'viewer'::user_role from fixture union all select user_b,org_b,customer_b,'viewer'::user_role from fixture;
insert into public.products(id,organization_id,sku,name,unit,status)
select product_a,org_a,'CART-A','Cart Product A','unit','active' from fixture union all select product_b,org_b,'CART-B','Cart Product B','unit','active' from fixture;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select user_a::text from fixture),true);

select public.set_cart_item(product_a,3) from fixture;
select is((select count(*) from public.get_cart() where product_id=(select product_a from fixture)),1::bigint,'Tenant A cart contains its own product');
select is((select quantity from public.get_cart() where product_id=(select product_a from fixture)),3,'Tenant A quantity is isolated');
select throws_ok(format('select public.set_cart_item(%L,2)',product_b),'P0001','Tenant A cannot add Tenant B product') from fixture;
select is((select count(*) from public.carts c join fixture f on c.organization_id=f.org_b and c.customer_id=f.customer_b),0::bigint,'Tenant A cannot create or expose Tenant B cart');

select set_config('request.jwt.claim.sub',(select user_b::text from fixture),true);
select public.set_cart_item(product_b,5) from fixture;
select is((select quantity from public.get_cart() where product_id=(select product_b from fixture)),5,'Tenant B sees only its own cart item');
select is((select count(*) from public.get_cart() where product_id=(select product_a from fixture)),0::bigint,'Tenant B cannot see Tenant A cart item');
select is((select count(*) from public.cart_items ci join fixture f on ci.product_id=f.product_a),1::bigint,'Tenant B operations do not mutate Tenant A cart');

select * from finish();
rollback;
