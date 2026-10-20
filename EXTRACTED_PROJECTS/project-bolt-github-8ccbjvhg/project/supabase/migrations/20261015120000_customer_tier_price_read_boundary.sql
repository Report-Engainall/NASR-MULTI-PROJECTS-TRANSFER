-- Tier prices are internal financial source data, not a direct client-facing table.
-- Customer orders/checkout use security-definer server commands that resolve the tier internally.
-- Remove direct table SELECT for authenticated customers and staff alike; the admin UI uses audited/server RPCs.
REVOKE SELECT ON TABLE public.product_prices FROM PUBLIC, anon, authenticated;

-- Fail the migration if a future grant reintroduces direct table or column reads.
DO $block$
DECLARE
  v_column text;
BEGIN
  IF has_table_privilege('authenticated', 'public.product_prices', 'SELECT') THEN
    RAISE EXCEPTION 'Authenticated role must not have table-level SELECT on public.product_prices';
  END IF;

  FOR v_column IN
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_prices'
  LOOP
    IF has_column_privilege('authenticated', 'public.product_prices', v_column, 'SELECT') THEN
      RAISE EXCEPTION 'Authenticated role must not have column-level SELECT on public.product_prices.%', v_column;
    END IF;
  END LOOP;
END
$block$;
