# Aghbari — Architecture Enhancements V2

**Status:** ADOPTED AS ARCHITECTURE HARDENING — implementation/evidence gated.

## Purpose

This document records the highest-value improvements selected from the external architecture review performed on 2026-09-04. The goal is not to add complexity for its own sake; every enhancement must materially improve correctness, food-distribution suitability, resilience, operational speed, or integration reliability.

## 1. Food-grade inventory traceability

Because Aghbari is a food wholesale platform, inventory must be able to represent expiry-sensitive stock when the business requires it.

Adopt:
- lot/batch identity where supplied by the source system;
- expiry date per lot where available;
- receiving provenance;
- warehouse/location scope;
- optional FEFO allocation policy for expiry-sensitive products;
- blocked/expired/quarantined stock states;
- trace path from receipt → movement → reservation/order → adjustment;
- reconciliation evidence for imported stock.

Rule: FEFO is an allocation policy, not permission to silently change the authoritative stock quantity.

## 2. Order workflow as an explicit state machine

Orders are treated as workflows rather than a single mutable status field.

Minimum lifecycle:
`NEW → CONFIRMED → IN_PROGRESS → PREPARED → DELIVERED`

Terminal/corrective paths:
`NEW/CONFIRMED/IN_PROGRESS/PREPARED → CANCELLED`

Additional transitions must be explicitly authorized and audited. Invalid, stale, or replayed transitions are rejected.

For future split fulfillment, line-level fulfillment state is kept separate from order-level state so partial shipment does not corrupt the order's canonical identity.

## 3. Stronger integration reliability

The existing outbox boundary is strengthened to make the consumer side idempotent as well.

Required flow:
`business transaction + outbox → relay → adapter → provider → delivery evidence`

Every external consumer/adapter must:
- accept a stable event/operation ID;
- persist or otherwise durably recognize processed IDs;
- reject same ID with a different payload hash;
- tolerate at-least-once delivery;
- expose retry count, last error, next retry time, and terminal/DLQ state;
- preserve correlation IDs end-to-end.

No design may claim exactly-once external delivery merely because an outbox exists.

## 4. Deterministic incremental synchronization

Offline synchronization is upgraded from time-based change detection to a server-issued monotonic cursor where practical.

A sync pull returns:
- authorized changed records/projections;
- deletion/tombstone records when required;
- the next server cursor;
- schema/version metadata.

The client advances the cursor only after the complete page is applied atomically. A device syncs a scoped projection, never the entire database.

Conflict policy remains domain-specific: pricing/permissions use server authority; additive ledgers use append semantics; valuable concurrent edits require explicit reconciliation.

## 5. Scan-first warehouse operations

Warehouse workflows should be optimized for barcode/identifier scanning rather than long forms.

Adopt as a first-class UX capability:
- SKU/barcode/item-number scan;
- fast product resolution;
- wrong-scan rejection;
- warehouse/branch scope validation;
- scan-confirmed receiving and picking where enabled;
- keyboard-friendly desktop operation;
- mobile PWA operation.

Scanning is an input mechanism only; all business authorization and inventory mutation remains server-side.

## 6. Operational Command Center — not BI duplication

The admin experience is upgraded around operational action, not analytical dashboards.

High-value cards/actions include:
- orders requiring action;
- low/critical stock;
- expired/quarantined stock;
- pending imports;
- failed/retrying integrations;
- sync/reconciliation exceptions;
- customer approvals;
- price changes awaiting activation.

Trend analysis, forecasting, KPI intelligence, recommendations, and advanced analytics remain owned by Report-Advisor.

## 7. Search architecture

Operational search is treated as a first-class capability:
- normalized Arabic search;
- SKU/barcode/item-number exact lookup;
- customer/order search;
- category and status filters;
- indexed canonical fields;
- explicit authorization filtering before result serialization.

Search must not become a side channel around RLS or authorization.

## 8. Release-gated complexity

Do not introduce Kafka, Kubernetes, microservices, or a distributed database merely because they are common in large systems. Aghbari should begin with a modular transactional core and durable workers. Infrastructure complexity increases only when a measured scale/reliability gate proves the need.

The architecture therefore prefers:
- modular bounded contexts;
- PostgreSQL transactional core;
- durable outbox;
- worker/adapters;
- explicit contracts;
- horizontal stateless application scaling when needed.

## 9. Evidence gates added

Before these enhancements can be marked implemented/proven:

1. lot/expiry traceability test;
2. FEFO selection test where enabled;
3. order state-machine negative tests;
4. consumer duplicate-delivery test;
5. consumer payload-conflict test;
6. monotonic cursor sync test;
7. tombstone/reconnect test;
8. scan wrong-item/unauthorized-scope test;
9. operational command-center data authorization test;
10. search authorization/enumeration test.

## Decision

These enhancements are adopted as the V2 quality target because they increase the value of Aghbari specifically as a food-wholesale operational platform while preserving the existing Aghbari ↔ Report-Advisor boundary and the no-false-closure evidence protocol.

They are architecture requirements, not claims of implementation or runtime proof.
