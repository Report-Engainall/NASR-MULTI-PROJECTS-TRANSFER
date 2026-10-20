-- Secure tenant-scoped promotion commands; browser roles receive no direct table DML.
BEGIN;

DROP POLICY IF EXISTS "staff_all_promotions" ON public.promotions;
DROP POLICY IF EXISTS "public_read_promotions" ON public.promotions;
REVOKE ALL ON TABLE public.promotions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.promotions TO service_role;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_storefront_promotions()
RETURNS TABLE (
  id uuid, title text, description text, discount_type text, discount_value numeric,
  start_date date, end_date date, is_active boolean, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT p.id, p.title, p.description, p.discount_type, p.discount_value,
         p.start_date, p.end_date, p.is_active, p.created_at
  FROM public.promotions AS p
  WHERE p.organization_id = public.public_storefront_organization_id()
    AND p.is_active = true
    AND p.start_date <= CURRENT_DATE
    AND p.end_date >= CURRENT_DATE
  ORDER BY p.created_at DESC, p.id
  LIMIT 50
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_promotions()
RETURNS SETOF public.promotions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_profile_id uuid := public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    JOIN public.user_roles AS r ON r.profile_id = p.id
    WHERE p.id = v_profile_id AND p.auth_user_id = auth.uid()
      AND p.organization_id = v_organization_id AND p.is_active = true
      AND r.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Promotion administration requires an active admin or manager in this organization';
  END IF;
  RETURN QUERY
    SELECT p.* FROM public.promotions AS p
    WHERE p.organization_id = v_organization_id
    ORDER BY p.created_at DESC, p.id;
END
$function$;

CREATE OR REPLACE FUNCTION public.save_promotion(
  p_promotion_id uuid,
  p_title text,
  p_description text,
  p_discount_type text,
  p_discount_value numeric,
  p_product_ids uuid[],
  p_category_ids uuid[],
  p_start_date date,
  p_end_date date,
  p_is_active boolean
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_profile_id uuid := public.current_profile_id();
  v_title text := pg_catalog.btrim(coalesce(p_title, ''));
  v_description text := nullif(pg_catalog.btrim(coalesce(p_description, '')), '');
  v_row public.promotions%ROWTYPE;
  v_old jsonb;
  v_action text;
  v_id uuid := p_promotion_id;
  v_products uuid[] := coalesce(p_product_ids, ARRAY[]::uuid[]);
  v_categories uuid[] := coalesce(p_category_ids, ARRAY[]::uuid[]);
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    JOIN public.user_roles AS r ON r.profile_id = p.id
    WHERE p.id = v_profile_id AND p.auth_user_id = auth.uid()
      AND p.organization_id = v_organization_id AND p.is_active = true
      AND r.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Promotion writes require an active admin or manager in this organization';
  END IF;
  IF pg_catalog.char_length(v_title) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Promotion title must contain 1 to 120 characters';
  END IF;
  IF v_description IS NOT NULL AND pg_catalog.char_length(v_description) > 600 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Promotion description must not exceed 600 characters';
  END IF;
  IF p_discount_type IS NULL OR p_discount_type NOT IN ('percentage', 'fixed') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Promotion discount type is unsupported';
  END IF;
  IF p_discount_value IS NULL OR p_discount_value <= 0
     OR p_discount_value > 99999999.99 OR p_discount_value <> pg_catalog.round(p_discount_value, 2)
     OR (p_discount_type = 'percentage' AND p_discount_value > 100) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Promotion discount value must be positive, have at most two decimals, and percentage cannot exceed 100';
  END IF;
  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Promotion end date must be on or after its start date';
  END IF;
  IF pg_catalog.cardinality(v_products) > 500 OR pg_catalog.cardinality(v_categories) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Promotion selection is limited to 500 products and 500 categories';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(v_products) AS requested(id)
    LEFT JOIN public.products AS p ON p.id = requested.id AND p.organization_id = v_organization_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Promotion product not found in current organization';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.unnest(v_categories) AS requested(id)
    LEFT JOIN public.categories AS c ON c.id = requested.id AND c.organization_id = v_organization_id
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Promotion category not found in current organization';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.promotions(
      organization_id, title, description, discount_type, discount_value,
      product_ids, category_ids, start_date, end_date, is_active
    )
    VALUES (
      v_organization_id, v_title, v_description, p_discount_type, p_discount_value,
      v_products, v_categories, p_start_date, p_end_date, coalesce(p_is_active, false)
    )
    RETURNING * INTO v_row;
    v_id := v_row.id;
    v_action := 'promotion.created';
  ELSE
    SELECT p.* INTO v_row FROM public.promotions AS p
    WHERE p.id = v_id AND p.organization_id = v_organization_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Promotion not found in current organization';
    END IF;
    v_old := pg_catalog.to_jsonb(v_row);
    UPDATE public.promotions AS p
    SET title = v_title, description = v_description, discount_type = p_discount_type,
        discount_value = p_discount_value, product_ids = v_products, category_ids = v_categories,
        start_date = p_start_date, end_date = p_end_date,
        is_active = coalesce(p_is_active, false)
    WHERE p.id = v_id AND p.organization_id = v_organization_id
    RETURNING p.* INTO v_row;
    v_action := 'promotion.updated';
  END IF;

  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (v_organization_id, v_profile_id, v_action, 'promotion', v_id, v_old, pg_catalog.to_jsonb(v_row));
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION public.set_promotion_active(p_promotion_id uuid, p_is_active boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_organization_id uuid := public.current_organization_id();
  v_profile_id uuid := public.current_profile_id();
  v_row public.promotions%ROWTYPE;
  v_old jsonb;
  v_active boolean := coalesce(p_is_active, false);
BEGIN
  IF auth.uid() IS NULL OR v_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS p
    JOIN public.user_roles AS r ON r.profile_id = p.id
    WHERE p.id = v_profile_id AND p.auth_user_id = auth.uid()
      AND p.organization_id = v_organization_id AND p.is_active = true
      AND r.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Promotion status changes require an active admin or manager in this organization';
  END IF;
  SELECT p.* INTO v_row FROM public.promotions AS p
  WHERE p.id = p_promotion_id AND p.organization_id = v_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Promotion not found in current organization';
  END IF;
  IF v_row.is_active = v_active THEN
    RETURN v_row.id;
  END IF;
  v_old := pg_catalog.to_jsonb(v_row);
  UPDATE public.promotions AS p SET is_active = v_active
  WHERE p.id = v_row.id AND p.organization_id = v_organization_id
  RETURNING p.* INTO v_row;
  INSERT INTO public.audit_logs(organization_id, actor_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (
    v_organization_id, v_profile_id,
    CASE WHEN v_active THEN 'promotion.activated' ELSE 'promotion.deactivated' END,
    'promotion', v_row.id, v_old, pg_catalog.to_jsonb(v_row)
  );
  RETURN v_row.id;
END
$function$;

REVOKE ALL ON FUNCTION public.get_storefront_promotions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_promotions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_promotion(uuid, text, text, text, numeric, uuid[], uuid[], date, date, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_promotion_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_promotions() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_promotions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_promotion(uuid, text, text, text, numeric, uuid[], uuid[], date, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_promotion_active(uuid, boolean) TO authenticated;

COMMIT;
