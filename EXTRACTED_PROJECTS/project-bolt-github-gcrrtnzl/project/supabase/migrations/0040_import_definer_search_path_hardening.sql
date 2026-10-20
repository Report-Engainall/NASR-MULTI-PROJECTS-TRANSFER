-- Release hardening follow-up: the import delta correction already exists in migration 0009.
-- This migration preserves that canonical implementation and only hardens its SECURITY DEFINER boundary.

ALTER FUNCTION public.stage_product_import(text,text,jsonb) SET search_path='';
ALTER FUNCTION public.commit_product_import(uuid,uuid) SET search_path='';

REVOKE EXECUTE ON FUNCTION public.stage_product_import(text,text,jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.commit_product_import(uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.stage_product_import(text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_product_import(uuid,uuid) TO authenticated;

COMMENT ON FUNCTION public.commit_product_import(uuid,uuid) IS 'Atomically commits a validated import into catalog, tier pricing and warehouse inventory with audit and movement records; inventory deltas are calculated from the pre-commit balance.';
