# P1 Source Integration — Restore Existing Aghbari Commerce Favicon
**Date:** 2026-10-20  
**Target:** `Report-Engainall/Nasr1`  
**Branch:** `integration/restore-verified-brand-favicon-20261020`  
**Base SHA:** `c3fa1c52bd9c34d111e484b407d5eea2c2cefc07`  
**Source:** `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d`

## Evidence
- Target `src/routes/__root.tsx` already declares `{ rel: "icon", href: "/favicon.ico", type: "image/x-icon" }`.
- The target `public/` tree did not contain `favicon.ico`; the browser's configured icon URL was therefore broken.
- The same-product donor has `public/favicon.ico` at blob `3c01d69713f9c184e92b74f5799e6dff2f500825`.
- Copied the original asset as a Git binary blob. The target blob is required to equal the donor blob SHA exactly; no recompression or image editing was used.
- No saved-address functionality was changed: the customer-address service, tests and SQL migrations were already present in Nasr1 with blob SHAs matching the donor.

## Files changed
- Add `public/favicon.ico`, a bit-for-bit copy from the reviewed source.
- Add `src/test/favicon-asset.test.ts` to validate the ICO directory header, image table and byte bounds, and assert the root-route icon link points to the same path.
- Add a source-decision row to the P1-owned `SOURCE_INTEGRATION_LEDGER.csv`.
- Add the source/target blob trace to the P1-owned `READY_TO_REUSE_FILE_AUDIT.csv`.

## Safety and validation
- No runtime application logic, metadata, route behavior, authorization, database migration, secret or donor repository was changed.
- **PASS on exact PR head:** [GitHub Actions 39361936854](https://github.com/Report-Engainall/Nasr1/actions/runs/39361936854), SHA `e0b0640b4e073082a775c581bd5a9b2f147b6fc0`. The favicon integrity test passed; 54 test files and 387 tests passed; PostgreSQL 17 acceptance, lint, build, preview smoke 4173 and dev smoke 5173 passed.
- PR #19 merged into `main` as `3a8b1261179aea8861a3d01b5a5232106b41409d`. Post-merge CI [39362159790](https://github.com/Report-Engainall/Nasr1/actions/runs/39362159790) also passed on that exact main SHA.
- **NOT RUN:** local test execution, visual/pixel-level logo review, authenticated browser review, and production deployment. The static ICO structure was tested by CI; this is not a claim of visual asset approval.
- No P2-owned report file or Bolt archive was touched.

## Next task
Continue the existing P1 source ledger from the oldest remaining item that is marked partial or deferred and not already covered by a target-native equivalent. Do not import the legacy global webhook worker without tenant-scoped destination ownership, SSRF/egress controls, signing/secrets, retry and idempotency requirements.
