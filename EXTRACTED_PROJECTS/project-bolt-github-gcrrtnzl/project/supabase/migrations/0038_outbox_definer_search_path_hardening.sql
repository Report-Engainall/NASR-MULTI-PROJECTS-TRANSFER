-- Release hardening follow-up: preserve migration history while tightening
-- SECURITY DEFINER search_path handling for the outbox worker functions.

CREATE OR REPLACE FUNCTION public.claim_outbox_events(p_limit integer DEFAULT 20)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_org uuid := public.current_organization_id();
  v_is_service boolean := auth.role() = 'service_role';
BEGIN
  IF NOT v_is_service AND (v_org IS NULL OR NOT public.is_staff()) THEN
    RAISE EXCEPTION USING errcode='42501', message='outbox worker access required';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT id
    FROM public.outbox_events
    WHERE (v_is_service OR organization_id = v_org)
      AND ((status = 'pending' AND available_at <= now())
        OR (status = 'processing' AND locked_until IS NOT NULL AND locked_until <= now()))
      AND attempts < 8
    ORDER BY available_at, created_at, id
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ), claimed AS (
    UPDATE public.outbox_events e
    SET status = 'processing', attempts = e.attempts + 1,
        locked_until = now() + interval '2 minutes', last_error = NULL
    FROM candidates c
    WHERE e.id = c.id
    RETURNING e.*
  )
  SELECT * FROM claimed ORDER BY available_at, created_at, id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ack_outbox_event(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid := public.current_organization_id();
  v_is_service boolean := auth.role() = 'service_role';
  v_updated integer;
BEGIN
  IF NOT v_is_service AND (v_org IS NULL OR NOT public.is_staff()) THEN
    RAISE EXCEPTION USING errcode='42501', message='outbox worker access required';
  END IF;
  UPDATE public.outbox_events
  SET status='delivered', delivered_at=now(), locked_until=NULL, last_error=NULL
  WHERE id=p_event_id AND status='processing'
    AND (v_is_service OR organization_id=v_org);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_outbox_event(
  p_event_id uuid,
  p_error text DEFAULT 'worker failure'
)
RETURNS public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid := public.current_organization_id();
  v_is_service boolean := auth.role() = 'service_role';
  v_event public.outbox_events%rowtype;
  v_next_status text;
  v_delay_seconds integer;
BEGIN
  IF NOT v_is_service AND (v_org IS NULL OR NOT public.is_staff()) THEN
    RAISE EXCEPTION USING errcode='42501', message='outbox worker access required';
  END IF;
  SELECT * INTO v_event FROM public.outbox_events
  WHERE id=p_event_id AND status='processing'
    AND (v_is_service OR organization_id=v_org) FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING errcode='P0002', message='outbox event is not claimable for failure handling';
  END IF;
  v_next_status := CASE WHEN v_event.attempts >= 8 THEN 'dead' ELSE 'pending' END;
  v_delay_seconds := LEAST(900, 2 ^ LEAST(v_event.attempts, 9));
  UPDATE public.outbox_events
  SET status=v_next_status,
      available_at=CASE WHEN v_next_status='pending' THEN now() + make_interval(secs => v_delay_seconds) ELSE available_at END,
      locked_until=NULL,
      last_error=left(coalesce(p_error,'worker failure'), 2000)
  WHERE id=p_event_id RETURNING * INTO v_event;
  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_expired_outbox_events(p_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
  v_org uuid := public.current_organization_id();
  v_is_service boolean := auth.role() = 'service_role';
  v_count integer;
BEGIN
  IF NOT v_is_service AND (v_org IS NULL OR NOT public.is_staff()) THEN
    RAISE EXCEPTION USING errcode='42501', message='outbox worker access required';
  END IF;
  WITH expired AS (
    SELECT id FROM public.outbox_events
    WHERE status='processing' AND locked_until IS NOT NULL AND locked_until <= now()
      AND (v_is_service OR organization_id=v_org)
    ORDER BY locked_until, created_at, id LIMIT v_limit FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_events e
  SET status=CASE WHEN attempts >= 8 THEN 'dead' ELSE 'pending' END,
      available_at=CASE WHEN attempts >= 8 THEN available_at ELSE now() END,
      locked_until=NULL, last_error=coalesce(last_error, 'worker lease expired')
  FROM expired x WHERE e.id=x.id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_outbox_events(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ack_outbox_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_outbox_event(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_expired_outbox_events(integer) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_outbox_events(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ack_outbox_event(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fail_outbox_event(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recover_expired_outbox_events(integer) FROM anon;
