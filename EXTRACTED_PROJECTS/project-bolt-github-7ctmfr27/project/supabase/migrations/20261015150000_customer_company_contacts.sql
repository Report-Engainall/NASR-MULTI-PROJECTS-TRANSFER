-- Owner-bound company contact book. These are contact records, not login accounts or granted roles.
CREATE TABLE IF NOT EXISTS public.customer_company_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(full_name)) BETWEEN 2 AND 120),
  job_title text,
  department text,
  phone text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(phone)) BETWEEN 7 AND 32),
  email text,
  is_primary boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (pg_catalog.length(coalesce(job_title, '')) <= 80),
  CHECK (pg_catalog.length(coalesce(department, '')) <= 80),
  CHECK (pg_catalog.length(coalesce(email, '')) <= 254)
);

CREATE INDEX IF NOT EXISTS customer_company_contacts_customer_updated_idx
  ON public.customer_company_contacts(customer_id, updated_at DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS customer_company_contacts_one_primary_idx
  ON public.customer_company_contacts(customer_id) WHERE is_primary;

ALTER TABLE public.customer_company_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_company_contacts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.customer_company_contacts TO authenticated;

DROP POLICY IF EXISTS customer_company_contacts_tenant_boundary ON public.customer_company_contacts;
CREATE POLICY customer_company_contacts_tenant_boundary ON public.customer_company_contacts
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id())
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS customer_company_contacts_own_read ON public.customer_company_contacts;
CREATE POLICY customer_company_contacts_own_read ON public.customer_company_contacts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = customer_company_contacts.customer_id
        AND c.organization_id = customer_company_contacts.organization_id
        AND p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.is_active = true
        AND p.organization_id = c.organization_id
    )
  );

DROP POLICY IF EXISTS customer_company_contacts_staff_read ON public.customer_company_contacts;
CREATE POLICY customer_company_contacts_staff_read ON public.customer_company_contacts
  FOR SELECT TO authenticated
  USING (
    public.is_staff()
    AND organization_id = (
      SELECT p.organization_id
      FROM public.profiles p
      WHERE p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION public.save_customer_company_contact(
  p_contact_id uuid,
  p_full_name text,
  p_job_title text,
  p_department text,
  p_phone text,
  p_email text,
  p_is_primary boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_organization_id uuid;
  v_existing public.customer_company_contacts%ROWTYPE;
  v_contact_id uuid;
  v_make_primary boolean := false;
  v_full_name text := pg_catalog.btrim(coalesce(p_full_name, ''));
  v_job_title text := nullif(pg_catalog.btrim(coalesce(p_job_title, '')), '');
  v_department text := nullif(pg_catalog.btrim(coalesce(p_department, '')), '');
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, ''))), '');
  v_changes text[] := ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  SELECT c.id, c.organization_id INTO v_customer_id, v_organization_id
  FROM public.customers c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true
    AND p.organization_id = c.organization_id
  ORDER BY c.created_at, c.id
  LIMIT 1
  FOR UPDATE OF c;

  IF v_customer_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'an active customer account is required';
  END IF;

  IF pg_catalog.length(v_full_name) NOT BETWEEN 2 AND 120
     OR pg_catalog.length(v_phone) NOT BETWEEN 7 AND 32
     OR pg_catalog.length(coalesce(v_job_title, '')) > 80
     OR pg_catalog.length(coalesce(v_department, '')) > 80
     OR pg_catalog.length(coalesce(v_email, '')) > 254
     OR (v_email IS NOT NULL AND v_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'company contact fields are invalid or exceed their allowed lengths';
  END IF;

  IF p_contact_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.customer_company_contacts c
    WHERE c.id = p_contact_id
      AND c.customer_id = v_customer_id
      AND c.organization_id = v_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company contact not found or not owned by this account';
    END IF;
    v_changes := ARRAY[]::text[];
    IF v_existing.full_name IS DISTINCT FROM v_full_name THEN v_changes := pg_catalog.array_append(v_changes, 'full_name'); END IF;
    IF v_existing.job_title IS DISTINCT FROM v_job_title THEN v_changes := pg_catalog.array_append(v_changes, 'job_title'); END IF;
    IF v_existing.department IS DISTINCT FROM v_department THEN v_changes := pg_catalog.array_append(v_changes, 'department'); END IF;
    IF v_existing.phone IS DISTINCT FROM v_phone THEN v_changes := pg_catalog.array_append(v_changes, 'phone'); END IF;
    IF v_existing.email IS DISTINCT FROM v_email THEN v_changes := pg_catalog.array_append(v_changes, 'email'); END IF;
  ELSE
    v_changes := ARRAY['full_name','job_title','department','phone','email'];
  END IF;

  IF coalesce(p_is_primary, false) THEN
    v_make_primary := true;
  ELSIF p_contact_id IS NULL THEN
    v_make_primary := NOT EXISTS (
      SELECT 1 FROM public.customer_company_contacts c WHERE c.customer_id = v_customer_id AND c.is_primary
    );
  ELSIF v_existing.is_primary THEN
    v_make_primary := true;
  ELSE
    v_make_primary := false;
  END IF;

  IF v_make_primary THEN
    UPDATE public.customer_company_contacts
    SET is_primary = false, updated_at = pg_catalog.now(), updated_by = v_profile
    WHERE customer_id = v_customer_id AND organization_id = v_organization_id
      AND id IS DISTINCT FROM p_contact_id AND is_primary = true;
  END IF;

  IF p_contact_id IS NULL THEN
    INSERT INTO public.customer_company_contacts (
      organization_id, customer_id, full_name, job_title, department, phone, email,
      is_primary, created_by, updated_by
    )
    VALUES (
      v_organization_id, v_customer_id, v_full_name, v_job_title, v_department, v_phone, v_email,
      v_make_primary, v_profile, v_profile
    )
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.customer_company_contacts
    SET full_name = v_full_name, job_title = v_job_title, department = v_department,
        phone = v_phone, email = v_email, is_primary = v_make_primary,
        updated_at = pg_catalog.now(), updated_by = v_profile
    WHERE id = p_contact_id AND customer_id = v_customer_id AND organization_id = v_organization_id
    RETURNING id INTO v_contact_id;
    IF v_contact_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company contact could not be updated';
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, v_profile,
    CASE WHEN p_contact_id IS NULL THEN 'customer_company_contact.created' ELSE 'customer_company_contact.updated' END,
    'customer_company_contact', v_contact_id,
    CASE WHEN p_contact_id IS NULL THEN NULL
      ELSE pg_catalog.jsonb_build_object('fields_changed', to_jsonb(v_changes), 'is_primary', v_existing.is_primary) END,
    pg_catalog.jsonb_build_object('fields_changed', to_jsonb(v_changes), 'is_primary', v_make_primary),
    pg_catalog.now()
  );
  RETURN v_contact_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_customer_company_contact(p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_organization_id uuid;
  v_was_primary boolean;
  v_replacement_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;

  SELECT c.id, c.organization_id INTO v_customer_id, v_organization_id
  FROM public.customers c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.id = v_profile
    AND p.auth_user_id = auth.uid()
    AND p.is_active = true
    AND p.organization_id = c.organization_id
  ORDER BY c.created_at, c.id
  LIMIT 1
  FOR UPDATE OF c;

  IF v_customer_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'an active customer account is required';
  END IF;

  DELETE FROM public.customer_company_contacts c
  WHERE c.id = p_contact_id AND c.customer_id = v_customer_id AND c.organization_id = v_organization_id
  RETURNING c.is_primary INTO v_was_primary;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company contact not found or not owned by this account';
  END IF;

  IF v_was_primary THEN
    SELECT c.id INTO v_replacement_id
    FROM public.customer_company_contacts c
    WHERE c.customer_id = v_customer_id AND c.organization_id = v_organization_id
    ORDER BY c.updated_at DESC, c.created_at DESC, c.id DESC
    LIMIT 1
    FOR UPDATE;
    IF v_replacement_id IS NOT NULL THEN
      UPDATE public.customer_company_contacts
      SET is_primary = true, updated_at = pg_catalog.now(), updated_by = v_profile
      WHERE id = v_replacement_id AND customer_id = v_customer_id;
      INSERT INTO public.audit_logs (
        organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
      ) VALUES (
        v_organization_id, v_profile, 'customer_company_contact.primary_changed',
        'customer_company_contact', v_replacement_id,
        pg_catalog.jsonb_build_object('is_primary', false),
        pg_catalog.jsonb_build_object('is_primary', true), pg_catalog.now()
      );
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, v_profile, 'customer_company_contact.deleted', 'customer_company_contact',
    p_contact_id, pg_catalog.jsonb_build_object('is_primary', v_was_primary), NULL, pg_catalog.now()
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_customer_company_contact(uuid,text,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_company_contact(uuid,text,text,text,text,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_customer_company_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_customer_company_contact(uuid) TO authenticated;

DO $block$
DECLARE v_column text;
BEGIN
  FOR v_column IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_company_contacts'
  LOOP
    IF has_column_privilege('authenticated', 'public.customer_company_contacts', v_column, 'INSERT')
       OR has_column_privilege('authenticated', 'public.customer_company_contacts', v_column, 'UPDATE') THEN
      RAISE EXCEPTION 'authenticated must not receive direct write privileges on customer_company_contacts.%', v_column;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.customer_company_contacts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customer_company_contacts', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_company_contacts', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must not receive direct table write privileges on customer_company_contacts';
  END IF;
END
$block$;

COMMENT ON TABLE public.customer_company_contacts IS
  'Customer-owned operational contacts. These entries are not authentication accounts or application role assignments.';
COMMENT ON FUNCTION public.save_customer_company_contact(uuid,text,text,text,text,text,boolean) IS
  'Creates or updates one company contact under the authenticated customer profile, with tenant checks, primary-contact lifecycle and a privacy-minimizing audit record.';
