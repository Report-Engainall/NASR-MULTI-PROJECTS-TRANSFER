/*
# Fix organization membership access policies

1. Purpose
- Fix the infinite-recursion error that prevents signed-in users from loading their organization.
- Preserve organization and membership data without deleting or changing user records.

2. Database changes
- Add `public.is_org_member(uuid)`, a read-only security-definer helper that checks membership without recursively invoking the membership table policy.
- Replace the recursive organization-members SELECT policy with a policy that allows a user to read their own membership and other members of an organization they belong to.
- Update organization SELECT and UPDATE policies to use the same safe helper.

3. Security
- The helper uses a fixed `search_path` and is executable only by authenticated users.
- Anonymous users cannot read organization or membership data.
- Organization membership checks remain tied to `auth.uid()`.

4. Notes
- No tables, columns, or existing rows are deleted.
- Existing owner and admin memberships remain unchanged.
*/

CREATE OR REPLACE FUNCTION public.is_org_member(p_organization_id uuid)
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
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "orgmem_select_member" ON public.organization_members;
CREATE POLICY "orgmem_select_member"
ON public.organization_members
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_org_member(organization_id)
);

DROP POLICY IF EXISTS "org_select_authenticated" ON public.organizations;
CREATE POLICY "org_select_authenticated"
ON public.organizations
FOR SELECT
TO authenticated
USING (public.is_org_member(id));

DROP POLICY IF EXISTS "org_update_owner" ON public.organizations;
CREATE POLICY "org_update_owner"
ON public.organizations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.status = 'active'
      AND om.role IN ('owner', 'admin')
  )
);
