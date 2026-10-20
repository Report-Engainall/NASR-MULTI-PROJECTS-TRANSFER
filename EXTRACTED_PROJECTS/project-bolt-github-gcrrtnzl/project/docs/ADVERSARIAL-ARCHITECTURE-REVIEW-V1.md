# Aghbari — Adversarial Architecture Review V1

**Status:** Phase-0 challenge review; findings must become implementation/test gates.

## Objective
Actively attempt to break the candidate architecture rather than confirm that its documents are internally plausible.

## Attack and failure matrix

| Threat / failure | Attack or race | Required control | Evidence gate |
|---|---|---|---|
| Cross-organization access | Guess valid UUID from another organization | service authorization + RLS scope enforcement | direct API negative tests |
| Cross-customer order access | Change order ID in URL/request | owner/scope policy before serialization | authenticated E2E |
| Price-tier leakage | Request product/pricing endpoint with another tier ID | server-derived pricing context; no client tier authority | response-shape security test |
| Tier tampering | Modify tier in registration/order payload | ignore client authority field; derive server-side | mutation test |
| Branch hopping | Submit another branch ID | authorized scope resolved server-side | direct API test |
| Warehouse hopping | Submit another warehouse ID | warehouse permission + RLS | direct API test |
| Privileged endpoint bypass | Call API directly without UI | every request authorized server-side | authorization test suite |
| Order replay | Replay same create-order operation | scoped idempotency key | duplicate prevention test |
| Order race | Two concurrent creates from same operation | unique/idempotency constraint | concurrency test |
| Stock oversell | Concurrent reservation/sale | transactional consistency strategy | concurrent inventory test |
| Stock overwrite | Send arbitrary balance value | ledger-only mutation path | API negative test |
| Illegal order transition | Jump from cancelled to delivered | explicit transition matrix | state-machine test |
| Client total manipulation | Alter item price/total | server recomputation | tamper test |
| Import poisoning | Malformed/duplicate/foreign rows | staged validation + scope checks | adversarial fixture import |
| Import replay | Re-upload same source | fingerprint/idempotency policy | repeat import test |
| External replay | Worker retries same WhatsApp/Onyx operation | delivery idempotency | adapter replay test |
| External outage | Provider unavailable during order commit | outbox decoupling | fault-injection test |
| Stale offline write | Client syncs outdated stock/order data | server authority + version/conflict policy | offline conflict test |
| Soft-delete bypass | Reference archived product/customer | lifecycle constraints + authorization | relational integrity test |
| Identifier enumeration | Iterate predictable IDs | UUID + authorization + safe not-found behavior | enumeration test |
| Audit evasion | Mutate sensitive entity without audit | transactional audit requirement | audit completeness test |
| Secret leakage | Error/log includes token or SQL | typed errors + secret redaction | log/error inspection |
| Rate abuse | Repeated auth/order/import calls | rate limiting + abuse controls | rate-limit test |

## Contradictions checked

### Analytics duplication
No operational table or feature is allowed to become a second BI/Decision Intelligence platform. Aghbari owns operational truth; Report-Advisor owns analytics/forecasting/decision intelligence.

### UI vs authorization
UI hiding is treated as presentation only. Authorization must be enforced independently at API/service and database layers.

### Synchronous integrations
WhatsApp/Onyx/export delivery cannot be a prerequisite for committing the business transaction. Durable outbox processing is mandatory for external side effects.

### Offline truth
Offline cache may support browsing and controlled drafts, but cached stock/pricing cannot override server authority during authoritative commit.

### Legacy implementation
Historical app behavior is evidence for capability, not a reason to preserve legacy architecture, naming, coupling, or insecure mechanisms.

## Required implementation hardening
Before architecture freeze, prove:
1. scope resolution is centralized and cannot be replaced by client input;
2. pricing resolution has one authoritative path;
3. inventory mutations have one authoritative transactional path;
4. order creation has one idempotent canonical path;
5. state transitions are explicit and auditable;
6. all external effects leave a durable trace;
7. imports cannot silently partially mutate canonical data;
8. every sensitive endpoint has negative authorization coverage;
9. audit events cannot be silently omitted by ordinary application code;
10. runtime evidence identifies the exact deployed commit and schema migration set.

## Current disposition
- No critical contradiction found in the documented boundary model.
- Several controls remain **specified, not proven** because implementation does not yet exist.
- Batch 3 is still required before final architecture freeze.
- This review is a challenge baseline and must be repeated after implementation slices; passing documentation review once is not permanent proof.
