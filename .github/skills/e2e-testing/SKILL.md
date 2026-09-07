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
     `data_source` (`historical_import` / `paper_backfill`) and correct `entered_at` vs.
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
- [playwright.smoke.ts](./scripts/playwright.smoke.ts) — skeleton covering steps 2-4.
  Extend it per feature rather than rewriting it from scratch each time.

## References
- [test-accounts.md](./references/test-accounts.md) — how to create/reset test accounts and roles.
