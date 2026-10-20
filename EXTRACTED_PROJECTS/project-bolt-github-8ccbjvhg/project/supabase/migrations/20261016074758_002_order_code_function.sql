/*
# Generate Order Code Function

Creates an RPC function to generate sequential, human-readable order codes (ORD-000001).
Uses a sequence and format with zero-padded numbers.
*/

CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'ORD-' || lpad(nextval('order_code_seq')::text, 6, '0');
$$;
