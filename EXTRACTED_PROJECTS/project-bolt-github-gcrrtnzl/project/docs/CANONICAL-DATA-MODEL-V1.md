# Aghbari — Canonical Operational Data Model V1

**Status:** Phase-0 candidate baseline; implementation begins only after Batch-3 reconciliation. V2 architecture hardening is incorporated below.

## 1. Ownership rule
Each business fact has one canonical owner. Derived views, caches, exports, and Report-Advisor datasets never become competing sources of truth.

## 2. Core identity and scope
- organizations/tenants
- branches
- warehouses
- users
- roles / role assignments
- customers
- suppliers

All scoped records carry the minimum required ownership/scope keys and immutable primary identity.

## 3. Catalog
- categories
- products
- product media
- product identifiers (SKU/barcode/item number)
- units
- product status

Product identity is stable. Presentation/media can evolve without changing the canonical product identity.

## 4. Pricing
- customer pricing tiers
- product prices by tier
- effective dates/versioning where required
- price change audit
- optional approved promotion/discount rules

Customer-facing reads resolve one authorized price. Alternative tiers are never exposed through the customer contract.

## 5. Inventory
- inventory balances by warehouse/product
- inventory movements
- stock adjustment records
- thresholds
- reservations where required by the order lifecycle
- optional lot/batch records
- optional expiry dates
- receiving provenance
- blocked/expired/quarantined stock states where required
- allocation policy metadata, including FEFO where enabled

Balance is a transactional projection supported by a movement ledger. Every material mutation has actor, reason, source/reference, and timestamp.

For expiry-sensitive stock, the trace chain should remain reconstructable from receiving through movement/reservation/order/adjustment. FEFO is an allocation policy; it never permits silent stock mutation.

## 6. Sales
- orders
- order lines
- order status history
- order notes
- invoices/operational invoice snapshots where needed
- customer/order delivery records
- line-level fulfillment state where split fulfillment is introduced

An order has one canonical identity and immutable audit provenance. Lines reference canonical products and preserve the price/quantity actually committed to the order.

Order lifecycle is an explicit state machine. Invalid, stale, unauthorized, or replayed transitions are rejected and audited.

## 7. Purchasing
- purchase orders
- purchase lines
- receiving events
- supplier references

Purchasing changes inventory through explicit transactional domain operations, never ad-hoc direct balance edits.

## 8. Promotions
Promotions are a separate bounded context from base pricing. Eligibility and precedence must be deterministic. The resulting authorized sell price is resolved server-side and recorded in the transaction when financially material.

## 9. Notifications
- notification intent/event
- recipient
- channel
- delivery state
- attempts
- provider reference

Notifications are side effects and never block the canonical order transaction.

## 10. Integration/outbox
- durable outbox events
- delivery attempts
- integration providers/adapters
- idempotency keys
- correlation IDs
- retry/dead-letter state
- consumer-side processed-event/idempotency records where required

External system state is stored as integration evidence, not treated as canonical internal business truth. Outbox persistence alone is insufficient: consumers must be idempotent against at-least-once delivery.

## 11. Import/export
Imports use:
`upload → quarantine → parse → schema validation → business validation → preview → commit transaction → result/evidence`.

Exports are generated from authorized canonical reads and are versioned by contract where external systems depend on exact columns.

## 12. Audit and security
Audit records cover sensitive business and security actions. They must be append-oriented, tamper-resistant at the application level, scope-aware, and free of secrets.

## 13. Concurrency invariants
1. Order creation is idempotent by client operation key.
2. Inventory mutation is atomic.
3. Stock reservation/release cannot double-apply.
4. A product added repeatedly to a cart resolves to one logical line per cart/product combination.
5. Price resolution is deterministic for the transaction context.
6. State transitions reject invalid/stale transitions.
7. External retries cannot duplicate internal business mutations.
8. Unique order numbers are generated server-side.
9. Soft deletion cannot bypass security or uniqueness invariants.
10. External consumers cannot apply the same event twice.
11. Reuse of an idempotency/event key with a different payload is rejected.

## 14. Financial integrity
Never trust client-calculated totals as canonical. Server-side calculation uses the authorized price, quantity, discounts, taxes/fees if enabled, and rounding policy. The committed transaction stores sufficient snapshot information to reproduce the operational invoice.

## 15. Report-Advisor boundary
Operational facts originate here. Analytical projections may be exported/published through a controlled bridge to Report-Advisor. Report-Advisor calculations must not write competing operational truth back into core tables.

## 16. Synchronization model
Offline synchronization uses scoped projections and, where supported, a server-issued monotonic cursor rather than relying solely on client timestamps.

A sync page may contain changed records and tombstones plus the next cursor. The client advances its cursor only after applying the complete page atomically. Cursor scope, schema version, and authorization remain server-controlled.

## 17. Migration principle
Schema changes are forward, reviewable, repeatable, and testable. Destructive changes require an explicit migration plan, backup/recovery consideration, compatibility window where needed, and evidence.

## 18. V1 decision
Use a normalized transactional core with explicit bounded-context ownership, immutable identifiers, auditable movements/events, transactional projections, and adapter boundaries. The V2 hardening adds food-grade lot/expiry traceability, explicit order state machines, consumer-side idempotency, deterministic incremental sync, and scan-first operational support without prematurely introducing distributed infrastructure.

Exact physical table names/indexes await final Batch-3 reconciliation and technology freeze.
