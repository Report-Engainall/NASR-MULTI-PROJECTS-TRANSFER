-- Allow multiple quantity breaks for the same customer tier and product.
-- Existing product_prices rows remain valid; the resolver chooses the highest matching min_quantity.
ALTER TABLE public.product_prices
  DROP CONSTRAINT IF EXISTS product_prices_product_id_tier_key;

CREATE UNIQUE INDEX IF NOT EXISTS product_prices_product_tier_min_quantity_uidx
  ON public.product_prices(product_id,tier,min_quantity);

CREATE INDEX IF NOT EXISTS product_prices_checkout_lookup_idx
  ON public.product_prices(product_id,tier,min_quantity DESC)
  WHERE is_active;
