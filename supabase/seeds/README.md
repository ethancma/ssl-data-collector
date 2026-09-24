# One-time data-import scripts

This directory holds **standalone, one-off SQL scripts** for historical/backfill data
imports (e.g. the Graham water-quality history pulled from a Google Sheet) — things
that need to land in the real data once, not reproducible fixtures that should exist
after every reset.

## How this differs from `supabase/seed.sql` and `supabase/migrations/`

| | `supabase/seed.sql` | `supabase/seeds/` (this dir) | `supabase/migrations/*.sql` |
|---|---|---|---|
| Purpose | reproducible dev/test fixtures (seeded test accounts, reference data) | one-time historical/backfill data imports | schema changes (tables, RLS, functions) |
| Runs automatically on `supabase db reset --local`? | **Yes** (wired via `[db.seed] sql_paths` in `config.toml`) | **No** | N/A — reset replays migration history, not this |
| Applied to remote/hosted by `supabase db push`? | **No** — `seed.sql` is a local-dev-only CLI convention | **No** — nothing here is wired into CLI push/reset at all | **Yes** — this is what `db push` syncs to remote |
| Re-run safe? | Yes, must be idempotent | No — run once, then it's done | Tracked once via migration history |

**Important:** don't add `./seeds/*.sql` to `[db.seed] sql_paths` in `config.toml`. Files
in this directory are intentionally *not* wired into the CLI's seed step — they're meant
to run exactly once, by a human, not on every reset.

## How a script here actually gets applied

Since neither `db reset --local` nor `db push` touch this directory automatically, a
human runs each import manually:

- **Direct CSVs** can be uploaded to their destination through the Supabase Table Editor.
- **Imports requiring lookups or transformations** use a reviewed script against local or
  scratch Supabase first, then a human runs it against hosted data. Follow the same
  human-in-the-loop rule as any remote write in
  [.github/skills/supabase-migrations/SKILL.md](../../.github/skills/supabase-migrations/SKILL.md)
  — an agent can prepare/verify the script locally, but a human runs it against remote.

## Conventions for scripts in this directory

- Keep each import in one dated directory with its CSV inputs and short upload instructions.
- Prefer destination-ready CSVs when the target IDs and transformed values are already known.
- Keep destructive legacy reconciliation explicit, reviewable, and disabled by default.
