-- Add the dedicated accountant role to the narrowly scoped finance capability only.
-- Deliberately do not add accountant to public.is_staff(): accountant accounts do not gain
-- order processing, pricing, inventory, customer-management, or other operational capabilities.

CREATE OR REPLACE FUNCTION public.can_manage_finance()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.auth_user_id=auth.uid()
       AND p.is_active
       AND r.role IN ('admin','manager','accountant')
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_finance() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_finance() TO authenticated;

COMMENT ON FUNCTION public.can_manage_finance() IS
  'Allows authenticated active admin/manager/accountant profiles into the finance capability. Accountant is excluded from operational is_staff access.';
