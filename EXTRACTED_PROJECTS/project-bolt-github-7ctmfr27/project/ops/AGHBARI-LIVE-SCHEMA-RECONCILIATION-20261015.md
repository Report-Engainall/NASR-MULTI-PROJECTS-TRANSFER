# Live Supabase schema reconciliation checkpoint — 2026-10-15

## Project identity and matching status

- Repository: `Aghbari-Technologies/aghbari-commerce-evolved`
- Intended Supabase ref recorded in the repository: `ffxxjaolfntzbapmfbuv`
- That intended ref was not present in the currently connected Supabase project list, so its deployment identity remains **UNVERIFIED**.
- The connected project named `aghbari-commerce` has ref `mrcyqezbhpncuvaehwgf`, state `ACTIVE_HEALTHY`, PostgreSQL 17.6.1, and deployed Edge Functions `outbox-worker` v1 and `customer-invitations` v3.
- Repository main at inspection: `39d2dec8752e973e9661c5564d85309f6df6f73a`.

The similarly named connected project is **not confirmed as the target**. Its live schema is materially different from this repository, so the config remains pinned to the repository's original intended ref rather than redirecting CLI operations to a database that may belong to an older product generation.

## Schema compatibility check against the connected candidate (read-only)

The project named `aghbari-commerce` has 133 recorded migrations; latest is `20260925040254` (`harden_client_ui_settings_admin_boundary`). Its current live definitions differ from this repository's clean-schema baseline:

- Live `public.profiles`: `id, organization_id, customer_id, role, created_at`; repository baseline expects fields such as `auth_user_id, full_name, email, is_active`.
- Live `public.products`: `sku, name, status, ...`; repository baseline expects `item_code` and pricing fields.
- Live `public.orders`: `subtotal, total`; repository baseline expects its own server-authoritative order totals and review fields.
- Live `public.notifications`: `recipient_user_id, kind, title, body, ...`; the new event handler expects a profile-oriented schema.
- Live `public.outbox_events`: `available_at, locked_until, delivered_at`; repository baseline's worker uses `next_attempt_at, locked_at, processed_at`.
- The candidate lacks `public.ai_usage_budgets`, `public.outbox_event_deliveries`, `public.claim_outbox_events(text,integer,integer,uuid)`, and `public.get_ai_gateway_budget()` in the inspected schema/function catalog.
- Its existing `outbox-worker` v1 sends events to `OUTBOX_WEBHOOK_URL` and authenticates with `OUTBOX_WORKER_TOKEN`; do not replace it without reconciling the webhook contract.
- The repository's first migration is a fresh-schema baseline with plain `CREATE TABLE` statements. It must not be replayed unchanged over the candidate or treated as an equivalent migration merely by adding a history row.
- The new AI and outbox migrations passed isolated PostgreSQL 17 acceptance only. That is not proof of compatibility with either live candidate.

## Deployment gate — open, no live DDL applied by this checkpoint

1. Recover or verify the Supabase project referenced by `ffxxjaolfntzbapmfbuv`; do not deploy repository functions based only on a matching project name.
2. If the intended target is the connected `mrcyqezbhpncuvaehwgf` project, create a forward-only schema compatibility plan against its actual live definitions. Do not replay the fresh-schema baseline or mark migrations as applied without equivalence proof.
3. Test compatibility on a restored staging clone or database branch with the production schema, inspect migration state and security/performance advisors, then obtain explicit confirmation of the exact production target before applying any schema writes.
4. Preserve and test the existing outbox webhook contract, or migrate its caller and worker together.
5. Before AI Test Connection can pass, configure Edge Function secrets `AI_OPENAI_COMPATIBLE_API_KEY` and/or `AI_GEMINI_API_KEY`, plus explicit per-1,000-token cost-rate variables shown in the Admin AI Center. No provider keys belong in database rows or browser fields.

## Proof classification

- Repository code + isolated PostgreSQL acceptance: **verified for the clean repository baseline**.
- Connected `aghbari-commerce` live schema and deployed function inventory: **read-back verified, but target identity UNVERIFIED**.
- Production compatibility migration: **not implemented/applied**.
- AI provider secret configuration, live provider test, and production user journey: **not verified**.
- All inspection of the connected candidate was read-only; no customer rows, secrets, or live schema were changed during this checkpoint.
