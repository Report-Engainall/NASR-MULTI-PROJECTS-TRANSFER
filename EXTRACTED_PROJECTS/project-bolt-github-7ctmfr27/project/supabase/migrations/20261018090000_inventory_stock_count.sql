-- Physical stock-count sessions with immutable starting quantities and safe variance application.
CREATE TABLE IF NOT EXISTS public.stock_count_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
 idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
 notes text CHECK (notes IS NULL OR char_length(notes)<=1000),
 started_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 started_at timestamptz NOT NULL DEFAULT now(),
 total_lines integer NOT NULL DEFAULT 0 CHECK (total_lines>=0),
 counted_lines integer NOT NULL DEFAULT 0 CHECK (counted_lines>=0 AND counted_lines<=total_lines),
 completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 completed_at timestamptz,
 cancelled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
 cancelled_at timestamptz,
 cancellation_reason text CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason)<=1000),
 CONSTRAINT stock_count_session_org_key_unique UNIQUE (organization_id,idempotency_key),
 CONSTRAINT stock_count_session_terminal_state CHECK (
  (status='open' AND completed_at IS NULL AND cancelled_at IS NULL) OR
  (status='completed' AND completed_at IS NOT NULL AND cancelled_at IS NULL) OR
  (status='cancelled' AND cancelled_at IS NOT NULL AND completed_at IS NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_count_one_open_per_warehouse_idx
 ON public.stock_count_sessions(organization_id,warehouse_id) WHERE status='open';
CREATE INDEX IF NOT EXISTS stock_count_sessions_org_started_idx ON public.stock_count_sessions(organization_id,started_at DESC);

CREATE TABLE IF NOT EXISTS public.stock_count_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 session_id uuid NOT NULL REFERENCES public.stock_count_sessions(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
 product_code text NOT NULL,
 product_name text NOT NULL,
 unit text,
 expected_quantity numeric(15,3) NOT NULL CHECK (expected_quantity>=0),
 expected_reserved_quantity numeric(15,3) NOT NULL CHECK (expected_reserved_quantity>=0),
 expected_last_movement_at timestamptz,
 counted_quantity numeric(15,3) CHECK (counted_quantity IS NULL OR counted_quantity>=0),
 counted_at timestamptz,
 completed_quantity numeric(15,3) CHECK (completed_quantity IS NULL OR completed_quantity>=0),
 variance numeric(15,3),
 completed_at timestamptz,
 CONSTRAINT stock_count_line_session_product_unique UNIQUE (session_id,product_id)
);
CREATE INDEX IF NOT EXISTS stock_count_lines_session_product_idx ON public.stock_count_lines(session_id,product_code,product_id);

ALTER TABLE public.stock_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stock_count_sessions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.stock_count_lines FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.stock_count_sessions TO authenticated;
GRANT SELECT ON TABLE public.stock_count_lines TO authenticated;
GRANT ALL ON TABLE public.stock_count_sessions TO service_role;
GRANT ALL ON TABLE public.stock_count_lines TO service_role;
DROP POLICY IF EXISTS stock_count_sessions_tenant_read ON public.stock_count_sessions;
CREATE POLICY stock_count_sessions_tenant_read ON public.stock_count_sessions FOR SELECT TO authenticated
 USING (public.is_staff() AND organization_id=public.current_organization_id());
DROP POLICY IF EXISTS stock_count_lines_tenant_read ON public.stock_count_lines;
CREATE POLICY stock_count_lines_tenant_read ON public.stock_count_lines FOR SELECT TO authenticated
 USING (public.is_staff() AND organization_id=public.current_organization_id());

CREATE OR REPLACE FUNCTION public.start_stock_count(p_warehouse_id uuid,p_idempotency_key text,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE;
 v_existing_id uuid; v_key text := pg_catalog.btrim(coalesce(p_idempotency_key,''));
 v_notes text := nullif(pg_catalog.btrim(coalesce(p_notes,'')),''); v_line_count integer := 0;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required to start a stock count';
 END IF;
 IF p_warehouse_id IS NULL OR v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='warehouse and valid stock-count idempotency key are required';
 END IF;
 IF v_notes IS NOT NULL AND pg_catalog.char_length(v_notes)>1000 THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock-count notes cannot exceed 1000 characters';
 END IF;
 PERFORM 1 FROM public.warehouses w WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='warehouse is unavailable in this organization'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':stock-count-key:'||v_key,0));
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.organization_id=v_org AND s.idempotency_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_session.warehouse_id IS DISTINCT FROM p_warehouse_id OR v_session.notes IS DISTINCT FROM v_notes THEN
   RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock-count idempotency key payload conflict';
  END IF;
  RETURN pg_catalog.to_jsonb(v_session)||pg_catalog.jsonb_build_object('replayed',true);
 END IF;
 SELECT s.id INTO v_existing_id FROM public.stock_count_sessions s
  WHERE s.organization_id=v_org AND s.warehouse_id=p_warehouse_id AND s.status='open' FOR UPDATE;
 IF FOUND THEN RAISE EXCEPTION USING ERRCODE='55006', MESSAGE='an open stock count already exists for this warehouse'; END IF;
 INSERT INTO public.stock_count_sessions(organization_id,warehouse_id,status,idempotency_key,notes,started_by)
 VALUES(v_org,p_warehouse_id,'open',v_key,v_notes,v_actor) RETURNING * INTO v_session;
 PERFORM 1 FROM public.inventory_balances ib
  JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
  WHERE ib.warehouse_id=p_warehouse_id ORDER BY ib.product_id FOR SHARE OF ib;
 INSERT INTO public.stock_count_lines(organization_id,session_id,product_id,product_code,product_name,unit,
  expected_quantity,expected_reserved_quantity,expected_last_movement_at)
 SELECT v_org,v_session.id,ib.product_id,coalesce(p.item_code,p.name),p.name,p.unit,ib.quantity_on_hand,ib.quantity_reserved,ib.last_movement_at
  FROM public.inventory_balances ib JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
  WHERE ib.warehouse_id=p_warehouse_id ORDER BY ib.product_id;
 GET DIAGNOSTICS v_line_count=ROW_COUNT;
 IF v_line_count=0 THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='no verified inventory balances exist for this warehouse'; END IF;
 UPDATE public.stock_count_sessions SET total_lines=v_line_count,counted_lines=0 WHERE id=v_session.id RETURNING * INTO v_session;
 RETURN pg_catalog.to_jsonb(v_session)||pg_catalog.jsonb_build_object('replayed',false);
END;
$$;
REVOKE ALL ON FUNCTION public.start_stock_count(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.start_stock_count(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_stock_count_line(p_session_id uuid,p_product_id uuid,p_counted_quantity numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE; v_line public.stock_count_lines%ROWTYPE;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required to record a stock count';
 END IF;
 IF p_session_id IS NULL OR p_product_id IS NULL OR p_counted_quantity IS NULL
  OR p_counted_quantity::text IN ('NaN','Infinity','-Infinity') OR p_counted_quantity<0
  OR p_counted_quantity>999999999999.999 OR pg_catalog.round(p_counted_quantity,3)<>p_counted_quantity THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='counted quantity must be non-negative with at most three decimals';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open'; END IF;
 SELECT l.* INTO v_line FROM public.stock_count_lines l WHERE l.session_id=v_session.id AND l.organization_id=v_org AND l.product_id=p_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product is not part of this stock-count snapshot'; END IF;
 UPDATE public.stock_count_lines SET counted_quantity=p_counted_quantity,variance=p_counted_quantity-v_line.expected_quantity,counted_at=pg_catalog.now()
  WHERE id=v_line.id RETURNING * INTO v_line;
 UPDATE public.stock_count_sessions s SET counted_lines=(SELECT pg_catalog.count(*)::integer FROM public.stock_count_lines l WHERE l.session_id=s.id AND l.counted_quantity IS NOT NULL)
  WHERE s.id=v_session.id;
 RETURN pg_catalog.to_jsonb(v_line);
END;
$$;
REVOKE ALL ON FUNCTION public.set_stock_count_line(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_stock_count_line(uuid,uuid,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_stock_count(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE;
 v_line public.stock_count_lines%ROWTYPE; v_balance public.inventory_balances%ROWTYPE;
 v_delta numeric(15,3); v_available numeric(15,3); v_adjusted_lines integer := 0;
 v_positive numeric(20,3) := 0; v_negative numeric(20,3) := 0; v_line_count integer := 0; v_counted_lines integer := 0;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to finalize a stock count';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open'; END IF;
 SELECT pg_catalog.count(*)::integer,pg_catalog.count(l.counted_quantity)::integer INTO v_line_count,v_counted_lines
  FROM public.stock_count_lines l WHERE l.session_id=v_session.id;
 IF v_line_count=0 OR v_counted_lines<>v_line_count OR v_session.counted_lines<>v_session.total_lines THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='all stock-count lines must be counted before finalization';
 END IF;
 FOR v_line IN SELECT l.* FROM public.stock_count_lines l WHERE l.session_id=v_session.id ORDER BY l.product_id
 LOOP
  SELECT ib.* INTO v_balance FROM public.inventory_balances ib WHERE ib.product_id=v_line.product_id AND ib.warehouse_id=v_session.warehouse_id FOR UPDATE;
  IF NOT FOUND OR v_balance.quantity_on_hand IS DISTINCT FROM v_line.expected_quantity
   OR v_balance.quantity_reserved IS DISTINCT FROM v_line.expected_reserved_quantity
   OR v_balance.last_movement_at IS DISTINCT FROM v_line.expected_last_movement_at THEN
   RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='stock balance changed after the count snapshot; cancel this session and start a new count';
  END IF;
  IF v_line.counted_quantity<v_balance.quantity_reserved THEN
   RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='counted quantity is below reserved stock; resolve reserved orders before finalization';
  END IF;
  v_delta:=v_line.counted_quantity-v_line.expected_quantity;
  IF v_delta<>0 THEN
   UPDATE public.inventory_balances SET quantity_on_hand=v_line.counted_quantity,last_movement_at=pg_catalog.now(),updated_at=pg_catalog.now()
    WHERE id=v_balance.id RETURNING quantity_available INTO v_available;
   INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,reference_type,reference_id,reason,created_by)
   VALUES(v_line.product_id,v_session.warehouse_id,'stock_count_adjustment',v_delta,v_available,'stock_count_session',v_session.id,
    pg_catalog.left('Physical stock count'||CASE WHEN v_session.notes IS NULL THEN '' ELSE ': '||v_session.notes END,1000),v_actor);
   v_adjusted_lines:=v_adjusted_lines+1;
   IF v_delta>0 THEN v_positive:=v_positive+v_delta; ELSE v_negative:=v_negative+(-v_delta); END IF;
  END IF;
  UPDATE public.stock_count_lines SET completed_quantity=v_line.counted_quantity,variance=v_delta,completed_at=pg_catalog.now() WHERE id=v_line.id;
 END LOOP;
 UPDATE public.stock_count_sessions SET status='completed',completed_by=v_actor,completed_at=pg_catalog.now(),counted_lines=total_lines WHERE id=v_session.id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_org,v_actor,'inventory.stock_count.completed','stock_count_session',v_session.id,
  pg_catalog.jsonb_build_object('warehouse_id',v_session.warehouse_id,'total_lines',v_line_count),
  pg_catalog.jsonb_build_object('adjusted_lines',v_adjusted_lines,'positive_adjustment',v_positive,'negative_adjustment',v_negative,'notes',v_session.notes));
 RETURN pg_catalog.jsonb_build_object('session_id',v_session.id,'status','completed','total_lines',v_line_count,'adjusted_lines',v_adjusted_lines,'positive_adjustment',v_positive,'negative_adjustment',v_negative);
END;
$$;
REVOKE ALL ON FUNCTION public.complete_stock_count(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.complete_stock_count(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_stock_count(p_session_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := public.current_profile_id(); v_org uuid; v_session public.stock_count_sessions%ROWTYPE; v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='administrator or manager permission required to cancel a stock count';
 END IF;
 IF p_session_id IS NULL OR v_reason IS NULL OR pg_catalog.char_length(v_reason)>1000 THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock-count cancellation requires a reason between 1 and 1000 characters';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open'; END IF;
 UPDATE public.stock_count_sessions SET status='cancelled',cancelled_by=v_actor,cancelled_at=pg_catalog.now(),cancellation_reason=v_reason WHERE id=v_session.id;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_org,v_actor,'inventory.stock_count.cancelled','stock_count_session',v_session.id,
  pg_catalog.jsonb_build_object('status','open','warehouse_id',v_session.warehouse_id),
  pg_catalog.jsonb_build_object('status','cancelled','reason',v_reason));
 RETURN pg_catalog.jsonb_build_object('session_id',v_session.id,'status','cancelled','reason',v_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_stock_count(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_count(uuid,text) TO authenticated;
COMMENT ON TABLE public.stock_count_sessions IS 'Tenant-scoped stock count snapshots; finalization applies only when captured stock balances remain unchanged.';
COMMENT ON FUNCTION public.complete_stock_count(uuid) IS 'Manager-approved atomic stock-count completion with stale-snapshot rejection and audit/movement history.';
