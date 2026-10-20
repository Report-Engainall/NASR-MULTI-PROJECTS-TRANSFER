# Aghbari — Phase 0 Forensic Synthesis

Status: **PROVISIONAL / NOT FROZEN**

This document converts the currently available requirements into an engineering decision surface. It is intentionally provisional until Legacy Batch 3 is incorporated.

## 1. Re-engineering mandate

Aghbari is not a legacy-specification implementation exercise. Historical requirements are evidence of business intent, workflows, constraints, and failure history.

**Engineering mandate:** Convert historical requirements into **modern, measurable, testable engineering requirements**, then re-engineer the system architecture, data model, workflows, interfaces, integrations, security, performance, reliability, and operational experience using current engineering standards and proven modern practices.

The objective is to preserve the required **business capability**, not to preserve obsolete implementation decisions.

Every historical requirement is therefore classified through:

`UNDERSTAND → EXTRACT BUSINESS INTENT → ENGINEER → VALIDATE → IMPLEMENT`

Never:

`COPY LEGACY SPEC → COPY LEGACY ARCHITECTURE → PATCH FOR COMPATIBILITY`

### Re-engineering principles

1. **Legacy Requirements → Engineering Requirements** — convert vague or implementation-shaped requests into explicit acceptance criteria, invariants, interfaces, and testable behavior.
2. **Legacy Architecture → Modern Architecture** — independently reassess technology and structure against security, performance, reliability, maintainability, scalability, and operational cost.
3. **Feature Preservation → Capability Evolution** — preserve business outcomes while redesigning weak workflows and failure-prone mechanisms.
4. **Security by construction** — authorization, data isolation, validation, auditability, and secret handling are architectural properties, not UI add-ons.
5. **Evidence-driven completion** — every material capability advances through implementation and verification gates; no inferred PASS.
6. **No technology nostalgia** — old framework/library choices are historical evidence only unless independently revalidated.

## 2. Product boundary

Aghbari is the operational system of record for wholesale food commerce. It owns transactional truth and operational workflows.

Report-Advisor owns analytical truth, BI, advanced reporting, forecasting, decision intelligence, and analytical recommendations.

The boundary is architectural, not merely UI-level: Aghbari emits reliable operational/canonical data; Report-Advisor consumes it through controlled contracts.

## 3. Core bounded-context candidates

| Context | Owns | Must not own |
|---|---|---|
| Identity & Access | users, authentication, sessions, roles, permissions, invites | business analytics |
| Customer Management | customers, approval, status, commercial classification | BI/customer scoring |
| Catalog | products, categories, SKU/barcode, units, media metadata | analytical product ranking |
| Pricing | tier prices, price lists, effective periods, approvals | forecasting/optimization AI |
| Inventory | stock balances, movements, reservations, thresholds | historical BI dashboards |
| Sales | carts, orders, order lines, status lifecycle, invoices | executive analytics |
| Purchasing | suppliers, purchase documents, receiving workflows | supplier BI |
| Cash & Operational Finance | operational financial transactions required by commerce | full financial analytics |
| Promotions | offers, banners/tickers, eligibility and validity | recommendation intelligence |
| Notifications | in-app/operational notifications and delivery state | analytical alerting |
| Import/Export | validated data exchange, templates, job status | arbitrary direct DB mutation |
| Integration Hub | Onyx Pro, WhatsApp, Report-Advisor adapters, retries, idempotency | core domain ownership |
| Audit & Compliance | immutable operational audit trail | analytics |
| Media | product/order documents, optimized assets, references | BI |
| Platform Operations | health, jobs, observability, configuration | business records |

## 4. Critical transactional invariants

1. A customer can see only data authorized for that customer and commercial context.
2. A tier price is resolved server-side; other tier prices are never returned to the customer client.
3. An order has one canonical identity and idempotent creation semantics.
4. Adding the same product to a cart updates its quantity rather than creating duplicate lines.
5. Cart badge count represents distinct line items, not summed quantity.
6. Stock mutations are atomic and auditable.
7. External integration retries cannot duplicate orders, inventory movements, or outbound messages.
8. Order state transitions are explicit, validated, and auditable.
9. Operational invoices do not expose internal customer-tier classification.
10. Import jobs validate, stage, report errors, and commit atomically or by explicit safe batch semantics.
11. Soft deletion is never used to silently bypass uniqueness, authorization, or audit rules.
12. Every tenant/branch/warehouse boundary is enforced at the data-access layer, not only in UI code.

## 5. Re-engineering decisions from legacy requirements

### Keep and strengthen
- Tiered pricing with strict server-side privacy.
- Customer approval and controlled onboarding.
- Fast product search/filter/category navigation.
- Inline quantity controls and duplicate-line prevention.
- Operational inventory thresholds and movement history.
- Explicit order lifecycle and order timeline.
- Excel import/export with a canonical Onyx-compatible export contract.
- WhatsApp integration, but through an official business API/provider contract rather than client-side URL hacks.
- PWA/responsive web as the first-class client.
- RBAC, auditability, rate limiting, validation, and security-by-default.
- Weak-network resilience through caching and controlled synchronization.

### Simplify / redesign
- Replace the legacy oversized admin tree with an action-oriented command center.
- Keep operational reports only where they support immediate work; analytical reporting belongs to Report-Advisor.
- Avoid a large AI suite, AI tables, AI dashboard, or duplicated intelligence layer in Aghbari.
- Treat old Flutter/Laravel/JWT choices as historical, not requirements.
- Replace direct spreadsheet/WhatsApp coupling with durable integration jobs and explicit delivery state.
- Separate domain logic from framework/UI concerns so future mobile clients do not require domain rewrites.
- Replace implementation-shaped legacy requirements with explicit contracts, invariants, acceptance criteria, and evidence requirements.

### Reject as binding
- Old branding using “العامري”.
- Legacy implementation limitations.
- Client-side-only authorization.
- Direct database writes from imports or UI.
- Any assumption that WhatsApp deep links constitute server-side delivery.
- Duplicated analytics/forecasting/decision intelligence inside Aghbari.

## 6. Admin command-center principle

The administrator should enter one coherent operational workspace, not navigate a maze of technical modules.

Primary navigation candidate:

1. Command Center
2. Orders
3. Customers
4. Catalog & Products
5. Pricing
6. Inventory
7. Purchasing
8. Promotions
9. Imports & Exports
10. Integrations
11. Notifications
12. Audit & Security
13. Settings

Cross-cutting search, global command actions, saved filters, bulk actions, and contextual actions should reduce navigation depth.

## 7. Architecture candidate

Provisional recommendation: a **modular monolith** with strict domain boundaries, PostgreSQL as transactional source of truth, typed server contracts, background jobs/outbox for integrations, and a responsive web/PWA client.

Why:
- The product has many tightly related transactional workflows.
- Microservices would add operational complexity before scale justifies it.
- Modular boundaries preserve future extraction options.
- PostgreSQL provides strong transactional integrity for orders/inventory/pricing.
- Background integration processing isolates slow/unreliable external systems.

The exact framework/runtime remains an explicit ADR decision and must be finalized after Batch 3 and current ecosystem verification.

## 8. Integration architecture

All external side effects should follow this shape:

`Domain Command → Transaction → Outbox/Event → Worker → External Adapter → Delivery Record → Retry/Dead Letter`

Required properties:
- idempotency key
- correlation ID
- retry policy with backoff
- bounded attempts
- explicit terminal failure
- audit record
- no hidden synchronous dependency on external services for core transaction commit

Targets:
- Onyx Pro
- WhatsApp Business Platform/provider
- Report-Advisor
- email/push/SMS providers if later required

## 9. Offline / weak-network model

Offline support is not permission to invent local transactional truth.

Candidate model:
- cache catalog/pricing/customer-safe reference data
- allow controlled draft cart/order preparation offline where safe
- attach client operation IDs
- synchronize through idempotent commands
- server remains authoritative for final stock, price, authorization, and order acceptance
- surface conflicts explicitly rather than silently overwriting

## 10. Security model

Security must be enforced in layers:

`UI → API/service authorization → domain policy → database authorization → audit`

Minimum controls:
- secure session/authentication design
- server-side authorization
- least-privilege RBAC
- row/tenant/branch/warehouse isolation where applicable
- schema validation
- rate limiting and abuse controls
- CSRF protection where cookie-based browser auth requires it
- secure headers/CSP strategy
- secret isolation
- structured audit events
- no sensitive data leakage in client payloads/logs
- direct endpoint authorization tests

## 11. Certification strategy

Every major capability progresses through:

`SPECIFIED → IMPLEMENTED → UNIT VERIFIED → INTEGRATION VERIFIED → SECURITY VERIFIED → E2E VERIFIED → RUNTIME PROVEN → RELEASE CERTIFIED`

A green build alone never certifies business correctness.

High-risk certification suites must include:
- tenant/customer isolation
- price privacy
- order idempotency
- inventory atomicity
- duplicate submission/retry behavior
- import rollback/partial-failure behavior
- Onyx export exactness
- WhatsApp delivery/retry semantics
- role/permission boundaries
- weak-network synchronization conflicts
- audit completeness

## 12. Current risks

| Risk | Severity | Treatment |
|---|---|---|
| Batch 3 missing | High | Do not freeze final architecture; continue safe synthesis |
| Legacy feature duplication | High | Enforce Aghbari/Report-Advisor boundary |
| Integration side effects | High | Outbox + idempotency + delivery state |
| Inventory race conditions | Critical | DB transactions/locking/invariants + concurrency tests |
| Price leakage | Critical | Server-side resolution + payload tests |
| Admin complexity | High | Command-center UX and task-oriented navigation |
| Weak-network conflicts | High | Explicit sync protocol and conflict model |
| Import corruption | High | staging/validation/idempotent commit + rollback evidence |
| External API availability | Medium/High | asynchronous adapters and retries |
| Premature framework lock-in | Medium | finalize stack only after requirements synthesis |

## 13. Freeze gate

Architecture Candidate may be frozen only when:

- Batch 1, Batch 2, and Batch 3 are reconciled.
- Every legacy feature is classified as KEEP / STRENGTHEN / REDESIGN / REJECT / DEFER.
- Every bounded context has an owner and data boundary.
- Transactional invariants are explicit.
- Integration contracts are explicit.
- Security model is testable.
- Offline/sync semantics are explicit.
- Admin information architecture is approved by evidence/requirements.
- Technology ADRs are recorded.
- Certification matrix maps every P0/P1 capability to evidence.

Until then this document is **PROVISIONAL**.
