# Aghbari — Domain/API Contract Map V1

**Status:** candidate engineering contract; Batch 3 and technology gates pending.

## Contract rule
Every externally reachable operation is a business/security contract. It must identify actor, authorization scope, target, transaction boundary, idempotency/concurrency behavior, response projection, errors, audit event, and evidence path.

## Context map

| Context | Representative commands | Representative queries | Critical authority |
|---|---|---|---|
| Identity & Access | register, approve, suspend, reactivate, assign role | current actor, effective permissions | server + DB authorization |
| Customers | create/update customer, change tier, block/reactivate | customer detail/list | customer scope + role policy |
| Catalog | create/update/archive product, identifiers/media | product search/detail | product lifecycle |
| Pricing | set price, bulk price update | resolve authorized price | server-side pricing context |
| Inventory | adjust stock, receive, reserve/release | balance, movement history | transactional ledger |
| Sales | create/edit order, transition status, cancel | cart, order detail/history | order state machine |
| Purchasing | create PO, receive goods | PO/receipt detail | purchasing + inventory transaction |
| Promotions | create/activate/deactivate offer | active offers | explicit eligibility rules |
| Notifications | create notification, acknowledge | inbox/status | actor + delivery policy |
| Import/Export | stage, validate, commit, export | job status/errors | staged validation |
| Integration Hub | enqueue, retry, reconcile delivery | delivery status | outbox/idempotency |
| Audit & Compliance | record audit event | audit search | append-only evidence |

## Core command contracts

### `registerCustomer`
- Actor: unauthenticated registration context using a valid invitation.
- Authorization: invitation validity + registration policy.
- Transaction: create identity/customer in pending state atomically.
- Idempotency: registration operation identifier prevents duplicate customer records.
- Output: safe registration result; never disclose internal role/tier machinery beyond required customer-facing outcome.

### `approveCustomer` / `changeCustomerTier`
- Actor: authorized administrative role.
- Authorization: explicit customer-management permission and organization scope.
- Transaction: customer state + tier change + audit event.
- Concurrency: optimistic version or equivalent conflict detection.
- Output: customer projection excluding secrets and irrelevant internal fields.

### `createOrder`
- Actor: authenticated customer or authorized staff.
- Authorization: customer/organization/branch policy.
- Transaction: validate cart/items, resolve authoritative price, validate availability, calculate totals, persist order and status history, emit outbox event.
- Idempotency: required client operation key scoped to actor/operation.
- Concurrency: explicit stock/reservation strategy; no negative stock through races.
- Output: canonical order ID/number and safe invoice/order projection.
- Forbidden: trusting client price, client total, tier selection, or warehouse scope.

### `editDraftOrAllowedOrder`
- Actor: customer or staff according to order state and role policy.
- Authorization: state-aware policy.
- Transaction: replace allowed lines atomically and recompute authoritative totals.
- Idempotency: operation key for retriable mutation.
- Output: new canonical order version/status.

### `transitionOrderStatus`
- Actor: role permitted for the specific transition.
- Authorization: state machine + scope + role.
- Transaction: transition + history + audit + optional outbox event.
- Forbidden: arbitrary status assignment from request body.

### `adjustInventory` / `recordStockMovement`
- Actor: warehouse role or explicitly authorized administrator.
- Authorization: warehouse scope + operation permission.
- Transaction: movement ledger + balance update atomically.
- Concurrency: row/version locking or equivalent deterministic strategy.
- Output: resulting balance and movement reference.
- Forbidden: direct client balance overwrite without a controlled adjustment operation.

### `updateProduct`
- Actor: catalog-authorized role.
- Authorization: organization scope.
- Transaction: product mutation + relevant identifier/media changes + audit.
- Concurrency: version conflict detection.

### `bulkUpdatePrices`
- Actor: pricing-authorized role.
- Authorization: organization scope + price-list scope.
- Transaction: staged validation followed by atomic or explicitly partitioned commit.
- Failure: invalid rows never silently mutate canonical pricing.
- Evidence: source file fingerprint, job ID, validation report, commit result.

### `stageImport` → `validateImport` → `commitImport`
- Actor: authorized staff.
- Authorization: import type + scope.
- Transaction: staging is isolated; commit is explicit.
- Idempotency: source fingerprint/job operation prevents accidental duplicate submission.
- Failure: row-level diagnostics; no hidden partial commit.

### `enqueueExternalDelivery` / `retryIntegrationDelivery`
- Actor: trusted system or authorized operator for manual retry.
- Authorization: integration policy.
- Transaction: durable outbox/delivery record.
- Idempotency: provider operation key + internal delivery key.
- Failure: retry/backoff/dead-letter; terminal failure is visible and auditable.

## Query rules
- Pagination for unbounded lists.
- Explicit field projection.
- Authorization filtering before serialization.
- Customer-facing price query returns only the authorized price.
- Order history is restricted to the owning customer or permitted staff scope.
- Inventory queries respect warehouse scope.
- Audit queries require elevated authorization.

## Error contract
Canonical error classes:
`AUTHENTICATION_REQUIRED`, `FORBIDDEN`, `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_REPLAY`, `CONCURRENCY_CONFLICT`, `RATE_LIMITED`, `INTEGRATION_UNAVAILABLE`, `INTEGRATION_TERMINAL_FAILURE`, `INTERNAL_ERROR`.

Errors must not expose secrets, SQL internals, tokens, or cross-scope existence information.

## Event contract
Domain transaction first; durable outbox second; external side effect third. Events carry event ID, type/version, aggregate reference, organization/scope, correlation ID, occurred-at timestamp, and non-secret payload needed by the consumer.

## Versioning
- Public/service contracts are versioned independently from database migration versions.
- Breaking changes require explicit compatibility/deprecation evidence.
- Provider-specific payloads remain inside adapters.

## Evidence requirement
Each contract progresses independently through:
`SPECIFIED → IMPLEMENTED → UNIT VERIFIED → INTEGRATION VERIFIED → SECURITY VERIFIED → E2E VERIFIED → RUNTIME PROVEN`.

A type definition or mocked response is never sufficient runtime evidence.
