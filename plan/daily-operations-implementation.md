# Daily Operations implementation plan

Status: implementation-ready after repository investigation and independent
critique. Design only; no implementation has started.

## Scope

1. Add **Header** and **Nursery** systems; record their AM/PM temperatures.
2. **Micro-Algae** keeps AM/PM rows but does not require a temperature.
3. Successful ordinary saves keep the user on the same Daily Operations type.
4. Operation order: Daily check, Health observation, then the rest.
5. Add **Balding** health issue.
6. Record **spines found** during a Spine drop observation, per animal.

## Confirmed decisions

| Item | Decision |
| --- | --- |
| Header | General water for the lab; no animals; new category `header`, shown as "Header" on the Systems page. |
| Nursery | `larviculture`; can hold animals. |
| Header and Nursery weekly water quality | May appear and be logged, but not required on Home. |
| Header and Nursery AM/PM checks | Required, with temperature. |
| Micro-Algae | Still in AM/PM round; temperature not required and saved `NULL`. |
| Post-save, ordinary forms | Stay on same type, clear form, show success message. |
| Post-save, Feeding and Star treatment | Keep existing batch summary and "Log another". |
| Spine count | Spines found in this observation; per animal; not cumulative. |
| Spine count visibility | History, History CSV, ISeaU, and ISeaU CSV. |

## Design principles

- Smallest change that is correct. No new abstractions, dependencies, toast
  library, or remount mechanism.
- System behavior is database-driven, not name-based (AGENTS.md rule).
- Existing migrations on `origin/main` are immutable; add one new file.
- Missing data stays `NULL`, never zero.

## Phase 1: Database (1 migration)

Create one file with `npx supabase migration new daily_operations_updates`,
following the newest migration's style. All changes are additive and ship
together, so one file is simpler to review, apply, and roll forward.

Systems:

- Add to `core.systems`:
  - `requires_temperature boolean not null default true`
  - `requires_weekly_water_quality boolean not null default true`
- Set `requires_temperature = false` for slug `micro-algae`.
- Replace the `core.systems` category check to add `header` (look up the
  generated constraint name; drop and re-add, as in
  [20260920120000_rename_data_source_import_value.sql](../supabase/migrations/20260920120000_rename_data_source_import_value.sql)
  lines 22-24).
- Insert, with `on conflict (slug) do nothing`:
  - `header`, `Header`, `header`, `has_animals = false`,
    `requires_weekly_water_quality = false`
  - `nursery`, `Nursery`, `larviculture`, `has_animals = true`,
    `requires_weekly_water_quality = false`
- Do not create tanks, animals, schedules, or water-quality targets.
- Defaults keep the eight existing systems unchanged and keep the previous app
  version compatible.
- The Systems lineup and compare views render category as
  `category.replace(/_/g, " ")` with `capitalize`
  ([system-lineup.tsx](../components/systems/system-lineup.tsx) line 40,
  [system-compare.tsx](../components/systems/system-compare.tsx) line 30), so
  Header shows "Header" with no UI change.

Health observations:

- Replace `health_observations_issues_check`: add `'balding'` to the allowed
  array **and** add its matching duplicate-detection `case` term. Keep the
  existing null-element and one-dimension checks.
- Add `spine_count integer null` with:
  - `check (spine_count is null or spine_count > 0)`
  - `check (spine_count is null or 'spine_drop' = any (issues))`
- `create or replace` the health history view (lines 143-167 of
  [20261014183001_history_views.sql](../supabase/migrations/20261014183001_history_views.sql)):
  keep `with (security_invoker = true)`, keep existing columns and order, and
  append `spine_count` last. Existing grants persist; the union view needs no
  change.

## Phase 2: Daily check temperatures

Files:

- [daily-operations/data.ts](../app/protected/daily-operations/data.ts): select
  `requires_temperature` with systems.
- [daily-operations/derivations.ts](../app/protected/daily-operations/derivations.ts)
  lines 26-28 and 72-75: **pass `requiresTemperature` through**. This mapper
  currently rebuilds systems as `{ id, name }` and would silently drop the flag.
- [log-types.tsx](../components/daily-operations/log-types.tsx): extend the
  `SharedFormData.systems` type.
- [daily-check.ts](../lib/validation/daily-check.ts):
  - Add `requiresTemperature: boolean` to each row.
  - Keep temperature as a string; allow blank only when not required.
  - In `superRefine`, require and range-check only required rows.
  - In `transform`, emit `null` for non-required rows; skip conversion and
    ignore any stale `temperatureSource`.
- [daily-check-form.tsx](../components/daily-operations/daily-check-form.tsx):
  - Include the flag in default rows.
  - For non-required rows, show "Not required" instead of the input.
  - F/C switching skips non-required rows.

Water-running and notes remain for every system. History, Systems snapshot, and
ISeaU already accept or filter `NULL` temperatures.

## Phase 3: Home weekly water-quality requirement

- [home/data.ts](../app/protected/home/data.ts) line 64: select
  `requires_weekly_water_quality`.
- [home/derivations.ts](../app/protected/home/derivations.ts) lines 36-45: only
  add "Water quality" to outstanding items when the system requires it.
- Header and Nursery remain selectable in the Water quality form.

## Phase 4: Post-save behavior and form order

For each ordinary form —
[daily-check-form.tsx](../components/daily-operations/daily-check-form.tsx),
[water-quality-form.tsx](../components/daily-operations/water-quality-form.tsx),
[chemical-addition-form.tsx](../components/daily-operations/chemical-addition-form.tsx),
[health-observation-form.tsx](../components/daily-operations/health-observation-form.tsx),
[maintenance-log-form.tsx](../components/daily-operations/maintenance-log-form.tsx):

- Replace `router.push("/protected/home")` with:
  1. `reset()` to freshly computed defaults (new current date/time; keep
     `defaultCheckType` and `defaultSystemId`).
  2. Set an inline `role="status"` success message.
  3. `router.refresh()`.
- Clear the success message at the next submission.
- Daily check: reset `checksSaved` and `consumption` **only after full success**.
  On consumption-follow-up failure, keep current retry behavior so checks are
  not inserted twice.
- Do not navigate to the same URL to reset state; Next.js does not guarantee a
  remount.
- Feeding and Star treatment: no change.

Order: in [log-types.tsx](../components/daily-operations/log-types.tsx) lines
75-110, move Health observation directly after Daily check. Default without a
`type` parameter remains Daily check.

## Phase 5: Balding

- Add `balding` / "Balding" before `other` in
  [reference-data.ts](../lib/config/reference-data.ts).
- Replace duplicated label maps with `HEALTH_ISSUE_LABELS` in:
  - [health-observation-form.tsx](../components/daily-operations/health-observation-form.tsx) lines 44-51
  - [home/derivations.ts](../app/protected/home/derivations.ts) lines 7-14
  - [systems/data.ts](../app/protected/systems/data.ts) lines 38-45
- Validation, History, and ISeaU already use the shared values and labels.

## Phase 6: Spine count

Form and validation:

- [health-observation.ts](../lib/validation/health-observation.ts): add optional
  `spineCount`; blank means unknown and becomes `null`; otherwise require a
  positive whole number. If Spine drop is not selected, output `null`.
- [health-observation-form.tsx](../components/daily-operations/health-observation-form.tsx):
  when Spine drop is selected, show "Spines found" with "Leave blank if unknown."
  Clear it when Spine drop is unchecked. Insert `spine_count`.
- No separate "Count unknown" checkbox: blank and unknown both mean `NULL`.

History:

- [datasets.ts](../lib/history/datasets.ts) lines 199-210: add a
  `spine_count` number column labeled "Spines found" after Issues. History table,
  details, and CSV use these definitions.

ISeaU:

- [iseau/data.ts](../app/protected/iseau/data.ts): add `spine_count` to the query
  (line 214), row type (lines 35-37), and mapper (lines 409-419).
- [lib/iseau/data.ts](../lib/iseau/data.ts) lines 18-30: add
  `spineCount: number | null`.
- [widgets.tsx](../components/iseau/widgets.tsx) line 95: show "Spines found: N"
  when present.
- [use-iseau.ts](../components/iseau/use-iseau.ts) lines 33-36: include
  "Spines found N" in the existing details text.

Do not total spine counts; repeated observations may count the same spines.

## Phase 7: Tests

Unit tests (extend existing files):

- [daily-check-validation.test.ts](../tests/unit/daily-check-validation.test.ts):
  required blank rejected; exempt blank becomes `null`; boundaries 32/122 °F and
  0/50 °C; unit switch with exempt row; stale `temperatureSource` ignored.
- [route-derivations.test.ts](../tests/unit/route-derivations.test.ts) lines
  17-49: `requiresTemperature: false` survives derivation.
- [home-derivations.test.ts](../tests/unit/home-derivations.test.ts): no
  outstanding water quality when not required; existing behavior otherwise.
- [history-csv.test.ts](../tests/unit/history-csv.test.ts): Balding label,
  spine count, and empty legacy count.
- [iseau-data.test.ts](../tests/unit/iseau-data.test.ts): spine count passes
  through.
- Add health-observation validation cases in the closest existing validation
  test: count blank, 0, negative, decimal, valid count, and count cleared without
  Spine drop.

Database checks after `npx supabase db reset`, using
`npx supabase db query --local`:

- Accept Balding alone and with another issue.
- Still reject duplicates, unknown issues, null elements, and nested arrays.
- Accept positive spine count with Spine drop; reject 0, negative, and count
  without Spine drop; accept legacy `NULL`.
- Removing Spine drop while a count remains is rejected.
- Systems have expected flags; Header and Nursery exist once.
- Health history view returns `spine_count` and remains readable by roles.

E2E updates:

- [helpers.ts](../.github/skills/e2e-testing/scripts/helpers.ts) lines 149-163:
  iterate all system rows; fill temperature only where an input exists; return
  the total system count. This avoids misaligned fields and untagged rows.
- [daily-logging-forms.smoke.ts](../.github/skills/e2e-testing/scripts/daily-logging-forms.smoke.ts):
  Micro-Algae saves `temperature = null`; Header/Nursery require temperatures;
  assert actual rendered operation order instead of only editing lines 258-274;
  replace ordinary-save `/protected/home` assertions with same-type URL,
  success message, cleared form, and a second save creating a new row.
- [rbac-tiers.smoke.ts](../.github/skills/e2e-testing/scripts/rbac-tiers.smoke.ts):
  update ordinary-save redirect assertions.
- Health observation: Balding, spine count, and History/ISeaU display.
- Keep invalid-form and Feeding/Star treatment assertions unchanged.

## Verification and release

1. `npx supabase db reset` locally, then the database checks above.
2. `npm run verify`.
3. `npm run test:e2e:plan -- --files <touched-files>`.
4. `npm run test:e2e:preflight` with explicit `E2E_BASE_URL`, then run the full
   E2E suite for all four roles, since this includes schema changes (Tier 3).
5. `npm run check:dead-code` and `git diff --check`.
6. Human-only hosted release:
   1. Apply the migration to Dev with
      `npx supabase db push --db-url "<Dev connection string>"`, then verify with
      `npx supabase migration list --db-url "<Dev connection string>"`.
   2. Test the new app against Dev.
   3. Apply the migration to Production, verify migration list, then deploy app.

**The app must never deploy before its migration.** The shared systems query
would fail and block every Daily Operations form.

## Estimated size

About 19 files (one migration), most of them small edits. Main logic changes are in the
daily-check validator/form and health observation validator/form.
