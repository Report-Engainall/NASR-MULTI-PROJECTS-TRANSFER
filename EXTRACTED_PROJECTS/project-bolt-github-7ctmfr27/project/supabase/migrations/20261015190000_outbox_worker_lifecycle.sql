-- AGH-ASYNC-OUTBOX-001: durable claim/dispatch/ack lifecycle for transactional events.
-- Worker claims are leased, bounded and retriable. Delivery receipts and business side effects
-- commit in the same database transaction to make replay safe after a worker crash.

CREATE TABLE IF NOT EXISTS public.outbox_event_deliveries (
  event_id uuid NOT NULL REFERENCES public.outbox_events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  consumer_key text NOT NULL CHECK (length(btrim(consumer_key)) BETWEEN 1 AND 100),
  completed_at timestamptz NOT NULL DEFAULT now(),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (event_id, consumer_key)
);

ALTER TABLE public.outbox_event_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.outbox_event_deliveries FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS outbox_events_processing_lease_idx
  ON public.outbox_events(locked_at, created_at)
  WHERE status = 'processing';

COMMENT ON TABLE public.outbox_event_deliveries IS
  'Idempotency receipts for outbox consumers. Each receipt is committed atomically with its internal side effects.';

CREATE OR REPLACE FUNCTION public.claim_outbox_events(
  p_worker text,
  p_limit integer DEFAULT 25,
  p_lease_seconds integer DEFAULT 300,
  p_event_id uuid DEFAULT NULL
)
RETURNS SETOF public.outbox_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(length(btrim(p_worker)),0) < 1 OR length(p_worker) > 120
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
     OR p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid outbox worker, batch size, or lease';
  END IF;

  IF coalesce(current_setting('request.jwt.claim.role', true),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='outbox claiming requires a trusted worker';
  END IF;

  -- A process that repeatedly crashes is terminal after the configured max attempts.
  UPDATE public.outbox_events e
     SET status='dead_letter',
         dead_letter_at=coalesce(e.dead_letter_at,now()),
         locked_at=NULL,
         locked_by=NULL,
         error_class=coalesce(e.error_class,'retry_exhausted'),
         last_error=coalesce(e.last_error,pg_catalog.jsonb_build_object(
           'error_class','retry_exhausted',
           'message','Worker lease expired after maximum attempts'
         ))
   WHERE e.attempts >= 8
     AND (p_event_id IS NULL OR e.id=p_event_id)
     AND (
       (e.status IN ('pending','retry') AND e.next_attempt_at <= now())
       OR (e.status='processing' AND e.locked_at IS NOT NULL
           AND e.locked_at <= now() - (p_lease_seconds * interval '1 second'))
     );

  RETURN QUERY
  WITH picked AS (
    SELECT e.id
      FROM public.outbox_events e
     WHERE (p_event_id IS NULL OR e.id=p_event_id)
       AND e.attempts < 8
       AND (
         (e.status IN ('pending','retry') AND e.next_attempt_at <= now())
         OR (e.status='processing' AND e.locked_at IS NOT NULL
             AND e.locked_at <= now() - (p_lease_seconds * interval '1 second'))
       )
     ORDER BY e.next_attempt_at,e.created_at,e.id
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  )
  UPDATE public.outbox_events e
     SET status='processing',
         locked_by=p_worker,
         locked_at=now(),
         last_attempt_at=now(),
         attempts=e.attempts+1,
         last_error=NULL,
         error_class=NULL
    FROM picked
   WHERE e.id=picked.id
  RETURNING e.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_outbox_event(
  p_event_id uuid,
  p_worker text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.outbox_events%ROWTYPE;
  v_order_number text;
  v_order_status text;
  v_delivery_id uuid;
  v_notifications integer := 0;
BEGIN
  IF p_event_id IS NULL OR coalesce(length(btrim(p_worker)),0) < 1 OR length(p_worker)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid outbox event or worker';
  END IF;
  IF coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='outbox processing requires a trusted worker';
  END IF;

  SELECT e.* INTO v_event
    FROM public.outbox_events e
   WHERE e.id=p_event_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='outbox event not found';
  END IF;

  IF v_event.status='processed' THEN
    RETURN pg_catalog.jsonb_build_object('status','already_processed','event_id',v_event.id);
  END IF;
  IF v_event.status<>'processing' OR v_event.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='outbox event is not leased to this worker';
  END IF;
  IF v_event.organization_id IS NULL OR v_event.event_type<>'OrderCreated' OR v_event.aggregate_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='0A000', MESSAGE='unsupported outbox event type or missing tenant/aggregate';
  END IF;

  SELECT o.order_number,o.status
    INTO v_order_number,v_order_status
    FROM public.orders o
   WHERE o.id=v_event.aggregate_id
     AND o.organization_id=v_event.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503', MESSAGE='OrderCreated aggregate is missing from its organization';
  END IF;

  -- Insert the receipt and its side effects atomically. A crash rolls back both.
  INSERT INTO public.outbox_event_deliveries(event_id,organization_id,consumer_key)
  VALUES (v_event.id,v_event.organization_id,'in_app_order_created')
  ON CONFLICT (event_id,consumer_key) DO NOTHING
  RETURNING event_id INTO v_delivery_id;

  IF v_delivery_id IS NOT NULL THEN
    INSERT INTO public.notifications(organization_id,profile_id,title,body,type)
    SELECT v_event.organization_id,p.id,'طلب جديد',
           'تم استلام الطلب '||v_order_number||'. الحالة الحالية: '||v_order_status||'.',
           'order'
      FROM public.profiles p
     WHERE p.organization_id=v_event.organization_id
       AND p.is_active=true
       AND EXISTS (
         SELECT 1 FROM public.user_roles r
          WHERE r.profile_id=p.id
            AND r.role IN ('admin','manager','staff')
       );
    GET DIAGNOSTICS v_notifications = ROW_COUNT;

    UPDATE public.outbox_event_deliveries d
       SET result=pg_catalog.jsonb_build_object(
         'notifications_created',v_notifications,
         'event_type',v_event.event_type
       )
     WHERE d.event_id=v_event.id
       AND d.consumer_key='in_app_order_created';
  ELSE
    SELECT coalesce((d.result->>'notifications_created')::integer,0)
      INTO v_notifications
      FROM public.outbox_event_deliveries d
     WHERE d.event_id=v_event.id
       AND d.consumer_key='in_app_order_created';
  END IF;

  UPDATE public.outbox_events e
     SET status='processed',
         processed_at=coalesce(e.processed_at,now()),
         locked_at=NULL,
         locked_by=NULL,
         last_error=NULL,
         error_class=NULL
   WHERE e.id=v_event.id;

  RETURN pg_catalog.jsonb_build_object(
    'status','processed',
    'event_id',v_event.id,
    'event_type',v_event.event_type,
    'notifications_created',v_notifications
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_outbox_event(
  p_event_id uuid,
  p_worker text,
  p_error_class text,
  p_error_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event public.outbox_events%ROWTYPE;
  v_class text;
  v_message text;
  v_status text;
  v_delay_seconds integer;
BEGIN
  IF p_event_id IS NULL OR coalesce(length(btrim(p_worker)),0)<1 OR length(p_worker)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid outbox event or worker';
  END IF;
  IF coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='outbox failure reporting requires a trusted worker';
  END IF;

  SELECT e.* INTO v_event
    FROM public.outbox_events e
   WHERE e.id=p_event_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='outbox event not found';
  END IF;
  IF v_event.status IN ('processed','dead_letter') THEN
    RETURN pg_catalog.jsonb_build_object('status',v_event.status,'already_terminal',true,'event_id',v_event.id);
  END IF;
  IF v_event.status<>'processing' OR v_event.locked_by IS DISTINCT FROM p_worker THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='outbox event is not leased to this worker';
  END IF;

  v_class := left(regexp_replace(coalesce(p_error_class,'worker_error'),'[^A-Za-z0-9_.-]','','g'),80);
  IF v_class='' THEN v_class:='worker_error'; END IF;
  v_message := left(regexp_replace(coalesce(p_error_message,'No error detail supplied'),'[[:cntrl:]]',' ','g'),500);
  IF v_message='' THEN v_message:='No error detail supplied'; END IF;

  IF v_event.attempts >= 8 THEN
    v_status := 'dead_letter';
    v_delay_seconds := 0;
  ELSE
    v_status := 'retry';
    v_delay_seconds := LEAST(3600, 15 * (2 ^ LEAST(GREATEST(v_event.attempts - 1,0),8))::integer);
  END IF;

  UPDATE public.outbox_events e
     SET status=v_status,
         next_attempt_at=CASE WHEN v_status='retry' THEN now()+pg_catalog.make_interval(secs=>v_delay_seconds) ELSE e.next_attempt_at END,
         dead_letter_at=CASE WHEN v_status='dead_letter' THEN coalesce(e.dead_letter_at,now()) ELSE e.dead_letter_at END,
         error_class=v_class,
         last_error=pg_catalog.jsonb_build_object('error_class',v_class,'message',v_message,'attempts',v_event.attempts),
         locked_at=NULL,
         locked_by=NULL
   WHERE e.id=v_event.id;

  RETURN pg_catalog.jsonb_build_object(
    'status',v_status,
    'event_id',v_event.id,
    'attempts',v_event.attempts,
    'delay_seconds',v_delay_seconds,
    'dead_letter_at',CASE WHEN v_status='dead_letter' THEN now() ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_outbox_events(text,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.process_outbox_event(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_outbox_event(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_outbox_events(text,integer,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.process_outbox_event(uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_outbox_event(uuid,text,text,text) TO service_role;

COMMENT ON FUNCTION public.claim_outbox_events(text,integer,integer,uuid) IS
  'Service-worker-only SKIP LOCKED claim with bounded leases, stale-lease recovery, exponential retry and terminal dead-lettering.';
COMMENT ON FUNCTION public.process_outbox_event(uuid,text) IS
  'Atomically handles the OrderCreated in-app notification consumer and records an idempotent delivery receipt.';
COMMENT ON FUNCTION public.fail_outbox_event(uuid,text,text,text) IS
  'Records a bounded sanitized error and schedules exponential retry or dead-letters the event after eight attempts.';
