# Agent Instructions

Next.js + Supabase app where lab techs and volunteers log daily husbandry data. Read docs only
when the task needs them: schema/roles in [docs/platform-architecture.md](docs/platform-architecture.md),
open questions and BLOCKED values in [docs/implementation-checklist.md](docs/implementation-checklist.md),
testing tiers in [docs/testing-strategy.md](docs/testing-strategy.md).
Start exploration at the canonical [README file map](README.md#file-map); do not maintain a second map.

## Rules

1. **Never `git push` without my explicit OK.** Commit locally when useful.
2. **The port-3000 dev server is mine.** Never stop or restart it. In a worktree
   (`npm run wt -- new <name>`), run your own with `npm run dev -- -p $PORT` (from `.env.local`)
   and stop only that one.
3. **A human merges every PR.**

Hooks in `.github/hooks/` enforce these and block hosted-Supabase writes and `.env` edits.

## Verify

- Run `npm run verify` (typecheck, lint, unit tests; about 5s) before saying you're done.
  The stop hook also runs it.
- For features and DB changes, run the sections that
  `npm run test:e2e:plan -- --files <files you touched>` selects
  ([e2e-testing skill](.github/skills/e2e-testing/SKILL.md)) before a PR.
- Two hosted Supabase projects exist: Production (`npm run dev`) and Dev
  (`npm run dev:supabase-dev`). E2E runs on Local or Dev only, never Production; see "Pick the target" in the e2e-testing skill.
- For pure logic in `lib/`, extend the matching test in `tests/unit/`.
- Before a PR: also run `npm run check:dead-code` and `git diff --check`; use
  [prepare-pr](.github/prompts/prepare-pr.prompt.md) for branch coverage and exact evidence.
- Before E2E writes, run `npm run test:e2e:preflight` with an explicit `E2E_BASE_URL`.
  It checks Local/Dev configuration, the listener checkout, and fixtures without writing data.

## Parallel sessions and handoffs

- One implementation session owns a worktree. In a shared checkout, agree on disjoint
  file ownership before editing; never stage or commit another session's changes.
- Worktrees still share local Supabase. The E2E lock serializes tests and standalone cleanup,
  not manual seed/reset commands. Coordinate those commands; reset is explicit opt-in.
- Record a compact handoff in session state: task/acceptance criteria, worktree/branch/HEAD,
  owned files, app and database target and server PID, decisions/blockers, exact checks/results,
  and remaining work. Do not record secrets or copy sensitive source data.
- Before consolidating/removing a worktree, inspect staged, unstaged, and untracked files.
  A new worktree contains committed files only; do not silently discard or omit local work.

## Keep changes small and in-pattern

- Make the smallest diff that works. Ask before adding dependencies, abstractions, or new
  files. If a change will pass ~150 lines or 5 files, propose a plan first.
- Copy the closest existing example:
  - Form: `components/star-treatments/star-treatment-form.tsx` with
    `lib/validation/star-treatment.ts`; shared pieces in `components/forms/`.
  - Static config: `lib/config/reference-data.ts`. Water-quality params come only from
    `WATER_QUALITY_PARAMS`.
  - Supabase: `createClient` from `lib/supabase/client.ts` (browser) or `server.ts`.
  - Dates and times: `lib/pacific-date-time.ts` (America/Los_Angeles).
  - Migration: the newest file in `supabase/migrations/` (supabase-migrations skill).
  - E2E: the matching `*.smoke.ts` and `helpers.ts` in `.github/skills/e2e-testing/scripts/`.
- Systems, species, catalogs, and target ranges live in the database. Don't hardcode them, and
  don't invent BLOCKED values.
- For mock-to-real data or shared domain-value changes, load
  [feature-data-wiring](.github/skills/feature-data-wiring/SKILL.md).

## Search

Search with exact identifiers (component, route, label, table). After two misses, use the
README map or ask. Hand open-ended research to a subagent.
For previous work, query session history first; if the index has no conversations, use the
session listing/context tools. Treat transcript decisions as context, not new authorization.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
