-- Browser roles may read stock, but only server-owned commands may alter balances or movement history.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inventory_balances FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.inventory_movements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.inventory_balances TO authenticated;
GRANT SELECT ON TABLE public.inventory_movements TO authenticated;

CREATE OR REPLACE FUNCTION public.set_inventory_reorder_point(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_reorder_point integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
  v_product public.products%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_new_available numeric(15,3);
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to change reorder point';
  END IF;
  IF p_product_id IS NULL OR p_warehouse_id IS NULL
     OR p_reorder_point IS NULL OR p_reorder_point<0 OR p_reorder_point>1000000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='reorder point must be an integer between zero and one billion';
  END IF;
  IF v_reason IS NULL OR pg_catalog.char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a reason between 1 and 1000 characters is required';
  END IF;
  SELECT p.* INTO v_product
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=v_org AND p.status='active'
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='product is unavailable in this organization';
  END IF;
  PERFORM 1 FROM public.warehouses w
   WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active
   FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='warehouse is unavailable in this organization';
  END IF;
  SELECT ib.* INTO v_balance
    FROM public.inventory_balances ib
   WHERE ib.product_id=p_product_id AND ib.warehouse_id=p_warehouse_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='no verified inventory balance exists for this product and warehouse';
  END IF;
  IF v_balance.reorder_point IS NOT DISTINCT FROM p_reorder_point THEN
    RETURN pg_catalog.jsonb_build_object(
      'balance_id',v_balance.id,'product_id',p_product_id,'warehouse_id',p_warehouse_id,
      'previous_reorder_point',v_balance.reorder_point,'reorder_point',p_reorder_point,
      'quantity_available',v_balance.quantity_available,'unchanged',true
    );
  END IF;
  UPDATE public.inventory_balances
     SET reorder_point=p_reorder_point,updated_at=pg_catalog.now()
   WHERE id=v_balance.id
   RETURNING quantity_available INTO v_new_available;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'inventory.reorder_point.updated','inventory_balance',v_balance.id,
    pg_catalog.jsonb_build_object('reorder_point',v_balance.reorder_point),
    pg_catalog.jsonb_build_object('reorder_point',p_reorder_point,'reason',v_reason,
      'product_id',p_product_id,'warehouse_id',p_warehouse_id,'quantity_available',v_new_available));
  RETURN pg_catalog.jsonb_build_object(
    'balance_id',v_balance.id,'product_id',p_product_id,'warehouse_id',p_warehouse_id,
    'previous_reorder_point',v_balance.reorder_point,'reorder_point',p_reorder_point,
    'quantity_available',v_new_available,'unchanged',false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.set_inventory_reorder_point(uuid,uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_inventory_reorder_point(uuid,uuid,integer,text) TO authenticated;
COMMENT ON FUNCTION public.set_inventory_reorder_point(uuid,uuid,integer,text) IS
  'Manager-authorized reorder-point update with tenant validation, existing-balance requirement, operational task trigger and audit log.';
