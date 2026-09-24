---
name: e2e-testing
description: 'Run an end-to-end Playwright pass through the SSL Data Collection app: sign in, exercise the daily logging forms (AM/PM check, feeding, water quality, health observation, chemical addition, maintenance), and confirm each write landed correctly in Supabase. Use when: a feature is "done" and needs verification before a PR; a DB migration or RLS policy changed; the onboarding/auth/approval flow changed. Do NOT use for copy-only or pure CSS/UI-polish tweaks — see docs/testing-strategy.md.'
---

# End-to-End Testing (SSL Data Collection)

## When to use
- After any change that touches a form, a table, or an RLS policy.
- After any schema migration.
- Before opening a PR for anything at or above the "standard feature" tier — see
  [docs/testing-strategy.md](../../../docs/testing-strategy.md).

## What "done" looks like
Drive the app the way a lab tech, volunteer, or admin actually would, using Playwright — and
confirm both the UI *and* the underlying Supabase row for each step. A green UI with no
matching database row is a failure, not a pass.

## Fast path — route, observe, run

Do not begin with an open-ended repository search. Use the requested feature or changed-file
list to open the matching script directly:

| Area | Script |
|---|---|
| Daily checks, feeding, water quality, chemical additions, health, maintenance, Today | `daily-logging-forms.smoke.ts` |
| Sign-up, pending approval, admin users | `auth-and-admin.smoke.ts` |
| Sidebar, Home navigation, theme | `sidebar-ui.smoke.ts` |
| Operational-log roles and permission matrix | `rbac-tiers.smoke.ts` |
| Star treatments and the Probiotics boundary | `star-treatments.smoke.ts` |
| RLS/GRANT rebuild regression | `rls-rebuild.smoke.ts` |
| Systems page and water-quality trend charts | `systems-trends.smoke.ts` |

1. Open only the matching section script and `helpers.ts` first. If the request names changed
  files, use `git diff --name-only` once to choose the section.
2. Observe the live page with Playwright MCP `browser_navigate` and `browser_snapshot` before
  guessing selectors. Prefer the accessible names in that snapshot and existing
  `getByRole`/`getByLabel` patterns.
3. Make at most two code searches before executing a browser probe or test. Each search must
  use an exact route, visible label, component name, or test title and be scoped to the
  likely file or directory. After a miss, inspect the route file or browser snapshot; do not
  retry variations of a broad regex.
4. Run the narrowest existing check first:
  `npx playwright test <section-file> -g "<exact test or describe title>"`.
  Run the whole section only after that check passes. Run multiple sections only when the
  change crosses those areas or the testing tier requires them.
5. Extend a test only after the targeted run proves the behavior is uncovered. Reuse
  `helpers.ts`; do not rediscover login, role, date/time, or DB-query behavior.

## Procedure

1. **Reuse the always-on dev server** on port 3000. Never start a second instance and never
   kill the running one (see [AGENTS.md](../../../AGENTS.md)).
2. **Auth & account state** — sign in with a designated test account (see
   [test-accounts.md](./references/test-accounts.md)). If the change touches onboarding:
   create a new sign-in, confirm it lands as `profiles.status = pending`, approve it as an
   Admin, confirm the assigned role actually takes effect (e.g. a Viewer can't insert).
3. **Exercise the changed feature end to end.** Examples for this app:
   - AM/PM check → confirm a new `daily_checks` row (right `system_id`, `check_type`).
   - Feeding log → confirm `feeding_logs` row, then do the same-day consumption follow-up and
     confirm it updates that same row rather than creating a duplicate.
   - Water quality reading (all 6 params) → confirm `water_quality_readings` row, with
     `ph_source` set correctly (`apex_probe` vs `manual`).
   - Chemical addition → confirm `chemical_additions` row.
   - Health observation with a photo → confirm `health_observations` row plus the
     `attachments` row and the object landing in Supabase Storage.
   - Maintenance task marked performed → confirm `maintenance_logs` row and that
     `next_due_at` recomputed correctly.
   - Historical import / paper backfill → confirm rows are tagged with the right
     `data_source` (`import` / `paper_backfill`) and correct `entered_at` vs.
     event-time split.
4. **Check the "Today" dashboard** reflects what you just logged (done/outstanding badges
   update for the right system).
5. **Click every tab touched by the change** while the dev server keeps running in the
   background, watching the browser console and network tab for errors.
6. **Confirm directly in Supabase** (table editor or a SQL query) that every row from step 3
   exists with the right values — don't rely on the UI alone reporting success.
7. **Report back**: what was tested, what passed, and anything that looked off, even if
   passing. This does not replace a manual pass by the human before merge — it just catches
   the dumb stuff first.

## Scripts
Split into one shared helper module plus a section file per area — extend the matching
section file per feature; only add a new section file for a genuinely new area rather than
growing an existing one indefinitely:
- [helpers.ts](./scripts/helpers.ts) — shared module (env constants, `db`, `dbQuery`,
  `login`/`loginAs`, role clients, date/time helpers). Not a test file itself; imported by
  every file below.
- [daily-logging-forms.smoke.ts](./scripts/daily-logging-forms.smoke.ts) — the 6 daily forms
  (AM/PM check, feeding + consumption follow-up, water quality, chemical addition, health
  observation, maintenance), the Today dashboard, and each form's date/time-box behavior.
- [auth-and-admin.smoke.ts](./scripts/auth-and-admin.smoke.ts) — sign-up → pending →
  admin-approval flow, plus the `/protected/admin` approve/deny UI.
- [sidebar-ui.smoke.ts](./scripts/sidebar-ui.smoke.ts) — sidebar Home button + theme toggle
  (UI-only, Tier 1).
- [rbac-tiers.smoke.ts](./scripts/rbac-tiers.smoke.ts) — per-role (admin/technician/
  volunteer/viewer) behavior for operational logs, plus the DB-level SELECT/UPDATE/DELETE
  matrix across every affected table.
- [star-treatments.smoke.ts](./scripts/star-treatments.smoke.ts) — Star treatment role
  visibility, RPC-only create/correct/delete flows, immutable provenance, current-row
  assertions, filters, and the Probiotics chemical-addition boundary. A general activity
  audit is deferred as project-wide work; this script does not probe a feature-specific
  audit table.
- [rls-rebuild.smoke.ts](./scripts/rls-rebuild.smoke.ts) — full-form regression after an
  RLS/GRANT rebuild on core tables (`rlsRebuildWriteSuite()`, called once per role).
- [systems-trends.smoke.ts](./scripts/systems-trends.smoke.ts) — systems-page water-quality
  trend controls, chart rendering, carousel behavior, and responsive layout.

Run a single section directly by file path instead of the whole suite, e.g.
`npx playwright test .github/skills/e2e-testing/scripts/daily-logging-forms.smoke.ts`.

## Known gotchas (learned from real runs — read before extending a script)
- **Never assert against schema `core` with the plain service-role Supabase-js client
  (`db.from(...)`).** The hosted project's `service_role` Postgres role has no `USAGE` grant
  on schema `core` (only `authenticated` does), so any `db.from("<core table>")` call 403s
  with "permission denied for schema core". Use the `dbQuery(sql)` helper from
  [helpers.ts](./scripts/helpers.ts) instead (runs SQL via `supabase db query -f ... --linked`,
  connects as `postgres`, and needs schema-qualified table names, e.g. `core.profiles`).
  `db.auth.admin.*` calls (Auth Admin API, not a schema query) are unaffected and fine to use
  directly.
- **Scope `test.describe.configure({ mode: "serial" })` inside each `test.describe` block**,
  not once at the top of a file. Applied file-wide, one failing test cascades into every
  later, unrelated `describe` block being marked "did not run" instead of executed — which
  can hide a real regression in a feature you didn't even touch. This still applies within
  section files that hold more than one top-level `describe` (e.g. rbac-tiers.smoke.ts) —
  splitting by file isolates across sections, not within one.
- When isolating a single new suite while debugging, run
  `npx playwright test -g "<describe name>"` (optionally combined with a file path) rather
  than the whole file, especially if an unrelated pre-existing suite in the same file is
  known-flaky — see the gotcha above for why the whole file can otherwise report false
  negatives.
- **For "it looks wrong" visual/CSS-variable bugs (e.g. dark mode, theming), don't trust a
  screenshot alone** — a screenshot you don't actually look at pixel-by-pixel proves nothing.
  Instrument the page instead: `page.evaluate` to read `document.documentElement.className`,
  `window.localStorage`, `getComputedStyle(el).backgroundColor`/`.color`, and the raw CSS
  custom property via `getComputedStyle(document.documentElement).getPropertyValue("--var")`.
  Also check `navigator.serviceWorker.getRegistrations()` and the stylesheet's
  `Cache-Control` response header before concluding it's a real bug — a stale service worker
  or aggressively cached CSS chunk in the *human's* browser can reproduce as "broken" even
  when an instrumented run proves the app logic is correct. See `captureThemeState` in
  [sidebar-ui.smoke.ts](./scripts/sidebar-ui.smoke.ts) for a reusable pattern — reuse/extend
  it for the next visual-state bug report instead of writing a one-off check.

## References
- [test-accounts.md](./references/test-accounts.md) — how to create/reset test accounts and roles.
