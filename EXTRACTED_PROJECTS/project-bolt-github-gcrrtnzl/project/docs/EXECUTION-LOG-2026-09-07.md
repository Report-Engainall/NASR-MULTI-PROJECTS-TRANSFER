# Aghbari Commerce — Execution Log 2026-09-07

**Scope:** `Aghbari-Technologies/aghbari-commerce` only.

## Batch: multi-front input-boundary hardening + live security recheck

### Completed implementation evidence
- Added `supabase/tests/018-rpc-privilege-surface.test.sql`: 57 assertions covering anonymous/PUBLIC denial, authenticated execution, context helpers, and legacy 4-argument catalog denial.
- Added `supabase/tests/019-security-definer-contract.test.sql`: 12 assertions covering fixed `search_path = public` and intentional SECURITY DEFINER status on the exposed command/read RPC boundary.
- Added `supabase/tests/020-order-state-machine-boundary.test.sql`: 8 assertions for same-tenant order creation, unauthorized viewer transition denial, cross-tenant transition denial, RLS isolation, inventory decrement, and status-history scoping.
- Corrected test `020` after source inspection showed `transition_order` explicitly returns `42501` for an unauthorized role; the test now asserts the real contract.
- Expanded `src/services/offlineQueue.test.ts` with adversarial coverage for offline browser gating, queue mutation during draining, terminal-operation skipping, cyclic payload rejection, malformed retry timestamps, maximum-attempt retry timing, whitespace normalization, explicit invalid-user filtering, payload/queue ceilings, and user isolation.
- Corrected the retry-boundary assertion to the actual configured maximum-attempt delay (`256000ms`); the implementation's `15min` ceiling is above the current 8-attempt boundary and is not falsely claimed as reached.
- Hardened `src/services/orders.ts` with fail-closed validation for client order-transition inputs: UUID order id plus canonical `order_status` enum values, with whitespace normalization before the RPC call.
- Expanded `src/services/orders.test.ts` with valid normalization coverage and invalid UUID/empty/unknown-status rejection cases.
- Hardened `src/services/admin.ts` with runtime customer-tier and product-status allowlists, normalized entity IDs, and fail-closed enum validation; expanded admin contract regressions.
- Hardened `src/services/purchasing.ts` so purchase and receiving quantities are safe integers bounded to 1..10,000; expanded adversarial quantity regressions.
- Hardened `src/services/customers.ts` with normalized/bounded customer fields, runtime tier validation, UUID validation for mutations, boolean validation, and safe pagination; added customer input regressions.
- Hardened `src/services/finance.ts` with safe monetary magnitude limits and safe pagination; expanded precision/overflow regressions.
- Hardened `src/services/cart.ts` to fail closed on malformed `get_cart` RPC responses instead of coercing invalid quantities/prices to fallback values; validates product UUID, nonblank identity fields, quantity bounds, currency, and nonnegative finite authorized price before returning data to the UI.

### Live/source evidence retained
- Live privilege aggregation independently re-checked: `anon_exposed=0`, `authenticated_exposed=18`, `public_functions=19`.
- Live public table audit re-checked: `23/23` public tables have RLS enabled; no forced-RLS claim is made.
- Legacy 4-argument catalog remains denied to authenticated/anon/PUBLIC according to the retained privilege proof.
- `src/services/cart.ts` calls the authenticated customer RPC surface and validates product UUIDs and quantity bounds before online calls/offline queueing; malformed server response data now fails closed.
- `src/services/catalog.ts` calls only the mandatory 5-argument warehouse-aware `get_catalog` and preserves finite-number guards.
- `transition_order` canonical source locks by order id plus authenticated organization, then applies explicit role/state authorization and records history/audit.
- Tenant A/B cart/order runtime-equivalent isolation remains proven: foreign product, foreign warehouse, and foreign order transition are rejected; opposite-tenant orders are hidden; own order creation succeeds.
- Import correctness remains proven with inventory deltas `0→4 = +4` and `4→7 = +3`; successive price versioning uses `clock_timestamp()`.
- Migration numeric-prefix reconciliation remains complete at source level with no duplicate-prefix blocker in the scanned tree.

### CI / runner boundary
- Workflow definitions remain exact-SHA-bound where required; application quality uses Node 22 and `npm ci` plus typecheck/test/lint/build/release-audit.
- `package-lock.json` is still absent from the branch and therefore `npm ci`/release certification remains blocked.
- New commits may trigger workflow execution, but usable job-step/log evidence remains unavailable; CI therefore remains **NOT PROVEN** and no code-level diagnosis is inferred from workflow failure status alone.
- No production certification is claimed from workflow existence or source-only regressions.

### Current branch
- Branch: `security/rpc-surface-final6`
- PR: `#42`
- PR remains open and unmerged.
- The exact latest execution SHA is the commit containing this log update and must be treated as the new certification boundary.

### Certification boundary
- RPC privilege surface: **LIVE 18/18 PASS**.
- Public table RLS coverage: **LIVE 23/23 ENABLED**.
- RPC SECURITY DEFINER/search-path contract: source regression added; CI execution still not proven.
- Order state-machine boundary: source regression added after inspecting canonical transition contract.
- Client order-transition input boundary: hardened and regression-covered at source level.
- Offline queue: adversarial source regression expanded; runtime/CI execution not yet proven.
- Admin/purchasing/customer/finance input boundaries: hardened and regression-covered at source level; CI execution not yet proven.
- Cart response boundary: hardened fail-closed at source level; CI execution not yet proven.
- Tenant/RPC/catalog/cart/order/import hardening: materially strengthened and transactionally exercised.
- CI runner evidence, lockfile/npm-ci, authenticated browser E2E, and production runtime proof: **NOT CERTIFIED**.

**No production certification is claimed by this log.**
