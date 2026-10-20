# Aghbari — Certification Traceability Matrix V1

**Status:** Phase-0 baseline.

| Capability | Contract | Security | Data integrity | Test layers | Runtime evidence | Release gate |
|---|---|---|---|---|---|---|
| Authentication | auth/session contract | identity/session policy | user identity | unit/integration/security/E2E | required | P0 |
| Customer approval | approval command | admin policy + scope | customer status invariant | unit/integration/security/E2E | required | P0 |
| Tier pricing | pricing query/command | customer scope | authorized price invariant | unit/security/E2E | required | P0 |
| Product catalog | catalog contract | scoped read/admin write | product identity | unit/integration/E2E | required | P0 |
| Inventory | stock commands | warehouse scope | atomic movement/balance | unit/integration/concurrency/security/E2E | required | P0 |
| Order creation | createOrder | customer/admin policy | totals/idempotency/order identity | unit/integration/security/E2E | required | P0 |
| Order lifecycle | transition command | role/policy | valid state machine | unit/integration/E2E | required | P0 |
| Purchasing | purchase commands | supplier/warehouse policy | receiving → inventory | unit/integration/concurrency/E2E | required | P0 |
| Import | staged import contract | upload/admin policy | validate-before-commit | unit/integration/security/E2E | required | P0 |
| Export | versioned export contract | scoped reads | canonical source | contract/integration | required | P0 |
| WhatsApp | adapter contract | integration credential isolation | idempotent delivery | contract/integration/retry/E2E | required | P0 |
| Onyx Pro | adapter/export contract | integration isolation | mapping correctness | contract/integration/fixture/E2E | required | P0 |
| Notifications | notification contract | recipient scope | delivery state | unit/integration/retry/E2E | required | P1 |
| Offline sync | operation contract | authenticated sync | idempotent conflict handling | unit/integration/E2E/offline | required | P1 |
| Audit | audit event contract | privileged access | append/provenance | unit/integration/security | required | P0 |
| RBAC/RLS | policy matrix | direct endpoint + DB checks | scope isolation | security/adversarial/E2E | required | P0 |
| PWA/cache | cache contract | no auth bypass | stale-data boundaries | integration/E2E | required | P1 |

## Evidence rule
A row is release-complete only when its implementation, automated evidence, security evidence where applicable, and runtime evidence are all bound to the same release candidate HEAD. Documentation alone never closes a row.

## Adversarial minimum
Certification must include attempts to:
- access another customer's data
- read another pricing tier
- cross branch/warehouse boundaries
- replay an order mutation
- race inventory adjustments
- replay integration delivery
- submit malformed/oversized imports
- bypass UI permissions through direct API calls
- use stale/offline state after server truth changes
- force invalid order transitions

## Release rule
Any P0 row that is NOT PROVEN blocks Production Certification. P1 gaps may be accepted only through an explicit release decision with risk and remediation evidence.
