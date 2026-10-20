-- Atomic, tenant-authorized price-grid writes with stale-value checks and per-product audit.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_product_price_grid(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_profile_id uuid := public.current_profile_id();
  v_item jsonb;
  v_id uuid;
  v_old_base numeric;
  v_old_ww numeric;
  v_old_wholesale numeric;
  v_old_retail numeric;
  v_expected_base numeric;
  v_expected_ww numeric;
  v_expected_wholesale numeric;
  v_expected_retail numeric;
  v_new_base numeric;
  v_new_ww numeric;
  v_new_wholesale numeric;
  v_new_retail numeric;
  v_count integer := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    JOIN public.user_roles AS r ON r.profile_id = p.id
    WHERE p.id = v_profile_id
      AND p.organization_id = v_organization_id
      AND p.auth_user_id = auth.uid()
      AND p.is_active = true
      AND r.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Price grid updates require an active admin or manager in this organization';
  END IF;
  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array'
     OR jsonb_array_length(p_changes) < 1 OR jsonb_array_length(p_changes) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Price grid batch must contain between 1 and 200 products';
  END IF;
  IF (
    SELECT count(DISTINCT (value ->> 'id')::uuid)
    FROM jsonb_array_elements(p_changes)
  ) <> jsonb_array_length(p_changes) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Price grid batch contains duplicate product ids';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    IF jsonb_typeof(v_item) <> 'object'
      OR jsonb_object_length(v_item) <> 9
      OR NOT (v_item ?& ARRAY[
        'id','expected_base_price','expected_price_wholesale_of_wholesale',
        'expected_price_wholesale','expected_price_retail','base_price',
        'price_wholesale_of_wholesale','price_wholesale','price_retail'
      ])
      OR jsonb_typeof(v_item -> 'id') <> 'string'
      OR jsonb_typeof(v_item -> 'expected_base_price') <> 'number'
      OR jsonb_typeof(v_item -> 'expected_price_wholesale_of_wholesale') <> 'number'
      OR jsonb_typeof(v_item -> 'expected_price_wholesale') <> 'number'
      OR jsonb_typeof(v_item -> 'expected_price_retail') <> 'number'
      OR jsonb_typeof(v_item -> 'base_price') <> 'number'
      OR jsonb_typeof(v_item -> 'price_wholesale_of_wholesale') <> 'number'
      OR jsonb_typeof(v_item -> 'price_wholesale') <> 'number'
      OR jsonb_typeof(v_item -> 'price_retail') <> 'number' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Each price row must contain exactly the id, four expected values and four new numeric prices';
    END IF;
    v_id := (v_item ->> 'id')::uuid;
    v_expected_base := (v_item ->> 'expected_base_price')::numeric;
    v_expected_ww := (v_item ->> 'expected_price_wholesale_of_wholesale')::numeric;
    v_expected_wholesale := (v_item ->> 'expected_price_wholesale')::numeric;
    v_expected_retail := (v_item ->> 'expected_price_retail')::numeric;
    v_new_base := (v_item ->> 'base_price')::numeric;
    v_new_ww := (v_item ->> 'price_wholesale_of_wholesale')::numeric;
    v_new_wholesale := (v_item ->> 'price_wholesale')::numeric;
    v_new_retail := (v_item ->> 'price_retail')::numeric;
    IF least(v_new_base,v_new_ww,v_new_wholesale,v_new_retail) < 0
      OR v_new_base > 999999999999 OR v_new_ww > 999999999999
      OR v_new_wholesale > 999999999999 OR v_new_retail > 999999999999
      OR round(v_new_base,2) <> v_new_base OR round(v_new_ww,2) <> v_new_ww
      OR round(v_new_wholesale,2) <> v_new_wholesale OR round(v_new_retail,2) <> v_new_retail THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Prices must be non-negative, no greater than 999999999999, with at most two decimal places';
    END IF;
    SELECT p.base_price,p.price_wholesale_of_wholesale,p.price_wholesale,p.price_retail
      INTO v_old_base,v_old_ww,v_old_wholesale,v_old_retail
    FROM public.products AS p
    WHERE p.id=v_id AND p.organization_id=v_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Product not found in current organization';
    END IF;
    IF v_old_base IS DISTINCT FROM v_expected_base
      OR v_old_ww IS DISTINCT FROM v_expected_ww
      OR v_old_wholesale IS DISTINCT FROM v_expected_wholesale
      OR v_old_retail IS DISTINCT FROM v_expected_retail THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'A product price changed after the grid was loaded; reload and review the current values';
    END IF;
    UPDATE public.products AS p
    SET base_price=v_new_base,
        price_wholesale_of_wholesale=v_new_ww,
        price_wholesale=v_new_wholesale,
        price_retail=v_new_retail
    WHERE p.id=v_id AND p.organization_id=v_organization_id;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES (
      v_organization_id,v_profile_id,'product.price_grid_updated','product',v_id,
      jsonb_build_object('base_price',v_old_base,'price_wholesale_of_wholesale',v_old_ww,'price_wholesale',v_old_wholesale,'price_retail',v_old_retail),
      jsonb_build_object('base_price',v_new_base,'price_wholesale_of_wholesale',v_new_ww,'price_wholesale',v_new_wholesale,'price_retail',v_new_retail)
    );
    v_count := v_count + 1;
    v_ids := array_append(v_ids,v_id);
  END LOOP;
  RETURN jsonb_build_object('updated_count',v_count,'product_ids',to_jsonb(v_ids));
END
$function$;

REVOKE ALL ON FUNCTION public.save_product_price_grid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_product_price_grid(jsonb) TO authenticated;
COMMENT ON FUNCTION public.save_product_price_grid(jsonb) IS
  'Applies one bounded, tenant-checked, stale-safe atomic price grid transaction; only active admin/manager writes are accepted and each product row is audited.';
COMMIT;
