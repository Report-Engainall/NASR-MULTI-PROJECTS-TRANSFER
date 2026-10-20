# Aghbari — Architecture Decision Log

Status: **PROVISIONAL** until Batch 3 reconciliation and architecture freeze.

## ADR-000 — Full system re-engineering and modernization
**Decision:** Historical requirements are treated as business evidence, not as a blueprint for implementation. The system will undergo full re-engineering and architectural modernization using current engineering standards, proven modern technologies, and measurable/testable requirements.

**Engineering rule:** Preserve business capability and intent; redesign obsolete workflows, architecture, data structures, integrations, security controls, and UX where evidence shows a better solution.

**Required transformation:** `Legacy Requirement → Business Intent → Engineering Requirement → Architecture/Contract → Implementation → Evidence`.

**Consequence:** No legacy framework, library, data model, UI structure, or integration shortcut is binding merely because it existed previously.

## ADR-001 — Operational system of record
**Decision:** Aghbari owns transactional and operational truth.

**Rationale:** Orders, inventory, prices, customers, purchasing, and operational integrations require one authoritative system.

**Consequence:** Report-Advisor consumes governed data; it does not become the transactional writer for Aghbari workflows.

## ADR-002 — Analytics boundary
**Decision:** Analytics, BI, forecasting, decision intelligence, and analytical recommendations remain in Report-Advisor.

**Rationale:** Avoid duplicate logic, contradictory metrics, unnecessary UI complexity, and two competing intelligence layers.

## ADR-003 — Modular monolith first
**Decision:** Start as a modular monolith with enforceable domain boundaries rather than microservices.

**Rationale:** Transactional workflows are highly coupled and the product does not yet justify distributed-system overhead. Modules can later be extracted if measured scale or ownership requires it.

## ADR-004 — PostgreSQL transactional core
**Decision:** PostgreSQL is the leading candidate for the operational database.

**Rationale:** Strong transactions, constraints, concurrency controls, indexing, JSON support where useful, and mature authorization patterns fit the workload.

**Status:** Candidate; final technology approval waits for Batch 3 and ecosystem verification.

## ADR-005 — Asynchronous external side effects
**Decision:** Onyx, WhatsApp, and similar external actions use an outbox/worker integration pattern.

**Rationale:** External APIs can be slow, unavailable, duplicated, or rate-limited. Core order/inventory commits must not depend on successful external delivery.

## ADR-006 — Server-authoritative pricing
**Decision:** Customer price is resolved and authorized server-side; the client never receives other tier prices.

**Rationale:** UI hiding is not a security boundary.

## ADR-007 — Server-authoritative inventory
**Decision:** Stock acceptance and mutation are decided transactionally on the server/database.

**Rationale:** Cached/offline values can become stale and concurrent orders can race.

## ADR-008 — PWA/web first
**Decision:** Responsive web/PWA is the first-class client target. Native mobile packaging remains an extension decision.

**Rationale:** The business requires mobile and desktop access, while a single web application minimizes duplicated domain/UI logic. Native shells can be added if evidence justifies them.

## ADR-009 — Explicit idempotency
**Decision:** All externally retryable commands and important client mutations receive idempotency semantics.

**Rationale:** Network retries are normal in weak-network environments and integrations; duplicate orders or stock movements are unacceptable.

## ADR-010 — Admin command center
**Decision:** Admin UX is task-oriented and operational, not a mirror of the backend module tree.

**Rationale:** The legacy admin became difficult to operate. A small number of coherent workspaces with contextual actions is preferable to dozens of technical screens.

## ADR-011 — Legacy requirements are evidence, not implementation
**Decision:** Legacy العامري specifications are mined for business intent and failure history, not copied as code or architecture.

**Rationale:** They contain valuable requirements but also known implementation limitations and duplicated intelligence features.

## ADR-012 — Evidence-first certification
**Decision:** No capability is considered complete solely because code exists or CI is green.

**Rationale:** Business correctness, authorization, concurrency, integration delivery, and runtime behavior require direct evidence.
