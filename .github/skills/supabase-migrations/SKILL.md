---
name: supabase-migrations
description: 'Supabase CLI workflow for the SSL Data Collection project — writing migration files, applying them locally, and handing hosted changes to a human. Use when: creating or editing anything in supabase/migrations/**; checking whether local and remote schema are in sync. For the SQL content itself (tables, RLS, indexes), also load supabase-postgres-best-practices.'
---

# Supabase Migration Workflow (SSL Data Collection)

## Project state
- Hosted project ref `bqylxmsifagnztxhixyl` (dummy data only; becomes staging at go-live).
  The CLI is already linked and logged in; don't re-run `link`/`login`.
- Schemas: `core` (operational tables, int PKs), `analytics` (reporting layer), `public`
  (kept empty).
- One local Docker stack is shared by the main checkout and every worktree. Don't
  `supabase stop` it while worktrees may be using it.

## What goes where
- `supabase/migrations/**`: schema only (tables, RLS, functions).
- `supabase/seed.sql`: reproducible local fixtures (the four role test accounts); runs on every
  local reset, never pushed.
- `supabase/seeds/`: one-time historical imports, applied by a human. See
  [supabase/seeds/README.md](../../../supabase/seeds/README.md).

## Writing a migration
1. `npx supabase migration new <name>`, one logical change per file, following the latest
   file's style.
2. A migration already on `origin/main` is immutable (a hook blocks edits); add a new one.
   Files not yet on `origin/main` may be amended in place.
3. Every new table gets RLS covering admin, technician, volunteer, and viewer.
4. Verify locally: `npx supabase db reset` (all migrations + seed), then check shape with
   `npx supabase db query --local "..."`, then `npm run verify` and the e2e plan. The e2e
   suite is required for schema changes (Tier 3).

## Hosted project: human-only
Agents never change the hosted schema. `supabase db push`, `migration repair`, and
`db reset --linked` are blocked by a hook, and so are drops, truncates, and deletes
attempted any other way (stored connection strings, service-role keys, `psql`).

When hosted needs a change, hand the human:
1. The exact commands (`npx supabase db push`, any `migration repair --status reverted <v>`).
2. Any drop SQL for the Dashboard SQL Editor, with the reason (for example, a migration
   amended after it was applied).
3. The check to run afterwards: `npx supabase migration list` shows matching local and remote
   versions.
