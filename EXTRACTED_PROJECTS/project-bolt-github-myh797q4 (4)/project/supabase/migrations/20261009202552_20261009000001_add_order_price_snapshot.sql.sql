/*
# Complete order line price snapshots

1. Purpose
- Add the missing immutable unit-price snapshot used by the server-authoritative order transaction.

2. Changes
- Add `order_items.unit_price_snapshot` as a backward-compatible numeric column.
- Copy existing `unit_price` values into the snapshot where historical rows do not yet have one.

3. Security
- No rows are deleted and no existing column types are changed.
*/

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_snapshot numeric(12,2);
UPDATE order_items SET unit_price_snapshot = COALESCE(unit_price_snapshot, unit_price) WHERE unit_price_snapshot IS NULL;
