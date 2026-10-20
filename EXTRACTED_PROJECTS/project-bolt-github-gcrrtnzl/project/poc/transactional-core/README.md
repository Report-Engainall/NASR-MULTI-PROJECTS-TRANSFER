# G1 Transactional Core Proof Harness

This harness is the first executable technology proof artifact for Aghbari.

## Scope

It proves, at domain level, four invariants required by G1:

1. effective price is authoritative and client-supplied stale/wrong price is rejected;
2. insufficient inventory causes no partial order mutation;
3. repeated `operation_id` is idempotent and cannot create a second order;
4. order total is calculated by the server-side command path.

## Important boundary

This is **executable evidence of domain invariants**, not a PostgreSQL transaction/concurrency PASS. The next G1 layer must replace the in-memory state with the selected transactional persistence candidate and prove atomicity under concurrent requests.

## Run

Requires Node.js 20+ because the harness uses the built-in `node:test` runner.

```bash
node --test poc/transactional-core/invariants.mjs
```

## No-false-closure

A green local run does not certify the database, RLS, runtime, deployment, or production behavior. Those require their own evidence gates.
