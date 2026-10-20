-- Resolve tenant and warehouse scope from the authenticated profile, never from browser constants.
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.organization_id
  FROM public.profiles AS p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active = true
    AND p.organization_id IS NOT NULL
  LIMIT 1
$function$;

REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated;

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '28000', MESSAGE = 'Authentication required';
  END IF;

  SELECT p.id, p.organization_id
    INTO v_profile_id, v_organization_id
  FROM public.profiles AS p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active = true
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An active profile is required';
  END IF;
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'The profile has no organization scope';
  END IF;

  -- This is a deterministic default for legacy screens, not a permission boundary.
  -- Every query is independently restricted by tenant-aware RLS below.
  SELECT w.id
    INTO v_warehouse_id
  FROM public.warehouses AS w
  WHERE w.organization_id = v_organization_id
    AND w.is_active = true
  ORDER BY w.created_at ASC, w.id ASC
  LIMIT 1;

  RETURN jsonb_build_object(
    'profile_id', v_profile_id,
    'organization_id', v_organization_id,
    'warehouse_id', v_warehouse_id
  );
END
$function$;

REVOKE ALL ON FUNCTION public.get_current_tenant_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_context() TO authenticated;

-- Restrictive policies AND with all existing permissive policies. This prevents an old
-- broad staff_all_* or public_read_* policy from overriding the tenant boundary for
-- authenticated sessions. RLS remains enabled for every organization-owned base table.
DO $block$
DECLARE
  v_table text;
  v_policy text;
BEGIN
  FOR v_table IN
    SELECT c.table_name
    FROM information_schema.columns AS c
    JOIN information_schema.tables AS t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name = 'organization_id'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    v_policy := 'tenant_org_scope_' || v_table;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (organization_id = public.current_organization_id()) WITH CHECK (organization_id = public.current_organization_id())',
      v_policy, v_table
    );
  END LOOP;
END
$block$;

-- Tenant-scope relation tables that inherit ownership from a parent row and do not
-- carry their own organization_id column.
DO $block$
DECLARE
  v_table text;
  v_predicate text;
  v_policy text;
BEGIN
  FOR v_table, v_predicate IN
    SELECT rule.table_name, rule.predicate
    FROM (VALUES
      ('user_roles', 'EXISTS (SELECT 1 FROM public.profiles AS parent_row WHERE parent_row.id = user_roles.profile_id AND parent_row.organization_id = public.current_organization_id())'),
      ('product_media', 'EXISTS (SELECT 1 FROM public.products AS parent_row WHERE parent_row.id = product_media.product_id AND parent_row.organization_id = public.current_organization_id())'),
      ('product_prices', 'EXISTS (SELECT 1 FROM public.products AS parent_row WHERE parent_row.id = product_prices.product_id AND parent_row.organization_id = public.current_organization_id())'),
      ('price_change_log', '(EXISTS (SELECT 1 FROM public.products AS parent_row WHERE parent_row.id = price_change_log.product_id AND parent_row.organization_id = public.current_organization_id()) OR (price_change_log.product_id IS NULL AND EXISTS (SELECT 1 FROM public.profiles AS parent_row WHERE parent_row.id = price_change_log.changed_by AND parent_row.organization_id = public.current_organization_id())))'),
      ('inventory_balances', '(EXISTS (SELECT 1 FROM public.products AS parent_product WHERE parent_product.id = inventory_balances.product_id AND parent_product.organization_id = public.current_organization_id()) AND EXISTS (SELECT 1 FROM public.warehouses AS parent_warehouse WHERE parent_warehouse.id = inventory_balances.warehouse_id AND parent_warehouse.organization_id = public.current_organization_id()))'),
      ('inventory_movements', '(EXISTS (SELECT 1 FROM public.products AS parent_product WHERE parent_product.id = inventory_movements.product_id AND parent_product.organization_id = public.current_organization_id()) AND EXISTS (SELECT 1 FROM public.warehouses AS parent_warehouse WHERE parent_warehouse.id = inventory_movements.warehouse_id AND parent_warehouse.organization_id = public.current_organization_id()))'),
      ('order_items', 'EXISTS (SELECT 1 FROM public.orders AS parent_row WHERE parent_row.id = order_items.order_id AND parent_row.organization_id = public.current_organization_id())'),
      ('order_status_history', 'EXISTS (SELECT 1 FROM public.orders AS parent_row WHERE parent_row.id = order_status_history.order_id AND parent_row.organization_id = public.current_organization_id())'),
      ('import_job_rows', 'EXISTS (SELECT 1 FROM public.import_jobs AS parent_row WHERE parent_row.id = import_job_rows.import_job_id AND parent_row.organization_id = public.current_organization_id())')
    ) AS rule(table_name, predicate)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table AND table_type = 'BASE TABLE'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_table AND column_name = 'organization_id'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
      v_policy := 'tenant_relation_scope_' || v_table;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy, v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (%s) WITH CHECK (%s)',
        v_policy, v_table, v_predicate, v_predicate
      );
    END IF;
  END LOOP;
END
$block$;
