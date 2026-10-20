-- Record the preparation of the Onyx XLSX export server-side.
-- The browser builds the OOXML bytes, so this event deliberately does not claim
-- that the browser completed a download or that the target Onyx version accepted the file.
CREATE OR REPLACE FUNCTION public.record_onyx_order_export(
  p_order_id uuid,
  p_item_count integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_order public.orders%ROWTYPE;
  v_item_count integer;
  v_audit_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff permission required to prepare an Onyx export';
  END IF;

  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization is required';
  END IF;

  IF p_order_id IS NULL OR p_item_count IS NULL OR p_item_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='valid order and item count are required';
  END IF;

  SELECT o.*
    INTO v_order
    FROM public.orders o
   WHERE o.id=p_order_id
     AND o.organization_id=v_org
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='order not found in the active organization';
  END IF;

  IF v_order.status NOT IN ('confirmed','processing','shipped','delivered')
     OR coalesce(v_order.quantity_review_required,false) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only approved orders may be prepared for Onyx export';
  END IF;

  SELECT count(*)::integer
    INTO v_item_count
    FROM public.order_items oi
   WHERE oi.order_id=v_order.id;

  IF v_item_count < 1 OR p_item_count <> v_item_count THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='export item count does not match the persisted order';
  END IF;

  INSERT INTO public.audit_logs (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value,
    created_at
  ) VALUES (
    v_org,
    v_actor,
    'onyx_export.prepared',
    'order',
    v_order.id,
    NULL,
    pg_catalog.jsonb_build_object(
      'format', 'xlsx',
      'profile', 'onyx-order-27/v1',
      'column_count', 27,
      'item_count', v_item_count,
      'order_number', v_order.order_number,
      'order_status', v_order.status,
      'compatibility_verified', false,
      'download_completion_verified', false,
      'generated_at', pg_catalog.now()
    ),
    pg_catalog.now()
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_onyx_order_export(uuid,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_onyx_order_export(uuid,integer) TO authenticated;

COMMENT ON FUNCTION public.record_onyx_order_export(uuid,integer) IS
  'Writes a tenant-scoped audit record after the client prepares the canonical Onyx XLSX. It does not assert browser download completion or target Onyx import acceptance.';
