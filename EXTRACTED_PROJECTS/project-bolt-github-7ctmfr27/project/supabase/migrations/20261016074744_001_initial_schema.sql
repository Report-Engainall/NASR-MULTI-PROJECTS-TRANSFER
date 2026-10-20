-- Legacy duplicate baseline quarantined on 2026-10-18 after isolated PostgreSQL acceptance failed.
-- Original SQL preserved verbatim at:
-- docs/bolt-source-reconciliation/REFERENCE_ONLY/migrations/20261016074744_001_initial_schema.legacy.sql
--
-- Evidence: migrations 20261006063522 and later canonical migrations already create
-- public.products with "status" as the product-state contract. This historical file
-- uses CREATE TABLE IF NOT EXISTS then creates a policy on "is_active"; that fails
-- against the existing canonical table and also seeds demo catalog rows. It must not
-- mutate an already-migrated commerce schema or insert demo business data.
--
-- Keep this migration version as an explicit compatibility gate, not a second schema.
DO $guard$
BEGIN
  IF to_regclass('public.organizations') IS NULL OR to_regclass('public.products') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Canonical Aghbari schema must be created by the preceding versioned migrations before the legacy baseline checkpoint.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'status'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'The active products contract is missing status; refusing to apply the retired legacy initial schema.';
  END IF;
END;
$guard$;
