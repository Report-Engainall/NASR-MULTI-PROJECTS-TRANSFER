# Aghbari Commerce — Development Progress Ledger

Rule: tests and evidence apply only to the exact SHA recorded with them. The push and Lovable sync are separate acceptance events. The master spec, mandate, registry, project memory and resume prompt are now persisted on main.

## 2026-10-15 — Storefront empty-catalog truth state (PR #50)

- **PR:** [#50](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/50), merged to `main` at `fffa5035f6b3ee3f55f4a2456b515aa0814e4899` from tested PR head `ced57138b68515b581fcc988271a1b9a1c847ed9`.
- **Exact PR-head CI:** [38776511699](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38776511699) **SUCCESS** including unit tests, PostgreSQL 17 migration/workflow acceptance, lint, build, production preview and dev-server smoke.
- **Files changed:** `src/components/Storefront.tsx`, `src/test/storefront-discovery.test.tsx`.
- **Behavior:** an empty published catalog now announces that no active items are available; a nonempty catalog with no matches retains the search/filter-specific message. Test covers the empty-catalog rendering. No fake records or production writes were added.
- **Limit:** public live readback still shows zero items, so this is not evidence that the production catalog has been populated or is bound to the intended project. `/invoices`, `/statement` and `/manifest.webmanifest` still returned 404 in the checked snapshot. Owner-signed Lovable publishing/authenticated browser verification remains open.
- **Current cursor:** `AGH-SEC-BROWSER-E2E-001` remains OPEN; intended Supabase ref `ffxxjaolfntzbapmfbuv` remains EXTERNAL / permission-denied. No production migrations were applied.


## 2026-10-15 — AGH-AI-GATEWAY-001: Gemini API-key URL leakage closed in source

- **PR:** [#49](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/49), merged by squash at main SHA `4787f806aa59ffb9ae5edaf219b201ef4a6d81f3`.
- **Exact tested PR head:** `664d7b361f1ed8f001ef8bb5b53f8c307d5eb361`; Actions run [38775258588](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38775258588) **SUCCESS** across unit, isolated PostgreSQL 17 migration/workflow acceptance, lint, build, production-artifact smoke and dev-server smoke.
- **Changed source paths:** `supabase/functions/ai-gateway/logic.ts`, `supabase/functions/ai-gateway/index.ts`, `src/test/ai-gateway-logic.test.ts`.
- **Root cause and fix:** Gemini API keys were appended to the request URL. Requests now use `x-goog-api-key`; a shared builder validates the host and required model/key and regression tests confirm an empty URL query and header-only key transport. No real key or external service was contacted by the tests.
- **Merge verification:** remote `main` was read back as `4787f806aa59ffb9ae5edaf219b201ef4a6d81f3`. Exact main CI run [38775736464](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38775736464) **SUCCESS** on the exact main merge SHA `4787f806aa59ffb9ae5edaf219b201ef4a6d81f3`.
- **Not closed:** `AGH-AI-GATEWAY-001` remains PARTIAL because provider secrets/configuration and live provider connection are not proven. `AGH-SEC-BROWSER-E2E-001` remains the sole `next_task_id`: the published homepage currently shows an empty catalog and public `/invoices`, `/statement`, `/manifest.webmanifest` return 404 despite successful source CI; signed-in Lovable publishing/live SHA readback and authenticated browser checks remain open. `AGH-EXT-SUPABASE-001` remains externally blocked on permission to intended project ref `ffxxjaolfntzbapmfbuv`; no production database was changed.
- **Host limitation:** the execution environment has no repository checkout, so local Git commands were unavailable; branch, remote SHA, files and Actions were checked through GitHub APIs.


## 2026-10-15 — Remote checkpoint reconciliation after PRs #41–#43

- **Remote `main` before this documentation-only refresh:** `39d2dec8752e973e9661c5564d85309f6df6f73a` (merge PR #43). This metadata commit updates stale checkpoint pointers; fetch live `main` again in the next session.
- **PR #41 — pricing route coverage:** tested SHA `81ef31247c434ba2381180e81924e7e8d135d14e`, [exact run 38761146295](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38761146295) **SUCCESS**.
- **PR #42 — account price removal from persisted catalog cache:** tested SHA `328c367e3947992b93d1bacc0664f4567844d67f`, [exact run 38761721452](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38761721452) **SUCCESS**.
- **PR #43 — outbox worker:** trusted-worker identity fix SHA `a21d138f648c3a50b2bb84e10559bb105c5a162b`, [exact run 38763521249](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38763521249) **SUCCESS**; preceding sanitizer fix SHA `ce675638e3e7c367d29a8def0b1e73d4cf04b2b4`, [run 38763315363](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38763315363) **SUCCESS**.
- **Evidence boundary:** the latest merged main SHA `39d2dec...` returns no exact-SHA status/run via the connected GitHub APIs. PR-head CI evidence does not imply this merge SHA passed. Root `AGENTS.md` and `.github/copilot-instructions.md` are present; Lovable docs confirm the root AGENTS loader, but live editor/deployment sync remains **UNVERIFIED**.
- **Next:** `AGH-PRICE-PRIVACY-001 — PARTIAL`; review remaining API/RPC/export fields and cross-tier leakage, then run live authenticated browser and publication SHA checks under `AGH-SEC-BROWSER-E2E-001`. Intended production Supabase ref `ffxxjaolfntzbapmfbuv` remains last-known inaccessible; no production mutation was attempted. No local checkout is mounted, so local Git commands were not run.



| Item | Current status | Evidence | Next closure |
|---|---|---|---|
| CI at `f75dcb7fd3f4a598b2acf6db6d649e0f54c92fac` | PASS | [Run 38687301037](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38687301037) unit/PostgreSQL/lint/build/5173 smoke all successful | The later `main` SHA has a separate CI run; do not transfer this PASS |
| CI at `05fcacbf4ddb6bfd025ab4b1fee7c144a44d4459` | PASS | [Run 38687685412](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38687685412) including expanded route and PWA asset smoke checks | Check CI for the newest main SHA; proof is SHA-specific |
| Persistent project requirements | PARTIALLY closed by this batch | Complete owner-uploaded master spec already exists at `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`; new durable mandate and resume files are being added | Keep updated after each implementation batch |
| Supabase production | BLOCKED EXTERNALLY | Current connector cannot access expected project ref `ffxxjaolfntzbapmfbuv` | Owner/admin access and explicit project identity required; never substitute another project |
| Tenant security | **PARTIAL — isolated PostgreSQL 17 and source CI PASS; production NOT PROVEN** | PR #26 merged as `fe22af0424947b56ae80e0679621cf0df333e284`; exact-head CI [38689077672](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38689077672) and main CI [38689238295](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38689238295) pass. Browser tenant constants replaced by authenticated `get_current_tenant_context()` plus restrictive RLS and cross-tenant negative checks. | Verify intended Supabase project/migration, authenticated browser E2E, price-tier privacy and anonymous storefront tenant routing; never infer production proof from isolated CI. |
| Customer/staff E2E and pricing privacy | PARTIAL | Isolated transaction, price authority, idempotency and denial checks are present in CI acceptance script | Test through authenticated browser and target DB; test all three tiers and data channels |
| Import / Onyx | PARTIAL | Unified CSV/XLSX engine, DQS, manifests/snapshots and read-only reconciliation exist | Validate resume/cancel/rollback/100k rows and exact Onyx workbook in a permitted test system |
| Invoice PDF / Onyx workbook | NOT PROVEN | Finance UI/RPC foundations exist; exported template acceptance is not attached | Generate actual PDF/XLSX and validate template column order from section 21 of canonical spec |
| AI gateway / queues / WhatsApp | PARTIAL or externally blocked | Deterministic assistant/schema and internal notifications exist; provider/worker proof incomplete | Secret-safe provider validation, quotas, privacy gate, fallback, deployed workers, official WhatsApp receipt |
| Public Lovable preview | **PARTIAL — runtime mismatch persists after main merge** | Read-only fetch on 2026-10-15: `/login` responds, while `/invoices`, `/statement`, both PDF APIs and `/manifest.webmanifest` return 404; local main CI [38755977039](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38755977039) passes the new route-specific Arabic title assertions. | Still requires authenticated runtime/browser, actual Lovable editor/deployment SHA readback and deployment route proof; repository CI does not establish live synchronization. |
| Production restore/performance | NOT PROVEN | No target-environment restore drill or P95/100k-row profile evidence | Run isolated/authorized tests and record method/results |
| Company member invitations / identity linkage — merged main SHA 68365d5dd87e9f00eff6bd68c6ad7d517e9cb567 | **CODE + ISOLATED CI VERIFIED; PRODUCTION/BROWSER PARTIAL** | PR #33 merged. Exact PR CI [38708641537](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38708641537) and main CI [38708849372](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38708849372) **SUCCESS**: unit, PostgreSQL 17 migration and membership/customer-scope acceptance, lint, build, /company/members and /company/accept-invitation smoke checks. Invitation token is one-time/hash-only and email-verified; buyer/finance/viewer capabilities are enforced in RPC/RLS. | Production ref ffxxjaolfntzbapmfbuv remains inaccessible; do not apply to mrcyqezbhpncuvaehwgf. Keep AGH-SEC-BROWSER-E2E-001 open and continue at AGH-FINANCE-DOCS-001. |


## Execution protocol
Read `PROJECT_MEMORY.md`, `ops/AGHBARI-SESSION-RESUME.md`, latest state and requirement registry first. Continue from the current GitHub `main` SHA. No broad repeated discovery, no placeholder success, no unverified production operation, no Lovable point spend before a tested push.


## 2026-10-15 — Finance route smoke metadata guard merged to main

- **Main SHA:** `d8212a45d4282a3d1e5c7927651975c641e2d51c`; exact main Actions [38755977039](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38755977039) **SUCCESS**. PR [#37](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/37) was merged from tested head `ddebb148c198295af3e488efe34bb4c32860fc48`; PR Actions [38755678481](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38755678481) **SUCCESS**.
- **Changed path:** `.github/workflows/commerce-checks.yml`.
- **Regression coverage:** in addition to HTTP status checks, local dev-server smoke fetches `/invoices` and `/statement` HTML and requires their own Arabic titles (الفواتير / كشف الحساب). This prevents a generic 200 fallback page from passing the route smoke. The same exact-SHA run also passed Bun lock check, unit tests, isolated PostgreSQL 17 acceptance, lint, build, anonymous PDF API 401 checks and PWA manifest smoke.
- **Evidence boundary:** this is local CI route contract coverage, not proof the published Lovable deployment runs the same SHA. Post-merge external readback still returns 404 for invoice/statement/PDF deep routes and the PWA manifest while `/login` responds. Live editor/deployment SHA and authenticated browser flow remain unverified.
- `next_task_id = AGH-SEC-BROWSER-E2E-001 — OPEN`; intended Supabase ref `ffxxjaolfntzbapmfbuv` remains permission-denied. No production DB changes.



## 2026-10-15 — Approved-order XLSX export: server audit merged to main

- **Main baseline before this documentation refresh:** `90cf41ecb471b219c5f82f113d13bcc6ab76afb9`; exact docs-baseline CI [38754165794](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38754165794) **SUCCESS**.
- **PR #36 merged:** [`feat(onyx): audit approved order workbook exports`](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/36), tested head `6bb4acfc3a0e5cca3e008c76b3e81a8404dadf29`, merge SHA `ea3b525d2d383dc7c22c70108ebaff8abd244c3d`.
- **Exact CI:** PR-head [38753274701](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38753274701) **SUCCESS**; main merge [38753519465](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38753519465) **SUCCESS** for unit tests, isolated PostgreSQL 17 migration/workflow acceptance, lint, build and local route/PWA/API smoke.
- **Changed paths:** `supabase/migrations/20261015170000_onyx_order_export_audit.sql`, `src/components/AdminPages.tsx`, `scripts/test-database-migrations.mjs`.
- **Implementation:** `public.record_onyx_order_export(uuid, integer)` requires an authenticated active staff profile, derives organization/actor from database identity, validates same-tenant order ID, approved final status/no pending review, and item count against persisted lines, then writes `audit_logs` action `onyx_export.prepared`. Client download is not started if audit fails.
- **Verified isolated DB behavior:** valid audit row + metadata, unapproved order denial, item-count mismatch denial, cross-tenant order denial and customer role denial. `compatibility_verified=false` and `download_completion_verified=false` are intentional.
- **Still open:** owner-authorized import acceptance in the actual Onyx version and proof of completed browser download. No production database writes/migrations.
- **Current next cursor:** `AGH-SEC-BROWSER-E2E-001 — OPEN` for the publicly deployed deep-route/authenticated-browser discrepancy; production project `ffxxjaolfntzbapmfbuv` remains permission-denied.



## 2026-10-15 — Approved-order XLSX export
- **PASS — source/code generation:** commit `6112b24c2807fbb013b9fcd2d38c889631286a7c`, [CI run 38688167670](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38688167670). Unit tests verify exact 27 section-21 headers, line mapping, leading-zero SKU strings, XLSX ZIP/OOXML package structures, customer header worksheet, and file-name sanitization. The same run passes isolated PostgreSQL acceptance, lint, build, route and PWA asset smoke.
- **PARTIAL:** XLSX generation is real and the central preparation audit was added later by PR #36 (documented above). Actual opening in Excel/LibreOffice and import acceptance into the owner’s Onyx version remain untested. Unknown accounting values stay blank, never synthesized.
- **UI safety:** the export button is disabled until the order is approved/confirmed and no quantity review is pending.
- **Release/sync:** external fetch still returns 404 for several published deep routes and the PWA manifest; Lovable editor fetch returns 403. Git push and green CI do not prove Lovable deployed this SHA.

## 2026-10-15 — Server-derived tenant scope hardening

- **MERGED:** PR #26, https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/26
- Main merge SHA: `fe22af0424947b56ae80e0679621cf0df333e284`.
- Exact PR head tested: `c117b0eee5b19411c1fa3bf5162dbef1e939455f`; [CI 38689077672](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38689077672) **PASS**. Main merge SHA [CI 38689238295](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38689238295) **PASS**.
- Affected files: `src/lib/supabase.ts`, `src/lib/api.ts`, `src/components/CustomerWorkflows.tsx`, `src/components/AdminPages.tsx`, `supabase/migrations/20261015090000_server_derived_tenant_context.sql`, `scripts/test-database-migrations.mjs`.
- CI passed: unit tests; all migrations and cross-tenant workflows on isolated PostgreSQL 17; lint; production build; dev-server smoke on port 5173 covering client/admin routes and PWA files.
- The first PR run failed at build for unresolved `ORG_ID` imports in `CustomerWorkflows.tsx` and `AdminPages.tsx`. Both consumers now resolve the organization from the authenticated tenant-context RPC; subsequent exact-head and merged-main runs passed.
- **Not closed:** source migration has not been applied to production; configured Supabase ref `ffxxjaolfntzbapmfbuv` is inaccessible. Authenticated browser E2E, full price-tier privacy, and anonymous storefront/domain tenant routing remain open. Lovable sync remains unproven.

## 2026-10-15 — Permanent session-resume protocol

- **Persistent instruction entrypoints:** root `AGENTS.md` and `.github/copilot-instructions.md` are present on remote `main`; Copilot's repo-wide instruction file points to the shared canonical rules. Lovable's own auto-loading and actual sync remain unverified.
- **Protocol implementation SHA:** `90602f6deeba79a5d80efad38d83efec64be5173`; exact-head [GitHub Actions run 38692264543](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38692264543) **SUCCESS**: unit tests, isolated PostgreSQL 17 acceptance, lint, build and port 5173 smoke.
- **Resume checkpoint follow-up SHA:** `755b0ac12668403530f6180a76468b8182a32b10`; exact-head [run 38692476144](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38692476144) **SUCCESS**. The registry marks `AGH-OPS-RESUME-001` `DONE_VERIFIED` for repository persistence/CI only.
- Canonical state/resume/registry/mandate and memory are updated; the owner-supplied `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md` remains unchanged. No duplicate log was created and no Lovable points were used.
- Production Supabase project `ffxxjaolfntzbapmfbuv` remains an external access blocker. Keep production migration and real-browser proof open.
- **next_task_id:** `AGH-SEC-BROWSER-E2E-001`.
## 2026-10-15 — Free Lovable persistent-instruction fallback verified

- Lovable official docs explicitly state that root-level `AGENTS.md` is always read by its agent regardless of session length: https://docs.lovable.dev/features/knowledge. The existing root `AGENTS.md` therefore gives Aghbari a free, repository-backed persistent session-resume mechanism; this avoids spending Lovable points or browser wallet credits just to persist the rule.
- Latest remote baseline when this clarification was prepared: `8729fdd39158ab562d5833d4dbdcf76856d83d47`, exact-head CI [38692662830](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38692662830) **SUCCESS**. This CI result applies only to that baseline; verify the clarification commit's own run separately.
- **Not claimed:** direct Project settings → Knowledge edit, or confirmation that a subsequent SHA is active in the live Lovable editor. The metered browser run did not start because its wallet balance was insufficient. No Lovable points or browser wallet funds were spent in this fallback.
- `AGH-OPS-RESUME-001` remains `DONE_VERIFIED` for committed repository policy/CI; editor sync stays a separate evidence gate. `next_task_id = AGH-SEC-BROWSER-E2E-001`.
## 2026-10-15 — AGH-SEC-BROWSER-E2E-001 source-level subgate

- Changed path: `src/test/public-catalog-privacy.test.ts` (new). Tests target the real data-access module `fetchProducts()` and assert anonymous least-privilege product/inventory column projections, resolved tenant/warehouse filters, fail-closed behavior on missing public scope, and staff query scoping.
- Baseline verified before implementation: `85dab55ec8e9ca903fe54b5f9845abe409037fad`; exact CI [38693335507](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38693335507) **SUCCESS**.
- First test SHA `e26e71e4ec05ef90e42da922bdf513cff43c22ed`; Actions [38693899113](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38693899113): `npm test` and `npm run test:db` **PASS**; Lint **FAIL** on one `prefer-const` issue in the new test; build and dev-server smoke were skipped. The follow-up uses `const` and is awaiting its own exact-SHA CI; source gate remains pending until that run passes.
- Honest boundary: these tests are query-contract unit tests, not real browser E2E; they do not certify production Supabase, authenticated browser sessions, or complete price-tier privacy over all transports. Production project ref `ffxxjaolfntzbapmfbuv` remains unverified/inaccessible. `next_task_id = AGH-SEC-BROWSER-E2E-001` remains OPEN.
## 2026-10-15 — Tenant-scope resolver coverage

- Confirmed follow-up SHA `127fb2b001c1ae4414cd8ee8baf9864cdd8fac12` exact-head [CI 38694129297](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38694129297) **SUCCESS** across unit tests, isolated PostgreSQL 17 migration/workflow tests, lint, build and port 5173 smoke. The prior `prefer-const` lint failure is resolved.
- New path: `src/test/tenant-scope.test.ts`. It exercises actual `src/lib/supabase.ts` tenant resolver behavior: authenticated mapping and request cache, missing session rejection, malformed scope rejection, RPC retry after failure, anonymous public binding and fail-closed error, signed-in scope selection, and cache invalidation on auth-state events.
- This batch is being pushed against the new `main` head; record it PASS only after CI on its exact SHA succeeds. These tests do not replace authenticated browser E2E or production Supabase evidence. `next_task_id = AGH-SEC-BROWSER-E2E-001` remains OPEN.
## 2026-10-15 — Tenant-scope resolver coverage verified

- Commit `fe4440cd8a34c61facc06425abce7916dbd52fb1`; exact-head CI [38694500854](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38694500854) **SUCCESS**. Unit tests (including `src/test/tenant-scope.test.ts`), isolated PostgreSQL 17 migration/workflow acceptance, lint, build, and port-5173 smoke passed.
- The new test file verifies the actual scope resolver's cache and mapping, no-session rejection, malformed scope rejection, retry behavior, anonymous public scope resolution/fail-closed behavior, signed-in scope selection, and auth-event invalidation. It does not substitute for browser E2E or production DB validation.
- **External blocker rechecked:** connected Supabase integration cannot access intended ref `ffxxjaolfntzbapmfbuv` (permission denied). It can read an ACTIVE_HEALTHY project named `aghbari-commerce`, ref `mrcyqezbhpncuvaehwgf`; its migration list contains 133 rows, newest `20260925040254`, while repository migrations are newer. Do not target that different ref based on name. No production changes made.
- `next_task_id = AGH-SEC-BROWSER-E2E-001` remains OPEN; `AGH-EXT-SUPABASE-001` remains blocked pending intended project identity/access.
## 2026-10-15 — Customer quote workflow auth/tenant component acceptance

- Verified exact-head CI on `fe4440cd8a34c61facc06425abce7916dbd52fb1` [run 38694500854](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38694500854) **SUCCESS** and docs/checkpoint SHA `d5b404235f0b97347b4140281dbb44850e05d341` [run 38694768595](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38694768595) **SUCCESS**.
- New test path: `src/test/customer-workflow-tenant.test.tsx`, covering unauthenticated access, signed-in customer tenant filtering and fail-closed scope errors. SHA `d02e3f5408e67729a619616fcb56c03bca702b17` failed two tests because the component was mounted without router context (95 passed); SHA `94f2d8a02628443522dfe7fcad1b398bdb62d5e0` mounted the real route tree but failed 3 tests because `@/lib/auth` mock omitted root `AuthProvider` (94 passed). Follow-up adds the pass-through wrapper used by existing project tests and awaits exact-SHA CI.
- This is jsdom component/route coverage, not live authenticated browser E2E or production Supabase proof. `next_task_id = AGH-SEC-BROWSER-E2E-001` stays OPEN.
## 2026-10-15 — Customer quote route acceptance verified

- **SHA:** `6a4b68acc8a9295f508d4301cce754cf826e7f3d`; exact-head [GitHub Actions run 38695532757](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38695532757) **SUCCESS** across unit tests, isolated PostgreSQL 17 acceptance, lint, build and port-5173 dev-server smoke.
- `src/test/customer-workflow-tenant.test.tsx` passes with the real `/quotes` route tree, `RouterProvider`, memory history, and a pass-through mock for the root `AuthProvider`. Proves login gate/no catalog reads for unauthenticated state, server-scoped catalog reads for an authenticated customer, and no DB reads when tenant scope resolution fails. Two earlier test-harness iterations failed and were fixed; this latest exact SHA is the verified one.
- Evidence scope remains mocked jsdom route/component testing, not live authenticated browser E2E or production DB proof. `next_task_id = AGH-SEC-BROWSER-E2E-001` remains OPEN; production Supabase `ffxxjaolfntzbapmfbuv` remains externally inaccessible through the connected integration.
## 2026-10-15 — Authenticated tier-price non-enumeration check

- Added a CI assertion in `scripts/test-database-migrations.mjs` under authenticated customer identity: direct `SELECT tier,price FROM public.product_prices WHERE product_id=...` must be privilege-denied or return no visible tier rows; returning any tier rows fails the acceptance test. Existing cart validation already asserts customer cart responses omit unit prices and totals.
- Exact-SHA CI for the new assertion is pending. If it fails, inspect active `product_prices` grants/RLS and fix with a new migration + regression test; do not conceal the failed result. `AGH-PRICE-PRIVACY-001` remains PARTIAL and `AGH-SEC-BROWSER-E2E-001` OPEN.
## 2026-10-15 — Authenticated tier-price disclosure found; additive fix pending

- CI [38695976338](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38695976338) on SHA `700fef00cd26bc022b2f8837236530195951db19` failed isolated PostgreSQL acceptance because an authenticated customer could directly read tier rows from `public.product_prices`.
- Root cause located in the public-storefront boundary: direct SELECT was revoked from `PUBLIC, anon` but not `authenticated`. Row-level organization scope is not sufficient to keep tier prices staff/private.
- Added new migration `supabase/migrations/20261015120000_customer_tier_price_read_boundary.sql`: revoke direct SELECT from `PUBLIC, anon, authenticated`, and abort migration if table-level or column-level `SELECT` is still effective for `authenticated`. The existing `scripts/test-database-migrations.mjs` assertion is retained as regression coverage.
- Fix commit and exact-SHA CI are pending; no production database mutation. Keep `AGH-PRICE-PRIVACY-001` PARTIAL and `next_task_id = AGH-SEC-BROWSER-E2E-001` OPEN until the new run passes.
## 2026-10-15 — Direct customer tier-table disclosure fixed in CI

- Root cause confirmed by failing isolated Postgres test: `product_prices` SELECT was revoked from `PUBLIC, anon` but not `authenticated`, leaving direct row enumeration possible despite organization-scoped RLS.
- New migration `supabase/migrations/20261015120000_customer_tier_price_read_boundary.sql` revokes direct SELECT from all client roles and validates no table-level or column-level SELECT remains for `authenticated`; `scripts/test-database-migrations.mjs` checks direct customer reads return no price rows or are denied.
- Exact fix SHA `8f1a7ec7b6f85a280da66e183bfd130996902edb`; Actions [run 38696292337](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696292337) **SUCCESS** for unit tests, isolated PostgreSQL 17 migration/workflow acceptance, lint, build and port-5173 smoke.
- Scope: no production database mutation. This closes the direct-table read flaw in CI and keeps the price-tier item PARTIAL pending all-channel and authenticated real-browser evidence. `next_task_id = AGH-SEC-BROWSER-E2E-001` remains OPEN.
## 2026-10-15 — Customer denial at admin route

- Extended `src/test/customer-workflow-tenant.test.tsx` to mount the real `/admin/quotes` route with a customer identity and verify the app displays `لا تملك صلاحية الإدارة` without calling `getCurrentTenantScope`, `supabase.from`, or `supabase.rpc`.
- This remains route/jsdom evidence, not a live authenticated browser session. Exact-SHA CI is pending; the prior direct-price-table fix remains independently proven on SHA `8f1a7ec7b6f85a280da66e183bfd130996902edb` / run [38696292337](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696292337).
## 2026-10-15 — Admin quote role boundary, staff-path companion

- Exact-head CI `aff2a30dadf5d977a82f2c8b5458da46f100cc98` / [run 38696635586](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696635586) **SUCCESS** for customer denial on `/admin/quotes` before any tenant or data access.
- Added the staff-side companion to `src/test/customer-workflow-tenant.test.tsx`: an active staff identity must be able to load the actual `/admin/quotes` route, receive the quote list from the mock DB boundary, and use only the enumerated non-financial quote columns. Exact-SHA CI pending.
- This remains jsdom route acceptance, not an authenticated real-browser session. `AGH-SEC-BROWSER-E2E-001` remains OPEN.
## 2026-10-15 — Direct tier-price RPC denial checks

- Verified route-role CI at SHA `c19c0b0516194d309fdf183690b8ceb1ee7a595f`, Actions [38696894239](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696894239) **SUCCESS**. Customer sessions are denied from the real `/admin/quotes` route before any tenant/table/RPC read; active staff sessions load the quotes workspace using the explicit non-financial quote projection.
- Added two regression assertions in `scripts/test-database-migrations.mjs`: authenticated customers must be denied direct execution of `public.customer_product_unit_price(uuid,uuid,text,numeric)` and `public.preview_order_pricing(jsonb)`. This complements the existing direct `product_prices` table read test and the customer cart response field exclusions.
- Exact-SHA CI at SHA `fe6a993e8ba809d6117c553314ddbc49b9c256db`, [run 38697134660](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38697134660), **SUCCESS**. Customer direct calls to both raw pricing functions are denied, alongside direct table SELECT denial. Keep `AGH-PRICE-PRIVACY-001` PARTIAL and `AGH-SEC-BROWSER-E2E-001` OPEN until all-channel and live-browser proof exists.
## 2026-10-15 — Direct raw price-calculation RPCs denied

- Code SHA `fe6a993e8ba809d6117c553314ddbc49b9c256db`; exact-head CI [run 38697134660](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38697134660) **SUCCESS** across unit tests, PostgreSQL 17 migration/workflow acceptance, lint, build and port-5173 smoke.
- Added isolated database checks that authenticated customers cannot directly call `public.customer_product_unit_price(uuid,uuid,text,numeric)` or `public.preview_order_pricing(jsonb)`; the existing table-level direct SELECT regression and no-price/no-total checkout response tests also pass.
- Admin quotes route role tests pass at SHA `c19c0b0516194d309fdf183690b8ceb1ee7a595f`, CI [38696894239](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696894239): customers are denied before reads, while active staff load the quote view.
- This evidence remains isolated CI + mocked jsdom. Full API/RPC/cache/export channel proof, production DB migration and live authenticated browser E2E are not certified.
## 2026-10-15 — Offline catalog cache allowlist wired end-to-end

- Code review found the existing `sanitizePublicCatalogCache()` already removed private fields in a unit test, but `OfflineWorkspacePage` did not use it; raw rows from staff's broad `fetchProducts()` query could be persisted and stale contents were counted unsanitized.
- Updated `src/components/CustomerWorkflows.tsx` to sanitize/rewrite legacy cached contents and sanitize fresh sync results before localStorage persistence. Added route regression in `src/test/customer-workflow-tenant.test.tsx` with mock staff rows containing cost/tier prices, stock thresholds/reservations and internal notes; both legacy cache migration and fresh sync must remove those fields.
- This is an offline-cache privacy guard, not live browser/production proof. Exact-SHA CI is pending. Keep `AGH-SEC-BROWSER-E2E-001` OPEN.
## 2026-10-15 — Offline cache sanitization verified

- Code SHA `fc7e44c9fc55b191ea4b9aad5ca9b5063ca51be1`; exact-head CI [38698194334](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38698194334) **SUCCESS** across unit tests, isolated PostgreSQL 17 acceptance, lint, build and port-5173 smoke.
- `OfflineWorkspacePage` uses the existing allowlist `sanitizePublicCatalogCache()` before writing fresh sync rows and whenever hydrating/re-writing the legacy cache. `src/test/customer-workflow-tenant.test.tsx` simulates unsafe prior staff cache and fresh staff results with cost/tier prices, reservation/reorder fields, and internal notes, asserting those fields do not persist.
- Evidence remains route/jsdom + CI, not a live authenticated browser or production DB certification. `AGH-SEC-BROWSER-E2E-001` remains OPEN; price privacy remains PARTIAL until live browser and the remaining API/RPC/cache/export paths are reviewed.

## 2026-10-15 — AGH-CUSTOMER-360-001: customer address book and motion preference

- Added `src/routes/addresses.tsx` and the RTL-responsive customer account screen inside the existing `CustomerWorkflows` shell. Customers can list, add, edit and delete addresses; success notices require server RPC confirmation.
- Added `src/lib/customer-addresses.ts` with field validation and RPC-only writes. Customer/tenant identifiers are intentionally not accepted from the browser.
- Added migration `supabase/migrations/20261015130000_customer_address_book.sql`: owner-scoped RLS, direct-write revocation, server-derived identity, audited mutations, and serialized one-default behavior.
- Added `src/test/customer-addresses.test.ts` and isolated PostgreSQL regressions in `scripts/test-database-migrations.mjs` for data projection, invalid input, false-success prevention, direct write denial, cross-customer isolation, default promotion and audit trail.
- Added `prefers-reduced-motion: reduce` global policy and included `/addresses` in the CI dev-server smoke matrix.
- Exact-SHA CI for this feature is pending. No production migration or live authenticated browser test was performed; checkout address snapshots and company-member screens remain open.

## 2026-10-15 — AGH-CUSTOMER-360-001: implementation CI verified

- Implementation head `64a7056274a7b24324c53f9020ec1b710133a724`; exact-head PR CI [run 38699933765](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38699933765) completed **SUCCESS**.
- Passed gates: `npm test`; `npm run test:db` applying all migrations/workflow assertions on isolated PostgreSQL 17; lint excluding the repository-wide Prettier rule; production build; dev-server port-5173 smoke including `/addresses`.
- The first attempt found the invalid PostgreSQL column privilege name `DELETE`; it was corrected to verify INSERT/UPDATE at column level and DELETE at table level. The fixed exact SHA passed all gates.
- Evidence is repository code + isolated CI only. No production migration or live authenticated browser test; checkout order-address snapshots and company contact/member management remain open.

## 2026-10-15 — AGH-CUSTOMER-360-001: delivery-address snapshot wired into checkout/order lifecycle

- Follow-up head `ad6659930e45d197b512837819df853b4ede1c29` is being rebased onto the current `main` docs checkpoint `74ca3ed043a0790e03fdfbfea56f8e6ec89a6dd8` to avoid replacing the latest verified address-book evidence.
- Checkout reads the saved address book, proposes the default, supports an explicit no-address path, incorporates the selected address into retry intent, and submits its opaque ID only.
- New additive migration `20261015140000_checkout_delivery_address_snapshot.sql` adds a frozen safe order snapshot, server-derived ownership checking, private internal address FK/fingerprint, address-sensitive idempotent replay rules and transactional `OrderCreated` outbox event.
- Customer and staff order details display the persisted snapshot; the customer projection reveals only the display-safe snapshot field. Existing server-side price/credit/idempotency transaction remains the authoritative order creator.
- Expanded isolated PostgreSQL test coverage for frozen snapshot, direct-column denial, idempotent outbox, retry mismatch and history immutability. This follow-up's exact-SHA CI remains pending; no production migration or live browser claim.

## 2026-10-15 — Customer company contacts verified on main

- Contact-management implementation merged to main as ec2d63e4cbd88887a285b06630bf4108cf59b3e2; exact push-to-main CI [38703404206](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38703404206) SUCCESS in 1m28s.
- Passed gates on the main SHA: npm test (110 tests across 10 files), npm run test:db applying migrations and isolated PostgreSQL workflow acceptance, lint, build, and dev-server route smoke on port 5173 including /company/contacts.
- Added customer_company_contacts with owner-scoped RPCs, a single-primary lifecycle, audit trail and /company/contacts; direct client writes are revoked. This is a commercial contact directory, not a login/member system.
- Duplicate parallel PR #31 was closed after PR #32 merged the contact feature first; no duplicate implementation was merged.
- Next: connect company sub-users to the customer record using explicit membership and invitation lifecycles. The current customers.profile_id assumption means this must include all customer authorization/query/RLS paths, not just an invitation UI. Production Supabase remains inaccessible; no production migration/live-auth browser test is claimed.


## AGH-FINANCE-DOCS-001 — Arabic server-generated finance PDFs merged to main

- PR [#35](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/35) merged at `47d7ea6c604c2fb65e0faaeb80a2c3ba9415ee56`; exact main CI [38751531855](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38751531855) **SUCCESS**. The server PDF endpoints and UI are code/isolated-CI verified; invoice PDFs deliberately omit monetary amounts not granted to customer role.
- Latest published readback still returns 404 for invoice/statement/PDF deep routes although the local main smoke passes. No production DB writes/migrations; intended Supabase ref `ffxxjaolfntzbapmfbuv` is denied. Lovable runtime/editor SHA remains unverified.
- `AGH-FINANCE-DOCS-001` stays **PARTIAL**; current next cursor is `AGH-SEC-BROWSER-E2E-001 — OPEN` for real runtime/authenticated-browser evidence.



## 2026-10-15 — Built-artifact smoke, catalog visibility and server-resolved customer pricing

- **Latest merged main SHA:** d0cbee114ebff7da4338edd658ba0453b88d1bf3; exact main CI [38760352659](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38760352659) **SUCCESS**.
- PR #38 (merge SHA 169939455676e04fa04d5361f4eef3a57b5def09) added production-built Cloudflare/Wrangler route smoke in addition to dev smoke; exact PR CI [38757497714](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38757497714) **SUCCESS**.
- PR #39 filters inactive public catalog rows and public category projections; exact PR CI [38757944496](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38757944496) **SUCCESS**.
- PR #40 exact tested head ba8bc3db63ec22ae3479b71b810fe3d6f60344f9, CI [38760040133](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38760040133) **SUCCESS**, merged as d0cbee114ebff7da4338edd658ba0453b88d1bf3. Files changed: src/lib/api.ts, src/lib/types.ts, src/lib/commerce-utils.ts, src/components/Storefront.tsx, src/components/CustomerWorkflows.tsx, src/test/public-catalog-privacy.test.ts, src/test/customer-workflow-tenant.test.tsx, scripts/test-database-migrations.mjs, supabase/migrations/20261015180000_storefront_customer_tier_prices.sql.
- **Behavior:** the RPC derives active organization and approved customer membership/tier server-side. It returns only product ID + current unit price; client requests cannot pick tier/customer/org. Customer storefront cards/details and quote/reorder/barcode/assistant results use resolved prices; missing/invalid RPC data fails closed; account-specific price is removed from offline cache. DB acceptance covers anonymous retail, wholesale quantity break, invalid quantity and foreign-tenant denial.
- **Verification gates:** frozen Bun lock; unit tests; PostgreSQL 17 applies all migrations and runs isolated workflows; lint; build; Wrangler local run of actual Cloudflare/Nitro output with route/manifest/PDF authorization probes; dev-server smoke. All gates passed on exact PR head and exact main merge SHA.
- **Still OPEN:** AGH-PRICE-PRIVACY-001 is PARTIAL pending route-level/display-path assertions and complete API/RPC/cache/export review plus production/authenticated browser proof. AGH-SEC-BROWSER-E2E-001 remains OPEN because prior external readback showed published Lovable finance/PDF deep-route 404; live deployment SHA is unverified. Intended Supabase ref ffxxjaolfntzbapmfbuv is inaccessible; no production migration/write was performed.
- **next_task_id = AGH-PRICE-PRIVACY-001 — PARTIAL**; continue source/test work rather than repeating discovery. Handle the external publish gate separately without spending Lovable points speculatively.

## 2026-10-15 — AGH-PRICE-PRIVACY-001 / AGH-ONYX-XLSX-001 — product price boundary and workbook XML integrity

- **Verified code SHA:** `8e5b706f0f3b17bbef2e5fd62aa96af823bd3b64`; exact main CI [38771897585](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771897585) **SUCCESS** across unit tests, PostgreSQL 17 full-migration/workflow acceptance, lint, build, production artifact smoke and dev-server smoke.
- **Files changed in the verified code batch:** `supabase/migrations/20261015210000_product_price_column_boundary.sql`, `supabase/migrations/20261015220000_accountant_storefront_price_tier_boundary.sql`, `src/lib/api.ts`, `src/test/public-catalog-privacy.test.ts`, `scripts/test-database-migrations.mjs`, `src/lib/onyx-export.ts`, `src/test/onyx-export.test.ts`.
- **Security closure evidence:** anonymous/customer direct raw `products.base_price` reads now fail permission checks; safe catalog projections still work; staff full product projections use `fetch_staff_products(uuid)`, which derives active staff identity and tenant scope server-side. Accountant acceptance sets a distinct base price of 99,000 and retail price of 1,234, then proves the pricing RPC returns 1,234 rather than the operational base price.
- **Regression repairs:** exact CI exposed and fixed the old staff query test that assumed direct `products SELECT`; the isolated database test fixture was then corrected to account for multi-quantity tier rows (delete the specific retail fixture before insert, rather than an invalid `ON CONFLICT(product_id,tier)` target). The final exact CI passes.
- **Onyx workbook integrity:** PR [#46](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/46) merged at `41f2419545a70822b85a1ce2ab8faff212e520d8`; exact PR-head CI [38771084892](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771084892) **SUCCESS**. Worksheet fields now drop XML 1.0-forbidden control code points before OOXML escaping; regression coverage inspects worksheet XML, not binary ZIP header bytes.
- **Next task:** `AGH-PRICE-PRIVACY-001 — PARTIAL`; continue the remaining API/RPC/export review. `AGH-SEC-BROWSER-E2E-001` remains OPEN because the published site returns 404 for `/invoices`, `/statement` and `/manifest.webmanifest` while CI’s built artifact passes. Intended production Supabase ref `ffxxjaolfntzbapmfbuv` remains inaccessible; no production migration ran. The live Lovable editor/deployment SHA is not proven.

## 2026-10-15 — Source-channel review closed; resume at published browser/runtime discrepancy

- Inspected current-main paths in `src/components/Storefront.tsx`, `src/components/CustomerWorkflows.tsx`, `src/lib/api.ts`, `src/lib/commerce-utils.ts`, finance PDF routes, and `src/lib/onyx-export.ts`. Quote/reorder/barcode/assistant select non-financial catalog fields and resolve prices through the server-tier RPC; the allowlisted local cache drops `display_price`; finance PDF routes do not select line/total monetary fields; Onyx export is approved-order/staff-gated and XML-control-safe.
- Code SHA `8e5b706f0f3b17bbef2e5fd62aa96af823bd3b64` passed exact CI [38771897585](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771897585): unit tests, isolated PostgreSQL 17 full migration/workflow checks, lint, build, production artifact smoke and dev-server smoke.
- The source-level privacy-review subgate is closed for these inspected paths. Do not mark `AGH-PRICE-PRIVACY-001` DONE_VERIFIED: live three-tier behavior and intended production DB evidence remain OPEN.
- **Next:** `AGH-SEC-BROWSER-E2E-001` — public fetch still returns 404 for `/invoices`, `/statement`, and `/manifest.webmanifest`. TinyFish Default profile has no authenticated sites, so live authenticated testing is blocked until the owner authorizes interactive sign-in setup. Supabase recheck: intended ref `ffxxjaolfntzbapmfbuv` is permission-denied; listed `aghbari-commerce` ref `mrcyqezbhpncuvaehwgf` is a different project and must not be used as a substitute.

## 2026-10-15 — deployment diagnosis clarified

- Verified state SHA `7585fd02e394fe6db464e3aa2f83303c8ed939c8` exact CI [38772980004](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38772980004) **SUCCESS**. Product code SHA `8e5b706f0f3b17bbef2e5fd62aa96af823bd3b64` exact CI [38771897585](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771897585) **SUCCESS**.
- Current Lovable docs confirm published hosting is a snapshot and new source/editor changes become live only after `Publish → Publish changes` ([publish](https://docs.lovable.dev/features/publish), [hosting](https://docs.lovable.dev/features/hosting)). A Git push/CI pass is not a production deploy signal.
- Public fetch confirms `/login` loads but `/invoices`, `/statement`, PDF routes and `/manifest.webmanifest` are 404. The available browser profile is not signed in to Lovable, so Publish changes and authenticated browser E2E are not attempted. Do not spend build credits just to restate source findings; use one interactive sign-in/publish action only after the owner authorizes it.
