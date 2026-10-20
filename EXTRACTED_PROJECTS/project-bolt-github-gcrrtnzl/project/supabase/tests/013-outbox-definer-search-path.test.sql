BEGIN;

SELECT plan(4);

SELECT is(
  (SELECT value FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS value WHERE value LIKE 'search_path=%' LIMIT 1),
  'search_path=""',
  'claim_outbox_events uses an empty SECURITY DEFINER search_path'
)
FROM pg_proc
WHERE oid = 'public.claim_outbox_events(integer)'::regprocedure;

SELECT is(
  (SELECT value FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS value WHERE value LIKE 'search_path=%' LIMIT 1),
  'search_path=""',
  'ack_outbox_event uses an empty SECURITY DEFINER search_path'
)
FROM pg_proc
WHERE oid = 'public.ack_outbox_event(uuid)'::regprocedure;

SELECT is(
  (SELECT value FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS value WHERE value LIKE 'search_path=%' LIMIT 1),
  'search_path=""',
  'fail_outbox_event uses an empty SECURITY DEFINER search_path'
)
FROM pg_proc
WHERE oid = 'public.fail_outbox_event(uuid,text)'::regprocedure;

SELECT is(
  (SELECT value FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) AS value WHERE value LIKE 'search_path=%' LIMIT 1),
  'search_path=""',
  'recover_expired_outbox_events uses an empty SECURITY DEFINER search_path'
)
FROM pg_proc
WHERE oid = 'public.recover_expired_outbox_events(integer)'::regprocedure;

SELECT * FROM finish();
ROLLBACK;
