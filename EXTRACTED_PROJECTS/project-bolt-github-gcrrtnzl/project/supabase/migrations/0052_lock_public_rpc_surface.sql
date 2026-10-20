revoke execute on function public.clear_cart() from public;
revoke execute on function public.get_catalog(text,uuid,integer,integer) from public;
revoke execute on function public.get_catalog(text,uuid,integer,integer) from anon;
grant execute on function public.clear_cart() to authenticated;
grant execute on function public.get_catalog(text,uuid,integer,integer) to authenticated;
