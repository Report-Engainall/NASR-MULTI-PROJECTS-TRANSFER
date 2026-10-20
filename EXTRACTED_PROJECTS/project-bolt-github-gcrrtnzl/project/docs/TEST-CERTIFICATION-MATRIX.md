# Aghbari — Test & Certification Matrix

Status: **PROVISIONAL**

## Evidence ladder

| Level | Required evidence |
|---|---|
| L0 Specified | Requirement and acceptance criteria recorded |
| L1 Implemented | Code/config/schema exists |
| L2 Static/Unit | Type/lint/unit/schema checks pass |
| L3 Integration | Real service/database interaction verified |
| L4 E2E | User-critical workflow exercised end-to-end |
| L5 Security | Authorization/isolation/abuse tests pass |
| L6 Runtime | Supported deployment/environment proven |
| L7 Release | Exact HEAD, deployment, migrations, rollback, observability and acceptance evidence bound together |

## P0 certification scenarios

### Identity & authorization
- approved customer login
- pending customer rejection/limited access
- blocked customer rejection
- role boundary tests for every administrative capability
- direct API access without UI
- cross-customer/tenant/branch/warehouse access attempts

### Pricing
- correct tier price resolution
- impossible-to-request other tier prices
- effective-date handling
- concurrent price change behavior
- bulk price import validation and audit

### Catalog/cart/order
- product search/category filtering
- add/update/remove quantity
- same-product consolidation
- distinct-line cart badge
- checkout validation
- duplicate submission
- retry after timeout
- order state transition validity
- invoice correctness and tier privacy

### Inventory
- concurrent stock decrements
- insufficient stock race
- movement audit
- reservation/release if enabled
- low-stock threshold behavior
- branch/warehouse isolation

### Imports/exports
- valid import
- malformed row
- duplicate row
- unauthorized import
- rollback/atomicity
- exact Onyx column order and data mapping
- large-file performance

### Integrations
- outbox creation in same transaction as domain mutation
- worker retry
- duplicate delivery suppression
- dead-letter behavior
- WhatsApp provider failure
- Onyx failure/reconciliation
- Report-Advisor export/consumption contract

### Offline/weak network
- cached catalog read
- stale price handling
- offline draft
- reconnect synchronization
- duplicate client operation ID
- conflicting server state
- explicit conflict presentation

## Non-functional gates

- authorization tested at direct endpoint level
- no secrets in client bundle/logs
- CSP/security headers reviewed
- rate limiting verified on sensitive endpoints
- database constraints cover critical invariants
- migration forward/backward strategy tested where feasible
- backup restore tested before production certification
- structured logs include correlation IDs
- critical failures are observable
- performance budgets are measured, not assumed

## Certification rule

A feature may be called **CERTIFIED** only when all required evidence levels for its risk class are present and bound to the exact candidate HEAD. A green CI pipeline without business/runtime evidence is never sufficient.
