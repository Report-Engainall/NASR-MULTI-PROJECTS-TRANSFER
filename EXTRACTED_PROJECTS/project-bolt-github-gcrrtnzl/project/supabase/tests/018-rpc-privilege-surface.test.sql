begin;

select plan(57);

-- Every application RPC must be authenticated-only: no PUBLIC or anonymous EXECUTE.
-- The context helpers are included because RLS policies invoke them under the caller role.
select is(
  has_function_privilege('anon', 'public.adjust_inventory(uuid,uuid,integer,text)', 'execute'),
  false,
  'anon cannot execute adjust_inventory'
);
select is(
  has_function_privilege('authenticated', 'public.adjust_inventory(uuid,uuid,integer,text)', 'execute'),
  true,
  'authenticated can execute adjust_inventory'
);
select is(
  has_function_privilege('public', 'public.adjust_inventory(uuid,uuid,integer,text)', 'execute'),
  false,
  'PUBLIC cannot execute adjust_inventory'
);

select is(has_function_privilege('anon', 'public.clear_cart()', 'execute'), false, 'anon cannot execute clear_cart');
select is(has_function_privilege('authenticated', 'public.clear_cart()', 'execute'), true, 'authenticated can execute clear_cart');
select is(has_function_privilege('public', 'public.clear_cart()', 'execute'), false, 'PUBLIC cannot execute clear_cart');

select is(has_function_privilege('anon', 'public.create_order(text,uuid,jsonb)', 'execute'), false, 'anon cannot execute create_order');
select is(has_function_privilege('authenticated', 'public.create_order(text,uuid,jsonb)', 'execute'), true, 'authenticated can execute create_order');
select is(has_function_privilege('public', 'public.create_order(text,uuid,jsonb)', 'execute'), false, 'PUBLIC cannot execute create_order');

select is(has_function_privilege('anon', 'public.get_cart()', 'execute'), false, 'anon cannot execute get_cart');
select is(has_function_privilege('authenticated', 'public.get_cart()', 'execute'), true, 'authenticated can execute get_cart');
select is(has_function_privilege('public', 'public.get_cart()', 'execute'), false, 'PUBLIC cannot execute get_cart');

select is(has_function_privilege('anon', 'public.get_or_create_cart()', 'execute'), false, 'anon cannot execute get_or_create_cart');
select is(has_function_privilege('authenticated', 'public.get_or_create_cart()', 'execute'), true, 'authenticated can execute get_or_create_cart');
select is(has_function_privilege('public', 'public.get_or_create_cart()', 'execute'), false, 'PUBLIC cannot execute get_or_create_cart');

select is(has_function_privilege('anon', 'public.get_catalog(text,uuid,integer,integer,uuid)', 'execute'), false, 'anon cannot execute warehouse-aware get_catalog');
select is(has_function_privilege('authenticated', 'public.get_catalog(text,uuid,integer,integer,uuid)', 'execute'), true, 'authenticated can execute warehouse-aware get_catalog');
select is(has_function_privilege('public', 'public.get_catalog(text,uuid,integer,integer,uuid)', 'execute'), false, 'PUBLIC cannot execute warehouse-aware get_catalog');
select is(has_function_privilege('authenticated', 'public.get_catalog(text,uuid,integer,integer)', 'execute'), false, 'authenticated cannot execute legacy 4-arg get_catalog');
select is(has_function_privilege('anon', 'public.get_catalog(text,uuid,integer,integer)', 'execute'), false, 'anon cannot execute legacy 4-arg get_catalog');
select is(has_function_privilege('public', 'public.get_catalog(text,uuid,integer,integer)', 'execute'), false, 'PUBLIC cannot execute legacy 4-arg get_catalog');

select is(has_function_privilege('anon', 'public.remove_cart_item(uuid)', 'execute'), false, 'anon cannot execute remove_cart_item');
select is(has_function_privilege('authenticated', 'public.remove_cart_item(uuid)', 'execute'), true, 'authenticated can execute remove_cart_item');
select is(has_function_privilege('public', 'public.remove_cart_item(uuid)', 'execute'), false, 'PUBLIC cannot execute remove_cart_item');

select is(has_function_privilege('anon', 'public.set_cart_item(uuid,integer)', 'execute'), false, 'anon cannot execute set_cart_item');
select is(has_function_privilege('authenticated', 'public.set_cart_item(uuid,integer)', 'execute'), true, 'authenticated can execute set_cart_item');
select is(has_function_privilege('public', 'public.set_cart_item(uuid,integer)', 'execute'), false, 'PUBLIC cannot execute set_cart_item');

select is(has_function_privilege('anon', 'public.transition_order(uuid,order_status)', 'execute'), false, 'anon cannot execute transition_order');
select is(has_function_privilege('authenticated', 'public.transition_order(uuid,order_status)', 'execute'), true, 'authenticated can execute transition_order');
select is(has_function_privilege('public', 'public.transition_order(uuid,order_status)', 'execute'), false, 'PUBLIC cannot execute transition_order');

select is(has_function_privilege('anon', 'public.stage_product_import(text,text,jsonb)', 'execute'), false, 'anon cannot execute stage_product_import');
select is(has_function_privilege('authenticated', 'public.stage_product_import(text,text,jsonb)', 'execute'), true, 'authenticated can execute stage_product_import');
select is(has_function_privilege('public', 'public.stage_product_import(text,text,jsonb)', 'execute'), false, 'PUBLIC cannot execute stage_product_import');

select is(has_function_privilege('anon', 'public.commit_product_import(uuid,uuid)', 'execute'), false, 'anon cannot execute commit_product_import');
select is(has_function_privilege('authenticated', 'public.commit_product_import(uuid,uuid)', 'execute'), true, 'authenticated can execute commit_product_import');
select is(has_function_privilege('public', 'public.commit_product_import(uuid,uuid)', 'execute'), false, 'PUBLIC cannot execute commit_product_import');

select is(has_function_privilege('anon', 'public.create_category(text,text,uuid)', 'execute'), false, 'anon cannot execute create_category');
select is(has_function_privilege('authenticated', 'public.create_category(text,text,uuid)', 'execute'), true, 'authenticated can execute create_category');
select is(has_function_privilege('public', 'public.create_category(text,text,uuid)', 'execute'), false, 'PUBLIC cannot execute create_category');

select is(has_function_privilege('anon', 'public.set_product_price(uuid,customer_tier,numeric,text)', 'execute'), false, 'anon cannot execute set_product_price');
select is(has_function_privilege('authenticated', 'public.set_product_price(uuid,customer_tier,numeric,text)', 'execute'), true, 'authenticated can execute set_product_price');
select is(has_function_privilege('public', 'public.set_product_price(uuid,customer_tier,numeric,text)', 'execute'), false, 'PUBLIC cannot execute set_product_price');

select is(has_function_privilege('anon', 'public.upsert_product(uuid,text,text,text,uuid,text,text)', 'execute'), false, 'anon cannot execute upsert_product');
select is(has_function_privilege('authenticated', 'public.upsert_product(uuid,text,text,text,uuid,text,text)', 'execute'), true, 'authenticated can execute upsert_product');
select is(has_function_privilege('public', 'public.upsert_product(uuid,text,text,text,uuid,text,text)', 'execute'), false, 'PUBLIC cannot execute upsert_product');

select is(has_function_privilege('anon', 'public.current_organization_id()', 'execute'), false, 'anon cannot execute current_organization_id');
select is(has_function_privilege('authenticated', 'public.current_organization_id()', 'execute'), true, 'authenticated can execute current_organization_id');
select is(has_function_privilege('public', 'public.current_organization_id()', 'execute'), false, 'PUBLIC cannot execute current_organization_id');

select is(has_function_privilege('anon', 'public.current_customer_id()', 'execute'), false, 'anon cannot execute current_customer_id');
select is(has_function_privilege('authenticated', 'public.current_customer_id()', 'execute'), true, 'authenticated can execute current_customer_id');
select is(has_function_privilege('public', 'public.current_customer_id()', 'execute'), false, 'PUBLIC cannot execute current_customer_id');

select is(has_function_privilege('anon', 'public.current_role()', 'execute'), false, 'anon cannot execute current_role');
select is(has_function_privilege('authenticated', 'public.current_role()', 'execute'), true, 'authenticated can execute current_role');
select is(has_function_privilege('public', 'public.current_role()', 'execute'), false, 'PUBLIC cannot execute current_role');

select is(has_function_privilege('anon', 'public.is_staff()', 'execute'), false, 'anon cannot execute is_staff');
select is(has_function_privilege('authenticated', 'public.is_staff()', 'execute'), true, 'authenticated can execute is_staff');
select is(has_function_privilege('public', 'public.is_staff()', 'execute'), false, 'PUBLIC cannot execute is_staff');

select * from finish();
rollback;
