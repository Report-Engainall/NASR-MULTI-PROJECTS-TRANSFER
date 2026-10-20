# Aghbari — Engineering Requirements Baseline

Status: **PROVISIONAL / PHASE 0**

## Re-engineering mandate

Aghbari is not a modernization of the old application by code transplantation. Historical requirements are evidence of business intent and failure history. They are transformed into measurable engineering requirements.

`Historical intent → Capability → Engineering requirement → Acceptance criteria → Evidence`

## Global requirements

Every capability MUST define:
- authoritative owner and source of truth
- authorization boundary
- invariant(s)
- command/query contract
- failure behavior
- idempotency and concurrency semantics where applicable
- audit/observability events
- automated verification
- runtime certification evidence

## P0 transactional requirements

### Identity and authorization
- Authentication MUST use a secure server-supported session model appropriate to the final deployment.
- Authorization MUST be enforced server-side and independently of UI visibility.
- Customer commercial classification MUST be authoritative on the server.
- Customer-facing reads MUST project only data permitted to that customer.
- Administrative capabilities MUST be capability-based and least-privilege.

### Pricing
- The effective customer price MUST be resolved on the server.
- A customer request MUST never receive prices belonging to another commercial tier unless explicitly authorized for an administrative use case.
- Price changes MUST be validated, auditable, and effective-dated where required.
- Bulk pricing changes MUST support validation/preview before commit.

### Catalog
- Products MUST have stable identifiers and business-facing item numbers/SKU/barcode where applicable.
- Search/filter/category reads MUST be paginated and indexed according to measured workload.
- Product availability shown to customers MUST be derived from authoritative operational state with an explicit freshness policy.

### Cart and orders
- A cart MUST contain at most one active line per product per cart.
- Repeated add operations MUST be idempotent at the line level.
- Order creation MUST support an idempotency key and a canonical business identity.
- An accepted order MUST have immutable commercial facts for the committed version: customer, authorized price, quantity, and totals.
- Order lifecycle transitions MUST be explicit, validated, and audited.
- Repeated client submission or integration retry MUST NOT create a duplicate order.

### Inventory
- Stock acceptance and mutation MUST occur transactionally against authoritative inventory state.
- Every material stock mutation MUST create an auditable movement record.
- Concurrent stock mutations MUST be protected against lost updates/overselling according to the final reservation policy.
- Low-stock thresholds are operational signals; analytical forecasting remains outside Aghbari.

### Imports and exports
- Imports MUST enter a staging/validation boundary before affecting canonical records.
- Invalid rows MUST be reported with actionable error information.
- Commit MUST be atomic or explicitly partitioned into safe, auditable batches.
- Exports used by Onyx MUST be versioned and schema-locked, including exact column order where required.

## P0 integration requirements

External systems MUST NOT be part of the atomic success condition for the core order/inventory transaction unless a future contract explicitly proves that requirement necessary.

Canonical flow:

`Command → DB transaction → Outbox → Worker → Adapter → Delivery record → Retry/DLQ`

Every integration job MUST carry:
- idempotency key
- correlation ID
- attempt count
- provider/external reference when available
- status
- timestamps
- terminal failure reason

Targets:
- Onyx Pro
- WhatsApp Business Platform/provider
- Report-Advisor

## P0 security requirements

- Tenant/branch/warehouse boundaries MUST be enforced at the data-access layer where applicable.
- Direct endpoint authorization MUST be tested; UI hiding is never evidence of authorization.
- Sensitive secrets MUST remain server-side.
- Inputs MUST be schema-validated at trust boundaries.
- Rate limiting and abuse controls MUST exist for authentication and high-risk mutation endpoints.
- Browser security headers/CSP and CSRF protections MUST match the final session architecture.
- Audit events MUST avoid unnecessary sensitive payloads.

## P1 resilience requirements

- Safe reference data MAY be cached.
- Offline/delayed operations MUST use client operation IDs and idempotent commands.
- Server state remains authoritative for price, stock, authorization, and final order acceptance.
- Synchronization conflicts MUST be explicit and observable; silent overwrite is prohibited.
- Retry policies MUST be bounded and distinguish transient from terminal errors.

## P1 UX requirements

- Customer UX MUST be Arabic RTL-first and responsive across supported desktop/mobile browsers.
- The home experience MUST prioritize search, categories, offers, product discovery, and fast quantity changes.
- Admin UX MUST be an operational command center with contextual actions, bulk operations, global search, and actionable alerts rather than a technical mirror of backend modules.
- Customer-facing screens MUST never expose internal tier classification.

## Certification rule

No requirement is considered complete because a screen exists or a build is green. Completion requires evidence appropriate to the risk, progressing through:

`SPECIFIED → IMPLEMENTED → UNIT VERIFIED → INTEGRATION VERIFIED → SECURITY VERIFIED → E2E VERIFIED → RUNTIME PROVEN → RELEASE CERTIFIED`
