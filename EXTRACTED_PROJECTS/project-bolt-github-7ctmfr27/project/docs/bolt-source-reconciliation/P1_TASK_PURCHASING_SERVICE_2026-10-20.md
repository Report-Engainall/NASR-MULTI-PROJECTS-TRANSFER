# P1 Donor Reconciliation — Purchasing Service and Input Tests
**Date:** 2026-10-20  
**Target:** `Report-Engainall/Nasr1`  
**Branch:** `integration/purchasing-input-boundaries-20261020`  
**Base SHA:** `26ad448bced4c23a23545df160698ac9a19b003e`  
**Task:** `NASR1-SOURCE-PURCHASING-SERVICE-RECONCILIATION-001`  
**Code-bearing SHA tested:** `791f0589b272f826ecd13954b0530cfc54a769f5`  
**Exact-head CI:** [Actions 39363180342 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39363180342)  
**Status after this evidence update:** the pass below covers the code-bearing SHA; because this commit records the evidence, final-head CI must also pass on the newly created documentation/evidence SHA before the PR is merge-ready.

## Decision
Reconciled the recorded donor service `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1` without restarting the repository audit.

- `src/services/purchasing.ts` source blob: `70117c47145ad81e4c0a9d973811c139ea954c2e`.
- `src/services/purchasing.input.test.ts` source blob: `8f20558e55452fa4b5a3925dc45e8485f1b37298`.
- Source runtime was inspected read-only; the donor service and donor test were not copied, staged, or executed.
- Target comparison: Nasr1 already implements supplier purchase orders in `src/lib/api.ts`, `src/lib/purchase-orders.ts`, `src/components/PurchaseOrdersPage.tsx`, and `supabase/migrations/20261019230000_purchase_orders_and_receiving.sql`. The current target contract derives tenant/profile and roles server-side; keeps purchase tables RPC-only; supports optional NULL unit costs, quantities to three decimals, partial/full atomic receiving, stock movements, audit events, idempotent replay and warehouse task creation/closure.
- The donor module is incompatible with the target contract: it expects a legacy currency argument, a separate `approved` state, different line/count/quantity bounds and old RPC/schema assumptions. Copying it or its migrations would create duplicate purchasing behavior and risk weakening the current target contract.
- Supplier creation already exists through the target `createSupplier`/admin flow. No duplicate supplier service or second purchasing ledger was added.

## Implemented in this branch
Extended the existing target test `src/test/purchase-orders-page.test.tsx` with five behavioral regressions adapted from the donor input-test intent:
1. Unknown unit cost remains `null`; it is not silently converted to zero.
2. Duplicate products are rejected before invoking purchase creation.
3. Quantity precision beyond the target's three-decimal contract is rejected before submission.
4. Unit-cost precision beyond two decimals is rejected rather than rounded silently.
5. A receipt quantity above the server-returned remainder is rejected before the receiving API call.

The existing manager/staff authorization UI test cases remain intact. The new cases test the target UI behavior; they do not replace the current server-side RPC authorization, idempotency, or database acceptance checks.

## Changed paths
- `src/test/purchase-orders-page.test.tsx` — focused target-native regressions; no runtime change.
- `docs/bolt-source-reconciliation/SOURCE_INTEGRATION_LEDGER.csv` — added the P1-owned purchasing service and input-test decision records.
- `docs/bolt-source-reconciliation/READY_TO_REUSE_FILE_AUDIT.csv` — recorded source blob provenance and the no-copy/adapt decisions for both reviewed donor paths.
- `docs/bolt-source-reconciliation/P1_TASK_PURCHASING_SERVICE_2026-10-20.md` — this supplementary P1-owned task report; the shared current reports and P2-owned coordination/state/archive files are untouched.

## Data and security boundary
No runtime service, SQL migration, RPC, route, grant, RLS policy, dependency, credential, historical transaction or production data was changed. No currency conversion is inferred. The donor repositories remain read-only. No Bolt archive was inspected or merged. `main` was not edited directly.

## Validation and evidence
- Targeted behavior coverage: five new cases in `src/test/purchase-orders-page.test.tsx`; all are included in the full unit suite.
- **Exact code-bearing SHA:** `791f0589b272f826ecd13954b0530cfc54a769f5`.
- **GitHub Actions:** [39363180342 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39363180342) on that exact SHA.
- Result: 54/54 test files and 392/392 tests passed; frozen Bun lockfile verification; PostgreSQL 17 migrations/RLS/core-workflow acceptance; lint; build; production-preview smoke on port 4173; dev-server smoke on port 5173; container cleanup — all succeeded.
- This exact-head run is the proven code-bearing revision. The following evidence-only commit changes the source ledger, provenance audit and this report; wait for a full CI success on that final commit SHA before treating PR #21 as merge-ready.
- No local command was run in this session. The donor test/service were not copied or executed. Browser-authenticated and production deployment/database-migration proof: **NOT RUN**.

## Next task
After the final candidate SHA is verified, continue with the next incomplete source-ledger candidate `NASR1-MANIFEST-036` (`src/services/finance.input.test.ts`) only after checking its overlap with the existing cash-expense and P2 invoice/payment accounting work. Reuse the logged partial decision; do not add a legacy second ledger, and do not edit P2-owned files or `scripts/test-database-migrations.mjs` without coordination.
