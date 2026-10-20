# Aghbari — Batch-3 Reconciliation V1

**Status:** RECONCILED / IMPLEMENTATION GATE
**Scope:** Canonical Data Model, Physical Schema Contract, Candidate Migration Skeleton, API/Domain Contracts, Data Ownership & Invariants, RBAC/RLS, Offline Sync, Intelligence Boundary.

## Decision
The repository is authorized to move from architecture/proof work into implementation of the transactional runtime, while preserving the canonical ownership and security boundaries below.

## 1. Canonical ownership
- Aghbari is the sole operational system of record for products, catalog, inventory, prices, customers, suppliers, sales, purchasing, operational finance, branches/warehouses, users/roles, imports/exports, notifications, audit and integration state.
- Report-Advisor is downstream analytics/BI/forecasting/Decision Intelligence. It has no operational write authority.
- Analytics must consume a validated canonical analytical dataset through the intelligence integration boundary.

## 2. Physical schema gate
The previously proposed relation families are accepted as the implementation baseline:
- Identity/scope: organizations, branches, warehouses, users, roles, user_roles, customer_tiers, customers, suppliers.
- Catalog: categories, products, product_identifiers, product_media, units.
- Pricing: price_lists, product_prices, promotions, promotion_rules.
- Inventory: inventory_balances, inventory_movements, inventory_reservations, stock_thresholds.
- Sales: carts, cart_items, orders, order_items, order_status_history, order_notes, operational_invoices.
- Purchasing: purchase_orders, purchase_order_items, receipts, receipt_items.
- Side effects/platform: notifications, notification_deliveries, outbox_events, integration_deliveries, import_jobs, import_rows, export_jobs, audit_events.

Exact column definitions, indexes and policies remain subject to implementation review and executable tests; no legacy schema is copied blindly.

## 3. Non-negotiable invariants
- Monetary values use numeric; totals are server-calculated.
- Tenant/branch/warehouse ownership is explicit and never inferred from UI state.
- Inventory balance uniqueness is (warehouse_id, product_id).
- Order numbers are server-generated and unique within the defined business scope.
- Order history retains committed pricing context.
- Inventory mutations are transactional, sourced and auditable.
- Idempotency is required for material retriable commands; payload changes under an existing operation key are rejected.
- Order state transitions are explicit and validated; arbitrary status writes are forbidden.
- Outbox and integration delivery records are durable and idempotent.
- Import flow is quarantine → parse → schema validation → business validation → preview → atomic commit → evidence.
- RLS is defense in depth; service authorization is independently enforced.
- Cross-tenant, cross-branch and cross-customer access must be rejected even when IDs are guessed.

## 4. Implementation order
M000 conventions/extensions → M001 organization/branch/warehouse → M002 identity/RBAC/customer scope → M003 catalog → M004 pricing/promotions → M005 inventory → M006 carts/orders/invoices → M007 purchasing/receiving → M008 notifications/outbox/integrations → M009 import/export → M010 audit → constraint/index pass → RLS/security pass → fixtures/evidence.

## 5. Runtime vertical slice priority
The first production slice must prove one complete path rather than create disconnected UI:

`authenticated tenant → catalog product → authorized price → inventory → create order → idempotent replay → validated order transition → audit/outbox`

The existing G1 transactional and order-workflow proofs become regression gates for this slice. Existing proof success does not by itself certify the production runtime.

## 6. Explicit non-goals
- No Report-Advisor BI/forecasting/Decision Intelligence tables in Aghbari core.
- No direct Report-Advisor writes to operational truth.
- No blind legacy database copy.
- No direct provider writes from business transactions.
- No Kafka/microservices/Kubernetes unless measured requirements later justify them.
- No production certification claim before real environment E2E evidence.

## 7. Certification rule
Every implementation commit changes the certification HEAD. Evidence is valid only when tied to the exact HEAD under test. Documentation, static inspection, green CI, or a POC cannot be promoted to runtime PASS without executable runtime evidence.

## 8. External gates
Real Supabase Auth/RLS tenant-isolation E2E requires a connected staging Supabase project. Browser E2E requires an executable browser environment. These blockers do not prevent implementation of independent runtime/database tracks.
