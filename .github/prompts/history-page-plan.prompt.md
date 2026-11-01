---
description: "Build the History page: a read-only, filterable, sortable table over every log dataset, backed by core.v_history_* SQL views, with CSV export of all matching rows. Also removes the unused analytics schema from the migration history. Starts with sample UIs to choose from."
name: "Build history page"
argument-hint: "Optional: a phase to run (1-6) or a decision to override below"
agent: "agent"
---

# History page

A read-only page at `/protected/history`. Active members browse every log dataset, filter and
sort it, open a row for detail, and export all matching rows to CSV. Read
[AGENTS.md](../../AGENTS.md) first and follow its rules. Exceptions for this task are listed
under **Hook exception**. This extends row 6b of
[build-frontend-pages.prompt.md](build-frontend-pages.prompt.md). Its "no backend changes"
rule is lifted for phase 3 only.

If `${input}` names a phase, run only that phase. Otherwise start at phase 1 and stop at the
end of phase 2 for my choice.

## Decisions already made
- **Branch:** `feat/history-page`, cut from `main`, in its own worktree. All commits go there.
  Commit locally in small steps. Never push.
- **Name:** "History" for the route, nav label, and page title.
- **Read-only:** no edit or delete actions. Edit history (`operational_log_audit`) is out of
  scope.
- **Datasets:** AM/PM checks, feeding, water quality, chemical additions, health observations,
  maintenance, and star treatments.
- **Viewers:** see every dataset except star treatments, which stay hidden from them as they
  are today.
- **Recorder names:** everyone active sees who recorded a row (display name only, never email).
- **Granularity:** one row per reading or event. Water quality is one row per reading, with
  each parameter as a column.
- **Shaping lives in SQL:** plain views in `core` named `v_*`. No TypeScript files that
  normalize or map rows. Pure helpers for CSV and URL parsing are fine.
- **No ETL, no `analytics` schema.** It is removed from the migration history (phase 3a).
- **Columns:** system, tank, and animal names are separate columns. Cohort animals get no
  special labelling.
- **Date range:** `Segmented` pills for 7 d, 30 d, 90 d, 1 y, and Custom (from/to). The
  default is 30 d.
- **Paging:** 50 rows per page, with page controls and an exact total count.
- **Sorting:** newest first by default. "All" sorts by time, dataset, system, tank, animal,
  and recorded by, but not summary. Dataset tabs also sort on their own typed columns.
- **Search:** notes, system, tank, animal, and recorder names.
- **Out of range:** the water-quality view computes it, and there is an "Out of range only"
  filter.
- **Row detail:** opens in a `Sheet` showing all fields, full notes, and health-observation
  photo thumbnails.
- **CSV export:**
  - Exactly the on-screen columns and values.
  - All rows matching the current filters, across every page.
  - Built in the browser, paging through the view 1,000 rows per request (PostgREST
    `max_rows`), with a progress count and a Cancel button.
  - No photos.
  - Escaped per RFC 4180. A leading `=`, `+`, `-`, `@`, tab, or CR gets a `'` prefix to block
    formula injection. Starts with a UTF-8 BOM.
  - Filename: `history-<dataset>-<from>-<to>.csv`.
- **No new dependencies.** Charts reuse
  [components/systems/charts.tsx](../../components/systems/charts.tsx), and the table is
  hand-built.
- **UI first:** sample UIs use mock data, then stop for my choice.

## Hook exception (this task only)
I have approved changing applied migrations to remove `analytics`. The hosted project holds
dummy data only.
- **Scope:** the exception covers only the four migration files listed in phase 3a.
  Everything else in `.github/hooks/` still applies: no push, no hosted commands, no `.env`
  edits, and leave the port-3000 server alone.
- **How:** delete files with `git rm`. If the edit tool denies an edit to one of those
  migration files, apply the same change with a scripted terminal edit and show the
  `git diff`.

## Phases

### 1. Worktree
`npm run wt -- new` branches from the main checkout's current HEAD, not `main`, so create the
worktree by hand:
```sh
git -C ~/GitHub/ssl-data-collection fetch origin
git -C ~/GitHub/ssl-data-collection worktree add ../ssl-data-collection-history-page -b feat/history-page origin/main
cd ../ssl-data-collection-history-page && npm run wt -- setup
```
Run your own dev server with `npm run dev -- -p $PORT`, using the port from the worktree's
`.env.local`. Stop only that server.

Before writing code, read the relevant guides in `node_modules/next/dist/docs/`, at least
`searchParams` and `loading.tsx`. This Next.js version differs from what you know.

### 2. Sample UIs (mock data, no database)
**Files:**
- **Mock data:** one shared file, `components/history/preview/mock-rows.ts`.
  - Shaped like the phase-3 views.
  - 150+ rows across all seven datasets, with Pacific times.
  - Includes some out-of-range water-quality values, all three data sources, and a few
    long notes.
- **Options:** three clickable designs selected with `/protected/history?design=a|b|c`.
- **Chooser:** `app/protected/history/page.tsx` links to the three designs and shows
  `SampleNote`.
- **No Supabase queries.**

**Visual language:** match ISeaU and Systems exactly. Reuse, don't copy, from
[components/iseau/shared.tsx](../../components/iseau/shared.tsx):
- **Header:** `PageHeader`, with a sentence headline. Example: "312 entries in the last 30
  days. 2 water tests out of range."
- **Selectors:** `Segmented` pills for dataset, range, and system.
- **Containers:** `Tile` / `rounded-3xl bg-muted` with no borders or shadows. The table sits on
  a tile.
- **Detail:** `Sheet` for row detail.
- **States:** `EmptyNote` for empty results, and `focusClass` on every interactive element.
- **Colour:** `SEVERITY` hues (teal, amber, coral) for severity and out-of-range.
- **URL state:** `?param` with `onPlainClick`, as in
  [system-lineup.tsx](../../components/systems/system-lineup.tsx).

Load the [frontend-design skill](../skills/frontend-design/SKILL.md) for direction within that
language.

**The options:**
- **A. Ledger:** one table with the "All" columns. Above it, a row of `Segmented` pills
  (dataset, range) plus system, recorder, and data-source selects, search, and an Export
  button.
- **B. Dataset tabs:** the same filter row. "All" plus one tab per dataset, each with its own
  typed columns. The water-quality tab colours out-of-range cells.
- **C. Day timeline:** a stat strip and an entries-per-day chart (`MultiLineChart`) above
  rows grouped by Pacific day, each day on its own tile. A toggle switches to the table view.

**Every option has:**
- `aria-sort` sortable headers.
- Active-filter chips with clear-all.
- Loading and empty states.
- A data-source badge (live, import, paper backfill).
- A row `Sheet`.
- Paging.
- A working CSV export of the mock rows.
- Below `sm`, the table becomes a list of cards.

**Stop here.** Summarise A, B, and C, and ask me to pick one or a mix.

### 3. Migrations (after I choose)
Load the [supabase-migrations skill](../skills/supabase-migrations/SKILL.md) and the
[supabase-postgres-best-practices skill](../skills/supabase-postgres-best-practices/SKILL.md).

**Shared local stack:** one Supabase stack serves every checkout. Tell me before each
`npx supabase db reset`, because it wipes local data for my port-3000 server too.

#### 3a. Remove `analytics` from history (edit in place, no new migration)
- **`20260907207000_analytics_schema.sql`:** delete it.
- **`20260910130000_native_role_grants.sql`:**
  - Remove section 4 (analytics policies) and the four `analytics` grant and default-privilege
    lines in section 5.
  - Drop the analytics wording from the comments, including the line-56 note.
- **`20260927232305_feeding_food_catalog_numeric_amount.sql`:** remove the two
  `comment on column analytics.fact_feeding…` statements.
- **`20260928222050_invited_profile_activation_guard.sql`:** change
  `in ('core', 'analytics')` to `= 'core'`.
- **`20260907199000_reset_stale_core_analytics_schemas.sql`:** leave it. It is an idempotent
  hosted cleanup.
- **[supabase/config.toml](../../supabase/config.toml):** remove `analytics` from `schemas` and
  `extra_search_path`.
- **Docs:** remove the `analytics` mentions from the
  [supabase-migrations skill](../skills/supabase-migrations/SKILL.md) (its "Schemas" line),
  [docs/implementation-checklist.md](../../docs/implementation-checklist.md), and
  [docs/star-treatments-design.md](../../docs/star-treatments-design.md).
- **Check:**
  1. Run `npx supabase db reset` (after telling me).
  2. `select nspname from pg_namespace where nspname = 'analytics'` returns no rows.
  3. A `supabase db dump --local --schema core` taken before and after is identical.
- **Commit:** on its own: `chore(db): remove unused analytics schema`.

#### 3b. `…_profile_names_view.sql`: `core.v_profile_names`
- **Purpose:** the only way non-admins can see other people's names. `core.profiles` RLS
  returns only self or admin.
- **Definition:** `create view core.v_profile_names with (security_barrier) as select id,
  display_name from core.profiles where status <> 'pending' and (select
  core.is_active_member())`.
  - It is owner-rights (definer) on purpose. Comment why in one line.
  - It must never expose email, role, or status.
- **Grants (critical):** `native_role_grants` sets default privileges so admin and technician
  get ALL on every new object in `core`. A single-table definer view is auto-updatable, so it
  would let them UPDATE any profile and bypass RLS.
  - Run `revoke all on core.v_profile_names from public, anon, authenticated, admin,
    technician, volunteer, viewer`.
  - Then `grant select … to admin, technician, volunteer, viewer`.
- **Advisor:** Supabase's advisor will flag `security_definer_view`. That is expected; the
  migration comment covers it.

#### 3c. `…_history_views.sql`: per-dataset views plus "All"
**All views** are `with (security_invoker = true)`, so existing RLS and grants apply.

**Shared columns**, in this order, on every view:
- `dataset` (code: `daily_check`, `feeding`, `water_quality`, `chemical_addition`,
  `health_observation`, `maintenance`, `star_treatment`)
- `id`, `occurred_at`, `occurred_on` (Pacific date)
- `system_id`, `system_name`, `tank_id`, `tank_name`, `animal_id`, `animal_name`
- `recorded_by`, `recorded_by_name` (via `v_profile_names`)
- `data_source`, `entered_at`, `notes`
- `summary` (short, built from values only, no UI labels)

Tank and animal columns are null where not applicable. Feeding, health, and star treatments
get `system_id` through `tanks`.

**Typed columns per view:**

| View | Typed columns |
|---|---|
| `v_history_daily_checks` | `check_type`, `water_running`, `temperature` |
| `v_history_feeding` | `food_name` (`food_catalog`), `amount_value`, `amount_unit` (`food_catalog.default_unit`), `consumption_status`, `consumption_checked_at` |
| `v_history_water_quality` | `ph_source`, every key in `WATER_QUALITY_PARAMS` (including `nitrate` and `nitrite`), and `out_of_range text[]` |
| `v_history_chemical_additions` | `chemical_name`, `amount`, `unit`, `reason` |
| `v_history_health_observations` | `severity`, `issues text[]`, `has_photo` |
| `v_history_maintenance` | `task_type` |
| `v_history_star_treatments` | `treatment_type`, `amount`, `unit`, `concentration`, `concentration_unit` |

- **`out_of_range` resolution:** a system-specific `water_quality_target_ranges` row wins over
  the lab-wide row (`system_id is null`). Match
  `lib/daily-operations/water-quality-targets.ts`.
- **"All" view:** `v_history_events` is `union all` of the shared columns from the six
  non-star views. Star treatments stay out because viewers have no grant on
  `core.star_treatments`, and one inaccessible branch would fail the whole query for them.
- **Grants:** `revoke all … from public, anon, authenticated, admin, technician, volunteer,
  viewer`, then `grant select` to the four roles. `v_history_star_treatments` gets only admin,
  technician, and volunteer.
- **Data source:** use `'import'`. It was renamed from `'historical_import'`; don't bring the
  old value back.
- **Performance:** `EXPLAIN ANALYZE` "All", 30 days, `order by occurred_at desc limit 50`. Add
  an index only if the plan is clearly bad, and say so.
- **Check:** with `db query --local` and `set role`:
  - Viewer can read `v_history_events` and gets permission denied on
    `v_history_star_treatments`.
  - Volunteer sees other people's names.
  - Anon gets nothing.
  - An `update core.v_profile_names` as technician fails.
- **Commit:** on its own: `feat(db): history views`.

### 4. Build the chosen design on real data
**Data fetching:**
- **Server:** `page.tsx` reads through [lib/supabase/server.ts](../../lib/supabase/server.ts).
  The client is already pinned to `core`.
- **Filters:** dataset, range or from/to, system, tank, animal, recorder, data source,
  out-of-range, `q`, sort, dir, and page.
  - All live in the URL.
  - Parse them with one pure helper in `lib/history/` that whitelists every value. Unknown
    values fall back to defaults.
- **Query:** filter, sort, and paging (`range()`, `count: 'exact'`) all run in the database.
  - Date bounds go on `occurred_at` via `pacificDayBoundaryToIso` so the base-table indexes
    are used.
  - Search uses `.or()` with `ilike`. Escape PostgREST reserved characters (`,` `(` `)` `.`
    `*` `%` `_` `\`) in user input first.
- **Filter options:** systems, tanks, and animals, including inactive ones, plus recorders
  from `v_profile_names`.
- **Role:** comes from [lib/supabase/current-profile.ts](../../lib/supabase/current-profile.ts).
  Viewers get no star-treatment tab or option.

**Display:**
- Dates and times use [lib/pacific-date-time.ts](../../lib/pacific-date-time.ts).
- Code-to-label maps (issues, tasks, and so on) reuse the existing config in
  [lib/config/reference-data.ts](../../lib/config/reference-data.ts) and
  [app/protected/systems/data.ts](../../app/protected/systems/data.ts). Don't redefine them.
- Water-quality parameters come only from `WATER_QUALITY_PARAMS`.
- Missing recorder names show "Unknown".

**Export:** the browser export (see Decisions) reuses the same filter-to-query function as
the page. Put the CSV builder in `lib/history/csv.ts`.

**Photos:** query `attachments` where `parent_table = 'health_observations'`, sign them in the
browser from the `attachments` bucket, and load them only when the `Sheet` opens.

**States:**
- `loading.tsx` for loading.
- Errors render like the Systems page: `text-sm text-red-500`, `role="alert"`.

**Nav and docs:**
- Add a History link (lucide `History` icon) after Systems in the Operations group of
  [components/layout/protected-sidebar.tsx](../../components/layout/protected-sidebar.tsx).
- Add History to the ISeaU and Systems section of
  [docs/style-guide.md](../../docs/style-guide.md).

**Unit tests:** in `tests/unit/` for `lib/history/csv.ts` (quoting, formula prefix, BOM,
arrays joined with `; `) and the search-param parser.

### 5. Clean up
- Delete the design switcher, the mock data, and the unchosen designs.
- `npm run verify` (knip included) must be clean.

### 6. Verify and hand off
1. Run `npm run verify` and `npm run build`.
2. Run the sections chosen by `npm run test:e2e:plan -- --files <touched files>`
   ([e2e-testing skill](../skills/e2e-testing/SKILL.md)). This is Tier 3 because the schema
   changed, so it is required.
3. Add `.github/skills/e2e-testing/scripts/history.smoke.ts`, copying the closest
   `*.smoke.ts` and `helpers.ts`. Cover:
   - Filter, sort, and paging.
   - The exported CSV row count equals the on-screen total.
   - A viewer sees no star treatments.
   - A volunteer sees another user's name.
4. Commit. Do not push.
5. Give me:
   - **A PR summary.**
   - **The hosted handoff, to run after merge.** Hosted already has `20260907207000` applied,
     and the edited files are already recorded as applied. Default path (keeps hosted data):
     1. Dashboard → API: remove `analytics` from Exposed schemas and Extra search path.
     2. SQL editor: `drop schema analytics cascade;`
     3. `npx supabase migration repair --status reverted 20260907207000`
     4. `npx supabase db push` (adds the two view migrations).
     5. `npx supabase migration list`: local and remote match.

     Fallback if hosted drifts: `npx supabase db reset --linked`. Afterwards, check that
     every `auth.users` row still has a `core.profiles` row and re-mark the admin.
     Provide that SQL as a file in `supabase/snippets/`.

## Out of scope
- Editing or deleting rows, saved views, edit history, the "missing entries" report.
- Moving SSL25 out of migrations. E2E relies on it, including on hosted.
- Switching the Systems page to the new views.
- Food Monitoring and Animals pages.
