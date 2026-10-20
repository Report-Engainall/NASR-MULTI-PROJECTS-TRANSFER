# Aghbari — Executable Runtime Implementation Roadmap V1

## Objective
Build the smallest production-capable transactional core first, then expand by dependency order. Every stage must have implementation, tests, adversarial tests, and exact-HEAD evidence.

## Wave R1 — Database foundation
- PostgreSQL project/runtime baseline
- M000 conventions
- M001 organizations/branches/warehouses
- M002 users/roles/customer tiers/customers/suppliers
- tenant ownership paths
- initial RLS/security primitives
- deterministic seed/fixture strategy

Gate: clean install + upgrade + repeat migration + cross-scope rejection.

## Wave R2 — Catalog + pricing
- categories/products/identifiers/media/units
- price lists/product prices
- effective pricing rules
- authorized price selection
- product and price service contracts

Gate: customer sees only authorized price; stale price cannot be committed.

## Wave R3 — Inventory
- balances
- movement ledger
- reservations
- thresholds
- transactional stock operations
- concurrency protection

Gate: no oversell; no partial mutation; audit/provenance preserved.

## Wave R4 — Sales/order core
- carts/cart items
- order creation
- immutable committed pricing context
- order number generation
- order state machine
- idempotency
- audit + outbox emission

Gate: complete first vertical slice and all G1/order POC invariants reproduced in runtime.

## Wave R5 — Purchasing
- purchase orders
- receiving
- inventory effects only through domain operations
- reconciliation/audit

## Wave R6 — Platform reliability
- notifications
- outbox worker
- integration deliveries
- retry/backoff/DLQ
- correlation/idempotency

## Wave R7 — Import/export/data center
- quarantine uploads
- parse/schema/business validation
- preview
- atomic commit
- export authorization
- evidence/result artifacts

## Wave R8 — Frontend/PWA
- authenticated shell
- operational command center
- catalog/pricing/inventory/orders
- scan-first warehouse UX
- offline bounded cache/queue
- explicit Report-Advisor handoff

No analytics dashboard duplication.

## Wave R9 — External integrations
- Onyx Pro adapter
- WhatsApp official API adapter
- Report-Advisor intelligence gateway

External delivery is asynchronous and cannot corrupt the operational transaction.

## Wave R10 — Release certification
- adversarial security
- Auth/RLS Tenant A/B
- browser E2E
- offline replay/conflicts
- integration delivery
- performance/reliability
- deployment/rollback
- exact-HEAD certification bundle

## Execution discipline
Do not start dependent waves before their predecessor gates are met. External blockers pause only the affected evidence track; independent implementation continues. Any commit invalidates prior exact-HEAD certification evidence until the new HEAD is tested.
