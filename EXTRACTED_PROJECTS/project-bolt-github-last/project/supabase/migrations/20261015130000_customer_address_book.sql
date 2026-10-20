-- Customer-owned delivery addresses with server-derived identity and audited writes.
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(label)) BETWEEN 1 AND 50),
  recipient_name text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(recipient_name)) BETWEEN 2 AND 120),
  phone text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(phone)) BETWEEN 7 AND 32),
  address_line1 text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(address_line1)) BETWEEN 3 AND 180),
  address_line2 text,
  city text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(city)) BETWEEN 2 AND 100),
  region text,
  postal_code text,
  country text NOT NULL DEFAULT 'YE' CHECK (country ~ '^[A-Z]{2}$'),
  delivery_instructions text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS customer_addresses_customer_updated_idx
  ON public.customer_addresses(customer_id, updated_at DESC, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS customer_addresses_one_default_per_customer_idx
  ON public.customer_addresses(customer_id) WHERE is_default;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.customer_addresses FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.customer_addresses TO authenticated;

DROP POLICY IF EXISTS customer_addresses_own_read ON public.customer_addresses;
CREATE POLICY customer_addresses_own_read ON public.customer_addresses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.customers c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = customer_addresses.customer_id
        AND c.organization_id = customer_addresses.organization_id
        AND p.id = public.current_profile_id()
        AND p.auth_user_id = auth.uid()
        AND p.is_active = true
        AND p.organization_id = c.organization_id
    )
  );

DROP POLICY IF EXISTS customer_addresses_staff_read ON public.customer_addresses;
CREATE POLICY customer_addresses_staff_read ON public.customer_addresses
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

CREATE OR REPLACE FUNCTION public.save_customer_address(
  p_address_id uuid,
  p_label text,
  p_recipient_name text,
  p_phone text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_region text,
  p_postal_code text,
  p_country text,
  p_delivery_instructions text,
  p_is_default boolean
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
  v_existing_default boolean := false;
  v_make_default boolean := false;
  v_replacement_id uuid;
  v_address_id uuid;
  v_label text := pg_catalog.btrim(coalesce(p_label, ''));
  v_recipient_name text := pg_catalog.btrim(coalesce(p_recipient_name, ''));
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
  v_address_line1 text := pg_catalog.btrim(coalesce(p_address_line1, ''));
  v_address_line2 text := nullif(pg_catalog.btrim(coalesce(p_address_line2, '')), '');
  v_city text := pg_catalog.btrim(coalesce(p_city, ''));
  v_region text := nullif(pg_catalog.btrim(coalesce(p_region, '')), '');
  v_postal_code text := nullif(pg_catalog.btrim(coalesce(p_postal_code, '')), '');
  v_country text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_country, 'YE')));
  v_delivery_instructions text := nullif(pg_catalog.btrim(coalesce(p_delivery_instructions, '')), '');
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

  IF pg_catalog.length(v_label) NOT BETWEEN 1 AND 50
     OR pg_catalog.length(v_recipient_name) NOT BETWEEN 2 AND 120
     OR pg_catalog.length(v_phone) NOT BETWEEN 7 AND 32
     OR pg_catalog.length(v_address_line1) NOT BETWEEN 3 AND 180
     OR pg_catalog.length(v_city) NOT BETWEEN 2 AND 100
     OR v_country !~ '^[A-Z]{2}$'
     OR pg_catalog.length(coalesce(v_address_line2, '')) > 180
     OR pg_catalog.length(coalesce(v_region, '')) > 100
     OR pg_catalog.length(coalesce(v_postal_code, '')) > 24
     OR pg_catalog.length(coalesce(v_delivery_instructions, '')) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'customer address fields are invalid or exceed their allowed lengths';
  END IF;

  IF p_address_id IS NOT NULL THEN
    SELECT a.is_default INTO v_existing_default
    FROM public.customer_addresses a
    WHERE a.id = p_address_id
      AND a.customer_id = v_customer_id
      AND a.organization_id = v_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer address not found or not owned by this account';
    END IF;
  END IF;

  IF coalesce(p_is_default, false) THEN
    v_make_default := true;
  ELSIF p_address_id IS NULL THEN
    v_make_default := NOT EXISTS (
      SELECT 1 FROM public.customer_addresses a WHERE a.customer_id = v_customer_id
    );
  ELSIF v_existing_default THEN
    SELECT a.id INTO v_replacement_id
    FROM public.customer_addresses a
    WHERE a.customer_id = v_customer_id AND a.id <> p_address_id
    ORDER BY a.updated_at DESC, a.created_at DESC, a.id DESC
    LIMIT 1
    FOR UPDATE;
    v_make_default := v_replacement_id IS NULL;
  ELSE
    v_make_default := NOT EXISTS (
      SELECT 1 FROM public.customer_addresses a
      WHERE a.customer_id = v_customer_id AND a.id <> p_address_id AND a.is_default = true
    );
  END IF;

  IF v_make_default THEN
    UPDATE public.customer_addresses
    SET is_default = false, updated_at = pg_catalog.now()
    WHERE customer_id = v_customer_id AND id IS DISTINCT FROM p_address_id AND is_default = true;
  END IF;

  IF p_address_id IS NULL THEN
    INSERT INTO public.customer_addresses (
      organization_id, customer_id, label, recipient_name, phone, address_line1,
      address_line2, city, region, postal_code, country, delivery_instructions, is_default
    )
    VALUES (
      v_organization_id, v_customer_id, v_label, v_recipient_name, v_phone, v_address_line1,
      v_address_line2, v_city, v_region, v_postal_code, v_country, v_delivery_instructions, v_make_default
    )
    RETURNING id INTO v_address_id;
  ELSE
    UPDATE public.customer_addresses
    SET label = v_label, recipient_name = v_recipient_name, phone = v_phone,
        address_line1 = v_address_line1, address_line2 = v_address_line2,
        city = v_city, region = v_region, postal_code = v_postal_code,
        country = v_country, delivery_instructions = v_delivery_instructions,
        is_default = v_make_default, updated_at = pg_catalog.now()
    WHERE id = p_address_id AND customer_id = v_customer_id AND organization_id = v_organization_id
    RETURNING id INTO v_address_id;
    IF v_address_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer address could not be updated';
    END IF;
  END IF;

  IF v_replacement_id IS NOT NULL AND NOT v_make_default THEN
    UPDATE public.customer_addresses
    SET is_default = true, updated_at = pg_catalog.now()
    WHERE id = v_replacement_id AND customer_id = v_customer_id;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, v_profile,
    CASE WHEN p_address_id IS NULL THEN 'customer_address.created' ELSE 'customer_address.updated' END,
    'customer_address', v_address_id,
    CASE WHEN p_address_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('is_default', v_existing_default) END,
    pg_catalog.jsonb_build_object('is_default', v_make_default), pg_catalog.now()
  );
  RETURN v_address_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_customer_address(p_address_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_organization_id uuid;
  v_was_default boolean;
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

  DELETE FROM public.customer_addresses a
  WHERE a.id = p_address_id AND a.customer_id = v_customer_id AND a.organization_id = v_organization_id
  RETURNING a.is_default INTO v_was_default;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer address not found or not owned by this account';
  END IF;

  IF v_was_default THEN
    SELECT a.id INTO v_replacement_id
    FROM public.customer_addresses a
    WHERE a.customer_id = v_customer_id
    ORDER BY a.updated_at DESC, a.created_at DESC, a.id DESC
    LIMIT 1
    FOR UPDATE;
    IF v_replacement_id IS NOT NULL THEN
      UPDATE public.customer_addresses
      SET is_default = true, updated_at = pg_catalog.now()
      WHERE id = v_replacement_id AND customer_id = v_customer_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value, created_at
  ) VALUES (
    v_organization_id, v_profile, 'customer_address.deleted', 'customer_address',
    p_address_id, pg_catalog.jsonb_build_object('is_default', v_was_default), NULL, pg_catalog.now()
  );
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_customer_address(uuid,text,text,text,text,text,text,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_address(uuid,text,text,text,text,text,text,text,text,text,text,boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.delete_customer_address(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_customer_address(uuid) TO authenticated;

DO $block$
DECLARE v_column text;
BEGIN
  FOR v_column IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_addresses'
  LOOP
    IF has_column_privilege('authenticated', 'public.customer_addresses', v_column, 'INSERT')
       OR has_column_privilege('authenticated', 'public.customer_addresses', v_column, 'UPDATE') THEN
      RAISE EXCEPTION 'authenticated must not receive direct write privileges on customer_addresses.%', v_column;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated', 'public.customer_addresses', 'INSERT')
     OR has_table_privilege('authenticated', 'public.customer_addresses', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.customer_addresses', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated must not receive direct table write privileges on customer_addresses';
  END IF;
END
$block$;
