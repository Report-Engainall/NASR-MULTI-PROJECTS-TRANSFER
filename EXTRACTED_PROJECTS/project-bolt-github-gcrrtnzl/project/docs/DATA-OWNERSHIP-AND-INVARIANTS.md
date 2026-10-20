# Aghbari — Data Ownership & Transactional Invariants

Status: **PROVISIONAL / PHASE 0**

## Ownership rule

Each canonical business fact has one authoritative domain owner. Other modules consume it through explicit contracts; they do not silently create competing copies.

| Domain | Canonical owner | Core records |
|---|---|---|
| Identity | Identity & Access | users, sessions, roles, permissions, invites |
| Customers | Customer Management | customers, approval/status, commercial classification |
| Catalog | Catalog | products, categories, units, identifiers, media refs |
| Pricing | Pricing | price lists, tier prices, effective periods, approvals |
| Inventory | Inventory | balances, reservations, movements, thresholds |
| Sales | Sales | carts, orders, order lines, lifecycle, invoice facts |
| Purchasing | Purchasing | suppliers, purchase docs, receipts |
| Operational finance | Cash & Operational Finance | operational financial entries/settlements |
| Promotions | Promotions | offers, eligibility, validity, campaign content |
| Notifications | Notifications | notifications, delivery state |
| Integrations | Integration Hub | outbox, jobs, attempts, delivery/reconciliation state |
| Audit | Audit & Compliance | append-oriented audit events |
| Media | Media | asset metadata and document references |

## Invariants

### Identity and authorization
1. Every protected mutation has a server-side authorization decision.
2. Tenant/branch/warehouse scope is derived from trusted server context, never from an arbitrary client claim.
3. Customer classification cannot be escalated by editing client payloads.

### Pricing
4. The server resolves exactly one authorized effective price for a customer/order context.
5. Other-tier prices are not serialized into customer-facing responses.
6. Committed order lines retain the commercial price used at acceptance; later price changes do not rewrite historical orders.

### Inventory
7. Inventory balance and movement history are changed within a transaction.
8. A movement has a reason/reference and cannot be duplicated by retrying the same command.
9. Reservation/available quantity rules must be explicit before inventory-consuming order acceptance is finalized.

### Cart/order
10. One active cart line exists per `(cart, product)`.
11. Order creation is idempotent for the same client operation/idempotency key.
12. Order numbers are unique and human-friendly while internal IDs remain stable identifiers.
13. Order transitions are validated against an explicit state machine.
14. A customer can read only their own authorized order history.

### Imports
15. Imported data cannot bypass domain validation by writing directly to canonical tables.
16. A validated import can be traced from source file/job to committed records.

### Integrations
17. External delivery is not considered successful merely because a job was queued.
18. A retried external job cannot duplicate the business side effect.
19. Terminal integration failure is observable and recoverable without mutating the original business transaction.

### Audit
20. Security-sensitive and material business mutations emit structured audit events.
21. Audit history cannot be rewritten through normal business CRUD.

## Transaction boundaries

Core transactional operations should keep all authoritative mutations local to the database transaction. External calls happen after commit through the outbox/worker model.

High-risk concurrency tests are mandatory for:
- simultaneous order acceptance against limited stock
- simultaneous price updates and order acceptance
- repeated order submission
- repeated inventory commands
- concurrent import commits

## Boundary discipline

Report-Advisor may build analytical projections from governed Aghbari data, but must not become a second writer for Aghbari transactional truth.
