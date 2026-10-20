-- G1 PostgreSQL proof harness.
-- This is an isolated POC, not the production schema. It proves transactional
-- invariants against a real PostgreSQL engine without freezing the architecture.

DROP SCHEMA IF EXISTS g1_poc CASCADE;
CREATE SCHEMA g1_poc;

CREATE TABLE g1_poc.products (
  product_id integer PRIMARY KEY,
  canonical_price numeric(12,2) NOT NULL CHECK (canonical_price >= 0)
);

CREATE TABLE g1_poc.inventory (
  product_id integer PRIMARY KEY REFERENCES g1_poc.products(product_id),
  quantity integer NOT NULL CHECK (quantity >= 0)
);

CREATE TABLE g1_poc.orders (
  order_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  operation_id uuid NOT NULL UNIQUE,
  payload_hash text NOT NULL,
  product_id integer NOT NULL REFERENCES g1_poc.products(product_id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL,
  total numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE OR REPLACE FUNCTION g1_poc.create_order(
  p_operation_id uuid,
  p_product_id integer,
  p_quantity integer,
  p_client_price numeric
) RETURNS TABLE(order_id bigint, total numeric, replayed boolean)
LANGUAGE plpgsql
AS $$
DECLARE
  v_price numeric(12,2);
  v_stock integer;
  v_payload_hash text := md5(format('%s|%s|%s', p_product_id, p_quantity, p_client_price));
  v_existing g1_poc.orders%ROWTYPE;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'invalid quantity' USING ERRCODE = '22023';
  END IF;

  -- Serialize requests sharing the same idempotency key before the read.
  -- This makes concurrent identical submissions converge on one committed order.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO v_existing
  FROM g1_poc.orders
  WHERE operation_id = p_operation_id;

  IF FOUND THEN
    IF v_existing.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION 'operation_id replay payload conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT v_existing.order_id, v_existing.total, true;
    RETURN;
  END IF;

  SELECT canonical_price INTO v_price
  FROM g1_poc.products
  WHERE product_id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_client_price <> v_price THEN
    RAISE EXCEPTION 'client price rejected' USING ERRCODE = '22000';
  END IF;

  -- Row lock serializes concurrent stock decisions for the same product.
  SELECT quantity INTO v_stock
  FROM g1_poc.inventory
  WHERE product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR v_stock < p_quantity THEN
    RAISE EXCEPTION 'insufficient inventory' USING ERRCODE = 'P0001';
  END IF;

  -- Make concurrent tests deterministic: the second transaction must wait here.
  PERFORM pg_sleep(1);

  UPDATE g1_poc.inventory
  SET quantity = quantity - p_quantity
  WHERE product_id = p_product_id;

  INSERT INTO g1_poc.orders(operation_id, payload_hash, product_id, quantity, unit_price, total)
  VALUES (p_operation_id, v_payload_hash, p_product_id, p_quantity, v_price, p_quantity * v_price)
  RETURNING g1_poc.orders.order_id, g1_poc.orders.total INTO order_id, total;

  replayed := false;
  RETURN NEXT;
EXCEPTION
  WHEN unique_violation THEN
    -- Defensive fallback for races that bypass the advisory-key serialization.
    SELECT * INTO v_existing FROM g1_poc.orders WHERE operation_id = p_operation_id;
    IF FOUND AND v_existing.payload_hash = v_payload_hash THEN
      RETURN QUERY SELECT v_existing.order_id, v_existing.total, true;
      RETURN;
    END IF;
    RAISE;
END;
$$;

INSERT INTO g1_poc.products(product_id, canonical_price) VALUES (1, 10.00);
INSERT INTO g1_poc.inventory(product_id, quantity) VALUES (1, 1);
