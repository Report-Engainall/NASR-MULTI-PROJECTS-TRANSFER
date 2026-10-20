-- Batch 7: harden identity-context helper functions.
-- Applied to the connected Aghbari Supabase project before source commit.

create or replace function public.current_organization_id()
returns uuid language sql stable security definer set search_path=public
as $$ select p.organization_id from public.profiles p where p.id=auth.uid() limit 1 $$;

create or replace function public.current_customer_id()
returns uuid language sql stable security definer set search_path=public
as $$ select p.customer_id from public.profiles p where p.id=auth.uid() limit 1 $$;

create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path=public
as $$ select p.role from public.profiles p where p.id=auth.uid() limit 1 $$;

revoke execute on function public.current_organization_id() from anon;
revoke execute on function public.current_customer_id() from anon;
revoke execute on function public.current_role() from anon;

grant execute on function public.current_organization_id() to authenticated, service_role;
grant execute on function public.current_customer_id() to authenticated, service_role;
grant execute on function public.current_role() to authenticated, service_role;
