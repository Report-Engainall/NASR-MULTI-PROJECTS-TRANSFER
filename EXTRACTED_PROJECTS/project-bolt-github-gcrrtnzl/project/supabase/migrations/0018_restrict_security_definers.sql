-- Restrict SECURITY DEFINER helpers and administrative commands from direct authenticated execution.
-- Customer-facing application commands remain explicitly granted below.

revoke execute on function public.adjust_inventory(uuid, uuid, integer, text) from authenticated;
revoke execute on function public.commit_product_import(uuid, uuid) from authenticated;
revoke execute on function public.create_category(text, text, uuid) from authenticated;
revoke execute on function public.current_customer_id() from authenticated;
revoke execute on function public.current_organization_id() from authenticated;
revoke execute on function public.current_role() from authenticated;
revoke execute on function public.get_cart() from authenticated;
revoke execute on function public.get_or_create_cart() from authenticated;
revoke execute on function public.is_staff() from authenticated;
revoke execute on function public.remove_cart_item(uuid) from authenticated;
revoke execute on function public.set_cart_item(uuid, integer) from authenticated;
revoke execute on function public.set_product_price(uuid, public.customer_tier, numeric, text) from authenticated;
revoke execute on function public.stage_product_import(text, text, jsonb) from authenticated;
revoke execute on function public.transition_order(uuid, public.order_status) from authenticated;
revoke execute on function public.upsert_product(uuid, text, text, text, uuid, text, text) from authenticated;

-- Canonical customer-facing order command remains callable by authenticated users.
grant execute on function public.create_order(text, uuid, jsonb) to authenticated;
revoke execute on function public.create_order(text, uuid, jsonb) from anon;
revoke execute on function public.create_order(text, uuid, jsonb) from public;
