# Aghbari — Requirements Matrix: Legacy Batch 1 + Batch 2

Status: **PROVISIONAL — Batch 3 pending**

## Re-engineering rule

These historical requirements are **not copied into implementation**. Each item is converted into a modern engineering requirement while preserving its business intent. Technology, architecture, UX, and integration mechanisms may be replaced when a stronger solution is justified.

Transformation contract:

`Historical wording → Business capability → Engineering requirement → Acceptance criteria → Verification evidence`

Legend: **KEEP** = retain intent; **STRENGTHEN** = retain with stronger engineering; **REDESIGN** = retain business intent but change implementation/UX; **REJECT** = intentionally exclude; **DEFER** = later phase.

| Capability | Decision | Engineering interpretation |
|---|---|---|
| Three commercial customer tiers | KEEP | Server-controlled commercial classification |
| Invite links by tier | STRENGTHEN | Signed/expiring invite tokens, server-side tier binding |
| Customer approval | KEEP | Explicit lifecycle: pending/approved/blocked/etc. |
| Tier-specific price visibility | STRENGTHEN | Server-side price projection; never expose other prices |
| Product catalog/search/categories | KEEP | Fast indexed search, pagination, safe caching |
| Inline quantity controls | KEEP | Atomic cart-line upsert semantics |
| Distinct-item cart badge | KEEP | Count unique cart lines |
| Order lifecycle | STRENGTHEN | Explicit state machine + transition audit |
| Duplicate order prevention | STRENGTHEN | Idempotency + unique business key |
| Inventory movements | STRENGTHEN | Transactional ledger/balance model + audit |
| Low-stock threshold | KEEP | Operational alert only; analytics remains external |
| Pricing bulk edit | KEEP | Validated bulk command, preview, audit |
| Excel import | STRENGTHEN | Staging → validation → commit; error report |
| Onyx export column contract | KEEP | Versioned export schema with exact ordering |
| Onyx integration | REDESIGN | Adapter + queue/outbox + retry + reconciliation |
| WhatsApp order delivery | REDESIGN | Official business API/provider integration; no client-side delivery assumption |
| WhatsApp status notifications | REDESIGN | Async delivery with templates/provider status |
| Customer order edit/resend | KEEP | Versioned order mutation rules + idempotency |
| Invoice/order preview | KEEP | Canonical server-rendered representation |
| Customer order history | KEEP | Authorization-scoped read model |
| Customer review/survey | DEFER | Low operational priority unless business requires it |
| Daily offers ticker/banner | KEEP | Promotions context; controlled validity and scheduling |
| Add product to offer from catalog | KEEP | Contextual admin action |
| Offers/discounts | STRENGTHEN | Explicit promotion rules; no hidden price mutation |
| Multi-branch | DEFER/FOUNDATION | Model branch/warehouse boundaries now; enable workflows when needed |
| Customer statements/credit limits | DEFER/FOUNDATION | Financial domain extension, not analytics |
| PWA/installability | KEEP | First-class responsive web/PWA capability |
| Weak-network operation | STRENGTHEN | Cache + idempotent command sync + conflict handling |
| Push notifications | DEFER | Provider decision after operational requirements |
| Operational reports | REDESIGN | Only action-oriented operational views; BI goes to Report-Advisor |
| Admin dashboard | REDESIGN | Command center, not analytics dashboard |
| Large legacy AI suite | REJECT | Belongs to Report-Advisor |
| AI dashboard/assistant/governance tables | REJECT | Avoid duplicate intelligence platform |
| Granular RBAC | KEEP | Re-engineer into manageable role/capability model |
| Audit logs | KEEP | Structured, append-oriented operational audit |
| Login history | KEEP | Security/audit evidence |
| Rate limiting | KEEP | Endpoint and abuse-aware limits |
| RLS/tenant isolation | STRENGTHEN | Database-enforced isolation where applicable |
| XSS/SQLi/CSRF protections | KEEP | Framework + service + database defense in depth |
| Soft delete | KEEP WITH RULES | Never compromise uniqueness or authorization |
| UUIDs | KEEP | External identifiers; business numbers remain human-friendly |
| Full-text search | KEEP | Use appropriate DB/search indexes; measure before adding search infra |
| Image optimization/WebP/thumbnails | KEEP | Media pipeline, not business logic |
| Backup/recovery | KEEP | Tested restore evidence, not merely configured backup |
| Error/performance monitoring | KEEP | Structured logs, traces, metrics, alerting |
| CI/CD | KEEP | Quality gates tied to exact commit |
| REST API | REDESIGN | Use typed contracts/OpenAPI where external API surface warrants it |
| JWT as mandatory auth architecture | REJECT AS BINDING | Select secure session model based on final client/deployment architecture |
| Flutter/Laravel as mandatory stack | REJECT AS BINDING | Technology follows requirements and evidence |

## Engineering quality gates applied to every capability

Every capability must define, before implementation where practical:

- business invariant
- authorization boundary
- data owner
- API/service contract
- failure modes
- idempotency/concurrency behavior where relevant
- observability/audit events
- test strategy
- runtime evidence required for certification

## High-risk conflict rules

1. If a legacy feature creates analytics duplication, Report-Advisor wins the boundary.
2. If legacy UX convenience conflicts with authorization or transactional integrity, security/integrity wins.
3. If direct integration creates duplicate side effects, asynchronous idempotent integration wins.
4. If offline behavior can create false inventory truth, server authority wins.
5. If admin completeness creates navigation complexity, task-oriented command center wins.

## Open questions to resolve with Batch 3

- Exact branch/warehouse operating model.
- Exact Onyx synchronization direction and conflict semantics.
- Exact WhatsApp provider/account model and message templates.
- Required financial/credit workflows.
- Native mobile requirements versus PWA sufficiency.
- Any additional product, purchasing, or supplier workflows introduced in Batch 3.
