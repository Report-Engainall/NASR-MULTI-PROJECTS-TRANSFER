# Aghbari — Execution Log Batch 7

## Scope
Aghbari Commerce only. No other project was modified.

## Security finding
A full live inventory of public `SECURITY DEFINER` functions showed that the identity-context helpers `current_organization_id()`, `current_customer_id()`, and `current_role()` were executable by the public `anon` role even though they derive authorization context from `auth.uid()`.

## Remediation
The helpers were recreated with an explicit `search_path=public`, and `EXECUTE` was revoked from `anon` and granted only to `authenticated` and `service_role`.

## Live evidence
The migration was applied successfully to Supabase project `mrcyqezbhpncuvaehwgf`. A post-migration ACL query confirmed each helper now has execute privileges for `authenticated` and `service_role` only (apart from the owner `postgres`).

## No-false-closure
This closes an unnecessary public execution surface, but it does not constitute full runtime certification. Fresh exact-head CI, clean migration reset/pgTAP, authenticated E2E, offline/outbox/import runtime proof, and deployment smoke remain separate gates.
