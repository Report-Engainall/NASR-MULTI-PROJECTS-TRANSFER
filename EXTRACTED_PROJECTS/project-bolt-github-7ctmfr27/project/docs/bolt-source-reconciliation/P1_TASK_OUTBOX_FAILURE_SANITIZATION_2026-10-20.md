# P1 Task Record — Outbox Worker Failure Sanitization
**Date:** 2026-10-20  
**Target:** `Report-Engainall/Nasr1` only  
**Feature PR:** [#15](https://github.com/Report-Engainall/Nasr1/pull/15) — merged  
**Code/test SHA:** `772e45ca2e1a16b918189b2b1ba744254570a3ab`  
**Merge SHA:** `efed429ed1efc54f22900d7d60f0109353452b1b`

## Source-integration decision

Donor reviewed read-only: `Report-Engainall/aghbari-commerce@00d7446bba9652ea40178a08b00c9da9a2bba8a1`, staged worker blob `441e93c159dec5b1571ec4906a232ee705d8686d`.

The donor worker uses `OUTBOX_WEBHOOK_URL`, `OUTBOX_WEBHOOK_TOKEN`, `OUTBOX_WORKER_TOKEN`, and legacy `ack_outbox_event` / `fail_outbox_event` call shapes. Nasr1 instead uses a secret-header gate, leased event claims, worker-bound ownership, a target-native internal order-notification consumer, and a different failure RPC contract. Copying the donor worker would bypass the target runtime design and has not been justified by tenant-scoped external webhook configuration evidence. **No donor worker code or migration was copied.**

## Root cause fixed

`supabase/functions/outbox-worker/index.ts` imported the defined `sanitizeOutboxErrorMessage` but used an undefined `safeErrorMessage(error.message)` in the branch called when `process_outbox_event` fails or returns an unknown result. That could throw before recording the retry/dead-letter result via `fail_outbox_event`.

## Files changed in PR #15

- `supabase/functions/outbox-worker/index.ts`: use `outboxFailureMessage(error)` in the failure-recording call.
- `supabase/functions/outbox-worker/logic.ts`: add `outboxFailureMessage`, using the existing redactor for the original `Error` message and a safe fallback for absent/malformed errors.
- `src/test/outbox-worker-logic.test.ts`: assert email, phone-like values, bearer/API secrets and URL tokens are redacted; assert missing/malformed errors use a generic bounded fallback.
- `src/test/outbox-worker-source.test.ts`: protect the exact helper import/call and fail if the undefined `safeErrorMessage` call returns.

No database schema, RLS, grants, RPC signatures, deployment secrets, manifests, or production data changed.

## Test evidence and correction

- First workflow attempt [39360775187](https://github.com/Report-Engainall/Nasr1/actions/runs/39360775187) failed only because the source-test harness assumed Vitest's transformed `import.meta.url` was a `file:` URL. It was corrected to resolve the file path from `process.cwd()`; the failure was not reported as a pass.
- Final exact code/test SHA `772e45ca2e1a16b918189b2b1ba744254570a3ab` passed [GitHub Actions 39360907560](https://github.com/Report-Engainall/Nasr1/actions/runs/39360907560):
  - 53 test files passed; 386 tests passed.
  - Frozen Bun lockfile verification and dependency installation passed.
  - Isolated PostgreSQL 17 migrations/core-workflow acceptance passed.
  - Lint and build passed.
  - Production-preview smoke on port 4173 and dev-server smoke on port 5173 passed.
- PR #15 was merged with expected-head guard, producing `efed429ed1efc54f22900d7d60f0109353452b1b`.
- Live Supabase Edge deployment, authenticated browser exercise, external webhook delivery, and production worker execution are **NOT RUN**. The usual CI path does not prove live Edge Runtime behavior.
- The branch's P1 ledger row and source audit result are updated here to preserve the source decision and exact-head proof. The P2-owned `PROGRAMMER_1_CURRENT_REPORT.md` and all Bolt archive material are untouched.

## Next task

`NASR1-SOURCE-OUTBOX-WEBHOOK-COMPATIBILITY-001`: decide whether externally configured webhook delivery is an approved product requirement. Before implementing it, require tenant-scoped destination ownership, URL/egress allow-listing to prevent SSRF, secret handling, payload minimization/signing, delivery receipts/idempotency, retry/dead-letter behavior, and isolated tests. Until those requirements/configuration are grounded in the current source contract, keep the legacy donor webhook worker deferred rather than adding a global, unbounded destination.
