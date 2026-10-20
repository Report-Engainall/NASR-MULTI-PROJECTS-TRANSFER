# Aghbari — Physical Schema Contract V1

**Status:** implementation-ready candidate; exact schema remains subject to Batch-3 reconciliation.

## Scope
This contract translates the canonical data model into physical design rules without prematurely binding every table name to an unreviewed legacy design.

## Schema conventions
- PostgreSQL 18.x is the production baseline candidate; PostgreSQL 19 beta is not a production target. PostgreSQL 18 is the current supported major line and receives fixes through November 2030. citeturn0search1turn0search2
- `uuid` identifiers for domain entities exposed beyond a trusted database boundary.
- `timestamptz` for event/business timestamps.
- `numeric` for monetary values; no floating-point committed money.
- Explicit status enums/check constraints where state is finite and stable.
- Foreign keys for canonical relationships.
- Nullable fields only when absence has defined business semantics.
- No polymorphic foreign keys for core financial/inventory relationships.

## Scope keys
Every tenant-scoped entity must have an explicit ownership path. Branch and warehouse scope must never be inferred from UI state. Authorization must remain deny-by-default and least-privilege; direct API requests are independently authorized. citeturn0search0turn0search6

## Proposed core relations
### Identity/scope
`organizations`, `branches`, `warehouses`, `users`, `roles`, `user_roles`, `customer_tiers`, `customers`, `suppliers`

### Catalog
`categories`, `products`, `product_identifiers`, `product_media`, `units`

### Pricing/promotions
`price_lists`, `product_prices`, `promotions`, `promotion_rules`

### Inventory
`inventory_balances`, `inventory_movements`, `inventory_reservations`, `stock_thresholds`

### Sales
`carts`, `cart_items`, `orders`, `order_items`, `order_status_history`, `order_notes`, `operational_invoices`

### Purchasing
`purchase_orders`, `purchase_order_items`, `receipts`, `receipt_items`

### Platform side effects
`notifications`, `notification_deliveries`, `outbox_events`, `integration_deliveries`, `import_jobs`, `import_rows`, `export_jobs`, `audit_events`

## Critical constraints
- Product identifier uniqueness is scoped according to identifier type and business ownership.
- One active cart line per `(cart_id, product_id)`.
- Order number is globally unique within the business scope and server-generated.
- Order items retain committed unit price and required pricing context; later price changes cannot rewrite history.
- Inventory balance uniqueness is `(warehouse_id, product_id)`.
- Inventory mutations require a source/reference and actor/system provenance.
- Idempotency keys are unique within their defined operation scope.
- Outbox event IDs and external delivery idempotency keys prevent replay duplication.
- Monetary totals are server-calculated.

## State machines
Order states are explicit and transition through validated commands. Direct arbitrary status updates are forbidden.

Inventory state changes occur through domain operations; direct balance writes are restricted to trusted persistence paths.

## RLS / authorization design
Database policies are defense in depth, not a replacement for service authorization. Security tests must attempt guessed IDs, cross-customer access, cross-branch access, and privileged endpoint invocation. OWASP recommends authorization on every request, deny-by-default, least privilege, and authorization testing. citeturn0search0turn0search6

## Index contract
Every index must have a documented access path. Initial critical indexes cover scope keys, order status/time, product identifiers, inventory `(warehouse, product)`, price lookup context, outbox retry state, and audit time/entity queries.

## Implementation gate
Before migrations are considered production-ready:
1. clean database migration succeeds;
2. representative fixture migration succeeds;
3. constraints are verified;
4. RLS/security policies are tested through direct API paths;
5. concurrency tests cover inventory/order invariants;
6. migration is applied from an empty database and an upgraded database;
7. exact migration versions are captured in release evidence.
