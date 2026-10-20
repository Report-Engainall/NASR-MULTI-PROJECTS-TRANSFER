revoke execute on function public.current_organization_id() from public;
revoke execute on function public.current_customer_id() from public;
revoke execute on function public.current_role() from public;
revoke execute on function public.is_staff() from public;
grant execute on function public.current_organization_id() to authenticated;
grant execute on function public.current_customer_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.is_staff() to authenticated;
