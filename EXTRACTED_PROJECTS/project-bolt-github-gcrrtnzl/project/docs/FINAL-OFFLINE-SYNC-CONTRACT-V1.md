# Aghbari — Final Offline / Weak-Network Sync Contract V1

**Status:** PROVISIONAL CONTRACT — implementation and runtime evidence required before certification. V2 synchronization hardening is incorporated below.

## 1. Purpose

Define the safe offline/weak-network behavior of بوابة الأغبري للمواد الغذائية without allowing stale client state to become operational truth.

The server/database remains authoritative for prices, inventory availability, order acceptance, permissions, and final order state.

## 2. Offline capability classification

| Capability | Offline | Rule |
|---|---:|---|
| Catalog reference data | Yes | Cached, versioned, explicitly marked as cached |
| Product media | Yes | Cacheable with bounded storage and invalidation |
| Customer profile display | Limited | Only previously authorized, non-sensitive cached fields |
| Cart drafting | Yes | Local draft is non-authoritative |
| Order submission | Queueable | Accepted only after server validation/transaction |
| Inventory availability | No authoritative offline decision | Cached quantity may be shown only as stale/reference data |
| Tier price | Cacheable only if already authorized | Never cache or expose other tiers |
| Price-changing operations | No | Require current server authority |
| Inventory mutation | No direct offline commit | Must reach authoritative transaction boundary |
| Role/permission changes | No | Refresh from server before privileged actions |
| Order final status | No offline authority | Server status wins |

## 3. Client operation envelope

Every queued mutation MUST carry:

- `operation_id`: client-generated UUID, unique per logical mutation.
- `actor_id`: authenticated actor identity when available.
- `entity_type` and `entity_id` when applicable.
- `command_name` and `command_version`.
- `created_at` and `client_sequence`.
- `payload_hash` for deterministic replay diagnostics.
- `correlation_id` for tracing.

The server MUST treat `operation_id` as an idempotency key for retryable mutations.

## 4. Replay protocol

1. Client reconnects.
2. Client submits queued operations in deterministic sequence order where dependencies exist.
3. Server authenticates and re-authorizes every operation.
4. Server validates current business state.
5. Server executes the command transactionally.
6. Server records the idempotency result.
7. Client marks the operation `ACKED`, `CONFLICTED`, or `TERMINAL_FAILED`.
8. Retries MUST reuse the same `operation_id` and MUST NOT create a second business mutation.

## 5. Deterministic incremental pull

Where server infrastructure supports it, synchronization MUST use a server-issued monotonic cursor.

A pull response contains:
- authorized changed records/projections;
- tombstones for deletions where required;
- `next_cursor`;
- schema/version metadata;
- scope metadata sufficient for client cache validation.

The client MUST advance its cursor only after the complete page has been applied atomically. A failed page application leaves the previous cursor intact so the page can be retried safely.

A device receives a scoped projection, not a database dump. Authorization filtering happens before serialization.

## 6. Conflict classes

### PRICE_CHANGED
The authoritative price changed after the draft was created. Client must refresh and obtain explicit confirmation before submission.

### INVENTORY_CHANGED
Requested quantity is no longer available. Server rejects or applies the explicitly supported partial-fulfillment rule; client must not silently alter quantity.

### PERMISSION_CHANGED
Actor no longer has the required role/scope. Operation is rejected and the client refreshes authorization state.

### ENTITY_CHANGED
The referenced product/customer/order changed incompatibly. Client must refresh and reconcile.

### DUPLICATE_REPLAY
The same operation was already committed. Server returns the original result rather than creating another mutation.

## 7. Ordering and dependencies

Queued operations MUST NOT be assumed globally commutative.

Examples:

- A cart-line update can precede order creation.
- An order edit cannot be replayed against an order already transitioned to a non-editable state.
- Inventory mutations require server-side current-state validation.

When dependency ordering cannot be proven, the client must stop the dependent operation and surface a recoverable conflict.

## 8. Cache rules

Cached data MUST include:

- schema/version identifier,
- source timestamp,
- freshness/expiry metadata,
- scope identifier where relevant,
- invalidation/version token where available.

Sensitive or privileged data MUST NOT be placed in an unrestricted offline cache.

Cached inventory MUST be visually and semantically distinguished from authoritative availability.

## 9. Security invariants

Offline mode MUST NOT become an authorization bypass.

Every server replay is re-authenticated and re-authorized. Client-supplied organization, branch, warehouse, customer, role, or price-tier identifiers cannot expand authority.

A previously authorized cached response does not grant continuing authorization after the server revokes access.

## 10. Failure handling

| Failure | Client action |
|---|---|
| Network unavailable | Retain queue; exponential retry with jitter |
| Authentication expired | Pause queue; require re-authentication |
| Authorization denied | Mark terminal; do not retry blindly |
| Validation failure | Mark terminal; show actionable reason |
| Conflict | Mark conflicted; require refresh/reconciliation |
| Rate limited | Retry according to server guidance |
| Server unavailable | Retry with bounded backoff |
| Duplicate replay | Accept original server result |
| Unknown failure | Retry within bounded policy, then dead-letter for investigation |

## 11. Queue safety

The queue MUST be bounded and observable.

The implementation MUST prevent:

- unbounded local growth,
- duplicate queued operations,
- infinite retry loops,
- silent loss of accepted operations,
- replay after terminal failure,
- cross-account replay after logout/account switch.

Account/session changes MUST isolate or invalidate pending operations according to the security policy.

## 12. Server authority

The following are never client-authoritative:

- final customer eligibility,
- effective tier price,
- stock availability,
- inventory reservation/commit,
- order totals,
- order number,
- order state transition validity,
- authorization scope,
- integration delivery status.

## 13. Evidence gates

Implementation cannot claim this contract as PASS until executable evidence proves at minimum:

1. offline catalog/cache behavior,
2. cart draft persistence,
3. idempotent replay,
4. duplicate prevention,
5. stale-price rejection,
6. stale-inventory rejection,
7. revoked-authorization rejection,
8. conflict classification,
9. bounded retry/dead-letter behavior,
10. account/session isolation,
11. deterministic recovery after reconnect,
12. monotonic cursor advancement,
13. tombstone application and replay safety.

## 14. Relationship to other systems

Aghbari remains the operational system of record. Offline synchronization does not move transactional truth into Report-Advisor.

Report-Advisor remains responsible for analytics, BI, forecasting, Decision Intelligence, and analytical recommendations.

## 15. No-false-closure

This document is a contract, not runtime evidence. No offline capability is considered certified until the implementation passes the corresponding executable and runtime tests.
