REVOKE EXECUTE ON FUNCTION public.is_staff() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;