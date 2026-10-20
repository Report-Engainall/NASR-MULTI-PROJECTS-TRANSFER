-- Customer order UX must not receive financial amounts in order/create/preview payloads.
-- Catalog prices and the separately authorized account statement remain separate product surfaces.

CREATE OR REPLACE FUNCTION public.validate_checkout_cart(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_preview jsonb;
  v_items jsonb;
  v_safe_items jsonb;
BEGIN
  -- The internal calculator still validates product identity, price rules, tenant and quantity.
  -- Only safe display metadata leaves this function; no unit prices, line totals or overall total.
  v_preview := public.preview_order_pricing(p_items);
  v_items := coalesce(v_preview->'items','[]'::jsonb);
  IF pg_catalog.jsonb_typeof(v_items)<>'array' OR pg_catalog.jsonb_array_length(v_items)<1 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تعذر التحقق من أصناف السلة';
  END IF;
  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'product_id',line.value->'product_id',
      'name',line.value->'name',
      'item_code',line.value->'item_code',
      'unit',line.value->'unit',
      'quantity',line.value->'quantity'
    ) ORDER BY line.ordinality
  )
  INTO v_safe_items
  FROM pg_catalog.jsonb_array_elements(v_items) WITH ORDINALITY AS line(value,ordinality);

  RETURN pg_catalog.jsonb_build_object(
    'valid',true,
    'items',coalesce(v_safe_items,'[]'::jsonb),
    'item_count',pg_catalog.jsonb_array_length(v_items),
    'currency',coalesce(v_preview->>'currency','YER'),
    'pricing_verified',true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.validate_checkout_cart(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.validate_checkout_cart(jsonb) TO authenticated;
-- The full monetary preview is a backend-only calculator, not a customer API.
REVOKE ALL ON FUNCTION public.preview_order_pricing(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preview_order_pricing(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.submit_customer_order(
  _items jsonb,
  _notes text,
  _business_name text,
  _contact_name text,
  _phone text,
  _payment_terms text DEFAULT 'cash_on_delivery',
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- place_order performs the actual server pricing, credit, idempotency and inventory transaction.
  -- This facade deliberately drops total_amount and all line-level monetary values from the customer response.
  v_result := public.place_order(
    _items,_notes,_business_name,_contact_name,_phone,_payment_terms,_idempotency_key
  );
  RETURN pg_catalog.jsonb_build_object(
    'id',v_result->'id',
    'order_number',v_result->'order_number',
    'status','pending',
    'payment_terms',v_result->'payment_terms',
    'idempotent_replay',coalesce((v_result->>'idempotent_replay')::boolean,false)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_customer_order(jsonb,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_customer_order(jsonb,text,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.place_order(jsonb,text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(jsonb,text,text,text,text,text,text) TO service_role;

COMMENT ON FUNCTION public.validate_checkout_cart(jsonb) IS
  'Customer-facing non-financial validation only. Never returns unit prices or totals.';
COMMENT ON FUNCTION public.submit_customer_order(jsonb,text,text,text,text,text,text) IS
  'Customer-facing order command. Monetary values are recalculated on the server and excluded from the response.';
