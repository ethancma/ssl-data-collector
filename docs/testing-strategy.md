# Testing Strategy — Test by Blast Radius

Not every change deserves the same rigor. This is a small nonprofit lab tool used daily by
~10-20 lab techs/volunteers to log irreplaceable conservation-research data — a silent
data-integrity bug is worse than a slow ship, but copy tweaks don't need a full e2e run.
Match effort to how much damage a wrong change could do.

## Tier 1 — Copy, UI polish, styling
- Spot check in the browser.
- Unit/component tests if shared components changed.
- Ship without a full e2e run.

## Tier 2 — Standard features & bug fixes
Examples: a new form field, a dashboard tweak, a non-destructive query change.
- Full run of the [e2e-testing skill](../.github/skills/e2e-testing/SKILL.md).
- Automated PR review (e.g. CodeRabbit) if/when configured — agent addresses flags.
- Human reads the diff before merge.

## Tier 3 — Schema/migrations, RLS policies, auth & roles, import tooling
Examples: a new table/column, an RLS policy change, the CSV import or paper-backfill tools.
- Everything in Tier 2, plus:
- Run migrations against a scratch/staging Supabase project first — never directly against
  production.
- Verify directly in the Supabase dashboard (table editor, RLS policy check) — don't trust
  the app UI alone.
- Re-verify all three roles (Admin/Technician/Viewer) behave as intended, not just Admin.
- Require a preview deployment before merge.

## Tier 4 — Anything touching real historical or production data
Examples: the one-time Google Sheets import, paper backfill runs, bulk edits/deletes.
- Everything in Tier 3, plus:
- Confirm a fresh Supabase backup exists immediately before running against prod.
- Manually spot-check a sample of imported/changed rows against the source record.
- A human runs the actual import/bulk-write interactively — the agent should prepare and
  dry-run it, but not execute irreversible writes against production unattended.

## Always
A human reviews and merges every PR — the agent never merges its own work, regardless of tier.
