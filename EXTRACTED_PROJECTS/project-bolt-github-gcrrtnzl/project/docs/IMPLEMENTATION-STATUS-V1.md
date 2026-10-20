# Aghbari — Implementation Status V1

**Scope:** `Aghbari-Technologies/aghbari-commerce` only.

## Status

- Architecture: RECONCILED
- Canonical ownership: ACCEPTED
- Physical relation families: IMPLEMENTED IN MIGRATION TREE
- Transactional domain invariants: prior evidence exists; fresh current-head CI execution evidence remains required
- Order workflow: prior evidence exists; fresh current-head CI execution evidence remains required
- Operational frontend/PWA: IMPLEMENTED and integrated
- Operational domain/services: IMPLEMENTED and integrated
- Supabase operational migrations/RLS/RPC layer: IMPLEMENTED through migration 0023; live security/runtime checks are proven for the current database state
- Catalog, cart, orders, import, image pipeline and offline queue: IMPLEMENTED
- Purchasing + receiving: IMPLEMENTED
- Customer lifecycle: IMPLEMENTED
- Inventory transfer + thresholds/low-stock: IMPLEMENTED
- Stock count/reconciliation: IMPLEMENTED
- Finance: IMPLEMENTED
- Catalog export: AVAILABLE
- Outbox: durable claim/recovery contract implemented; deployable worker present; production delivery proof remains open
- Offline cart/queue: hardened for user scoping, retry exhaustion and duplicate online-event replay
- Real Auth/RLS/E2E: staging/browser proof remains open
- Browser E2E: IMPLEMENTED as an executable Playwright gate; authenticated runtime execution remains pending target + credentials
- Production deployment: OPEN
- Production certification: NOT CERTIFIED

## Current authoritative implementation boundary

**Current candidate branch:** `security/rpc-surface-final6`

**Current candidate HEAD:** `960ef9c29a4404f7194db79a41698cab9fda298e`

PR #42 remains open and unmerged. The candidate HEAD includes the security/RPC reconciliation through migration `0023_restore_app_rpc_boundaries` plus the current execution documentation update.

## Verified current Supabase boundary

- Migration history is complete through `0023_restore_app_rpc_boundaries`.
- 23/23 public tables have RLS enabled.
- 23/23 public RLS policies are authenticated-only; no public-role RLS policies remain.
- Current live privilege audit: 19 public functions; 14 executable by `authenticated`; 0 executable by `anon`.
- The 14 exposed SECURITY DEFINER RPCs inspected use fixed `search_path = public` and enforce tenant/customer or staff-role guards appropriate to their boundary.
- Catalog uses the mandatory 5-argument warehouse-aware RPC; the legacy 4-argument RPC is not executable by `authenticated` or `anon`.
- Live temporary fixtures were cleaned: 0 organizations and 0 auth users remain.

## Verified implementation fronts present in the repository

1. Customer order response-shape validation.
2. Staff order response/transition validation.
3. Inventory command validation and deterministic regression coverage.
4. Purchasing/receiving command validation and deterministic regression coverage.
5. Finance command validation and deterministic regression coverage.
6. Outbox state-machine validation and deterministic regression coverage.
7. Exact-SHA bindings across critical evidence workflows.
8. Lockfile bootstrap workflow with fail-closed `npm ci` verification.
9. Release audit covering manifest, workflows, migrations, RPC references, security headers and runtime hazards.
10. Production smoke checks covering build provenance, security headers, PWA manifest and Service Worker boundaries.
11. Runtime rejection of null/non-object order drafts.
12. Runtime rejection of missing/non-string idempotency keys.
13. Runtime rejection of null/non-object order lines.
14. Runtime rejection of non-string product identifiers.
15. Runtime validation of the inventory container boundary.
16. Preview handling for non-array runtime input.
17. Preview handling for malformed/null line objects.
18. Preview protection against line multiplication overflow.
19. Preview protection against accumulated-total overflow.
20. Preview regression coverage for zero quantity and negative price containment.
21. Warehouse-aware catalog boundary with explicit tenant/warehouse validation.
22. Legacy catalog RPC execution removed from authenticated/anonymous/public access.
23. Frontend-invoked application RPCs restored to authenticated execution without restoring anonymous/PUBLIC execution.
24. Live RPC privilege audit and SECURITY DEFINER guard inspection.

## Latest execution batch

- `b10b23b197034eaae1744bf437557f18dd9db159` — hardened the order domain against malformed runtime objects and preview arithmetic overflow without changing server-side pricing authority.
- `aa6b571ea0b1a64c21ad9169894ea06708d81a60` — added deterministic adversarial regression coverage for the new runtime and arithmetic boundaries.
- `906884c9b8934df52a939222d6fe4380bc2b847f` — restored authenticated execution for frontend-invoked RPCs while retaining anon/PUBLIC denial (`0023_restore_app_rpc_boundaries`).
- `960ef9c29a4404f7194db79a41698cab9fda298e` — synchronized the execution log/status boundary with the latest candidate and CI evidence state.

## Evidence state

- `package-lock.json`: NOT PROVEN present on candidate; GitHub source lookup confirms it is absent.
- Fresh CI: NOT PROVEN. Current workflow attempts report `failure` but expose `steps=null`; direct job-log retrieval returns `BlobNotFound`, so no code-level failure is inferred.
- Fresh unit/domain execution: NOT PROVEN on current candidate until a runner exposes execution evidence.
- Fresh pgTAP/PostgreSQL CI execution: NOT PROVEN on current candidate; targeted live database transaction checks have passed for the catalog/security boundary.
- Live Supabase schema/security boundary: VERIFIED for current database state.
- Authenticated Browser E2E: NOT PROVEN against a real target.
- Outbox external delivery: NOT PROVEN.
- Production deployment: OPEN.

## Remaining closure gates

1. Obtain usable GitHub Runner step/log evidence on the exact candidate HEAD.
2. Generate and commit a valid synchronized `package-lock.json` and prove `npm ci`.
3. Run fresh typecheck, lint, unit/domain, migration/pgTAP, security, regression and build gates.
4. Provision/connect staging Supabase with real Tenant A/B identities.
5. Execute adversarial tenant isolation across data paths and RPCs.
6. Execute the authenticated Golden Path and verify persisted order after refresh.
7. Execute full order state-machine and inventory runtime scenarios.
8. Execute purchasing/receiving and finance runtime scenarios.
9. Execute real import/export, offline/replay and outbox delivery/recovery proofs.
10. Execute security adversarial, performance, backup/restore and rollback evidence.
11. Deploy to production and verify artifact SHA against the tested candidate.
12. Perform final regression, exact-head audit and certification.

## Evidence rule

Every PASS must identify the exact SHA, execution environment, command/test path and evidence artifact. A commit, workflow definition or source-code presence alone is never a runtime PASS.

## Protocol binding

Command `1` means immediate execution continuation. The execution loop is: LOAD STATE → RESCAN → PRIORITIZE → FIX → TEST → REGRESSION → ADVERSARIAL CHECK → VERIFY → EXACT-HEAD CHECK → DOCUMENT → NEXT. Work continues in parallel across independent fronts; external blockers do not stop independent executable work.
