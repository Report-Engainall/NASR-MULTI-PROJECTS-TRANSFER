-- Tenant-scoped audit history is append-only for client sessions.
-- SECURITY DEFINER RPCs/triggers continue to append trusted server-side events.
DROP POLICY IF EXISTS staff_all_audit_logs ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_admin_manager_read_same_org ON public.audit_logs;

CREATE POLICY audit_logs_admin_manager_read_same_org
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.user_roles r ON r.profile_id = p.id
      WHERE p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.organization_id = public.current_organization_id()
        AND p.is_active = true
        AND r.role IN ('admin', 'manager')
    )
  );

GRANT SELECT ON TABLE public.audit_logs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.audit_logs FROM anon, authenticated;
