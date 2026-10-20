# Aghbari — Intelligence Architecture Addendum V1

**Status:** Adopted candidate boundary; implementation and runtime evidence remain gated.

## Architectural decision

Aghbari Commerce and Report-Advisor remain independent products.

- Aghbari = operational system of record.
- Report-Advisor = analytical/intelligence system.
- Aghbari publishes governed analytical data outward.
- Report-Advisor has no operational write path into Aghbari.
- Aghbari must not require Report-Advisor for transactional availability.

## Integration boundary

```text
Aghbari Operational Core
        |
        v
Intelligence Integration Gateway
        |
        +-- Schema Registry
        +-- Source Adapters
        +-- Mapping / Normalization
        +-- Tenant Binding
        +-- Data Quality Gate
        +-- Provenance
        +-- Idempotency
        +-- Dataset Lifecycle
        +-- Publication Evidence
        |
        v
Canonical Analytical Dataset
        |
        v
Report-Advisor / Future Intelligence Consumers
```

The gateway is a contract boundary, not a second operational business-logic layer.

## Dataset lifecycle

```text
RECEIVED → VALIDATING → NORMALIZING → TENANT_BOUND
→ QUALITY_CHECKED → READY → ACTIVE → ANALYZED
```

Non-destructive failure states:

`QUARANTINED | REJECTED | PROCESSING_FAILED`

A failed publication never deletes the last valid ACTIVE dataset.

## Dataset identity

The envelope carries:

`dataset_id, source_system, source_dataset_id, source_version, contract_version, schema_version, tenant_id, period, counts, quality_score, provenance_ref, processing_status, activation_status, analysis_run_id, correlation_id`.

Tenant binding is server-controlled. Client input cannot select another tenant.

## Data quality

Activation is gated by deterministic checks for completeness, consistency, duplicates, required fields, relationships, dates, quantity anomalies, price anomalies, inventory anomalies, margin anomalies, and customer/supplier anomalies.

Low-quality data must be explicitly rejected/quarantined or marked insufficient. It must not silently become intelligence truth.

## Provenance

Material results must be traceable through:

`source record → dataset → transformation → metric → evidence → analysis → recommendation`.

## Idempotency

Record identity and dataset identity must prevent duplicate analytical facts during retry/replay. The conceptual source identity is:

`source_system + tenant_id + source_dataset_id + source_record_id + schema_version`.

## Security

Integration credentials are least-privilege and analytical only. They cannot write products, inventory, orders, customers, suppliers, prices, invoices, or operational records.

No database passwords, service-role keys, admin credentials, or equivalent secrets are present in datasets or frontend code.

## Intelligence product boundary

The following remain Report-Advisor responsibilities and are deliberately NOT duplicated inside Aghbari:

- Executive Intelligence
- Business Health Score
- advanced KPIs/BI
- forecasting
- anomaly/risk/opportunity engines
- Decision Intelligence
- evidence-backed recommendations
- AI Business Copilot
- scenario simulation
- Store Intelligence Twin
- recommendation outcome learning

Aghbari may expose a business-language entry point such as **حلّل متجري**, but the intelligence computation remains external.

## Operational safety

A recommendation is never an operational command. For example, `purchase 300 units` is an analytical recommendation and cannot directly create a purchase order or mutate inventory.

## Future source independence

The contract is designed for Aghbari first, but the analytical model may later accept governed data from Onyx Pro, ERP, POS, Excel/CSV, or other commerce systems without changing Aghbari's operational truth model.

## Evidence gates

Before claiming integration PASS, executable evidence must prove tenant isolation, least privilege, version rejection, deterministic mapping, idempotent replay, data-quality rejection, preservation of last ACTIVE dataset, provenance, failure isolation, and absence of operational mutation capability.

This addendum does not claim runtime integration PASS.
