# Aghbari — Technology Proof Gates V1

**Status:** candidate gates; no production technology freeze before evidence and Batch 3 reconciliation.

## Objective
Turn technology selection from preference into evidence. A candidate must pass the gates relevant to security, performance, maintainability, deployment, testing, and the Aghbari domain model.

## Candidate direction
- PostgreSQL 18.x: production database baseline candidate.
- Web/PWA first with a current supported React/Next.js-compatible stack candidate.
- Typed TypeScript service/domain contracts.
- Background worker/outbox mechanism for external side effects.
- Object/media storage with derivative generation and cache/CDN strategy.

The exact framework/runtime versions remain a proof-gated decision, not an assumption inherited from the old system.

## POC gates
### G1 — Transactional core
Prove atomic order creation, price authority, inventory mutation, and idempotency under concurrent requests.

### G2 — Authorization
Prove server authorization + RLS deny cross-customer, cross-branch, cross-warehouse, and cross-tier access through direct requests.

### G3 — Typed API contracts
Prove request/response/error schemas can be generated or validated consistently without database leakage.

### G4 — Background delivery
Prove durable outbox → worker → adapter → delivery record → retry/dead-letter behavior without duplicate business mutations.

### G5 — Weak-network/PWA behavior
Prove safe reference-data caching and draft/cart preparation without presenting stale cached inventory as authoritative truth. Replay uses client operation IDs and server idempotency.

### G6 — Import/export
Prove staged validation, bounded memory behavior, deterministic error reporting, and atomic/explicit commit semantics for bulk data.

### G7 — Performance
Establish repeatable budgets for critical customer catalog/search/order flows and administrative operational flows. Measure p50/p95/p99 rather than relying on a single local timing.

### G8 — Observability
Prove correlation IDs, structured errors, audit events, job status, integration delivery state, and actionable failure classification.

### G9 — Deployment/recovery
Prove reproducible build/deploy, migration from empty database, upgrade migration, backup/restore procedure, and configuration validation.

### G10 — Testability
Prove unit, integration, authorization/RLS, concurrency, contract, and E2E tests can run deterministically in CI.

## Pass criteria
A technology candidate is accepted only when the relevant gate has executable evidence. Documentation alone is not a technology PASS.

## Anti-lock-in rule
Avoid framework-specific business logic in domain invariants. Keep adapters around infrastructure concerns so future replacement does not require rewriting the operational core.

## Current decision
**NOT FROZEN.** Batch 3 and executable POCs remain required before architecture freeze.
