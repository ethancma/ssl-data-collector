---
name: supabase-migrations
description: 'Supabase CLI workflow for the SSL Data Collection project — writing/amending migration files, applying them locally, and syncing them to the linked hosted project. Use when: creating or editing anything in supabase/migrations/**; checking whether local and remote schema are in sync; deciding whether to amend an existing migration file or add a new one. Do NOT use for writing the actual table/RLS SQL content — see the schema-migrator agent for that; this skill is about the CLI commands and sync workflow around it.'
---

# Supabase Migration Workflow (SSL Data Collection)

## Project state
- Project ref: `bqylxmsifagnztxhixyl` — already linked (`supabase link`) and authenticated
  (`supabase login`) in this environment; don't re-run either unless a command reports
  otherwise.
- Three schemas matter: `core` (operational tables the app reads/writes — int PKs),
  `analytics` (star/snowflake reporting layer, int PKs, synced from `core` later via
  triggers), `public` (kept empty — no app tables live here).
- Local dev runs against a local Docker Postgres instance managed by the CLI, separate from
  the hosted project.

## Schema changes vs. one-time data — not the same thing
`supabase/migrations/**` is for schema changes only (tables, RLS, functions). One-time
historical/backfill data imports do **not** belong in a migration going forward — they
belong in `supabase/seeds/` as a standalone script a human applies manually (Dashboard SQL
Editor or `psql`), since neither `db reset --local` nor `db push` run that directory
automatically. Reproducible dev/test fixtures (seeded test accounts, reference data)
belong in `supabase/seed.sql` instead, which auto-runs on every local `db reset --local`
but — unlike migrations — is **not** applied to remote by `db push`. See
[supabase/seeds/README.md](../../../supabase/seeds/README.md) for the full breakdown.

## The hard rule: no agent-run deletions against remote
**Any operation that deletes/drops something on the remote (hosted) project — `DROP SCHEMA`,
`DROP TABLE`, `TRUNCATE`, `supabase db push` before remote is confirmed clean, anything run
via `psql`/the Dashboard SQL Editor against remote — must be done manually by the human**, not
executed by an agent. This includes when a migration file was edited *after* already being
applied to remote (common during active schema design): remote physically still has the old
objects, and only a human-run `DROP ... CASCADE` (in the Dashboard SQL Editor) can safely clear
them, since that also requires reasoning about what else depends on those objects.

An agent's job in that situation is to:
1. Say exactly what needs dropping and why (which schemas/tables, because local migration
   content changed after remote already applied that version).
2. Hand over the exact SQL for the human to run in the Dashboard SQL Editor.
3. Wait for confirmation it's done before touching migration history or pushing.

Never try to route around this by finding another way to run destructive SQL (e.g. via a
stored connection string, a service-role key, or `psql`) — if a safe non-destructive CLI
command doesn't exist for it, stop and ask.

## Local-only commands (safe for an agent to run directly)
| Command | Purpose |
|---|---|
| `supabase db reset --local` | Wipe and rebuild the local dev DB from all migration files in order. The standard way to verify a migration change applies cleanly. Implicitly starts the full local Docker stack (~12 containers: db, studio, auth, storage, realtime, kong, etc.) if it isn't already running. |
| `supabase db query --local "..."` / connect via the local Postgres port | Verify table shape, seeded rows, RLS flags, etc. after a reset. |
| `supabase migration list` | Compare local migration versions against what's recorded as applied on remote. Read-only, safe. |
| `supabase stop` | Tears down the local Docker stack started by the commands above. Safe for an agent to run — see "Free local Docker resources" below. |

## Free local Docker resources when done
The running dev server talks to the **hosted** project (check `NEXT_PUBLIC_SUPABASE_URL` in
`.env.local` — it's the `https://*.supabase.co` URL, not `localhost`), so the local Docker
stack only exists for the duration of a migration-verification session. Once you've finished
the local `db reset` → push → `migration list` sequence for a change, run `supabase stop` to
free those containers rather than leaving them running indefinitely. Verify with
`docker ps --filter "label=com.supabase.cli.project=ssl-data-collection"` if unsure whether
anything is still up. Skip stopping only if you know another local-DB task is about to run
immediately after in the same session.

## Amend-in-place vs. new migration file
- **Nothing pushed to remote yet, or remote already reconciled**: prefer amending the
  existing migration file in place over piling on `ALTER TABLE` migrations for something
  still under active design — keeps history readable while the schema is unstable.
- **Already pushed to remote and not yet reconciled**: still fine to amend in place, but the
  reconciliation dance below is required before the next push will succeed.
- **Once the schema is stable / after the MVP ships**: switch to additive migrations only
  (new files), never edit a migration that's already shipped and relied upon.

## Reconciling remote after amending an already-applied migration
This happens whenever a migration file's *content* changes after `supabase db push` already
applied that version — remote's bookkeeping still thinks it's up to date, but the actual
objects don't match the new file.

1. **(Human-run, Dashboard SQL Editor)** Drop whatever schemas/objects the changed migrations
   created, e.g.:
   ```sql
   drop schema if exists analytics cascade;
   drop schema if exists core cascade;
   drop schema if exists public cascade;
   create schema public;
   grant usage on schema public to postgres, anon, authenticated, service_role;
   grant all on schema public to postgres;
   ```
   Adjust which schemas/tables based on what actually changed — don't blindly copy this if
   only one table changed.
2. **(Agent can run)** Reset the CLI's remote bookkeeping for the affected versions:
   ```bash
   supabase migration repair --status reverted <version> [<version> ...]
   ```
3. **(Agent can run, only after step 1 is confirmed done by the human)**
   ```bash
   supabase db push
   ```
4. **(Agent can run)** Verify:
   ```bash
   supabase migration list
   ```
   Confirm every version shows matching `local`/`remote` values.

## Quick sanity check before any push
Always run `supabase db reset --local` first and confirm it applies cleanly — never push a
migration to remote that hasn't been verified locally first.
