-- Keep the public storefront working while deriving its single-merchant scope on the server.
-- This publication config stores the tenant binding in the database; the browser never chooses an organization.
CREATE TABLE IF NOT EXISTS public.storefront_publication_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.storefront_publication_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storefront_publication_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.storefront_publication_config TO service_role;

-- Bind the public hostname to the canonical Aghbari organization already seeded by the original schema.
-- ON CONFLICT preserves a deliberate later admin/service-role selection.
INSERT INTO public.storefront_publication_config(singleton, organization_id, warehouse_id, is_enabled)
SELECT true, org.id, wh.id, true
FROM public.organizations AS org
LEFT JOIN LATERAL (
  SELECT w.id
  FROM public.warehouses AS w
  WHERE w.organization_id = org.id AND w.is_active = true
  ORDER BY CASE WHEN w.id = 'd0000000-0000-0000-0000-000000000001'::uuid THEN 0 ELSE 1 END,
           w.created_at ASC, w.id ASC
  LIMIT 1
) AS wh ON true
WHERE org.id = 'a0000000-0000-0000-0000-000000000001'::uuid
  AND org.is_active = true
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION public.public_storefront_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT c.organization_id
  FROM public.storefront_publication_config AS c
  JOIN public.organizations AS org ON org.id = c.organization_id AND org.is_active = true
  WHERE c.singleton = true AND c.is_enabled = true
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.public_storefront_warehouse_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT c.warehouse_id
  FROM public.storefront_publication_config AS c
  JOIN public.organizations AS org ON org.id = c.organization_id AND org.is_active = true
  WHERE c.singleton = true AND c.is_enabled = true
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.public_storefront_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_storefront_warehouse_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_storefront_organization_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_storefront_warehouse_id() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_storefront_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid;
  v_warehouse_id uuid;
BEGIN
  SELECT c.organization_id, c.warehouse_id
    INTO v_organization_id, v_warehouse_id
  FROM public.storefront_publication_config AS c
  JOIN public.organizations AS org ON org.id = c.organization_id AND org.is_active = true
  WHERE c.singleton = true AND c.is_enabled = true
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Public storefront tenant is not configured';
  END IF;

  RETURN jsonb_build_object(
    'organization_id', v_organization_id,
    'warehouse_id', v_warehouse_id
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_public_storefront_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_context() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_storefront_settings()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_settings jsonb;
BEGIN
  IF public.public_storefront_organization_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Public storefront tenant is not configured';
  END IF;

  SELECT COALESCE(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
    INTO v_settings
  FROM public.admin_settings AS s
  WHERE s.organization_id = public.public_storefront_organization_id()
    AND s.key IN ('theme_primary', 'theme_accent', 'hero_title', 'hero_subtitle', 'store_name', 'store_tagline', 'store_phone', 'store_email', 'store_address', 'ticker_enabled', 'ticker_messages');

  RETURN v_settings;
END
$function$;

REVOKE ALL ON FUNCTION public.get_public_storefront_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_settings() TO anon, authenticated;

-- The authenticated resolver now also emits a role claim derived from database roles.
CREATE OR REPLACE FUNCTION public.get_current_tenant_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_warehouse_id uuid;
  v_is_staff boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;

  SELECT p.id, p.organization_id,
         EXISTS (
           SELECT 1 FROM public.user_roles AS r
           WHERE r.profile_id = p.id
             AND r.role IN ('admin', 'manager', 'staff', 'accountant')
         )
    INTO v_profile_id, v_organization_id, v_is_staff
  FROM public.profiles AS p
  WHERE p.auth_user_id = auth.uid() AND p.is_active = true
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An active profile is required';
  END IF;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The profile has no organization scope';
  END IF;

  SELECT w.id INTO v_warehouse_id
  FROM public.warehouses AS w
  WHERE w.organization_id = v_organization_id AND w.is_active = true
  ORDER BY w.created_at ASC, w.id ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'organization_id', v_organization_id,
    'warehouse_id', v_warehouse_id,
    'is_staff', COALESCE(v_is_staff, false)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_current_tenant_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_context() TO authenticated;

-- organizations uses its primary key as tenant identity rather than an organization_id column.
-- Restrict authenticated reads/writes so the legacy staff_all_organizations policy cannot cross tenants.
DROP POLICY IF EXISTS tenant_org_scope_organizations ON public.organizations;
CREATE POLICY tenant_org_scope_organizations
  ON public.organizations AS RESTRICTIVE FOR ALL TO authenticated
  USING (id = public.current_organization_id())
  WITH CHECK (id = public.current_organization_id());

-- Restrict anonymous catalog reads even when the original broad public_read_* policies exist.
DO $block$
DECLARE
  v_table text;
  v_predicate text;
  v_policy text;
BEGIN
  FOR v_table, v_predicate IN
    SELECT rule.table_name, rule.predicate
    FROM (VALUES
      ('organizations', 'id = public.public_storefront_organization_id()'),
      ('warehouses', 'id = public.public_storefront_warehouse_id() AND organization_id = public.public_storefront_organization_id()'),
      ('categories', 'organization_id = public.public_storefront_organization_id()'),
      ('products', 'organization_id = public.public_storefront_organization_id()'),
      ('product_media', 'EXISTS (SELECT 1 FROM public.products AS p WHERE p.id = product_media.product_id AND p.organization_id = public.public_storefront_organization_id())'),
      ('product_prices', 'EXISTS (SELECT 1 FROM public.products AS p WHERE p.id = product_prices.product_id AND p.organization_id = public.public_storefront_organization_id())'),
      ('inventory_balances', '(warehouse_id = public.public_storefront_warehouse_id() AND EXISTS (SELECT 1 FROM public.products AS p WHERE p.id = inventory_balances.product_id AND p.organization_id = public.public_storefront_organization_id()))'),
      ('promotions', 'organization_id = public.public_storefront_organization_id()')
    ) AS rule(table_name, predicate)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table AND table_type = 'BASE TABLE'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
      v_policy := 'public_storefront_scope_' || v_table;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO anon USING (%s)',
        v_policy, v_table, v_predicate
      );
    END IF;
  END LOOP;
END
$block$;

-- Minimize what unauthenticated visitors can fetch at the column/relationship level.
REVOKE SELECT ON TABLE public.organizations FROM PUBLIC, anon;
REVOKE SELECT ON TABLE public.warehouses FROM PUBLIC, anon;
REVOKE SELECT ON TABLE public.product_prices FROM PUBLIC, anon;
REVOKE SELECT ON TABLE public.products FROM PUBLIC, anon;
GRANT SELECT (id, organization_id, category_id, name, item_code, barcode, description, unit, base_price, status, image_url, created_at)
  ON TABLE public.products TO anon;

REVOKE SELECT ON TABLE public.inventory_balances FROM PUBLIC, anon;
GRANT SELECT (id, product_id, warehouse_id, quantity_on_hand, quantity_available)
  ON TABLE public.inventory_balances TO anon;

-- Do not expose private admin settings through the old broad storefront helper.
REVOKE SELECT ON TABLE public.admin_settings FROM PUBLIC, anon;
