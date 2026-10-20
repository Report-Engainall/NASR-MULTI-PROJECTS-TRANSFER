-- Keep catalog search responsive as the product table grows beyond the initial dataset.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS products_org_name_trgm_idx
  ON public.products USING gin (name extensions.gin_trgm_ops)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS products_org_sku_trgm_idx
  ON public.products USING gin (sku extensions.gin_trgm_ops)
  WHERE status = 'active';
