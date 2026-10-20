# Aghbari — API & Integration Contracts Baseline

**Status:** Phase-0 engineering baseline; implementation-neutral.

## 1. Contract principle
The API is a security and business contract, not a thin database wrapper. Every externally reachable command/query must define identity, authorization, input/output schema, idempotency, errors, auditability, and observable correlation.

## 2. Boundary
```text
UI / PWA / Admin
        ↓
Authenticated API / Server Action Boundary
        ↓
Application Service / Domain Policy
        ↓
Transactional PostgreSQL Core
        ↓
Outbox / Job Boundary
        ↓
External Adapters
```

External systems never receive direct write access to canonical domain tables.

## 3. Contract classes
### Queries
Read-only, authorization-filtered, pagination-first, explicit field projection, no accidental disclosure of other customer tiers or tenants.

### Commands
Validated state-changing operations executed transactionally. Commands require an authenticated actor and authorization decision. Critical commands require an idempotency key and correlation ID.

### Bulk operations
Imports, price updates, stock adjustments, and administrative bulk actions use staged validation before commit. Partial success is explicit; silent partial mutation is forbidden.

## 4. Canonical command requirements
Every material command must define:
- command name/version
- actor and authorization policy
- request schema
- target scope (tenant/branch/warehouse/customer)
- transaction boundary
- idempotency strategy
- concurrency strategy
- response schema
- typed error taxonomy
- audit event
- correlation/request ID
- retry safety
- tests and runtime evidence

## 5. Critical commands
Initial contract set:
- registerCustomer
- approveCustomer
- changeCustomerTier
- suspendCustomer / reactivateCustomer
- createOrder
- editDraftOrAllowedOrder
- transitionOrderStatus
- adjustInventory
- recordStockMovement
- updateProduct
- bulkUpdatePrices
- stageImport
- validateImport
- commitImport
- enqueueExternalDelivery
- retryIntegrationDelivery

## 6. Order contract
`createOrder` is server-authoritative for product identity, authorized price, availability rules, totals, customer scope, and order number. Client totals are hints only and must never become the financial truth.

Order creation must accept a client operation/idempotency key and return the canonical order ID/number. Repeating the same operation must not create a second order.

## 7. Pricing contract
The customer-facing API returns only the price authorized for the authenticated customer context. Tier metadata and alternative prices are excluded unless an explicitly authorized administrative contract requires them.

## 8. Inventory contract
Inventory mutations are transactional and auditable. Available quantity cannot be trusted from a cached client during authoritative commit. Concurrent adjustments must use an explicit consistency strategy and preserve a movement ledger.

## 9. Integration contract
```text
Domain transaction
 → durable outbox event
 → worker
 → external adapter
 → delivery record
 → retry/backoff or terminal failure
```

No external WhatsApp/Onyx/export operation may be required to succeed before the core business transaction commits.

Each delivery records provider, operation type, idempotency key, correlation ID, attempt count, status, timestamps, response classification, and terminal error where applicable.

## 10. WhatsApp
Use an official business API adapter when automated business messaging is enabled. The application must not depend on a client-side deep link as its authoritative delivery mechanism. Message rendering and delivery status are separate concerns.

## 11. Onyx Pro
Onyx integration is adapter-based. Its exact export/import column contract is versioned and tested independently from the core sales/inventory domain. Mapping errors must be caught during staging/validation rather than after mutation.

## 12. Error taxonomy
At minimum:
- AUTHENTICATION_REQUIRED
- FORBIDDEN
- VALIDATION_FAILED
- NOT_FOUND
- CONFLICT
- IDEMPOTENCY_REPLAY
- CONCURRENCY_CONFLICT
- RATE_LIMITED
- INTEGRATION_UNAVAILABLE
- INTEGRATION_TERMINAL_FAILURE
- INTERNAL_ERROR

Errors must not leak secrets, SQL details, tokens, or cross-scope information.

## 13. Evidence gates
A contract is not considered verified because a TypeScript type exists. Evidence progresses:
`SPECIFIED → IMPLEMENTED → UNIT VERIFIED → INTEGRATION VERIFIED → SECURITY VERIFIED → E2E VERIFIED → RUNTIME PROVEN`.

## 14. Architecture decision
Adopt versioned typed service contracts, explicit command/query boundaries, durable outbox-based integrations, idempotency for retriable mutations, and server-authoritative business truth as the canonical baseline. Exact framework syntax remains subject to final technology evaluation and Batch-3 reconciliation.
