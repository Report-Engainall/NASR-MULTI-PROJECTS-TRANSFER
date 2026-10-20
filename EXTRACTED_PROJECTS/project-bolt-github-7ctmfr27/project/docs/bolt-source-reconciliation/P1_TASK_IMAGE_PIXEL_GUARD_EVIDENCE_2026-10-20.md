# P1 Evidence Recheck — Product Image Pixel Guard
**Date:** 2026-10-20  
**Target:** `Report-Engainall/Nasr1`  
**Branch:** `integration/image-pixel-guard-evidence-20261020`  
**Base SHA:** `25bc0c969cfe8740860b19518caf21135caf67ad`  
**Task:** `NASR1-SOURCE-IMAGE-PIXEL-GUARD-TEST-001`

## Why this recheck was needed
The P1 source ledger recorded the code-bearing pixel-guard test as passed but still marked the final documentation-head recheck pending. The target-native implementation/test are already in current `main`; this change closes the stale evidence using a newer exact-main full CI result without re-fetching unchanged donor blobs.

## Target evidence
- Target test: `src/lib/product-image.test.ts`, blob `c753e417c8d3afd38f1acf80d5c3a1411bfeec8f`.
- Target helper: `src/lib/product-image.ts`, blob `8fce9c518a5ee3e4bc4a74db844e67942ac07e40`.
- The helper enforces `MAX_SOURCE_PIXELS = 25_000_000`; the target test covers rejecting an oversized image before canvas allocation and closing its ImageBitmap.
- Donor test `src/services/imagePipeline.test.ts`, source blob `839e6327d35718ca8d00392e090cce5d3133482a`, remains read-only evidence. It was not copied or executed; target-native assertions remain aligned with the current upload/auth/storage boundary.

## Exact validation evidence
- **Code-bearing main SHA:** `25bc0c969cfe8740860b19518caf21135caf67ad`.
- **Full CI:** [Actions 39366594237 — SUCCESS](https://github.com/Report-Engainall/Nasr1/actions/runs/39366594237) on that exact SHA.
- **Result:** 54/54 test files and 395/395 tests; frozen Bun lock verification; PostgreSQL 17 migrations/RLS/core-workflow acceptance; lint; build; production-preview smoke 4173; dev-server smoke 5173; cleanup — all succeeded.
- This PR changes only the P1 source ledger, source audit and this evidence report. The evidence PR must also pass CI on its exact head before merge.

## Safety and limits
No application code, SQL, RLS/authorization, dependencies, image-upload configuration, production uploads or secrets were changed. Browser-authenticated and production deployment proof remain **NOT RUN**.
