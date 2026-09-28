# Implementation Status And Backlog

> Current as of 2026-09-26. This is the single source of truth for delivery status and
> remaining work. Product context lives in
> [platform-architecture.md](platform-architecture.md), lab requirements and staff
> decisions live in [lab-operations-plan.md](lab-operations-plan.md), and verification
> depth is defined in [testing-strategy.md](testing-strategy.md).
>
> Checked items are demonstrable from the repository. They are not claims about hosted
> deployment state unless explicitly stated. Items marked **BLOCKED** need a staff or
> product decision before their behavior can be finalized.

## Delivered

- [x] Supabase CLI access is linked to project `bqylxmsifagnztxhixyl`; local credentials
      are configured in the ignored `.env.local`, and the migration workflow is documented.
- [x] Core reference schema: profiles, systems, tanks, species, and animals.
- [x] Operational schema: daily checks, water quality, chemical additions, health
      observations and attachments, feeding, ad-hoc maintenance logs, and Star treatments.
- [x] Controlled vocabularies use text plus database `CHECK` constraints; operational
      records distinguish event time, entry time, and `live|import|paper_backfill` provenance.
- [x] Private attachment storage bucket and initial health-photo workflow.
- [x] Email/password auth, pending-account gate, Admin approval/denial, role assignment,
      and Admin user-management UI.
- [x] Eight systems and the current species list are seeded, including the confirmed
      **Snack Shack** spelling. Graham tank categories and SSL25 are also seeded.
- [x] Daily Operations hub with URL-backed selection and persisted forms for AM/PM checks,
      individual feeding, same-day PM consumption, water quality, System chemical
      additions, health observations/photos, maintenance, and Star treatments.
- [x] Home dashboard with daily AM/PM, feeding, water-quality, recent-health, and activity
      summaries.
- [x] Systems dashboard with system selection, chemistry charts, comparisons, status, and
      an operational highlights feed.
- [x] Authenticated system/species consumers query database-owned reference data; systems
      sort alphabetically by database-owned name with an ID tie-breaker. The static public
      landing-page list remains an intentional non-operational exception.
- [x] Shared `America/Los_Angeles` date/time conversion and display across operational
      forms, corrections, dashboards, and charts, including spring-gap rejection and
      earlier-occurrence fall-back handling.
- [x] Star treatment table, RPC-only create/update/delete lifecycle, role-gated form,
      treatment-time location snapshot, filtered correction surface, and focused smoke tests.
- [x] Reviewed Graham import bundle prepared with 270 water-quality rows and 242 CBalance
      rows; historical Probiotics rows are excluded pending named-star attribution.
- [x] Settings UI for display-name and password changes.

## Data Integrity And Access Control

These are the highest-priority open items because they affect data ownership or history.

- [x] Establish one authoritative generic role contract and align migrations, UI, tests,
      and docs. Admin/Technician have full mutation, Volunteer has read/create plus update
      of their own entries without delete, and Viewer is read-only. Star treatments
      intentionally hide all access from Viewer.
- [x] Protect `recorded_by`, `data_source`, and `entered_at` on ordinary logs. Live writes
      derive provenance from the active profile and server time; provenance remains
      immutable while authorized event-time corrections are retained in the audit trail.
- [x] Add an append-only, trigger-written operational audit for updates and deletes with
      Admin/Technician read access and immutable actor/before/after history.
- [x] Scope Storage policies explicitly to the private `attachments` bucket and restrict
      Volunteer object updates to objects they own.
- [x] Replace destructive reference-data cascades into operational logs with restrictive
      foreign keys so deleting systems, tanks, or animals cannot erase operational history.
- [x] Enforce the System chemical addition boundary in the database: reject Probiotics,
      require positive amounts and nonblank names/units, and repair the currently skipped
      Star treatment boundary behavior locally.
- [ ] Make required health photos atomic with observation creation; an upload failure can
      currently leave an observation without its required attachment.
- [ ] Complete hosted smoke-test reconciliation. The Volunteer contract and migration
      reference are corrected locally; old URLs/control labels still require the full
      post-migration hosted e2e pass.
- [x] Refresh native-role JWT claims on the user's next application request after a role or
      status change; persistent mismatches fail closed and inactive/invalid profiles fall
      back to the non-privileged `authenticated` claim.

## Foundations And Reference Data

- [ ] Add the planned `animal_movements`, `microalgae_logs`, and `maintenance_tasks` tables.
- [ ] Add the daily-check-to-health-follow-up relationship if the flagged follow-up workflow
      remains part of the product contract.
- [ ] Seed the complete tank inventory, Larval pair groups, and real animal roster; verify
      provisional scientific names before rollout.
- [ ] Build Admin CRUD/retirement UI for systems, tanks, species, and animals.
- [ ] Configure Google OAuth in Supabase and add the application sign-in path.
- [ ] Confirm the Vercel project/deployment and wire preview/runtime log access for agents.
- [ ] Decide whether the existing unsynchronized `analytics` schema should be populated or
      removed until a synchronization pipeline is designed.

## Daily Operations

- [ ] Add the Daily check **Flag issue** flow, linked draft health observation, and a
      discoverable incomplete-follow-up surface.
- [ ] **BLOCKED:** confirm whether a health observation with no selected issues is valid.
- [ ] **BLOCKED:** define severity criteria and photo thresholds beyond arm drop, spine drop,
      and lesion. `Low|Medium|High` currently exists as a provisional implementation.
- [ ] **BLOCKED:** encode feeding due-today logic after staff confirms cadence by system,
      species, and life stage.
- [x] Add optional Admin/Technician-managed lab-wide water-quality ranges with per-system
      overrides. Ship with no seeded values; out-of-range entries require the existing
      Notes field, and range changes do not rewrite historical readings.
- [x] Add Admin-managed database quick picks for Chemical additions and Star treatments,
      preserving free-text entry and immutable event snapshots. Reef Dip may be recorded
      without amount or concentration.
- [x] Confirm salinity as the official ninth weekly water-quality parameter. Its fixed unit
      is `ppt`; analytics alignment remains deferred until that schema is populated.
- [ ] Build the Micro-Algae production log.
- [ ] Extend last-used-system defaults, field-linked errors, and live announcements from
      Star treatments to the older forms. Form controls use a uniform 36px (`h-9`) height
      across all Daily Operations forms.
- [ ] Add the explicit **Log a star treatment instead** path from System chemical addition.

## Dashboards, History, And Imports

- [ ] Make Home completion logic cadence-aware. Water quality currently uses a 14-day
      recency window, and feeding completion means any feeding for the system that day.
- [ ] Add station QR codes/deep links for system-filtered Daily Operations.
- [ ] Add health-observation markers to the priority per-system chemistry timeline.
- [ ] Add chemical-addition overlays, correlation exploration, and plain CSV export.
- [ ] Replace the placeholder History route with cross-log browsing and expose it in
      navigation when ready.
- [ ] **BLOCKED:** inventory historical source coverage by system, date range, and medium.
- [ ] Build Admin CSV column-mapping and paper-backfill grid tooling with durable import
      batch/source-row identity.
- [ ] Resolve each excluded historical Probiotics row to a named star, or preserve it as an
      unresolved source record without importing it as a treatment.

## Maintenance

- [x] Ad-hoc maintenance event entry.
- [ ] Add per-system recurrence/task configuration and due/overdue dashboard badges.
- [ ] Add scheduled Resend reminders to Admins/lead techs only.

## Engineering Maintainability

- [x] Add a deterministic changed-file e2e selector with explicit session-file input,
      dry-run reasoning, focused credential-free unit tests, conservative full-suite
      escalation, and a documented full-suite escape hatch.

## Star Treatment Closure

- [x] Core schema, eligibility rules, provenance, treatment-time tank snapshot, and indexes.
- [x] Admin/Technician update any treatment; Volunteer updates only treatments they
      recorded; Admin/Technician hard delete; Viewer and unauthenticated access are blocked.
- [x] URL-backed form and filtered correction/history surface.
- [x] Complete the System chemical addition database guard locally.
- [ ] Rerun the full Star treatment smoke suite without schema-gated skips after the P0/P1
      migrations are available to the test application environment.
- [ ] Confirm hosted migration state and complete the separate human-run Tier 4 Graham
      cleanup/import after a fresh backup and source-row spot checks.
- [ ] Deferred: general History, Home/Systems activity, export/timeline integration,
      health-observation links, and duplicate-treatment warnings.

## Staff Decisions

The full context for these questions is in
[lab-operations-plan.md](lab-operations-plan.md#8-open-questions--further-considerations).

- [ ] Feeding cadence by system/species/life stage.
- [x] Water-quality target-range model: optional lab-wide values with per-system overrides,
      configured later by Admins or Technicians with no seeded defaults.
- [ ] Health severity criteria and additional photo-required thresholds.
- [ ] Whether empty health observations are valid.
- [x] Salinity is part of the official weekly panel and uses `ppt`.
- [ ] Animal nickname reuse after death or transfer.
- [x] Volunteer permissions: lab-wide read/create, update any entry attributed to their
      profile with no time or provenance-source limit, and no delete.
- [ ] Remaining Apex probe coverage.
- [ ] Historical data coverage and paper-backfill ownership/deadline.

## Rollout And Operations

- [ ] Tablet/mobile QA at real lab stations.
- [ ] Pilot with one or two systems for a week.
- [ ] Hands-on training and station QR-code placement.
- [ ] Verify automated backups before any Tier 4 data operation.
- [ ] Wire GitHub and Vercel agent access; wire Resend when maintenance scheduling starts.
- [ ] Optional: add Sentry monitoring.
