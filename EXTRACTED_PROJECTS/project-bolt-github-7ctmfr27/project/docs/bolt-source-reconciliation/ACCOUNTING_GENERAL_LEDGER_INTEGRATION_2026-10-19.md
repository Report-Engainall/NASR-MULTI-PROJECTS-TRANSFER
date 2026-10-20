# NASR1 General Ledger — execution record

## Scope
This change adds the first target-native double-entry ledger foundation to `Report-Engainall/Nasr1` on a non-destructive feature branch, without replacing existing financial flows or archived screens.

## Implemented in code
- Organization-scoped chart of accounts (asset, liability, equity, revenue, expense), constrained codes, optional parent accounts, RLS and server-only writes.
- Journal drafts with strict finite monetary values, 2-decimal maximum precision, 2–100 lines, one-sided debit/credit lines, active same-organization accounts and server-side equality of totals.
- Payload-bound idempotency; replay of the same request returns the same journal, while reuse with changed content is rejected.
- Explicit posting with a row lock, revalidated balance, idempotent retries and audit events. Posted entries have no authenticated direct update/delete path.
- Trial balance and journal history by date/account filters; totals are calculated only from actual posted journal lines.
- Finance workspace is connected within the existing finance route and reuses the current auth/tenant/security model.
- No sample opening balances or fabricated historical entries are inserted.

## Intentionally not claimed
- This foundation does not automatically generate journal entries from historical invoices, payments, cash expenses, purchase receipts or Onyx snapshots. Such linkage must be implemented transactionally for future source events, with idempotency and explicit reconciliation, as the next task.
- Browser-proven and production-proven are NOT RUN. CI status is not production verification.

## Validation
- Unit and PostgreSQL acceptance tests were added for exact decimal handling, replay/conflict protection, balanced posting, audit events, trial-balance totals and cross-tenant/customer denial.
- Exact commit SHA and matching workflow run must be recorded after CI completes. Any check not executed is NOT RUN.
