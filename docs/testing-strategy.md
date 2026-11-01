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
- Pass only the files touched in the current coding session to the dry-run selector documented
  in the [e2e-testing skill](../.github/skills/e2e-testing/SKILL.md), review its reasons, and
  run the selected Playwright sections.
- Run the full e2e suite when the selector escalates broad, shared, or unknown runtime changes.
- Run the `reviewer` agent on the diff in a fresh context; fix its Blocking findings.
- Human reads the diff before merge.

## Tier 3 — Schema/migrations, RLS policies, auth & roles, import tooling
Examples: a new table/column, an RLS policy change, the CSV import or paper-backfill tools.
- Everything in Tier 2, plus:
- Run the complete e2e suite. Tier 3 never relies on a narrower selector result.
- Run migrations against the local Supabase stack (`npx supabase db reset`) first — never
  directly against the hosted project.
- Verify directly in the Supabase dashboard (table editor, RLS policy check) — don't trust
  the app UI alone.
- Re-verify all four roles (Admin/Technician/Volunteer/Viewer) behave as intended, not
  just Admin, including feature-specific exceptions such as Viewer having no Star
  treatment access.
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

## Agent verification and PR preparation

- During development, run `npm run verify` (typecheck, lint, unit tests).
- Before a PR, also run `npm run check:dead-code` and `git diff --check`; report exact
  commands with passed/failed/not-run results using [prepare-pr](../.github/prompts/prepare-pr.prompt.md).
- Plan session changes with `--files`. For a committed PR use
  `npm run test:e2e:plan -- --base origin/main`; add `--working-tree` only in an owned,
  single-purpose worktree. Working-tree mode includes staged, unstaged, and untracked files;
  `--git-diff` is its alias and does not include committed branch changes.
- Before browser writes, run `npm run test:e2e:preflight` with an explicit app origin.
  See the [E2E skill](../.github/skills/e2e-testing/SKILL.md) for Local/Dev safety, fixture
  readiness, lock behavior, and server-launch confirmation. Never test against Production.
- Harness selector/instruction changes use unit/doc tests. Shared E2E setup, target guards,
  fixture, or CI changes select the full suite. If shared-server/database ownership prevents
  execution, report browser coverage as not run rather than weakening the guard.
- For runtime/build changes follow [workers-deployment.md](workers-deployment.md);
  a Next.js-only pass is not evidence that the compiled Worker works.
