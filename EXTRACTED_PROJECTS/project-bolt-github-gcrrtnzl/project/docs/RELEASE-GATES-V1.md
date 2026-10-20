# Aghbari — Release Gates V1

## Gate R0 — Architecture
Batch-3 reconciliation exists and canonical ownership is frozen for implementation.

## Gate R1 — Database
Clean install, upgrade, repeatability, constraints, indexes, RLS, and fixtures pass on the exact HEAD.

## Gate R2 — Domain
Catalog, pricing, inventory and order operations execute transactionally with server-authoritative truth.

## Gate R3 — Security
Authentication, tenant isolation, role enforcement, guessed-ID denial, cross-branch denial and privileged-command denial pass through real request paths.

## Gate R4 — Reliability
Idempotency, concurrency, outbox durability, retry/backoff and terminal failure handling are proven.

## Gate R5 — Integrations
Onyx, WhatsApp and Report-Advisor adapters prove contract validation, provenance, correlation and delivery semantics. No external system may write Aghbari operational truth directly.

## Gate R6 — UX/runtime
Browser E2E proves authenticated customer/admin journeys, operational workflows, error handling and bounded offline behavior.

## Gate R7 — Production
Deployment, environment configuration, smoke tests, observability, rollback/recovery and release evidence pass.

## Final rule
Certification is `PRODUCTION CERTIFIED` only when R0–R7 pass against one exact HEAD. Any subsequent mutation returns certification to `NOT CERTIFIED` until evidence is refreshed.
