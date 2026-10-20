# READY TO REUSE — source snapshots from Aghbari Commerce Evolved

Source repository: https://github.com/Aghbari-Technologies/aghbari-commerce-evolved  
Source ref: main, observed commit HEAD d24695209b45f2352e0ba994e1f5109d7e2afc9d during the tree comparison.  
Target selected by owner: Report-Engainall/Nasr1.

These files are verbatim source snapshots for evaluation and reuse. They are stored outside src/ and outside the live migration directory so Bolt can review and port them deliberately. The source SHA shown in the source register is the Git blob identifier of the source file, not a SHA-256 digest of a downloaded file.

## Included snapshots
- src/lib/customer-addresses.ts — client service contract for address-book read/save/delete through named RPCs.
- src/lib/customer-company-members.ts — company membership workspace, invitations, acceptance and revocation validation.
- src/lib/finance-document-pdf.ts — PDF creation source; inspect fonts, runtime dependencies and Arabic/RTL support before porting.
- src/lib/unified-import.ts — deterministic import primitives, size limits, resumable verified chunk validation, stable configuration fingerprinting and incremental SHA-256.
- src/routes/api.invoice-pdf.$invoiceId.ts — source route for invoice PDF. Its routing conventions may differ from Nasr1; treat as behavior reference and adapt rather than drop into an incompatible router.
- src/test/tenant-scope.test.ts — test candidate for scope isolation. Reconcile its test environment and mocks with current target.

## Mandatory before porting
1. Compare each module to Nasr1's current implementation and don't overwrite a newer or safer one.
2. Inspect every referenced RPC and its matching migration, schema columns, RLS/grants and function signature. A TypeScript file alone does not create its backend contract.
3. For invoice PDFs, inspect the actual route runtime and existing invoice/statement endpoints; preserve auth and ownership checks and verify a caller cannot request another tenant's document.
4. Run the existing related tests and add route/database tests where the current suite does not cover the behavior.
5. Copy into live src/ only once integrated, or port the precise useful behavior. Do not import this staging folder into application builds.
