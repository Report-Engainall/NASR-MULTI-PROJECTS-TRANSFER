-- AGH-TASK-ASSIGNEE-001
-- Admin/manager-only, organization-scoped list for the operational-task assignment UI.
-- Role administration remains on its stricter admin-only RPC.
CREATE OR REPLACE FUNCTION public.list_operational_task_assignees()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid := public.current_organization_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to list task assignees';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile_id',p.id,
        'full_name',p.full_name,
        'email',p.email,
        'roles',coalesce((
          SELECT jsonb_agg(r.role ORDER BY r.role)
          FROM public.user_roles r
          WHERE r.profile_id=p.id
        ),'[]'::jsonb)
      )
      ORDER BY p.full_name,p.email,p.id
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.profiles p
  WHERE p.organization_id=v_org
    AND p.is_active
    AND p.auth_user_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.user_roles r WHERE r.profile_id=p.id);

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_operational_task_assignees() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_operational_task_assignees() TO authenticated;
COMMENT ON FUNCTION public.list_operational_task_assignees() IS
  'Admin/manager-only list of active, role-bearing staff in the caller organization for validating operational task assignments.';
