# Aghbari — Master Execution Index

**Canonical status ledger. Updated after every meaningful execution boundary.**

## Identity
- Product: **بوابة الأغبري للمواد الغذائية**
- Repository: `Aghbari-Technologies/aghbari-commerce`
- Branch: `main`
- Current exact implementation HEAD after this execution boundary: **`c44b45cd4ab48a455ea065685d28df6de9eb639f`**.
- Scope: **Aghbari Commerce only.** `Report-Advisor` and every other project are out of scope.
- Benchmark reference: **`https://alamri.app/` (بوابة العامري الذكية)** is treated only as an external UX/product benchmark; Aghbari identity, naming and implementation remain independent.

## Certification stages
| Stage | Current state |
|---|---|
| BUILT | **ADVANCED IMPLEMENTED** — commerce shell, catalog/pricing, cart/orders, staff operations, customers, inventory, purchasing/receiving, finance, import/export, outbox, PWA/offline and security hardening are present. |
| INTEGRATED | **IMPLEMENTATION PASS** — checkout, invoice RLS, finance runtime validation, transaction-boundary hardening, identity-helper ACL hardening, deterministic Vercel install contract, responsive navigation, Product/UI Excellence interaction-state hardening, export completeness/current-price handling, and runner-backed lockfile bootstrap are implemented on `main`. |
| VERIFIED | **NOT PROVEN** — a fresh exact-head GitHub Actions quality run has not completed successfully. |
| RUNTIME PROVEN | **PARTIAL / NOT CERTIFIED** — live Supabase authenticated-context database proof covers catalog authorization, tenant/warehouse binding, order creation, inventory decrement and idempotent replay; browser and deployed-runtime proof are still required. |
| PRODUCTION CERTIFIED | **NOT PROVEN** — certification gate remains open until all runtime and release evidence is green. |

## Latest execution boundary — 2026-09-08
- Main was re-verified at exact HEAD **`c44b45cd4ab48a455ea065685d28df6de9eb639f`**.
- The runner-backed `bootstrap-release-lockfile` workflow was executed and its failed job was rerun. The latest job for run `34181568528` completed with **failure**. GitHub exposed no step records and the job-log endpoint returned `404 BlobNotFound`; therefore the failure cause is **NOT PROVEN** and must not be guessed.
- `package-lock.json` was checked on `main` and is **NOT PRESENT** (GitHub Contents API returned 404). The deterministic lockfile gate therefore remains **BLOCKED / NOT PROVEN**.
- No fake CI PASS was recorded. No credentials or secrets were added to the repository.
- Supabase fixture state remains intact: 2 organizations, 2 linked profiles, 2 E2E products, and 1 committed idempotent proof order were verified.
- Authenticated Tenant A → Tenant B warehouse access through the authoritative catalog RPC remains rejected with `42501 warehouse not available`.
- Invalid cart quantity `0` was exercised inside a transaction and did not produce a committed mutation; the transaction was rolled back.

## Runtime evidence already proven
- Tenant A catalog authorization returns only its authorized product/price/warehouse context.
- Tenant A created real order `#9` for 1 unit at YER 1,000.
- Replaying the same idempotency key returned the same persisted order reference without creating a duplicate; the replay transaction was rolled back, preserving one committed proof order.
- Tenant A cannot use Tenant B's warehouse through the authoritative catalog RPC (`42501 warehouse not available`).
- Two dedicated non-production Supabase Auth identities exist for Tenant A/B E2E; credentials are not stored in repo/docs.
- Fixture linkage exists for each tenant across organization, branch, warehouse, customer, profile, category, product, wholesale price and positive inventory.

## Export reliability boundary
- Product export paginates the catalog instead of silently truncating at the first 5,000 rows.
- Exported prices are restricted to currently valid price records before selecting the newest authorized tier value.
- Safe upper bounds were added for product and price export volume.
- Spreadsheet formula-injection escaping remains enabled.
- No business authorization, pricing authority, tenant boundary or order behavior was changed.

## Previous implementation evidence
- Product/UI Excellence interaction-state hardening improved keyboard-visible focus treatment, disabled-state affordances, focus-within elevation, quantity-control states, empty-state sizing, mobile cart spacing and reduced-motion behavior.
- Source audit found no `localStorage` usage outside the dedicated offline queue, no `dangerouslySetInnerHTML`, and no `TODO`/`FIXME` markers at the previous boundary.
- Offline queue remains user-scoped, operation-type allowlisted, size/attempt bounded, corruption-tolerant, and retry-backoff controlled; runtime delivery is still NOT PROVEN.
- Batch 7 restricted `current_organization_id()`, `current_customer_id()`, and `current_role()` execution from `anon` to authenticated/service_role.
- Batch 6 hardened order runtime boundaries and expanded adversarial order input tests.
- Batch 5 hardened finance, purchasing/receiving transaction boundaries and cart quantity limits.
- All 34 public RLS-enabled tables have at least one policy; previous invoice-table policy gaps were restored.
- Deployment install contract uses `npm ci --no-audit --no-fund`.

## Remaining closure work — priority order
### P0 — Release blockers
1. Resolve the runner-backed lockfile bootstrap failure and verify `package-lock.json` is committed and synchronized with `package.json`.
2. Obtain fresh step-level typecheck, lint, unit/domain, database/pgTAP, build, security and release-audit evidence for the final exact HEAD.
3. Execute a clean-source Supabase migration reset/pgTAP run and reconcile the complete repository chain against live history.
4. Execute authenticated browser E2E, including tenant isolation and exact-created-order persistence.
5. Connect/deploy the actual Aghbari Vercel project and execute runtime smoke against the exact deployed SHA. No unrelated Vercel project will be mutated.

### P1 — Reliability proof
6. Runtime-prove offline refresh/cache/reconnect/replay/conflict/recovery and tenant scoping.
7. Runtime-prove outbox claim/delivery/retry/backoff/terminal failure and consumer idempotency.
8. Runtime-prove import/export malformed-input, quarantine, atomic commit, authorization and cross-tenant cases.
9. Re-run full pgTAP suites on clean/reset/repeat paths.

### P2 — Final hardening
10. Complete query-plan and representative-load review with production-like data.
11. Complete observability, audit, backup/recovery and rollback evidence.
12. Deploy release candidate → exact-SHA smoke → final regression → freeze exact HEAD → production certification.

## No-false-closure
A migration file is not migration execution evidence. A UI restriction is not authorization evidence. A queued outbox event is not successful delivery evidence. A green run on an earlier SHA is not exact-current-HEAD evidence. A documentation PASS is not a runtime PASS. Test credentials must never be fabricated or committed.

**NEXT EXECUTION LOOP:** continue Aghbari-only execution from exact `c44b45cd4ab48a455ea065685d28df6de9eb639f`. Resolve code/repository defects immediately; external runner/deployment gates remain explicitly blocked until executable evidence is obtained.