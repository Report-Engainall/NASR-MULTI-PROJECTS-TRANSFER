-- F31 deterministic invariant probe. The runner executes baseline -> intentional mutation -> MUST FAIL -> clean reset -> baseline.
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='products'),'Inventory boundary: products RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='orders'),'Orders boundary: orders RLS enabled');
select ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='cash_accounts'),'Finance boundary: cash_accounts RLS enabled');
select ok((select count(*) from pg_policies where schemaname='public' and tablename='products')>0,'Tenant boundary: product policies exist');
select ok((select count(*) from pg_policies where schemaname='storage' and tablename='objects')>0,'Storage boundary: object policies exist');
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE'))=0,'RBAC/RPC boundary: anon has no public function execute');
select ok((select count(*) from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and r.relname='orders' and c.contype='u' and pg_get_constraintdef(c.oid) like '%(organization_id, idempotency_key)%')>0,'Idempotency boundary: tenant-scoped order uniqueness exists');
select ok((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='claim_outbox_events')>0,'Outbox boundary: worker claim function exists');

select * from finish();
