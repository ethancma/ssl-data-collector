# One-time data-import scripts

This directory holds **standalone, one-off SQL scripts** for historical/backfill data
imports (e.g. the Graham water-quality history pulled from a Google Sheet) — things
that need to land in the real data once, not reproducible fixtures that should exist
after every reset.

## How this differs from `supabase/seed.sql` and `supabase/migrations/`

| | `supabase/seed.sql` | `supabase/seeds/*.sql` (this dir) | `supabase/migrations/*.sql` |
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
human runs each script manually when doing the real one-time import:

- **Locally**, for dry-running against the local dev DB: `supabase db query --local
  --file supabase/seeds/<file>.sql` (or `psql`/Dashboard SQL Editor equivalent), or
- **Against the remote/hosted project**: paste the script into the Supabase Dashboard
  SQL Editor and run it there, or connect with `psql` using the project's connection
  string. Follow the same human-in-the-loop rule as any other remote write in
  [.github/skills/supabase-migrations/SKILL.md](../../.github/skills/supabase-migrations/SKILL.md)
  — an agent can prepare/verify the script locally, but a human runs it against remote.

## Conventions for scripts in this directory

- Name files descriptively with a date prefix, e.g. `20260920_graham_water_quality_history.sql`.
- Wrap the script in `begin; ... commit;` and make it safe to inspect/dry-run locally
  before it's ever pointed at remote.
- Leave a one-line header comment stating what it imports, its source, and expected row
  counts, mirroring the style used in past one-time-import migrations (e.g.
  `supabase/migrations/20260920130000_import_graham_water_quality_history.sql`, which
  predates this convention and was left as a migration rather than moved here).
