# Aghbari — Implementation Readiness Register V1

## Purpose
Evidence-bound bridge from the reconciled architecture to executable implementation. This register distinguishes source/proof evidence from live runtime evidence and is maintained against the current Aghbari Commerce HEAD.

## Current implementation boundary — 2026-09-08

| Track | Current state | Remaining proof / closure |
|---|---|---|
| Architecture / ownership | RECONCILED | Maintain traceability at certification HEAD |
| Transactional invariants | IMPLEMENTED + POC PROVEN | Fresh live runtime regression |
| Order state machine | IMPLEMENTED | Fresh service/runtime execution |
| PostgreSQL schema | LIVE THROUGH 0062 | Fresh disposable migration replay + parity |
| Auth / tenant isolation | IMPLEMENTED / LIVE NEGATIVE SMOKE | Real authenticated Tenant A/B E2E |
| RLS | LIVE: 34/34 public tables enabled | Adversarial authenticated Tenant A/B proof |
| Backend/domain runtime | IMPLEMENTED | Exact-HEAD CI + integration evidence |
| Frontend/PWA | IMPLEMENTED | Browser E2E against reachable deployment |
| Worker/outbox | IMPLEMENTED / outbox-worker deployed | Durable delivery/retry runtime proof |
| Import/export | IMPLEMENTED / CONTRACTED | Real staged validation + commit evidence |
| Onyx integration | CONTRACTED | Adapter sandbox/E2E evidence |
| WhatsApp integration | CONTRACTED | Official provider E2E evidence |
| Offline sync | IMPLEMENTED / CONTRACTED | Replay/conflict/isolation runtime evidence |
| Report-Advisor gateway | CONTRACTED | Runtime dataset publication evidence |
| Production deployment | NOT YET PROVEN | Deployment + smoke + rollback evidence |

## First vertical slice acceptance
A release candidate cannot claim the first runtime slice complete unless all are executable against the same exact HEAD:

1. authenticated tenant context;
2. product read is scope-safe;
3. authorized customer price is server-selected;
4. inventory read is authoritative;
5. order creation is transactional;
6. stale/invalid client price cannot mutate truth;
7. inventory cannot oversell under concurrency;
8. repeated operation key replays exactly once;
9. changed payload under the same operation key is rejected;
10. order transitions enforce the state machine;
11. audit evidence is written;
12. outbox event is durable and correlated;
13. cross-tenant/cross-branch/unauthorized attempts fail;
14. all results are tied to the exact certification HEAD.

## Anti-closure rules
- A POC is not production runtime evidence.
- A migration file is not migration execution evidence.
- A UI restriction is not authorization evidence.
- A configured integration is not delivery evidence.
- A queued event is not successful external delivery evidence.
- A green CI run on an earlier SHA is not exact-HEAD evidence.

## Current hard release gates
1. Generate and commit `package-lock.json` from the authoritative `package.json` using a successful runner; do not hand-author dependency integrity data.
2. Obtain executable GitHub Actions results for the exact current HEAD; recent runs are failing before exposing steps/logs and therefore are not evidence of code failure or success.
3. Observe exact-HEAD typecheck, lint, unit/domain, PostgreSQL/pgTAP, build, security, and release-audit results.
4. Execute authenticated browser E2E with real staging identities and tenant isolation.
5. Prove production deployment/runtime smoke and rollback.
6. Prove outbox external delivery and retry behavior.
7. Reconcile live migration history through 0062 with the replayable source chain.

**Certification rule:** no production certification is claimed until every required runtime gate has fresh exact-HEAD evidence.
