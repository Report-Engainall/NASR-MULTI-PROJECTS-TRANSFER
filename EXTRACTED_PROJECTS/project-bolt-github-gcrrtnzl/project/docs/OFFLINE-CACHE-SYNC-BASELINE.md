# Aghbari — Offline, Cache & Synchronization Baseline

**Status:** Phase-0 engineering baseline; implementation-neutral.

## 1. Principle
Offline capability improves continuity; it must never manufacture false business truth.

## 2. Safe offline data
Cache only data whose staleness is acceptable, such as catalog presentation metadata, images, categories, and other explicitly versioned reference data. Sensitive/private data requires deliberate cache controls and expiration.

## 3. Offline operations
Permitted offline work is limited to controlled draft preparation where business risk allows it. Authoritative order creation, stock mutation, price mutation, approval, and other high-risk writes require server confirmation.

## 4. Operation identity
Every queued client mutation has a globally unique client operation ID, creation timestamp, authenticated actor context, operation type, payload version, and retry state.

## 5. Sync
```text
Client draft/queue
 → connectivity restored
 → authenticate
 → submit operation ID
 → server validates authority + current truth
 → transaction
 → idempotent acknowledgement
 → client reconciles state
```

A retried operation must be safe. The server is authoritative if client state conflicts with current inventory, pricing, customer status, or order state.

## 6. Conflict policy
Conflicts are explicit, not silently merged:
- stale price → reprice/review
- insufficient stock → reject or adjust according to domain policy
- changed order state → reject stale transition
- suspended customer → reject protected command
- duplicate operation ID → return original result where safe

## 7. Cache invalidation
Use versioning/revalidation and targeted invalidation rather than assuming long-lived local truth. Sensitive authorization decisions are never satisfied solely from cached client state.

## 8. Weak networks
Requests need bounded timeouts, retry classification, exponential backoff with jitter where appropriate, and visible pending/success/failure states. Avoid duplicate submissions caused by impatient repeated taps.

## 9. Service worker/PWA
The service worker may provide app-shell and safe asset caching. It must not bypass authentication, authorization, or server truth for protected mutations.

## 10. Evidence
Test offline/online transitions, duplicate submissions, stale drafts, concurrent stock changes, stale pricing, token expiry during sync, interrupted sync, retry exhaustion, and recovery after application restart.

## 11. Decision
Adopt server-authoritative synchronization with idempotent operation IDs, controlled offline drafts, explicit conflict handling, safe cache boundaries, and durable recovery semantics. Exact caching library/framework is deferred to technology selection.
