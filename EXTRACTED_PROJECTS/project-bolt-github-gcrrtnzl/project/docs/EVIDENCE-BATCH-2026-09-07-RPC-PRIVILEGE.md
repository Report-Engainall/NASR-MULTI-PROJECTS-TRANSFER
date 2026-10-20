# Aghbari Commerce — Evidence Batch: RPC Privilege Surface

**Scope:** `Aghbari-Technologies/aghbari-commerce` only.

## Exact source boundary
- Branch: `security/rpc-surface-final6`
- HEAD after this evidence batch: `83086ee715db9f0cfdadcd9c84327a47fb9baf77`
- PR: `#42`, still open/unmerged.

## New implementation evidence
- Added `supabase/tests/018-rpc-privilege-surface.test.sql`.
- Regression contains 57 assertions.
- It covers 18 application/context functions and the legacy 4-argument catalog function.
- Expected contract: authenticated execution only; anonymous and PUBLIC execution denied.

## Live database proof
Independent live SQL aggregation against Supabase project `mrcyqezbhpncuvaehwgf` returned:
- RPC rows passing: `18/18`
- RPC rows failing: `0`
- Legacy 4-argument `get_catalog` boundary: `true` (authenticated/anon/PUBLIC denied)

This is a live privilege proof, not a CI PASS.

## Correction recorded
The first version of test 018 declared `plan(54)` while containing 57 checks. This was detected before acceptance and corrected to `plan(57)` in commit `83086ee715db9f0cfdadcd9c84327a47fb9baf77`.

## CI boundary
Fresh candidate workflows still complete as `failure` without job steps/log payloads. The latest bootstrap lockfile job exposed `steps=null` and no log URL. Therefore CI remains **NOT PROVEN** and no source-code failure is inferred.

`package-lock.json` remains unproven/absent, so `npm ci` certification remains open.

## Certification rule
No production certification is claimed. The 18/18 privilege result is accepted only as live database evidence. Fresh CI, authenticated browser E2E, outbox delivery, deployment, and final exact-head certification remain open.
