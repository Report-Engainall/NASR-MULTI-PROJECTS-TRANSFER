# P1 Task Continuation — Customer Company Membership Coverage
**Date:** 2026-10-20  
**Target:** `Report-Engainall/Nasr1`  
**Branch:** `integration/customer-company-members-coverage-20261020`  
**Base SHA:** `9c2251780fda8f3f1a7011ce65bc66f8a51d8c01`  
**Task:** `NASR1-SOURCE-CUSTOMER-COMPANY-MEMBERS-001`

## Decision and source reconciliation

The donor source `Aghbari-Technologies/aghbari-commerce-evolved@d24695209b45f2352e0ba994e1f5109d7e2afc9d` was checked against the existing target; this is continuation of the previously recorded membership task, not a repository-wide re-audit.

| Source material | Source blob | Target blob | Decision |
|---|---|---|---|
| `src/lib/customer-company-members.ts` | `8578774e4074cf726ecf46d9ab3b92e48045b85d` | `8578774e4074cf726ecf46d9ab3b92e48045b85d` | Already present exactly |
| `src/routes/company.members.tsx` | `3f7f71f2050f1f3cb63cdc08957a7c156b983773` | `3f7f71f2050f1f3cb63cdc08957a7c156b983773` | Already present exactly |
| `src/routes/company.accept-invitation.tsx` | `2110b58489b8d9ba8206129e49adc1dbfec643ce` | `2110b58489b8d9ba8206129e49adc1dbfec643ce` | Already present exactly |
| `supabase/migrations/20261015160000_customer_company_memberships.sql` | `81e0bfc50b2d8cd29fe96af7a7fd9b0f93a99a65` | `81e0bfc50b2d8cd29fe96af7a7fd9b0f93a99a65` | Already present exactly; not reapplied or changed |
| `src/test/customer-company-members.test.ts` | `39a6b81982d22e312dcc023dccfcbc0b27b8eaf3` | `39a6b81982d22e312dcc023dccfcbc0b27b8eaf3` | Existing service-contract tests retained |
| `src/components/CustomerCompanyMembers.tsx` | `259caa2d675cd49d12864fa600b321ea73dcaae4` | `d000b2526228e476586d0e0cd2873d48c259f045` | Retain target-native variant; do not replace it with donor UI |

The target UI intentionally differs from the donor variant: it accepts an optional `initialToken` and clears the token using the canonical acceptance path. No source screen or migration was copied. The identified gap was page-level regression coverage, not missing runtime membership logic.

## Implemented in this branch

- Added `src/test/customer-company-members-page.test.tsx`.
- Added a feature decision/evidence row for `NASR1-SOURCE-CUSTOMER-COMPANY-MEMBERS-001` to the P1-owned `SOURCE_INTEGRATION_LEDGER.csv`.
- UI test cases cover: staff-account denial before any membership read; creation and manual sharing of an invitation URL; explicit member and invitation revocation actions; server acceptance of the URL token and removal from browser history; and rejection of staff accounts at invitation acceptance.
- No SQL, RPC, authorization policy, generated route tree, package manifest, or donor repository was changed.
- The tests mock only the client auth/data boundaries; they assert the UI calls the existing RPC adapter rather than introducing a parallel membership implementation.

## Validation status

- Initial base SHA verified: `9c2251780fda8f3f1a7011ce65bc66f8a51d8c01`.
- Code/test head `ae19ffc87000c6abcdfaa9a34de53c31d56fa110` passed GitHub Actions [39359934341](https://github.com/Report-Engainall/Nasr1/actions/runs/39359934341): frozen Bun lock verification, unit tests, PostgreSQL 17 migration/core-workflow acceptance, lint, build, production-preview smoke port 4173, dev-server smoke port 5173, and cleanup all succeeded on that exact SHA.
- Local test command is **NOT RUN** because no local checkout/test runtime is attached to this session.
- This evidence commit changes only this P1 ledger row and this supplementary report. Final-head CI for the resulting documentation SHA is **PENDING** and must pass before the PR is treated as merge-ready.
- PostgreSQL/RLS acceptance for this new UI test is not newly claimed; the migration and RPC contract were already covered by the existing target integration suite. Browser-authenticated proof and production migration/deployment are **NOT RUN**.

## Ownership and continuation

`PROGRAMMER_1_CURRENT_REPORT.md` is not modified in this change because it remains present in P2's open PR #5 changed-file set; its removal was already requested there. This supplementary P1 task report and the P1-owned source ledger retain the continuation evidence without overwriting P2's branch.

**Next task after final-head CI:** `NASR1-SOURCE-FINANCE-WORKFLOW-PARITY-001` — use the existing ledger/audit entry `NASR1-MANIFEST-036` (`src/services/finance.input.test.ts`, status `PARTIAL_FEATURE_ADAPTED_OTHER_LEGACY_DEFERRED`) as the entrypoint. Compare the already recorded source contract with current target finance/payment workflows, avoid duplicating the merged P2 invoice/payment accounting path, and implement only a concrete missing donor behavior if evidence confirms one. Do not re-fetch unchanged donor blobs.
