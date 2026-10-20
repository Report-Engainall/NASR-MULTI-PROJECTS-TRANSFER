# Aghbari — Intelligence Integration Contract V1

**Status:** Candidate implementation contract — evidence-gated; this contract does not create a runtime dependency on Report-Advisor.

## 1. Purpose

Define the one-way, least-privilege analytical integration boundary between Aghbari Commerce and any Intelligence Platform, with Report-Advisor as the first consumer.

Aghbari remains the operational system of record. The Intelligence Platform is an analytical consumer. No analytical consumer may mutate Aghbari operational truth through this contract.

## 2. Availability and failure isolation

Aghbari MUST remain fully operational when the Intelligence Platform is unavailable.

The Intelligence Platform MUST retain the last valid dataset/analysis when Aghbari or a new publishing run is unavailable. A failed publication MUST NOT delete or invalidate the last ACTIVE dataset.

## 3. Allowed data direction

```text
Aghbari Operational Truth
        |
        v
Intelligence Integration Gateway
        |
        v
Canonical Analytical Dataset
        |
        v
Report-Advisor / other Intelligence Consumers
```

Forbidden:

```text
Report-Advisor / Intelligence Consumer
        X
        v
Aghbari operational database
```

The analytical consumer receives publish/read capability only. No service credential issued for this contract may have operational write permissions in Aghbari.

## 4. Gateway responsibilities

The gateway owns:

- source adapter selection
- contract/schema versioning
- mapping
- normalization
- tenant binding
- provenance
- idempotency
- dataset lifecycle
- data-quality gates
- publication status
- processing evidence
- retention policy

The gateway MUST NOT become a second business domain implementation. Business truth remains owned by Aghbari.

## 5. Canonical analytical dataset envelope

Every published dataset MUST identify:

- `dataset_id`
- `source_system`
- `source_version`
- `contract_version`
- `schema_version`
- `tenant_id` (server-bound, never trusted from an untrusted client payload)
- `created_at`
- `data_period_start`
- `data_period_end`
- `record_count`
- `accepted_record_count`
- `rejected_record_count`
- `data_quality_score`
- `provenance_ref`
- `processing_status`
- `activation_status`
- `analysis_run_id` when analysis is requested

## 6. Dataset lifecycle

```text
RECEIVED
  -> VALIDATING
  -> NORMALIZING
  -> TENANT_BOUND
  -> QUALITY_CHECKED
  -> READY
  -> ACTIVE
  -> ANALYZED
```

Failure states are explicit and non-destructive:

```text
REJECTED
PROCESSING_FAILED
QUARANTINED
```

A new failed dataset MUST NOT replace the last valid ACTIVE dataset.

## 7. Canonical analytical domains

V1 supports publication of governed analytical facts for:

- sales
- purchases
- inventory
- customers
- suppliers
- products
- categories
- pricing
- receivables
- financial events
- branches
- warehouses
- promotions
- discounts

The exact analytical metric definitions remain owned by the Intelligence Platform. Aghbari publishes source facts and governed operational semantics; it does not duplicate BI or Decision Intelligence.

## 8. Provenance chain

Material analytical facts MUST be traceable:

```text
Aghbari Source Record
 -> Dataset
 -> Transformation
 -> Metric
 -> Evidence
 -> Analysis
 -> Recommendation
```

The contract MUST support source record references or deterministic source identifiers where legally and technically appropriate. Sensitive fields must be minimized and redacted according to the data-sharing policy.

## 9. Idempotency and replay

A publication or record replay MUST NOT double-count business facts.

The minimum deduplication identity is conceptually:

```text
source_system + tenant_id + source_dataset_id + source_record_id + schema_version
```

Dataset-level publication additionally uses `dataset_id`/publication identity and an idempotency key. Retries reuse the same logical identity.

## 10. Tenant binding and least privilege

Tenant identity is resolved and bound server-side. Client-supplied tenant identifiers cannot expand access.

Integration credentials are scoped to analytical publication/read only. They MUST NOT have permissions equivalent to:

- product write
- inventory write
- order write
- customer write
- supplier write
- price write
- invoice write
- operational delete

Cross-tenant dataset access is denied by default and covered by negative tests.

## 11. Data-quality gate

Before a dataset becomes ACTIVE, the gateway checks at minimum:

- completeness
- consistency
- duplicates
- required-field validity
- relationship validity
- date validity
- quantity anomalies
- price anomalies
- inventory anomalies
- margin anomalies
- customer/supplier anomalies

The result includes a `data_quality_score` and machine-readable failure reasons.

A quality failure may prevent activation. The previous ACTIVE dataset remains available.

## 12. Contract versioning

The boundary carries independent:

- `contract_version`
- `schema_version`
- `source_version`

Breaking changes require a new compatible contract/version path and explicit migration evidence. Consumers MUST reject unsupported breaking versions rather than silently guessing mappings.

## 13. Security and secrets

No database password, service-role key, admin credential, or equivalent secret is included in analytical datasets.

The frontend MUST NOT hold integration service credentials.

## 14. Observability

Every publication run records:

- integration run ID
- dataset ID
- tenant ID
- contract/schema versions
- source version
- records received/accepted/rejected
- quality score
- processing duration
- final state
- failure reason
- correlation ID

Logs MUST avoid secrets and unnecessary sensitive business data.

## 15. Analytical independence

Report-Advisor may calculate KPIs, forecasts, risks, opportunities, decisions, explanations, and recommendations from the canonical analytical dataset.

Those outputs are analytical truth, not operational commands.

A recommendation such as `purchase 300 units` remains a recommendation. It does not create a purchase order or alter Aghbari inventory.

## 16. User experience

The preferred Aghbari entry point is business language such as:

> **حلّل متجري**

The UI may show progress such as:

```text
Preparing Data
Checking Data Quality
Analyzing Business
Generating Intelligence
```

The technical pipeline remains hidden behind the product experience.

## 17. Certification gates

The integration cannot be considered proven until evidence covers:

1. correct tenant binding;
2. cross-tenant negative access;
3. least-privilege credential behavior;
4. schema/contract version rejection;
5. deterministic normalization;
6. duplicate/replay prevention;
7. data-quality rejection;
8. failed-run preservation of the last ACTIVE dataset;
9. provenance from source record to dataset;
10. no operational mutation capability from the analytical credential;
11. retry/failure isolation;
12. exact source/contract/schema provenance.

## 18. Scope boundary

This contract prepares Aghbari for Report-Advisor and future consumers such as Onyx Pro, ERP, POS, Excel/CSV, and other commerce systems without coupling Aghbari to any single intelligence implementation.

It does not implement Report-Advisor intelligence engines inside Aghbari.
