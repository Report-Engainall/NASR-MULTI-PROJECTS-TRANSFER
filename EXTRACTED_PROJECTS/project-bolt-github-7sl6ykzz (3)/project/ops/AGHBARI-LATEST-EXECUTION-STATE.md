# Aghbari Commerce — Latest Execution State

## Current implementation pointer — 2026-10-15 (storefront empty-catalog truth state)

- **Latest source change:** PR [#50](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/50) merged to `main` at `fffa5035f6b3ee3f55f4a2456b515aa0814e4899`, tested PR head `ced57138b68515b581fcc988271a1b9a1c847ed9`. Exact PR-head CI [38776511699](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38776511699) **SUCCESS**. The separate main merge-SHA run is [38776814715](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38776814715); read its live conclusion before transferring the PR-head result.
- **Storefront behavior:** when the live/cached catalog has zero products, the page now says no active products are published; when products exist but search/category filters match none, it retains the filter-specific empty message. Regression test lives in `src/test/storefront-discovery.test.tsx`. No sample products were inserted.
- **Live-data limitation:** read-only published homepage still displayed zero products. This source change fixes the misleading empty state only; it does not prove or repair production catalog data. Published `/invoices`, `/statement` and `/manifest.webmanifest` still returned 404 on the checked snapshot.
- **Prior security batch:** PR [#49](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/49) moved Gemini API keys from URL query strings to `x-goog-api-key`; exact PR-head CI [38775258588](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38775258588) **SUCCESS** and main merge-SHA CI [38775736464](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38775736464) **SUCCESS**.
- **`next_task_id = AGH-SEC-BROWSER-E2E-001` — OPEN.** Real authenticated browser journey, live Lovable deploy-SHA readback and correction of published deep routes remain unverified. The separate Lovable sign-in profile was created, but its signed-in-site list remains empty until the owner finishes setup.
- **`blocked_task_id = AGH-EXT-SUPABASE-001` — EXTERNAL.** Intended production project ref `ffxxjaolfntzbapmfbuv` remains permission-denied. Do not substitute `mrcyqezbhpncuvaehwgf`; no production database writes or migrations were performed.
- **Persistent instructions:** `AGENTS.md` and `.github/copilot-instructions.md` remain present in remote `main`; repository auto-load rules are separate from live Lovable deployment synchronization.
- **Execution host:** no checkout is mounted, so local `git fetch/status/HEAD` remain unavailable; remote state and Actions were read through GitHub APIs.

---

## Previous verified implementation pointer — 2026-10-15 (Gemini API-key transport hardening)

- **Merged source:** PR [#49](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/49) merged to `main` at `4787f806aa59ffb9ae5edaf219b201ef4a6d81f3` from the tested PR head `664d7b361f1ed8f001ef8bb5b53f8c307d5eb361`.
- **Exact PR-head CI:** [run 38775258588](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38775258588) **SUCCESS** for the exact PR-head SHA, including unit tests, isolated PostgreSQL 17 migration/workflow assertions, lint, build, production-artifact smoke and dev-server smoke. Main merge-SHA Actions run [38775736464](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38775736464) was still running at the time of this checkpoint; verify its final conclusion and do not transfer PR-head CI to the merge SHA.
- **Security change:** Gemini requests now send credentials in `x-goog-api-key`, not the URL query; `buildGeminiRequestConfig` validates the approved Gemini HTTPS host and the model/key, and regression tests assert that no credential appears in URL/search. No real provider key was added or changed.
- **Changed source paths:** `supabase/functions/ai-gateway/logic.ts`, `supabase/functions/ai-gateway/index.ts`, `src/test/ai-gateway-logic.test.ts`.
- **`next_task_id = AGH-SEC-BROWSER-E2E-001` — OPEN.** Read-only published preview check: the homepage returned the Arabic storefront but showed zero available products; `/invoices`, `/statement` and `/manifest.webmanifest` returned 404. Source/CI success does not prove the live Lovable snapshot has been published. Interactive Lovable session is still needed to publish and read back the deployed SHA; no login credentials are stored in Git or chat.
- **`blocked_task_id = AGH-EXT-SUPABASE-001` — EXTERNAL.** The intended production ref `ffxxjaolfntzbapmfbuv` remains permission-denied in the available integration. Do not substitute `mrcyqezbhpncuvaehwgf`; no production migrations or writes were performed.
- **Persistent instructions:** root `AGENTS.md` and `.github/copilot-instructions.md` remain present on the remote branch. They document the repository-level resume contract; live editor/deployment SHA sync is separate and unverified.
- **Execution host:** no checkout is mounted. The remote ref/files/Actions were read through GitHub APIs; local `git fetch`, `git status`, local branch and local `HEAD` were not executed and remain unavailable.

---

## Current implementation pointer — 2026-10-15 (pricing boundary and XLSX integrity)

- **Latest verified product-code SHA:** `8e5b706f0f3b17bbef2e5fd62aa96af823bd3b64`; exact main CI [38771897585](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771897585) **SUCCESS**. Prior state-only HEAD `7585fd02e394fe6db464e3aa2f83303c8ed939c8` also passed exact CI [38772980004](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38772980004). The present state correction creates a new SHA and must be checked separately.
- **Raw product-price boundary:** `20261015210000_product_price_column_boundary.sql` adds safe catalog column grants and a server-derived, staff-role/tenant-bounded `fetch_staff_products(uuid)` RPC. Direct browser-role SELECT of `base_price`, `cost_price` and other private product columns is denied; staff product reads/writes use the guarded RPC projection.
- **Accountant tier boundary:** `20261015220000_accountant_storefront_price_tier_boundary.sql` corrects the earlier malformed/stale migration variant and removes finance-only accountants from the operational staff pricing branch. Exact isolated DB assertions set base price 99,000 versus retail price 1,234 and prove the accountant receives 1,234.
- **Onyx XLSX integrity:** PR [#46](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/46) merged at `41f2419545a70822b85a1ce2ab8faff212e520d8`; exact PR-head CI [38771084892](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771084892) **SUCCESS**. Export generation strips XML 1.0-forbidden control characters from business fields before OOXML escaping. Target-version Onyx compatibility is still unproven.
- **`next_task_id = AGH-SEC-BROWSER-E2E-001` — OPEN.** Source-level API/RPC/export review is complete for catalog, quote, reorder, barcode, assistant, offline cache, customer finance PDFs and Onyx workbook export. Exact main CI [38771897585](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38771897585) passed the price-column/accountant boundary. Remaining proof is actual authenticated browser navigation/download and the live deployment SHA; public route readback still 404s for finance/PWA deep routes.
- **`blocked_task_id = AGH-EXT-SUPABASE-001` — EXTERNAL.** Rechecked via Supabase integration: project listing exposes `aghbari-commerce` only at ref `mrcyqezbhpncuvaehwgf`; `get_project(ffxxjaolfntzbapmfbuv)` remains permission-denied. Do not substitute the other project. No production migrations/writes were performed.
- **Published/browser evidence:** fresh read-only fetch of `/login` returned the Arabic login page; `/invoices`, `/statement`, both PDF routes, and `/manifest.webmanifest` returned 404. Lovable's official publish documentation says live hosting is a snapshot and source/editor changes only reach visitors after selecting **Publish → Publish changes**: https://docs.lovable.dev/features/publish and https://docs.lovable.dev/features/hosting. The available browser profile has no sign-in for Lovable; publishing is therefore NOT performed/verified. Do not ask the owner to paste credentials; request approval for an interactive sign-in setup if this external action is required.
- **Lovable / persistent rules:** root `AGENTS.md` and `.github/copilot-instructions.md` are present remotely. Lovable documents that root `AGENTS.md` is always loaded: https://docs.lovable.dev/features/knowledge (FAQ lines 330–334). This confirms the loader mechanism, **not** live editor/deployment SHA sync. No Lovable credits were spent.
- **Execution host:** no repository checkout is mounted. Remote refs/files/actions were verified using GitHub APIs; local `git fetch`, `git status`, local branch and local `HEAD` were not executed and are explicitly **UNAVAILABLE**, not PASS.

---

## Verified merged batch — AGH-CUSTOMER-360-001: company-member invitations and identity scope

- **Current main SHA:** 68365d5dd87e9f00eff6bd68c6ad7d517e9cb567; PR [#33](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/33) merged successfully from tested PR SHA ecf6412a93d8350eb40de97b995e43f1e84b309e.
- **Exact PR CI:** [run 38708641537](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38708641537) **SUCCESS** on the exact PR SHA.
- **Exact main CI:** [run 38708849372](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38708849372) **SUCCESS** on the exact merged main SHA; unit tests, isolated PostgreSQL 17 migration/workflow acceptance, lint, build and port-5173 smoke all passed.
- Added customer_company_memberships and customer_company_invitations, hashed one-time invitation tokens (7-day expiry), verified-email + matching-email acceptance, owner-side list/revoke, audit events, and buyer / finance / viewer capability boundaries. Existing order, quote, reorder, statement, address and contact RPC/RLS paths resolve the invited profile to its explicitly linked customer rather than reassigning customer history.
- Frontend: /company/members to create/copy invitations and revoke members; /company/accept-invitation to accept them. Sending mail is not wired; the owner shares the returned link manually. The feature does not create a staff-role account.
- CI also covers collision-free membership fixtures and checkout JSONB payload typing. Do not remove tenant checks to get tests to pass.
- **Evidence limit:** no production migration was applied. Expected Supabase ref ffxxjaolfntzbapmfbuv remains inaccessible; do not substitute mrcyqezbhpncuvaehwgf. Real authenticated-browser E2E and production DB proof remain OPEN under AGH-SEC-BROWSER-E2E-001; live Lovable-editor SHA sync remains unproven.
- AGH-CUSTOMER-360-001 was **PARTIAL** at the historical PR #33 checkpoint; finance PDFs were implemented later in PR #35. The sole current cursor is `next_task_id = AGH-SEC-BROWSER-E2E-001 — OPEN` in the current state section above.

---


## Verified offline catalog cache privacy subgate

- **Code SHA:** `fc7e44c9fc55b191ea4b9aad5ca9b5063ca51be1`.
- **Exact-SHA CI:** [run 38698194334](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38698194334) **SUCCESS**, including unit tests, isolated PostgreSQL 17 migration/workflow acceptance, lint, build and port-5173 smoke.
- `OfflineWorkspacePage` now runs `sanitizePublicCatalogCache()` both when loading/re-writing an existing `aghbari:catalog:v1` cache and before saving fresh `fetchProducts()` sync results. The new route regression seeds unsafe legacy staff cache data and a fresh broad staff product response, then verifies cost/tier prices, reserved/threshold stock fields and internal notes are absent from localStorage.
- This is cache route/jsdom + exact-SHA CI evidence; not production/live-browser proof. Keep `AGH-SEC-BROWSER-E2E-001` OPEN and `AGH-PRICE-PRIVACY-001` PARTIAL pending real-browser and complete channel proof.

---
## Active subgate — sanitize the offline catalog cache on read and write

- At verified base SHA `950174047f0ef34f53cd7cc4ccec0f0599bade46`, exact-SHA CI [38697641746](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38697641746) passed all gates.
- Source review found `sanitizePublicCatalogCache()` already strips purchase cost, tier prices, inventory reservations/thresholds and internal notes, with an existing unit test; however, `OfflineWorkspacePage` was writing raw `fetchProducts()` rows directly to `aghbari:catalog:v1` and reading prior contents without applying the sanitizer. Since staff queries intentionally return broader fields, this could persist private values locally.
- This batch applies the existing allowlist when hydrating/re-writing legacy cache contents and when storing fresh catalog sync results. `src/test/customer-workflow-tenant.test.tsx` adds route-level regression for both stale cache migration and fresh sync from a staff payload. Exact-SHA CI is pending; no production DB or user data was touched.

---
## Verified pricing-privacy RPC subgate

- **Code SHA:** `fe6a993e8ba809d6117c553314ddbc49b9c256db`.
- **Exact-SHA CI:** [run 38697134660](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38697134660) **SUCCESS** for unit tests, isolated PostgreSQL 17 migration/workflow acceptance, lint, build and port-5173 smoke.
- `scripts/test-database-migrations.mjs` now verifies authenticated customers cannot directly SELECT tier rows in `public.product_prices`, cannot execute `public.customer_product_unit_price(...)`, and cannot call `public.preview_order_pricing(jsonb)`. Existing checkout validation still omits line prices and order totals. The direct table read regression initially exposed a real defect; `20261015120000_customer_tier_price_read_boundary.sql` fixes it by revoking table SELECT from `PUBLIC, anon, authenticated` and checking for effective column/table privileges.
- The actual `/admin/quotes` route tests also pass: a customer is denied before tenant/table/RPC reads; active staff can load the staff quote workspace. These remain mocked jsdom tests and isolated database evidence, not a live browser or production deployment.
- **Remaining gate:** `AGH-SEC-BROWSER-E2E-001` OPEN and `AGH-PRICE-PRIVACY-001` PARTIAL pending full API/RPC/cache/export channel coverage and live authenticated browser proof. Intended production Supabase ref `ffxxjaolfntzbapmfbuv` remains inaccessible in the connected integration; no production migration was applied.

---
## Latest verified route-role subgate — customer denied, staff allowed

- Exact-SHA CI at `c19c0b0516194d309fdf183690b8ceb1ee7a595f` [run 38696894239](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696894239) **SUCCESS** across unit tests, isolated PostgreSQL 17, lint, build and port-5173 smoke.
- The actual `/admin/quotes` route now has a passing customer-denial test (zero tenant/table/RPC calls) and a passing active-staff test (staff quote workspace loads with the explicit non-financial column projection). These are jsdom route tests, not live browser auth.
- Exact-SHA CI for the raw RPC denial tests passed at `fe6a993e8ba809d6117c553314ddbc49b9c256db` ([run 38697134660](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38697134660)) **SUCCESS**. Authenticated customers are denied direct calls to `customer_product_unit_price(...)` and `preview_order_pricing(jsonb)`; table SELECT denial and price-free customer checkout response assertions also pass.
- `AGH-SEC-BROWSER-E2E-001` and `AGH-PRICE-PRIVACY-001` remain OPEN/PARTIAL respectively; production Supabase and live browser evidence remain unavailable.

---
## Latest verified admin-role boundary — customer denial

- Exact-SHA CI at `aff2a30dadf5d977a82f2c8b5458da46f100cc98` [run 38696635586](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696635586) **SUCCESS**. The customer identity visiting `/admin/quotes` is rejected with `لا تملك صلاحية الإدارة` before `getCurrentTenantScope`, `supabase.from`, or `supabase.rpc` is called.
- New complementary case in `src/test/customer-workflow-tenant.test.tsx` exercises the same actual route with an active `staff` identity, expecting the staff quote workspace to load only the explicit non-financial quote columns. The new exact-SHA CI is pending.
- The tier-price table leak is fixed and isolated-CI-proven at SHA `8f1a7ec7b6f85a280da66e183bfd130996902edb` / run `38696292337`. Production DB and live-authenticated browser proof remain unavailable; `AGH-SEC-BROWSER-E2E-001` remains OPEN.

---
## Active subgate — customer denial on the actual admin quotes route

- The direct tier-table access fix at SHA `8f1a7ec7b6f85a280da66e183bfd130996902ed` passed exact-SHA CI [38696292337](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696292337), including unit, isolated PostgreSQL, lint, build and port-5173 smoke.
- Extends `src/test/customer-workflow-tenant.test.tsx` to mount the actual `/admin/quotes` route with a customer identity and assert the application denies administration before any tenant/data/RPC access. This is route/jsdom acceptance, not a real browser authentication session. New exact-SHA CI is pending.
- `AGH-SEC-BROWSER-E2E-001` remains OPEN for live authenticated customer/staff browser acceptance and all-channel price tier verification; production Supabase is still externally inaccessible.

---
## Verified security fix — authenticated tier-price enumeration closed in isolated CI

- **Code SHA:** `8f1a7ec7b6f85a280da66e183bfd130996902edb`.
- **Exact-SHA CI:** [run 38696292337](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38696292337) **SUCCESS** across unit tests, isolated PostgreSQL 17 migration/workflow acceptance, lint, build and port-5173 smoke.
- CI run `38695976338` on parent SHA `700fef00cd26bc022b2f8837236530195951db19` exposed the actual defect: an authenticated customer could enumerate `public.product_prices`, because the public storefront migration revoked direct SELECT from `PUBLIC, anon` but omitted `authenticated`.
- New migration `supabase/migrations/20261015120000_customer_tier_price_read_boundary.sql` revokes direct table SELECT from `PUBLIC, anon, authenticated` and aborts if table-level or any column-level SELECT remains available to `authenticated`. The new database regression now passes and order pricing still works through the server-owned pricing workflow on isolated CI.
- **Proof boundary:** production Supabase ref `ffxxjaolfntzbapmfbuv` is still inaccessible; no production migration was applied. This closes the direct-table leak in repository migration tests, not all pricing transports. `AGH-PRICE-PRIVACY-001` remains PARTIAL; `AGH-SEC-BROWSER-E2E-001` remains OPEN.

---
## Security finding — authenticated tier prices were directly readable

- Exact CI run [38695976338](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38695976338) failed `Apply all migrations to isolated PostgreSQL 17 and verify core workflows` at SHA `700fef00cd26bc022b2f8837236530195951db19`. The new assertion proved that an authenticated customer could directly enumerate `public.product_prices`; this is a real isolated-DB security defect, not a browser-test harness issue.
- Root cause: `20261015110000_public_storefront_tenant_scope.sql` revoked table SELECT from `PUBLIC, anon` but omitted `authenticated`. The tenant restrictive policy only scoped rows by organization; it did not restrict this sensitive table to staff.
- Fix under test: new additive migration `20261015120000_customer_tier_price_read_boundary.sql` revokes direct SELECT from `PUBLIC, anon, authenticated` and aborts if table-level or any column-level SELECT remains for `authenticated`. The existing CI regression test requires customer direct reads to be denied or filtered to zero rows. The fix is not considered proven until exact-SHA CI passes.
- No production database was touched. Keep `AGH-PRICE-PRIVACY-001` PARTIAL and `AGH-SEC-BROWSER-E2E-001` OPEN pending CI, full-channel checks, and actual browser/production evidence.

---
## Active security subgate — authenticated customer tier-price non-enumeration

- Adds a targeted assertion to `scripts/test-database-migrations.mjs`: under the CI `authenticated` role for a customer identity, querying `public.product_prices` directly must either be denied by SQL privileges or return zero visible rows. Returning any tier rows fails the test. Existing checkout tests still verify the customer cart endpoint does not return unit prices or order totals.
- This closes a specific gap not previously asserted directly for authenticated customers (anonymous direct access was already tested). Exact-SHA CI for this new assertion is pending. Keep `AGH-PRICE-PRIVACY-001` PARTIAL and `AGH-SEC-BROWSER-E2E-001` OPEN until complete channel and real-browser evidence exists.

---
## Latest verified subgate — customer quote workflow route acceptance

- **Current source SHA:** `6a4b68acc8a9295f508d4301cce754cf826e7f3d`.
- **Exact-SHA CI:** [run 38695532757](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38695532757) **SUCCESS**; unit tests, isolated PostgreSQL 17 migration/workflow acceptance, lint, build, and port-5173 dev-server smoke all passed.
- `src/test/customer-workflow-tenant.test.tsx` mounts the actual `/quotes` route through the generated route tree and checks unauthenticated login gating/no data reads; authenticated customer scope resolution and organization-filtered least-privilege catalog query; and fail-closed behavior when the authenticated scope RPC fails. The test also supplies the root `AuthProvider` context needed by the actual route tree.
- This is jsdom route/component evidence with mocked auth/data calls; it is **not** a live authenticated browser session, production database, or proof for every pricing channel. `AGH-SEC-BROWSER-E2E-001` remains **OPEN**.

---
## Latest CI correction — root authentication wrapper in route acceptance

- Follow-up SHA `94f2d8a02628443522dfe7fcad1b398bdb62d5e0` failed its unit-test gate in Actions [38695284952](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38695284952): **94 tests passed, 3 failed** in the new customer workflow test. The `/quotes` page rendered the root generic error because the mocked `@/lib/auth` module omitted `AuthProvider`, which the actual root route requires.
- Follow-up adds an `AuthProvider` pass-through to the test mock, consistent with existing route tests. This is test harness correction only; exact-SHA CI for the fix is pending. Preserve the task as OPEN.

---
## Latest CI correction — customer workflow router context

- Test attempt SHA `d02e3f5408e67729a619616fcb56c03bca702b17` failed in two component cases with `TypeError: Cannot read properties of null (reading 'isServer')` from TanStack Router `useLinkProps`: the real `QuoteWorkspacePage` was mounted without router context. Aggregate unit result: 95 passed, 2 failed; no DB/lint/build gates ran after the unit failure.
- Follow-up edits `src/test/customer-workflow-tenant.test.tsx` to mount the `/quotes` route via the actual generated `routeTree`, `RouterProvider`, memory history, and a `QueryClient`, so the page's real links have router context. This fixes the test harness, not product source behavior; the follow-up exact-SHA CI is pending.
- Preserve the claim boundary: the test remains jsdom component/route acceptance, not live authenticated browser E2E or production DB proof. `AGH-SEC-BROWSER-E2E-001` remains OPEN.

---
## Active subgate — customer workflow auth and tenant acceptance

- The preceding tenant-scope resolver source tests at SHA `fe4440cd8a34c61facc06425abce7916dbd52fb1` passed exact-SHA CI [38694500854](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38694500854). The follow-up state/blocker documentation at SHA `d5b404235f0b97347b4140281dbb44850e05d341` also passed exact-SHA CI [38694768595](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38694768595).
- This batch adds `src/test/customer-workflow-tenant.test.tsx`, which mounts the actual `QuoteWorkspacePage` component and verifies unauthenticated users cause no tenant or database read, authenticated customers load products only after tenant scope resolution and query by the resolved organization, and scope failure stops data reads.
- This is component-level jsdom acceptance, not a live browser session, real auth-provider integration or production database proof. Keep `AGH-SEC-BROWSER-E2E-001` OPEN until live authenticated customer/staff browser acceptance and full pricing privacy channels are proven.

---
## Latest verification — tenant-scope tests and exact-SHA CI

- Remote `main` is `fe4440cd8a34c61facc06425abce7916dbd52fb1`; exact-head Actions [38694500854](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38694500854) completed **SUCCESS**.
- Actual CI steps on that SHA passed: unit tests (including `src/test/tenant-scope.test.ts`), all migrations and workflows on isolated PostgreSQL 17, lint, build, and port-5173 dev-server smoke.
- The new resolver tests cover authenticated tenant mapping/cache, missing session, malformed scope denial, retry after RPC failure, anonymous public binding/fail-closed behavior, signed-in tenant selection, and auth-event cache invalidation.
- **Scope boundary:** this is source-level/unit and isolated database evidence, not authenticated end-to-end browser proof or production database proof. `AGH-SEC-BROWSER-E2E-001` remains OPEN.

---
## Active subgate — authenticated tenant-scope resolver regression tests

- Previous source privacy test fix SHA `127fb2b001c1ae4414cd8ee8baf9864cdd8fac12` is now **CI SUCCESS**: [run 38694129297](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38694129297); unit tests, isolated PostgreSQL 17 workflows, lint, build and port-5173 smoke all passed on that exact SHA.
- This batch adds `src/test/tenant-scope.test.ts` against the real `src/lib/supabase.ts` resolver to cover signed-in context mapping/cache, missing session, malformed server scope, retry after RPC failure, anonymous public binding/fail-closed behavior, signed-in scope selection, and auth-event cache invalidation.
- These are isolated unit tests, not authenticated browser E2E or production Supabase proof. The task remains OPEN; this commit's exact-SHA CI must pass before recording the subgate.

---
## Latest result — AGH-SEC-BROWSER-E2E-001 lint fix

- First source-test SHA `e26e71e4ec05ef90e42da922bdf513cff43c22ed`: Actions [38693899113](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38693899113) showed **unit tests PASS** and **isolated PostgreSQL acceptance PASS**, then Lint failed only on `prefer-const` at `src/test/public-catalog-privacy.test.ts:44` (`builder` never reassigned). Build and server smoke were skipped by workflow dependency.
- The fix changes the query-builder declaration from `let` plus assignment to one `const` declaration. This follow-up SHA's exact CI is pending; don't infer a pass from the previous unit/DB successes.
- Once CI passes, the source-level query-contract subgate may be recorded as passing. `AGH-SEC-BROWSER-E2E-001` remains OPEN for real authenticated browser E2E and full price-tier privacy across API/RPC/cache/export.

---
## Active task — AGH-SEC-BROWSER-E2E-001 (source-runnable subgate)

- Remote `main` baseline before this batch: `85dab55ec8e9ca903fe54b5f9845abe409037fad`, exact-SHA CI [38693335507](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38693335507) **SUCCESS**.
- This batch adds `src/test/public-catalog-privacy.test.ts` to exercise the actual `fetchProducts()` query contract: anonymous least-privilege projections, organization/warehouse filters sourced from resolved scope, fail-closed behavior when public scope resolution fails, and staff-only broad projection under the authenticated scope.
- This is **source-level Vitest coverage**, not authenticated browser E2E or production DB proof. Keep `AGH-SEC-BROWSER-E2E-001` **OPEN** until real customer/staff browser acceptance and all API/RPC/cache/export price-tier privacy channels are proven.
- Expected Supabase project `ffxxjaolfntzbapmfbuv` remains the last-recorded external blocker. No production migration or data mutation is performed.
- A mounted local checkout is unavailable in this execution host; source changes are prepared against the verified remote tree. Verify the new commit's own CI before closing this subgate.

---
## Free Lovable persistence path verified from official documentation — 2026-10-15

- **Official contract:** Lovable docs state that root-level `AGENTS.md` files are always read by the Lovable agent regardless of session length: https://docs.lovable.dev/features/knowledge. The existing root `AGENTS.md` on this repository is therefore the free persistent-instruction fallback; the separate Project Knowledge text field need not be directly edited just to make resume rules durable.
- **Live repository baseline before this clarification:** `main` SHA `8729fdd39158ab562d5833d4dbdcf76856d83d47`; exact-SHA CI [run 38692662830](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38692662830) completed **SUCCESS**. This is baseline evidence, not proof for the clarification commit that follows.
- **Scope boundary:** the documented AGENTS loader is verified from official docs; the actual active branch/editor sync for any new commit and direct edit of Project settings → Knowledge remain **UNVERIFIED** because the free browser route did not provide an authenticated editor session. Do not spend wallet/credits or claim editor sync without direct evidence.
- **Next code task remains** `AGH-SEC-BROWSER-E2E-001`; the last recorded external blocker to production DB work is `AGH-EXT-SUPABASE-001` for intended project `ffxxjaolfntzbapmfbuv`.

---
## Verified protocol implementation checkpoint — 2026-10-15

- **Implementation SHA on remote `main`:** `90602f6deeba79a5d80efad38d83efec64be5173` — https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/commit/90602f6deeba79a5d80efad38d83efec64be5173.
- **Exact-SHA CI:** [run 38692264543](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38692264543) completed **SUCCESS** for the implementation SHA above. The job's unit tests, isolated PostgreSQL 17 migration/core workflow acceptance, lint, build, port 5173 dev-server smoke and cleanup steps all concluded success.
- **Protocol files changed in this batch:** `PROJECT_MEMORY.md`, `ops/AGHBARI-SESSION-RESUME.md`, `ops/AGHBARI-LATEST-EXECUTION-STATE.md`, `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`, `docs/canonical/AGHBARI-EXECUTION-MANDATE.md`. Root `AGENTS.md` and `.github/copilot-instructions.md` were already committed and were verified present; no duplicate instruction system was created.
- **Protocol task:** `AGH-OPS-RESUME-001` is `DONE_VERIFIED` for repository persistence and exact-SHA CI. Official Lovable docs establish that root `AGENTS.md` is always read, providing the free persistent-instruction fallback; this does **not** prove a particular new SHA synchronized into the live editor or that Project Knowledge was directly edited.
- **Remote ref safety:** GitHub reports branch protection disabled. Any direct `main` update must use an expected-SHA lease with `force=false`; abort on SHA mismatch.
- **Local Git limitation:** this execution host has no mounted checkout. The remote branch, commit and Actions were verified by GitHub API; local `git fetch`, `git status`, local branch and local `HEAD` were not run. Working-tree state remains **UNKNOWN**.
- **`blocked_task_id = AGH-EXT-SUPABASE-001` — external, rechecked 2026-10-15.** `get_project(ffxxjaolfntzbapmfbuv)` returns permission denied in the connected Supabase integration. The only visible project with the matching name `aghbari-commerce` is ref `mrcyqezbhpncuvaehwgf`, ACTIVE_HEALTHY; its migration history has 133 rows and ends at `20260925040254`, behind current repository migrations. Similar name is not proof of identical project; do not apply migrations to `mrcyq...` as a substitute. No production mutation occurred; keep production isolation unproven until intended project identity/access is confirmed.
- **Lovable persistence/sync:** root `AGENTS.md` auto-reading is documented by Lovable's official docs (https://docs.lovable.dev/features/knowledge), so it is the no-cost instruction mechanism. Synchronization of the newest SHA into the live editor remains unverified; do not spend credits on discovery or claim sync based on Git push alone.

---

## Historical checkpoints

## Historical checkpoint before protocol setup (preserved; latest proof is above)

- **Remote branch:** `main`; the source baseline checked immediately before this protocol-only batch was `8324f22419a967fc86f20dddc3b8650a6fd89390` ([commit](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/commit/8324f22419a967fc86f20dddc3b8650a6fd89390)). Its commit date was 2026-10-15 06:10:49 UTC.
- **Exact-SHA CI:** [run 38690894558](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38690894558) for that exact SHA completed **SUCCESS**; workflow job `test-and-build` concluded success. This evidence applies to `8324f224...` only, not to any later documentation commit.
- **Persisted protocol commit verified:** `e34dfebc44a7ec72dfed5bc3475e82aa4898a651` passed [CI run 38691694726](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38691694726) **SUCCESS**. A follow-up documentation correction normalizes the tenant-isolation registry row; verify the exact resulting HEAD/CI and never inherit this PASS.
- **Source evidence in that baseline:** public storefront reads resolve scope from server-side publication configuration; isolated PostgreSQL migration tests assert tenant-scoped anonymous product/inventory visibility and deny direct reads of purchase cost, customer price tiers, reserved inventory fields, and private admin settings. Public catalog cache sanitization was added. This does not prove production Supabase or authenticated browser E2E.
- **Repository/session instruction entry points:** root `AGENTS.md`; GitHub Copilot repository instructions `.github/copilot-instructions.md`; canonical references below. GitHub documents repository-wide Copilot instructions under that exact path. Whether Lovable automatically loads these files remains **UNVERIFIED** and must be confirmed in that host rather than assumed.
- **`blocked_task_id = AGH-EXT-SUPABASE-001`:** last-known external blocker is access to the intended project `ffxxjaolfntzbapmfbuv`. This batch did not access or mutate any production Supabase project; re-verify the same intended project before declaring the blocker current or trying a migration.
- **Local Git note for this execution environment:** no repository checkout was mounted; the shell clone attempt failed because it could not resolve `github.com`. Therefore no local `git status`/local `git fetch origin` result is claimed. Remote branch/commit/Actions were checked through the GitHub integration. The next agent with a checkout must run commands in `AGENTS.md`; working-tree cleanliness is **UNKNOWN**, not inferred clean.
- **Exact-SHA rule:** after this documentation commit is pushed, fetch the resulting remote `main` and its own Actions run. Never transfer the parent SHA's PASS to the new documentation SHA. The next session must read live HEAD first; the SHA above is a baseline, not an assumed future HEAD.

- Repository: `Aghbari-Technologies/aghbari-commerce-evolved`
- Branch: `main`
- Main SHA before this documentation-pointer update: `fe22af0424947b56ae80e0679621cf0df333e284`
- Full owner-supplied spec: `docs/canonical/AGHBARI-MASTER-PROJECT-SPECIFICATION.md`
- Enduring mandate: `docs/canonical/AGHBARI-EXECUTION-MANDATE.md`
- Single requirement registry: `docs/canonical/AGHBARI-REQUIREMENT-REGISTRY.md`
- Session recovery/startup prompt: `ops/AGHBARI-SESSION-RESUME.md`
- Root project memory: `PROJECT_MEMORY.md`

## CI evidence
- [Run 38687301037](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38687301037), SHA `f75dcb7fd3f4a598b2acf6db6d649e0f54c92fac`: **PASS**, including unit, isolated PostgreSQL 17 acceptance, lint, build and port 5173 smoke.
- [Run 38687685412](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38687685412), SHA `05fcacbf4ddb6bfd025ab4b1fee7c144a44d4459`: **PASS**, including expanded route and PWA asset smoke tests.
- [Run 38687897943](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38687897943), SHA `971a49d75b546ccba0a05d8829c8d9c38cae085a`: **IN PROGRESS at last observation**. Confirm latest `main` and CI after the current documentation commit; do not transfer prior PASS status to a new SHA.

## Changes already pushed
- Fixed preview-auth timeout lint blocker and preserved the two-second timeout semantics.
- Operations Center refresh re-fetches active data rather than displaying an unsupported success toast.
- Onyx workspace wording matches the integrated Aghbari product direction; reconciliation stays read-only pending an approved adjustment contract.
- Offer creation is explicitly disabled until an actual create operation exists.
- Data-center connectivity status reflects an actual category query instead of a hard-coded success label.
- Root `.env` removed from the current tree and `.env.example` added with empty values.
- The full uploaded master specification, requirement registry, execution mandate, project memory, session resume prompt, state and progress ledger are persisted on main.

## Remaining blockers / high-priority gaps
1. Supabase project `ffxxjaolfntzbapmfbuv` is not accessible via the currently connected Supabase integration. Do not apply migrations to a different project.
2. Fixed browser organization/warehouse constants have been removed from the scoped API and customer/admin consumers. A server-derived tenant-context RPC and restrictive policies for authenticated users are merged and pass isolated PostgreSQL CI. Production isolation remains **unproven** until the correct Supabase project is accessible, its migration is authorized/applied, authenticated browser E2E passes, and anonymous storefront tenant routing is verified.
3. Authenticated customer/staff browser E2E, three-tier price privacy over API/RPC/cache/export, production migrations, server-generated invoice PDF and Onyx workbook compatibility are not proven.
4. AI provider registry/secret-backed test connection/budgeting/privacy sanitization, deployed workers and official WhatsApp delivery remain partial or externally blocked.
5. Public preview loads home/login/admin/order pages but external extraction returned 404 for several deep route/PWA URLs; reproduce in an authenticated real browser. Lovable editor returned 403 through external inspection. Exact sync is not proven.
6. Production restore drill, measured P95/large import profile and responsive RTL UAT remain open.

## Safe next step
Read `PROJECT_MEMORY.md` and `ops/AGHBARI-SESSION-RESUME.md`; then verify live `main` HEAD and latest CI once, and continue from the first open security/release gate in the requirement registry. No broad rediscovery, no fake success, no production mutation without verified access.


## XLSX export implementation — tested code SHA `6112b24c2807fbb013b9fcd2d38c889631286a7c`
- Added `src/lib/onyx-export.ts`: a dependency-free OOXML/ZIP workbook generator, exact 27-column item sheet using the uploaded section-21 headers, plus separate order/customer metadata sheet. Unavailable mapping values are deliberately blank, and SKU/customer code cells are inline strings so leading zeroes survive.
- Added an order-detail download action in `src/components/AdminPages.tsx`. It is enabled only for confirmed/processing/shipped/delivered orders with no pending review. UI explicitly says actual Onyx-version acceptance and centralized export auditing are not proven.
- Added `src/test/onyx-export.test.ts` for exact columns, row mapping, leading-zero identifiers, ZIP/OOXML structure and filename handling.
- Exact-head CI run [38688167670](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38688167670) completed **SUCCESS**: unit tests, isolated PostgreSQL migration/workflow acceptance, ESLint, build, and expanded customer/admin/PWA smoke tests.
- Important limit: no XLSX viewer or actual Onyx sandbox was accessible; this is a code-verified workbook draft, not a certified Onyx import template. Central audit logging for exports is still open.
- Release blockers unchanged: intended Supabase ref `ffxxjaolfntzbapmfbuv` unavailable through current connection; public Lovable preview still returns 404 for several deep routes and `/manifest.webmanifest`; Lovable editor probe is 403 and exact deployed SHA remains unproven.

## 2026-10-15 — Server-derived tenant scope and restrictive RLS

- **PR #26 merged to main:** https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/26
- Merge SHA: `fe22af0424947b56ae80e0679621cf0df333e284`.
- Tested PR head: `c117b0eee5b19411c1fa3bf5162dbef1e939455f`; exact-head CI [run 38689077672](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38689077672) = **PASS**.
- Merge commit CI [run 38689238295](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/38689238295) on exact SHA `fe22af0424947b56ae80e0679621cf0df333e284` = **PASS**.
- Files: `src/lib/supabase.ts`, `src/lib/api.ts`, `src/components/CustomerWorkflows.tsx`, `src/components/AdminPages.tsx`, `supabase/migrations/20261015090000_server_derived_tenant_context.sql`, `scripts/test-database-migrations.mjs`.
- CI gates actually passed: `npm test`; `npm run test:db` against isolated PostgreSQL 17 applying all migrations; `npm run lint -- --rule=prettier/prettier:off`; `npm run build`; dev-server smoke on port 5173 including customer/admin routes and PWA assets.
- New isolated DB checks verify `get_current_tenant_context()` resolves the authenticated profile/organization, foreign-organization products/customers are not visible to staff, and a foreign-organization product insert is denied by restrictive RLS. An earlier exact-head build failed because two components still imported `ORG_ID`; those consumers were corrected and the subsequent exact-head and main CI runs passed.
- **Scope of proof:** these results prove the migration and denial cases in CI’s isolated PostgreSQL 17 environment. No migration was applied to production. The expected Supabase ref `ffxxjaolfntzbapmfbuv` remains inaccessible in the current integration; authenticated real-browser E2E, comprehensive price-tier channel privacy, and public/anonymous storefront tenant routing are not certified.
- Lovable sync remains unverified; do not spend Lovable points or assert deployment based solely on a Git merge/green CI.
