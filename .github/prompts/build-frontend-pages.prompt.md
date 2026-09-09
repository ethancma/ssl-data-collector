---
description: "Build out the SSL Data Collection frontend page inventory (landing, home, daily-ops hub, settings, admin CRUD, systems/monitoring, analytics, animals+growth, food monitoring, historical import) using only the schema/RLS that already exists — no backend or migration changes."
name: "Build SSL Frontend Pages"
argument-hint: "Which page/phase to build (e.g. 'Settings + nav update'); omit to see the full plan"
agent: "agent"
---

# Build out the SSL Data Collection frontend

Frontend-only pass over the page inventory below. If `${input}` names a specific
page/phase, build only that one; otherwise treat this as the full backlog and ask
which to start with.

## Hard constraints
- **No backend changes.** Do not create or edit anything under
  `../../supabase/migrations/**`, do not add tables/columns/enums, and do not write
  SQL. Every page below must be buildable against the schema and RLS policies that
  already exist today.
- Pages whose real functionality depends on schema that doesn't exist yet
  (Food Monitoring, the Maintenance section of Systems, the Growth tab of Animal
  Monitoring) ship as **static UI placeholders only** — no Supabase queries wired
  up for those specific sections. Everything else on the same page that *does* have
  existing schema should still be fully wired to real data.
- Only touch `app/**` and `components/**` (read-only from `lib/config/**`,
  `lib/models/**`, `lib/validation/**`, `lib/supabase/**` for existing helpers/types).
- Reuse existing patterns before inventing new ones (see below) — don't restyle or
  refactor components that aren't part of the page you're building.

## Page inventory

| # | Page | Route(s) | Scope for this pass |
|---|------|----------|----------------------|
| 1 | Landing page | `app/page.tsx` (`/`) | Redesign/expand with more SSL mission content; keep the existing auth-redirect behavior |
| 2 | Home | `app/protected/today/page.tsx` | Rework in place — keep the existing per-system agenda-board logic (AM/PM/feeding/water-quality done-today status), add snapshot analytics widgets (small counts/summary stats, real data) |
| 3 | Daily Operations hub | new `app/protected/daily-operations/page.tsx` | One page, tab/section switcher (plain Button-group + local state, no new dependency) embedding the 5 existing form components (daily check, feeding, water quality, chemical addition, health observation) inline. Existing `/checks/new`, `/feeding/new`, `/water-quality/new`, `/chemical-additions/new`, `/health-observations/new` routes stay untouched for QR-code/deep-link use |
| 4 | User settings | `app/protected/settings/page.tsx` | Real implementation — edit own `display_name` only (that's all `profiles_update_self` RLS allows); read-only email/role/status |
| 5 | Admin CRUD | new `app/protected/admin/systems/page.tsx`, `/admin/tanks/page.tsx`, `/admin/species/page.tsx` | Create + edit only, no deactivate/delete. Follows the `admin-users-table.tsx` per-row-writes-to-Supabase pattern. Add a small sub-nav in the admin layout linking Users (existing) / Systems / Tanks / Species |
| 6 | Systems (water quality, live status, maintenance) | new `app/protected/systems/page.tsx` + `app/protected/systems/[slug]/page.tsx` | List page: 8 systems, tank/animal counts. Detail page: live status (last AM/PM check, current temp, latest water-chem reading — real data), tank + animal roster (real data), plus a **static placeholder Maintenance section** (task list UI shell only, no query — schema not built yet) |
| 6b | Analytics | `app/protected/history/page.tsx` reworked; nav label changes from "Historic data" to "Analytics" | Filter bar (log type / system / date range), results table (real data across `daily_checks`, `feeding_logs`, `water_quality_readings`, `chemical_additions`, `health_observations`), CSV export button (client-side, hand-rolled — no new dependency), a `recharts` trend chart (install `recharts`) shown when filtered to one system + water quality readings |
| 7 | Food monitoring | new `app/protected/food-monitoring/page.tsx` | **Static placeholder only** — "coming soon" shell + nav entry. No queries (microalgae_logs / urchin feed-stock tables don't exist) |
| 8 | Animal monitoring (merged w/ star size monitoring) | new `app/protected/animals/page.tsx`, `/animals/[id]/page.tsx`, `/animals/new/page.tsx`, `/animals/[id]/edit/page.tsx` | Roster list (real data, filterable by system/species/status; note `tracking_type='cohort'` + `pair_group` need distinct handling, not just filtering out). Detail page: animal info, feeding history, health-observation timeline w/ photos (all real data) + a **static placeholder Growth section** (no query — `animal_measurements` schema not built yet). Create/edit forms are admin-only, shown inline (no separate `/admin/animals` route) |
| 10 | Historical data import | new `app/protected/admin/import/page.tsx` | Admin-only. CSV import with column mapping (tags rows `data_source=historical_import`) + a spreadsheet-style backfill entry mode (tags `data_source=paper_backfill`, optional photo via the existing `attachments` table). This one **is real** — `data_source` already exists on every log table, no schema needed |

## Nav update (do first, one small edit)
In [app/protected/layout.tsx](../../app/protected/layout.tsx): add "Systems",
"Animals", "Food Monitoring" links; rename "Historic data" → "Analytics" (href
stays `/protected/history`); "Daily Operations" link; Import lives under the
existing Admin section, not its own top-level link.

## Reuse these patterns
- Form template: server `page.tsx` fetches via
  [lib/supabase/server.ts](../../lib/supabase/server.ts), wraps a client form in
  `<Suspense>`. Client form uses react-hook-form + zodResolver
  (`lib/validation/*.ts`), inserts via
  [lib/supabase/client.ts](../../lib/supabase/client.ts), then
  `router.push(...); router.refresh();`. Reference:
  [components/feeding-log-form.tsx](../../components/feeding-log-form.tsx).
- Admin table template:
  [components/admin-users-table.tsx](../../components/admin-users-table.tsx) —
  per-row dropdowns/inputs write straight to Supabase on change, per-row error state.
- All RLS needed already exists (admin-write / active-member-read on
  systems/tanks/species/animals; contributor-insert / admin-all on the 5 log
  tables) — confirm in
  [supabase/migrations/20260907200000_core_foundation.sql](../../supabase/migrations/20260907200000_core_foundation.sql)
  if unsure, but do not modify it.

## Verification
1. `npm run lint` and `npm run build` after each page/phase.
2. Manual spot-check in the browser on the existing dev server (port 3000) — do
   not restart it.
3. Once a batch of real (non-placeholder) pages is done, run the
   [e2e-testing skill](../skills/e2e-testing/SKILL.md) before opening a PR, per
   [AGENTS.md](../../AGENTS.md) rule 3.
