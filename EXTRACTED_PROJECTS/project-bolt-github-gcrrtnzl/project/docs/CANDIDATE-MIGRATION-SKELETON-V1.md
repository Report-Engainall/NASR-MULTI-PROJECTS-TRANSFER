# Aghbari — Candidate Migration Skeleton V1

**Status:** candidate implementation plan; NOT frozen until Batch 3 reconciliation.

## Purpose
Translate the physical schema contract into an ordered, dependency-safe migration sequence. This is intentionally a skeleton: exact column-level details remain subject to Batch-3 reconciliation and technology proof gates.

## Migration order

### M000 — Extensions and conventions
- Enable only required PostgreSQL extensions after compatibility review.
- Establish schema naming, UUID generation strategy, timestamp conventions, and migration metadata.
- No application-owned secrets or provider credentials in database tables.

### M001 — Organization and operational scope
- `organizations`
- `branches`
- `warehouses`
- scope relationships and active-state constraints
- indexes for ownership and operational lookup

**Invariant:** every operational record has an unambiguous ownership path.

### M002 — Identity, roles, customer segmentation
- `users`
- `roles`
- `user_roles`
- `customer_tiers`
- `customers`
- `suppliers`

**Invariant:** authorization scope is derived from trusted server/database context, never from a client-selected tier/branch/warehouse.

### M003 — Catalog foundation
- `categories`
- `units`
- `products`
- `product_identifiers`
- `product_media`

Constraints include stable product identity, identifier uniqueness by defined scope, active/inactive lifecycle, and safe soft deletion.

### M004 — Pricing and promotions
- `price_lists`
- `product_prices`
- `promotions`
- `promotion_rules`

**Invariant:** customer-facing reads resolve exactly one authorized price context. Alternative tier prices are never returned accidentally.

### M005 — Inventory ledger
- `inventory_balances`
- `inventory_movements`
- `inventory_reservations`
- `stock_thresholds`

**Invariant:** balances are derived/maintained through controlled domain operations and every mutation has actor/system provenance and a source reference.

### M006 — Shopping and sales
- `carts`
- `cart_items`
- `orders`
- `order_items`
- `order_status_history`
- `order_notes`
- `operational_invoices`

Critical constraints:
- one active cart line per `(cart_id, product_id)`;
- server-generated unique order number;
- committed unit price stored on order item;
- server-calculated totals;
- explicit legal state transitions;
- idempotent order creation.

### M007 — Purchasing
- `purchase_orders`
- `purchase_order_items`
- `receipts`
- `receipt_items`

Purchasing mutations must reconcile with inventory through explicit domain operations rather than uncontrolled balance writes.

### M008 — Notifications and asynchronous work
- `notifications`
- `notification_deliveries`
- `outbox_events`
- `integration_deliveries`

**Invariant:** external side effects occur after durable domain commit and are replay-safe.

### M009 — Import/export
- `import_jobs`
- `import_rows`
- `export_jobs`

Imports follow `stage → validate → preview/report → commit`, with row-level diagnostics and idempotency where repeat submission is possible.

### M010 — Audit and compliance
- `audit_events`

Audit records capture actor/system, action, target, scope, correlation/request ID, timestamp, result classification, and relevant non-secret metadata.

## Constraint/index pass
After table creation, add:
- foreign keys;
- uniqueness constraints;
- state/check constraints;
- scope indexes;
- product identifier indexes;
- `(warehouse_id, product_id)` inventory uniqueness/index;
- order status/time indexes;
- price resolution indexes;
- outbox retry indexes;
- audit entity/time indexes.

## RLS pass
RLS is added only after scope semantics are proven. Policies must be tested through direct API access, including guessed identifiers and cross-scope attempts.

## Seed/fixture pass
Fixtures must create at minimum:
- one organization;
- two branches;
- two warehouses with distinct scope;
- customer accounts across all tiers;
- products with all tier prices;
- inventory balances/movements;
- representative orders in multiple states;
- pending outbox/integration deliveries.

Fixtures must never become production authorization assumptions.

## Migration gates
A migration sequence is not production-ready until all are proven:
1. clean install from empty database;
2. upgrade from previous migration checkpoint;
3. repeat migration is deterministic;
4. rollback/recovery procedure is documented where rollback is safe;
5. constraints reject invalid states;
6. RLS blocks cross-scope access;
7. concurrent inventory/order tests preserve invariants;
8. migration version and resulting schema fingerprint are captured in release evidence.

## Explicit non-goals
- No Report-Advisor analytics tables.
- No duplicated forecasting/Decision Intelligence schema.
- No legacy database copied blindly.
- No direct external-provider write access to canonical tables.
- No architecture freeze before Batch 3 reconciliation.
