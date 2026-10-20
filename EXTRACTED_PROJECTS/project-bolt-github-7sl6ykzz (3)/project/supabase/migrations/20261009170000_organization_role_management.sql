-- Restrict profile and role assignments to self-read and admin-scoped RPCs.
-- Privileged role mutation is tenant-scoped, audited, and cannot strand an organization
-- without an active administrator. No client can change profile/auth bindings directly.

DROP POLICY IF EXISTS staff_all_profiles ON public.profiles;
DROP POLICY IF EXISTS staff_all_user_roles ON public.user_roles;
DROP POLICY IF EXISTS own_profile_update ON public.profiles;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles, public.user_roles TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_user_roles()
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
       AND p.organization_id IS NOT NULL
       AND r.role='admin'
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_user_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_user_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_organization_user_roles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='admin role required to list organization users';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active admin organization is required';
  END IF;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'profile_id',p.id,
        'full_name',p.full_name,
        'email',p.email,
        'is_active',p.is_active,
        'roles',coalesce((
          SELECT jsonb_agg(r.role ORDER BY r.role)
            FROM public.user_roles r
           WHERE r.profile_id=p.id
        ),'[]'::jsonb)
      ) ORDER BY p.full_name,p.email
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM public.profiles p
  WHERE p.organization_id=v_org
    AND p.is_active
    AND p.auth_user_id IS NOT NULL;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.list_organization_user_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_organization_user_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_organization_user_roles(
  p_profile_id uuid,
  p_roles text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_target public.profiles%ROWTYPE;
  v_role text;
  v_old_roles jsonb;
  v_admin_count integer;
  v_unique_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_user_roles() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='admin role required to change organization user roles';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active admin organization is required';
  END IF;

  -- Serialize role changes within the tenant; avoids concurrent removal of the last admin.
  PERFORM 1 FROM public.organizations o WHERE o.id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='organization is unavailable'; END IF;

  IF p_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='profile id is required';
  END IF;
  IF p_roles IS NULL OR pg_catalog.cardinality(p_roles)<1 OR pg_catalog.cardinality(p_roles)>5 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='select at least one allowed role';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(p_roles) AS requested(role)
    WHERE requested.role NOT IN ('admin','manager','staff','accountant','customer')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported user role';
  END IF;

  SELECT count(DISTINCT requested.role)::integer INTO v_unique_count
    FROM pg_catalog.unnest(p_roles) AS requested(role);
  IF v_unique_count <> pg_catalog.cardinality(p_roles) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='duplicate user roles are not allowed';
  END IF;
  IF pg_catalog.cardinality(p_roles)>1 AND 'customer'=ANY(p_roles) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='customer role cannot be combined with staff roles';
  END IF;
  IF p_profile_id=v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='cannot change their own roles from this screen';
  END IF;

  SELECT p.* INTO v_target
    FROM public.profiles p
   WHERE p.id=p_profile_id
     AND p.organization_id=v_org
     AND p.is_active
     AND p.auth_user_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='profile is outside the current organization or is inactive';
  END IF;

  SELECT coalesce(jsonb_agg(r.role ORDER BY r.role),'[]'::jsonb) INTO v_old_roles
    FROM public.user_roles r
   WHERE r.profile_id=v_target.id;

  IF EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id=v_target.id AND r.role='admin'
  ) AND NOT ('admin'=ANY(p_roles)) THEN
    SELECT count(DISTINCT p.id)::integer INTO v_admin_count
      FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id=p.id
     WHERE p.organization_id=v_org
       AND p.auth_user_id IS NOT NULL
       AND p.is_active
       AND r.role='admin';
    IF v_admin_count<=1 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cannot remove last active administrator';
    END IF;
  END IF;

  DELETE FROM public.user_roles WHERE profile_id=v_target.id;
  FOREACH v_role IN ARRAY p_roles LOOP
    INSERT INTO public.user_roles(profile_id,role) VALUES(v_target.id,v_role);
  END LOOP;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'user.roles.changed','profile',v_target.id,
    jsonb_build_object('roles',v_old_roles),
    jsonb_build_object('roles',to_jsonb(p_roles)));

  RETURN jsonb_build_object('profile_id',v_target.id,'roles',to_jsonb(p_roles));
END;
$$;
REVOKE ALL ON FUNCTION public.set_organization_user_roles(uuid,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_user_roles(uuid,text[]) TO authenticated;

COMMENT ON FUNCTION public.list_organization_user_roles() IS
  'Admin-only, tenant-scoped view of active organization profiles and their assigned roles.';
COMMENT ON FUNCTION public.set_organization_user_roles(uuid,text[]) IS
  'Admin-only, tenant-scoped, serialized and audited role assignment. Authenticated profile/role DML is revoked.';
