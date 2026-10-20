-- Correct the price-grid command to operate on the real products/product_prices schema.
-- The original migration introduced the RPC contract; this migration replaces its
-- implementation without rewriting migration history.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_admin_product_price_grid()
RETURNS TABLE (
  id uuid, name text, item_code text, unit text, is_active boolean, base_price numeric,
  price_wholesale_of_wholesale numeric, price_wholesale numeric, price_retail numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_profile_id uuid := public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    JOIN public.user_roles AS r ON r.profile_id=p.id
    WHERE p.id=v_profile_id AND p.organization_id=v_organization_id
      AND p.auth_user_id=auth.uid() AND p.is_active=true AND r.role IN ('admin','manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Price grid reads require an active admin or manager in this organization';
  END IF;
  RETURN QUERY
  SELECT p.id,p.name,p.item_code,p.unit,(p.status='active'),p.base_price,
    coalesce((SELECT pp.price FROM public.product_prices AS pp WHERE pp.product_id=p.id AND pp.tier='vip' AND pp.is_active ORDER BY pp.min_quantity ASC LIMIT 1),p.base_price),
    coalesce((SELECT pp.price FROM public.product_prices AS pp WHERE pp.product_id=p.id AND pp.tier='wholesale' AND pp.is_active ORDER BY pp.min_quantity ASC LIMIT 1),p.wholesale_price),
    coalesce((SELECT pp.price FROM public.product_prices AS pp WHERE pp.product_id=p.id AND pp.tier='retail' AND pp.is_active ORDER BY pp.min_quantity ASC LIMIT 1),p.retail_price)
  FROM public.products AS p
  WHERE p.organization_id=v_organization_id
  ORDER BY p.name,p.item_code,p.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.save_product_price_grid(p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid:=public.current_organization_id();
  v_profile_id uuid:=public.current_profile_id();
  v_item jsonb;
  v_product_id uuid;
  v_product public.products%ROWTYPE;
  v_old_base numeric; v_old_vip numeric; v_old_wholesale numeric; v_old_retail numeric;
  v_expected_base numeric; v_expected_vip numeric; v_expected_wholesale numeric; v_expected_retail numeric;
  v_new_base numeric; v_new_vip numeric; v_new_wholesale numeric; v_new_retail numeric;
  v_vip_min integer; v_wholesale_min integer; v_retail_min integer;
  v_vip_found boolean; v_wholesale_found boolean; v_retail_found boolean;
  v_old jsonb; v_new jsonb;
  v_count integer:=0;
  v_ids uuid[]:=ARRAY[]::uuid[];
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p JOIN public.user_roles AS r ON r.profile_id=p.id
    WHERE p.id=v_profile_id AND p.organization_id=v_organization_id AND p.auth_user_id=auth.uid()
      AND p.is_active=true AND r.role IN ('admin','manager')
  ) THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Price grid updates require an active admin or manager in this organization'; END IF;

  IF p_changes IS NULL OR jsonb_typeof(p_changes)<>'array' OR jsonb_array_length(p_changes)<1 OR jsonb_array_length(p_changes)>200 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Price grid batch must contain between 1 and 200 products';
  END IF;
  IF (SELECT count(DISTINCT (value->>'id')::uuid) FROM jsonb_array_elements(p_changes))<>jsonb_array_length(p_changes) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Price grid batch contains duplicate product ids';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_changes)
  LOOP
    IF jsonb_typeof(v_item)<>'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(v_item))<>9
      OR NOT (v_item ?& ARRAY['id','expected_base_price','expected_price_wholesale_of_wholesale','expected_price_wholesale','expected_price_retail','base_price','price_wholesale_of_wholesale','price_wholesale','price_retail'])
      OR jsonb_typeof(v_item->'id')<>'string'
      OR jsonb_typeof(v_item->'expected_base_price')<>'number'
      OR jsonb_typeof(v_item->'expected_price_wholesale_of_wholesale')<>'number'
      OR jsonb_typeof(v_item->'expected_price_wholesale')<>'number'
      OR jsonb_typeof(v_item->'expected_price_retail')<>'number'
      OR jsonb_typeof(v_item->'base_price')<>'number'
      OR jsonb_typeof(v_item->'price_wholesale_of_wholesale')<>'number'
      OR jsonb_typeof(v_item->'price_wholesale')<>'number'
      OR jsonb_typeof(v_item->'price_retail')<>'number' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Price row has an invalid JSON schema';
    END IF;

    v_product_id:=(v_item->>'id')::uuid;
    v_expected_base:=(v_item->>'expected_base_price')::numeric;
    v_expected_vip:=(v_item->>'expected_price_wholesale_of_wholesale')::numeric;
    v_expected_wholesale:=(v_item->>'expected_price_wholesale')::numeric;
    v_expected_retail:=(v_item->>'expected_price_retail')::numeric;
    v_new_base:=(v_item->>'base_price')::numeric;
    v_new_vip:=(v_item->>'price_wholesale_of_wholesale')::numeric;
    v_new_wholesale:=(v_item->>'price_wholesale')::numeric;
    v_new_retail:=(v_item->>'price_retail')::numeric;

    IF least(v_expected_base,v_expected_vip,v_expected_wholesale,v_expected_retail,v_new_base,v_new_vip,v_new_wholesale,v_new_retail)<0
      OR greatest(v_new_base,v_new_vip,v_new_wholesale,v_new_retail)>999999999999
      OR round(v_new_base,2)<>v_new_base OR round(v_new_vip,2)<>v_new_vip
      OR round(v_new_wholesale,2)<>v_new_wholesale OR round(v_new_retail,2)<>v_new_retail THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Prices must be non-negative and have no more than two decimal places';
    END IF;

    SELECT p.* INTO v_product FROM public.products AS p
    WHERE p.id=v_product_id AND p.organization_id=v_organization_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='Product not found in current organization'; END IF;

    v_old_base:=v_product.base_price;
    SELECT pp.price,pp.min_quantity INTO v_old_vip,v_vip_min FROM public.product_prices AS pp
      WHERE pp.product_id=v_product_id AND pp.tier='vip' AND pp.is_active ORDER BY pp.min_quantity ASC LIMIT 1 FOR UPDATE;
    v_vip_found:=FOUND;
    IF NOT v_vip_found THEN v_old_vip:=v_product.base_price; END IF;
    SELECT pp.price,pp.min_quantity INTO v_old_wholesale,v_wholesale_min FROM public.product_prices AS pp
      WHERE pp.product_id=v_product_id AND pp.tier='wholesale' AND pp.is_active ORDER BY pp.min_quantity ASC LIMIT 1 FOR UPDATE;
    v_wholesale_found:=FOUND;
    IF NOT v_wholesale_found THEN v_old_wholesale:=v_product.wholesale_price; END IF;
    SELECT pp.price,pp.min_quantity INTO v_old_retail,v_retail_min FROM public.product_prices AS pp
      WHERE pp.product_id=v_product_id AND pp.tier='retail' AND pp.is_active ORDER BY pp.min_quantity ASC LIMIT 1 FOR UPDATE;
    v_retail_found:=FOUND;
    IF NOT v_retail_found THEN v_old_retail:=v_product.retail_price; END IF;

    IF v_old_base IS DISTINCT FROM v_expected_base OR v_old_vip IS DISTINCT FROM v_expected_vip
      OR v_old_wholesale IS DISTINCT FROM v_expected_wholesale OR v_old_retail IS DISTINCT FROM v_expected_retail THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='A product price changed after the grid was loaded; reload and review current values';
    END IF;

    v_old:=jsonb_build_object('base_price',v_old_base,'price_wholesale_of_wholesale',v_old_vip,'price_wholesale',v_old_wholesale,'price_retail',v_old_retail);
    IF v_new_base IS DISTINCT FROM v_old_base THEN
      UPDATE public.products SET base_price=v_new_base WHERE id=v_product_id AND organization_id=v_organization_id;
    END IF;
    IF v_new_vip IS DISTINCT FROM v_old_vip THEN
      IF NOT v_vip_found THEN
        SELECT pp.min_quantity INTO v_vip_min FROM public.product_prices AS pp WHERE pp.product_id=v_product_id AND pp.tier='vip' ORDER BY pp.min_quantity ASC LIMIT 1 FOR UPDATE;
        IF FOUND THEN
          UPDATE public.product_prices SET price=v_new_vip,is_active=true WHERE product_id=v_product_id AND tier='vip' AND min_quantity=v_vip_min;
        ELSE
          INSERT INTO public.product_prices(product_id,tier,price,min_quantity,is_active) VALUES(v_product_id,'vip',v_new_vip,1,true);
        END IF;
      ELSE
        UPDATE public.product_prices SET price=v_new_vip WHERE product_id=v_product_id AND tier='vip' AND min_quantity=v_vip_min AND is_active;
      END IF;
    END IF;
    IF v_new_wholesale IS DISTINCT FROM v_old_wholesale THEN
      IF NOT v_wholesale_found THEN
        SELECT pp.min_quantity INTO v_wholesale_min FROM public.product_prices AS pp WHERE pp.product_id=v_product_id AND pp.tier='wholesale' ORDER BY pp.min_quantity ASC LIMIT 1 FOR UPDATE;
        IF FOUND THEN
          UPDATE public.product_prices SET price=v_new_wholesale,is_active=true WHERE product_id=v_product_id AND tier='wholesale' AND min_quantity=v_wholesale_min;
        ELSE
          INSERT INTO public.product_prices(product_id,tier,price,min_quantity,is_active) VALUES(v_product_id,'wholesale',v_new_wholesale,1,true);
        END IF;
      ELSE
        UPDATE public.product_prices SET price=v_new_wholesale WHERE product_id=v_product_id AND tier='wholesale' AND min_quantity=v_wholesale_min AND is_active;
      END IF;
    END IF;
    IF v_new_retail IS DISTINCT FROM v_old_retail THEN
      IF NOT v_retail_found THEN
        SELECT pp.min_quantity INTO v_retail_min FROM public.product_prices AS pp WHERE pp.product_id=v_product_id AND pp.tier='retail' ORDER BY pp.min_quantity ASC LIMIT 1 FOR UPDATE;
        IF FOUND THEN
          UPDATE public.product_prices SET price=v_new_retail,is_active=true WHERE product_id=v_product_id AND tier='retail' AND min_quantity=v_retail_min;
        ELSE
          INSERT INTO public.product_prices(product_id,tier,price,min_quantity,is_active) VALUES(v_product_id,'retail',v_new_retail,1,true);
        END IF;
      ELSE
        UPDATE public.product_prices SET price=v_new_retail WHERE product_id=v_product_id AND tier='retail' AND min_quantity=v_retail_min AND is_active;
      END IF;
    END IF;
    v_new:=jsonb_build_object('base_price',v_new_base,'price_wholesale_of_wholesale',v_new_vip,'price_wholesale',v_new_wholesale,'price_retail',v_new_retail);
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES(v_organization_id,v_profile_id,'product.price_grid_updated','product',v_product_id,v_old,v_new);
    v_count:=v_count+1;
    v_ids:=array_append(v_ids,v_product_id);
  END LOOP;
  RETURN jsonb_build_object('updated_count',v_count,'product_ids',to_jsonb(v_ids));
END
$function$;

REVOKE ALL ON FUNCTION public.get_admin_product_price_grid() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_product_price_grid() TO authenticated;
REVOKE ALL ON FUNCTION public.save_product_price_grid(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_product_price_grid(jsonb) TO authenticated;
COMMIT;
