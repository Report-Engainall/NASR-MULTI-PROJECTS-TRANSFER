# P1 Donor Test Reconciliation — Finance Runtime Input Boundaries
**Date:** 2026-10-20  
**Target:** `Report-Engainall/Nasr1`  
**Branch:** `integration/finance-runtime-type-guards-20261020`  
**Base SHA:** `ab218e88459c1278d25549f06f0c15f68c7988f6`  
**Task:** `NASR1-MANIFEST-036`  
**Code-bearing SHA tested:** `5155f31168bab7e7e7c72224e2a1b775b4414d8c`  
**Exact-head CI:** [Actions 39366199248 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39366199248)  
**Current status:** the code-bearing SHA passed. This evidence-only commit changes the P1 ledger, audit and this report, so final-head CI must pass on the new evidence SHA before the PR is merge-ready.

## Donor evidence and scope decision
- Read-only donor: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`.
- Source test `src/services/finance.input.test.ts`, blob `dc640af0b622bd51057cf7456e46b15d3c29d9d8`, had already been staged and fingerprinted in the source audit; it was not copied into the application or re-executed.
- Useful missing behavior: reject malformed non-string runtime values with a specific validation error before calling `.trim()`, reading `.length`, or doing other string operations. This avoids surfacing a raw TypeError if data crosses the typed UI boundary unexpectedly.
- Intentionally excluded: donor cash-account/branch schema and old payment service methods. Those depend on tables and service/RPC contracts that Nasr1 does not use; importing them would create a second finance ledger. Cash expenses retain their exact-decimal text representation, and customer collection remains on its current `cash/transfer/card/other` method contract (not the donor's `bank_transfer` spelling).

## Implemented
- `src/lib/cash-expense-input.ts`: validates that the draft is an object and every text field (category, description, amount, currency, payment method, reference, expense date) is actually a string before any string operation.
- `src/lib/finance-input.ts`: validates the customer-payment amount, method, reference and notes runtime types before validation and length checks. Existing decimal grammar, positive amount, safe minor-unit precision, allowed methods and field limits remain unchanged.
- `src/test/cash-expense-input.test.ts`: adds malformed-object rejection and field-by-field non-string rejection.
- `src/test/finance-input.test.ts`: adds non-string argument tests including a null reference.
- `SOURCE_INTEGRATION_LEDGER.csv`: updates `NASR1-MANIFEST-036` with the precise adaptation and keeps the incompatible legacy API explicitly deferred.
- `READY_TO_REUSE_FILE_AUDIT.csv`: updates the donor test's reuse/adapt decision and evidence.

## Data, accounting and ownership
- No database migration, RPC, table, RLS policy, role mapping, ledger posting behavior, historical transaction, dependency, route, or production data changed.
- Server-side RPC/database authorization remains authoritative for tenant, invoice state, outstanding balance and posting. These input guards are defense-in-depth only.
- No P2-owned file, shared coordination/state report, migration test harness, or Bolt archive was touched. `main` was not edited directly.

## Validation
- Targeted unit files: `src/test/cash-expense-input.test.ts` and `src/test/finance-input.test.ts`.
- Required full suite: `.github/workflows/commerce-checks.yml` on the exact PR head, including frozen Bun lock check, unit tests, PostgreSQL 17 migrations/RLS/core-workflow acceptance, lint/build, preview smoke 4173, dev smoke 5173 and cleanup.
- **Exact code-bearing SHA:** `5155f31168bab7e7e7c72224e2a1b775b4414d8c`; [GitHub Actions 39366199248 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39366199248).
- Result: 54/54 test files and 395/395 tests passed; frozen Bun lockfile verification; PostgreSQL 17 migrations/RLS/core-workflow acceptance; lint; build; production-preview smoke on port 4173; dev-server smoke on port 5173; cleanup all succeeded.
- The evidence-only commit below must pass its own full CI on the final PR head. Browser-authenticated and production deployment/database-migration proof are **NOT RUN**.

## Next task
After the exact-head result is verified, use the P1-owned live source ledger to select the next incomplete donor item only after reconfirming its current target-native equivalent and status. Do not treat legacy finance ledger/cash-account APIs as missing merely because the old donor test mentions them; do not revisit resolved donor blobs without changed evidence.
