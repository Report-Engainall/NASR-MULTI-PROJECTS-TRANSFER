/*
# Isolate the organization membership helper

1. Purpose
- Keep the recursion fix while ensuring the helper cannot be called through the public API.

2. Database changes
- Create the private schema if it does not exist.
- Move the membership-check helper into `private.is_org_member(uuid)`.
- Update organization and membership policies to use the private helper.
- Remove public execution privileges from the old helper.

3. Security
- The helper remains SECURITY DEFINER with a fixed search path.
- The function is executable only by authenticated database policy evaluation and is not exposed through the public Data API schema.
- No application data is deleted or modified.
*/

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_org_member(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION private.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_org_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "orgmem_select_member" ON public.organization_members;
CREATE POLICY "orgmem_select_member"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR private.is_org_member(organization_id)
);

DROP POLICY IF EXISTS "org_select_authenticated" ON public.organizations;
CREATE POLICY "org_select_authenticated"
ON public.organizations
FOR SELECT
TO authenticated
USING (private.is_org_member(id));
