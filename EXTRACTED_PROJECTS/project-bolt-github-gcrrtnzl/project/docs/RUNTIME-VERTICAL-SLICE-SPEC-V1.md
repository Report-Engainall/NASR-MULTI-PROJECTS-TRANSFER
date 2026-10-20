# Aghbari — Runtime Vertical Slice V1

## Goal
Implement one complete production path before broadening the application surface.

## Path
`Authenticated Tenant → Product → Authorized Price → Inventory → Create Order → Idempotent Replay → State Transition → Audit → Outbox`

## Mandatory properties
1. Tenant context is derived from authenticated server-side identity.
2. Product reads enforce tenant/branch scope.
3. Price selection is server-authoritative and exposes only the authorized price context.
4. Inventory availability is read from authoritative transactional state.
5. Order totals are calculated server-side.
6. Order creation and inventory mutation are atomic.
7. Reusing an operation key with the same payload returns the original logical result without duplicate mutation.
8. Reusing an operation key with a different payload is rejected.
9. Concurrent orders cannot oversell available stock.
10. Invalid order-state transitions are rejected.
11. Audit evidence records actor, scope, command/correlation and material result.
12. Outbox emission is durable and correlated with the domain transaction.
13. Unauthorized, cross-tenant and cross-branch requests are rejected on direct request paths.
14. Tests include negative/adversarial cases and cannot pass by bypassing the production path.

## Evidence ladder
`SPECIFIED → IMPLEMENTED → UNIT VERIFIED → INTEGRATION VERIFIED → SECURITY VERIFIED → E2E VERIFIED → RUNTIME PROVEN`

A passing POC is regression evidence, not runtime certification.
