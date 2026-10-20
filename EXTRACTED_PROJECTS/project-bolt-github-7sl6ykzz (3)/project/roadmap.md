# Aghbari Commerce — completion roadmap

Last state audit: 2026-10-09. Repository: `Aghbari-Technologies/aghbari-commerce-evolved`.  
Recovery baseline used: `30dff96f4d874cd78dc2dd446bf81d634517157f`. Restoration starts from the regressed `main` commit `55645b517e0af130304f0c740d6c03cb63ffb5e1` and is not production-certified until the restored commit passes CI.  
Pull request #1: https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/pull/1 — **MERGED** at `7a80eb70e5c5c6c3d52dd282a28bb4e76d30d9ab`. The branch has since advanced on `main`; do not describe PR #1 as draft/unmerged.  
Release status: **NOT production-certified**. Exact target Supabase project `ffxxjaolfntzbapmfbuv` is still unavailable through the current connector, so live migrations, live RLS/RPC validation, authenticated browser E2E, and production behavior remain NOT PROVEN. Do not apply these migrations to the similarly named but schema-incompatible `aghbari-commerce` Supabase project.

## Implemented in the draft PR

- [x] Customer invoice list/detail with print-to-PDF through the browser.
- [x] Customer statement totals derived from stored invoices and payments; void invoices are excluded.
- [x] Server-side invoice creation on staff order confirmation, with invoice lines and payment-status recalculation.
- [x] Customer RFQ submission, staff quote pricing, customer quote review/accept/reject, and expiry checks.
- [x] Saved reorder templates and safe restoration of selected product quantities into the shopping cart.
- [x] Barcode lookup by typed code or camera where the browser supports `BarcodeDetector`.
- [x] Arabic data-backed commerce assistant for order status, catalogue lookup, invoice summary, and offline guidance. It does not invent database values and does not call an external LLM.
- [x] Limited offline catalogue caching, persisted cart drafts, PWA manifest/service worker, and an explicit warning that current stock/prices must be revalidated online.
- [x] Direct customer paths for the added workspaces and direct `/admin/*` paths for admin sections.
- [x] Rebuilt the checked-in TanStack route tree to register all 29 route files and aligned the escaped `admin_.*` file-route IDs. Added route-matching smoke coverage for the customer workspaces, every admin section, and order detail.
- [x] Finance/quote RPC hardening, tenant-scoped RLS policies for new tables, and safe first-signup role assignment.
- [x] Checkout RPC now includes server-side customer-tier pricing, a persistent idempotency key bound to the exact request payload, explicit cash-on-delivery/credit terms, tenant-safe product validation, and credit checks.
- [x] Checkout displays the server-calculated price preview by account tier and quantity before enabling order submission; order creation rechecks prices on the server.
- [x] Database schema now permits multiple minimum-quantity price breaks per product tier.
- [x] Order confirmation now requires an approved customer, locks/reserves sufficient stock atomically, tracks stock movements, and consumes/releases reservations on delivery/cancellation.
- [x] Order status transitions are constrained to legal next steps and status history is recorded by the database trigger in the same transaction.
- [x] CI workflow runs tests, correctness lint (excluding the repository-wide Prettier formatting rule), and production build.
- [x] Admin command palette: Arabic searchable navigation to admin sections, opened by the header button or Ctrl/⌘+K; screen-reader dialog text is included.
- [x] Customer quick-order matrix: enter quantities for multiple filtered catalogue items in one table and add them to the cart together. Shared validation rejects empty, fractional, invalid, and over-stock selections; checkout remains server-authoritative.

## Still open — do not mark complete until verified

- [ ] Apply migrations `20261009010000`, `20261009020000`, `20261009030000`, `20261009040000`, `20261009050000`, and `20261009060000` to the exact Supabase project configured by this repository's `.env`. The repository points to project ref `ffxxjaolfntzbapmfbuv`, which is not available through the current Supabase connection. The accessible project named `aghbari-commerce` uses a materially different schema; do not apply these migrations to it. No database writes or live SQL validation have been attempted.
- [ ] Run authenticated browser end-to-end checks for customer and staff flows against that exact database, including invoice issue, statement totals, payment overpayment rejection, RFQ/quote expiry, reorder restore, camera fallback, and offline recovery.
- [ ] Execute database-level tests on the target Supabase project for duplicate checkout replay, tier break pricing, cross-tenant product rejection, credit-limit rejection, concurrent stock reservation, legal state transitions, invoice creation, cancellation-release, and delivery stock consumption. The migration code is committed to the draft PR but is not runtime-proven.
- [ ] Customer address book and company-user management.
- [ ] Apply and verify active contract, `pricing_rules`, and promotion semantics at checkout. Current guaranteed pricing behavior covers per-tier `product_prices` rows and their quantity minimums; the legacy seeded rule/promotion records are not yet safely interpreted as a complete stacking/priority policy.
- [ ] Native/server-generated PDF documents (current invoice/statement output uses the browser print dialog).
- [ ] Model-backed Lovable AI integration and generated business insights. The current assistant is deliberately deterministic and database-backed.
- [ ] Full offline field-sales queue and conflict-safe synchronization after reconnect. Current support is cached catalogue + cart draft only; it does not place orders offline.
- [ ] Merge the PR to `main` only after the matching database migrations can be applied and database/browser checks pass. The Lovable project currently syncs `main`; changes on this fix branch are not visible in the existing Lovable preview/live URL until the active Lovable branch is switched to this branch or the PR is merged. Do not switch/merge to mask the unresolved backend mismatch.

## Routing incident closed in source — live preview still to verify

- On 2026-10-09, the checked-in `src/routeTree.gen.ts` was stale: it registered only the original 7 routes while the repository contained 29 route files. This caused paths added to the storefront to fail navigation in an environment that used the checked-in tree before regeneration.
- Route-tree registration and `admin_.*` file-route IDs have been corrected on `fix/commerce-completion-20261009`. The expanded routing smoke tests, lint, and production build passed on commit `fcf66fecabbd2e9a46f576270a4ddd579805c605`.
- The user's Lovable preview was not accessible from an unauthenticated external probe (it redirected to Lovable sign-in), so authenticated browser navigation on the actual preview is not yet proven. Confirm once Lovable completes updating the selected branch.

## Evidence rules

- Passing tests/build on the PR proves compilation and the listed unit/routing checks only. It does not prove database migrations, RLS behavior, browser flows, payment processing, or production deployment.
- No migration was applied and no production deployment was performed as part of this branch work.


## Regression recovery — 2026-10-09

- Detected a merge regression at `main` HEAD `55645b517e0af130304f0c740d6c03cb63ffb5e1`: 71 files from the previously green product tree were missing or replaced, including the canonical spec, workflow/DB acceptance runner, import engine, customer workflows, dedicated invoice/statement/quote/reorder/assistant/barcode/offline routes, and 22 production-intent SQL migrations.
- Restore source baseline: `30dff96f4d874cd78dc2dd446bf81d634517157f`, whose exact SHA passed CI run [37977637689](https://github.com/Aghbari-Technologies/aghbari-commerce-evolved/actions/runs/37977637689).
- Preserved the newer global Arabic navigation bar from `55645b5` while restoring the root auth health notice, PWA manifest and service-worker registration.
- Restoration branch: `fix/restore-product-work-after-main-regression-20261009`. Do not call the recovery complete until exact-head unit tests, PostgreSQL 17 acceptance, lint, build, route smoke tests and migration-version uniqueness pass.
- No production Supabase migrations or deployment performed by this recovery.

## Live DB sync (2026-10-15)
- [x] 20261009010000_commerce_completion applied to live Cloud DB (drizzle 0001)
- [ ] Apply remaining 18 supabase/migrations/20261009020000 … 20261009171000 in order (checkout depends on 040000)
- [x] 20261009020000_commerce_commands applied (drizzle 0002)
- [ ] Bring GitHub main (153 newer commits up to 6913e35) into the Lovable workspace — git merge/pull is not available to the agent; Lovable sync must pull it
- [ ] Then apply the remaining 17 migrations from 2026-10-09 + 14 new ones from 2026-10-15 to the live database
