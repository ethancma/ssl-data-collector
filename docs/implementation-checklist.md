# Implementation Checklist

> Actionable, priority-ordered punch list derived from the roadmap in
> [platform-architecture.md](platform-architecture.md) §6 and the operational details
> in [lab-operations-plan.md](lab-operations-plan.md). Check items off as they land;
> keep this in sync if priorities shift. Items marked **BLOCKED** need an open question
> answered first (see each doc's Open Questions section) before they can be built
> correctly — don't guess at the values, confirm with staff.

## 0. Connect the Supabase project (do first)

- [ ] `supabase login` and `supabase link --project-ref bqylxmsifagnztxhixyl`
- [ ] Copy Project Settings → API URL/keys into a local `.env` (never commit; `.env` is
      already gitignored) matching `.env.example`
- [ ] Decide local-dev workflow: local Supabase (`supabase start`, Docker) with
      migrations pushed to the hosted project, vs. developing directly against the
      hosted project. Local + migrations is recommended so schema changes are
      versioned and repeatable.
- [ ] Add Supabase access to agent dev tools per
      [agent-dev-tools.md](agent-dev-tools.md) (currently "not yet wired")

## 1. Foundations — schema, RLS, auth

- [ ] Write the initial migration for all core tables from the
      [data model](platform-architecture.md#4-data-model): `profiles`, `systems`,
      `tanks`, `species`, `animals`, `animal_movements`, `water_quality_readings`,
      `chemical_additions`, `daily_checks`, `microalgae_logs`, `health_observations`,
      `feeding_logs`, `maintenance_tasks`, `maintenance_logs`, `attachments`
- [ ] Add enums: `profiles.role` (admin|technician|volunteer|viewer),
      `profiles.status` (pending|active), `data_source` (live|historical_import|
      paper_backfill), `ph_source` (manual|apex_probe), `tank_type`, `issue` types,
      `food_type`, `task_type`
- [ ] Set up Supabase Storage bucket for `attachments` (health observation photos,
      scanned paper logs)
- [ ] RLS policies per [§5 Roles & Permissions](platform-architecture.md#5-roles--permissions):
      Admin (full), Technician/Volunteer (insert all logs + read all — identical for
      now), Viewer (read-only)
- [ ] Google OAuth wired through Supabase Auth
- [ ] Admin-approval gate: new sign-ins land as `status = pending`; approval UI/flow
      before a `profiles` row gets a role and data access
- [ ] Deploy Next.js scaffold to Vercel (confirm hosting decision is still Vercel per
      decisions log)

## 2. Reference data & admin

- [ ] Seed the 8 real systems (incl. confirmed "Snack Shack" spelling), tanks
      (including `pair_group` for the 8 larval pairs), and species
- [ ] Admin CRUD UI: systems, tanks, species, animals (with unique lab-wide `name`
      nickname field)
- [ ] User management/approval UI (list pending sign-ins, assign role)

## 3. Daily operational logging (parallelizable once §1–2 are done)

- [ ] AM/PM check form (water running, temperature, notes) + "flag issue" control
      that opens a linked, savable-as-draft health observation
- [ ] Health observation form: issue multi-select, photo upload — **BLOCKED**: severity
      scale labels/thresholds and which issue types beyond arm-drop/spine-drop/lesion
      require a mandatory photo need to be defined first
- [ ] Feeding log form, logged per individual named animal (not bulk per tank) —
      **BLOCKED**: real per-system/species feeding cadence needed before building any
      "due today" logic (the form itself can be built now; the schedule/reminder logic
      should wait)
- [ ] Same-day consumption follow-up, per animal, rolled into the PM check
- [ ] Water quality reading form (6 params, weekly cadence) + chemical addition log —
      **BLOCKED (validation only)**: inline range validation needs real target ranges
      per parameter; the form itself doesn't need to wait
- [ ] Micro-Algae production log (density/turbidity, harvest volume, condition notes)
- [ ] Shared form UX: default to today's date/last-used system, numeric-keypad inputs,
      multi-select checklists (not free text), inline range flags that warn, not block

## 4. "Today" dashboard

- [ ] Per-system checklist of what's done/outstanding today (AM/PM, feeding, water
      quality due this week)
- [ ] Surface flagged-but-incomplete health observations from AM/PM checks somewhere
      reachable (not a nag, but discoverable — confirm exact placement when built)
- [ ] QR code / deep link per system station → that system's daily forms

## 5. Historical data migration tooling

- [ ] **BLOCKED**: inventory exactly which systems/date ranges exist in Sheets vs.
      paper vs. not recorded, before building import tooling for data that may not
      exist
- [ ] Admin-only CSV import with column-mapping to the matching table, tagged
      `data_source = historical_import`
- [ ] Grid/spreadsheet-style backfill entry mode for paper logs, tagged
      `data_source = paper_backfill`, with optional photo-of-original-sheet attachment

## 6. Maintenance scheduling

- [ ] Task config: recurrence interval configurable per system (not shared per task
      type), task types (filter_change|sump_flush|other)
- [ ] Maintenance log entry + due/overdue dashboard badges
- [ ] Scheduled email reminders (Resend) to Admins only

## 7. Dashboards & analytics

- [ ] **Priority trend view**: per-system overlay chart — water chemistry lines
      (pH, magnesium, ammonia, alkalinity, calcium, phosphate) + health-observation
      event markers on the same timeline, all `data_source` values shown together
- [ ] Additional trend charts per system/parameter with chemical-addition overlays
- [ ] Correlation exploration view (water quality vs. health-observation frequency)
- [ ] CSV export of raw tables (plain CSV confirmed sufficient — no Darwin Core needed)

## 8. Polish & rollout

- [ ] Tablet/mobile QA at real lab stations
- [ ] Pilot with 1–2 systems for a week before full rollout
- [ ] Hands-on training at tank stations
- [ ] Verify automated backups
- [ ] Optional: Sentry error monitoring

## Cross-cutting blockers to resolve with staff (don't block coding, but do block correctness)

- Feeding cadence per system/species/life stage
- Water quality target/safe ranges per parameter
- Health observation severity scale (labels/criteria) + photo-required thresholds
- Animal nickname reuse policy after death/transfer
- Volunteer role permission differences vs. Technician (if any)
- Remaining Apex probe coverage (only Graham/Wholey confirmed so far)
- Historical data inventory (Sheets/paper date ranges and coverage)
