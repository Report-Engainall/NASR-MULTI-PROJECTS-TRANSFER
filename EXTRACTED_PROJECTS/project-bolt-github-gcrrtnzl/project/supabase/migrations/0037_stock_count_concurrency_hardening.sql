-- Harden stock-count lifecycle against concurrent starts/updates/completion.
-- A stock-count session is a singleton per organization+warehouse while open.

CREATE UNIQUE INDEX IF NOT EXISTS stock_count_one_open_per_warehouse_idx
  ON public.stock_count_sessions(organization_id, warehouse_id)
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.start_stock_count(
  p_warehouse_id uuid,
  p_idempotency_key text,
  p_notes text DEFAULT NULL
)
RETURNS public.stock_count_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_session public.stock_count_sessions%rowtype;
  v_existing public.stock_count_sessions%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','warehouse') THEN
    RAISE EXCEPTION USING errcode='42501', message='stock count access required';
  END IF;
  IF nullif(trim(p_idempotency_key),'') IS NULL THEN
    RAISE EXCEPTION USING errcode='22023', message='idempotency key required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id=p_warehouse_id AND organization_id=v_org AND is_active
  ) THEN
    RAISE EXCEPTION USING errcode='P0002', message='warehouse not found';
  END IF;

  -- Serialize starts for the same warehouse so the application-level open-session
  -- check cannot race. The partial unique index remains the database invariant.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_org::text || ':stock-count:' || p_warehouse_id::text, 0)
  );

  SELECT * INTO v_existing
  FROM public.stock_count_sessions
  WHERE organization_id=v_org AND idempotency_key=trim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.warehouse_id <> p_warehouse_id THEN
      RAISE EXCEPTION USING errcode='23505', message='idempotency key is already bound to another warehouse';
    END IF;
    RETURN v_existing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.stock_count_sessions
    WHERE organization_id=v_org AND warehouse_id=p_warehouse_id AND status='open'
  ) THEN
    RAISE EXCEPTION USING errcode='55006', message='an open stock count already exists for this warehouse';
  END IF;

  INSERT INTO public.stock_count_sessions(
    organization_id,warehouse_id,idempotency_key,started_by,notes
  ) VALUES (
    v_org,p_warehouse_id,trim(p_idempotency_key),auth.uid(),nullif(trim(p_notes),'')
  ) RETURNING * INTO v_session;

  INSERT INTO public.stock_count_lines(
    organization_id,session_id,product_id,expected_quantity
  )
  SELECT v_org,v_session.id,p.id,coalesce(b.quantity,0)
  FROM public.products p
  LEFT JOIN public.inventory_balances b
    ON b.organization_id=v_org
   AND b.warehouse_id=p_warehouse_id
   AND b.product_id=p.id
  WHERE p.organization_id=v_org AND p.status='active';

  INSERT INTO public.audit_events(
    organization_id,actor_id,action,target_type,target_id,result,metadata
  ) VALUES (
    v_org,auth.uid(),'stock_count.start','stock_count',v_session.id,'success',
    jsonb_build_object(
      'warehouse_id',p_warehouse_id,
      'line_count',(SELECT count(*) FROM public.stock_count_lines WHERE session_id=v_session.id)
    )
  );
  RETURN v_session;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_stock_count_line(
  p_session_id uuid,
  p_product_id uuid,
  p_counted_quantity integer
)
RETURNS public.stock_count_lines
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid := public.current_organization_id();
  v_role public.user_role := public.current_role();
  v_session public.stock_count_sessions%rowtype;
  v_line public.stock_count_lines%rowtype;
BEGIN
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','warehouse') THEN
    RAISE EXCEPTION USING errcode='42501', message='stock count access required';
  END IF;
  IF p_counted_quantity IS NULL OR p_counted_quantity < 0 THEN
    RAISE EXCEPTION USING errcode='22023', message='counted quantity must be zero or greater';
  END IF;

  -- Lock the session before changing a line. Completion locks the same session row,
  -- so a line cannot be updated after the session has been completed.
  SELECT * INTO v_session
  FROM public.stock_count_sessions
  WHERE id=p_session_id AND organization_id=v_org
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='P0002', message='stock count not found';
  END IF;
  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION USING errcode='22023', message='stock count is not open';
  END IF;

  UPDATE public.stock_count_lines
  SET counted_quantity=p_counted_quantity,counted_at=now()
  WHERE session_id=p_session_id
    AND organization_id=v_org
    AND product_id=p_product_id
  RETURNING * INTO v_line;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='P0002', message='stock count line not found';
  END IF;
  RETURN v_line;
END;
$$;

REVOKE ALL ON FUNCTION public.start_stock_count(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_stock_count_line(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_stock_count(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_stock_count_line(uuid,uuid,integer) TO authenticated;

COMMENT ON INDEX public.stock_count_one_open_per_warehouse_idx
IS 'Enforces at most one open stock-count session per organization and warehouse.';
