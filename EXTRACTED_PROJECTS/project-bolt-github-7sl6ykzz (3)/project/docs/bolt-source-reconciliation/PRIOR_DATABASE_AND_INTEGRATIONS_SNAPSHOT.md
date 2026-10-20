# Database / integrations inventory — source pointers and limits

## Visible tree inventory
The canonical tree includes `supabase/migrations/`, `src/integrations/supabase/types.ts`, `src/lib/supabase.ts`, `src/lib/api.ts`, and a migration test script. A large migration exists at `supabase/migrations/20261009070000_platform_spec_foundations.sql` (Git blob SHA-1 `4e61abdb9c45c92bb031514d2fa7075daf0b9a61`, 78,512 bytes). The DB test harness `scripts/test-database-migrations.mjs` is present (111,399 bytes; Git blob SHA-1 `1140e8e10bcc64623ceac4dc325a601bef521ba0`).

The Report-Engainall tree includes separate `supabase/migrations/`, `.github/workflows/sql-migrations.yml`, backup workflows, and `scripts/backup/`. The exact SQL files and migration lineage from that tree were not downloaded into this workspace, so the package cannot yet reconcile duplicate migration versions, schema deltas, RLS, grants, RPC signatures or ordering.

## Connectivity truth
- The canonical repo's source memory says the intended production Supabase project reference `ffxxjaolfntzbapmfbuv` was inaccessible via the currently connected integration at the last recorded checkpoint. This is source documentation, not a fresh successful production probe here.
- No production database writes, migrations or integration changes were performed as part of this task.
- No `.env` content or credentials were included. This package does not contain the RAR's `.env` values because the archive was not downloaded.
- A real integration/worker/WhatsApp delivery is not certified merely because source code or a queue exists; require a configured endpoint and read-only end-to-end proof before marking it live.

## Required follow-up
Acquire both full source trees and all seven archive folders; inventory SQL migration files, derive immutable ordered migration inventories, compare checksums and SQL behavior, and only then propose reconciliation. Verify project identity and authorization before any production DB action.
