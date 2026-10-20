# Aghbari Architecture Boundaries — Working Baseline

This is the pre-freeze architecture boundary. It records decisions that are already authoritative while leaving implementation technology and detailed domain decomposition open until the complete requirements corpus is reviewed.

## Product roles

### الأغبري — Operational System of Record

Owns:
- product/catalog master data
- SKU/item identity, barcode, units and categories
- tiered operational pricing
- customers and suppliers
- customer onboarding/approval and account state
- orders, order lifecycle, amendments and history
- inventory quantities and movements
- branches and warehouses
- offers and operational promotions
- users, roles and permissions
- operational notifications
- import/export and data operations
- Onyx Pro integration boundary
- WhatsApp integration boundary
- audit and traceability
- operational financial workflows required by the business

### Report-Advisor — Analytics / Intelligence Layer

Owns:
- BI
- analytical dashboards
- advanced reports
- trends/comparisons
- forecasting
- analytical inventory/sales analysis
- decision intelligence
- analytical alerts
- recommendations/insights

These responsibilities must not be duplicated in الأغبري merely to make it appear more sophisticated.

## Operational home principle

The primary home/command center is action-oriented, not an analytics dashboard. It surfaces work that requires operational attention: orders awaiting processing, actionable stock conditions, synchronization failures, pending approvals, operational notifications, and similar workflow state.

## Integration principles

### Report-Advisor bridge

The boundary should expose reliable canonical operational data and explicit integration contracts. Analytical consumers should not couple directly to arbitrary UI state or fragile presentation-layer queries.

### Onyx Pro

Treat Onyx as an external system with explicit import/export mappings, idempotency, validation, failure handling, reconciliation, and auditable synchronization state. The exact mechanism remains an architecture decision pending the complete requirements review.

### WhatsApp

Treat messaging as an integration service, not as a UI side effect. Automatic server-side delivery, template/message policy, retries, idempotency, delivery status, and failure visibility must be considered explicitly.

## Data integrity principles

- Canonical identifiers for products, customers, orders, and inventory movements.
- Transactional state transitions for money/order/inventory-critical operations.
- Idempotency for retriable commands and external integrations.
- Explicit lifecycle/status history where auditability requires it.
- No business-critical state derived only from client-side state.
- Import/export validation before mutation where feasible.
- Concurrency/race-condition analysis for stock and order mutation.

## Security principles

- Server-side authorization is authoritative.
- RBAC is explicit and least-privilege oriented.
- Database-level isolation is used where the deployment model requires it.
- Sensitive data is minimized and protected.
- Audit events are append-oriented and tamper-resistant within the application's trust model.
- File imports are treated as untrusted input.
- Every privileged path receives negative-path testing.

## UX principles

- Arabic RTL first-class.
- Mobile and desktop responsive behavior.
- Fast product discovery and quantity adjustment.
- Customer sees only the price applicable to their account/tier.
- Customer-facing documents never expose internal customer-tier metadata.
- Admin is a coherent command center, not a collection of disconnected tools.
- Operational complexity is hidden behind sensible workflows and bulk actions.

## Legacy re-engineering rule

The old العامري application is a requirements/reference source only. We retain valuable business behavior and lessons learned, but we do not inherit its branding, implementation limitations, unnecessary AI/reporting tables, excessive admin fragmentation, or legacy technology choices without independent justification.
