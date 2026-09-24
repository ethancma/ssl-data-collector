# Implementation Status And Backlog

> Current as of 2026-09-24. This is the single source of truth for delivery status and
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
- [x] Star treatment table, RPC-only create/update/delete lifecycle, role-gated form,
      treatment-time location snapshot, filtered correction surface, and focused smoke tests.
- [x] Reviewed Graham import bundle prepared with 270 water-quality rows and 242 CBalance
      rows; historical Probiotics rows are excluded pending named-star attribution.
- [x] Settings UI for display-name and password changes.

## Data Integrity And Access Control

These are the highest-priority open items because they affect data ownership or history.

- [ ] Establish one authoritative generic role contract and align migrations, UI, tests,
      and docs. Effective native grants currently give Admin/Technician full mutation,
      Volunteer read/create/update without delete, and Viewer read-only; some UI and RBAC
      tests still assume different behavior. Star treatments intentionally hide all access
      from Viewer.
- [ ] Protect `recorded_by`, `data_source`, `entered_at`, and event time on ordinary logs.
      Current native-role policies permit direct clients to override provenance; Star
      treatment RPCs already demonstrate the intended pattern.
- [ ] Scope later Storage policies explicitly to the private `attachments` bucket.
- [ ] Replace destructive reference-data cascades with a retirement/restriction policy so
      deleting systems, tanks, or animals cannot erase operational history.
- [ ] Enforce the System chemical addition boundary in the database: reject Probiotics,
      require positive amounts and nonblank names/units, and repair the currently skipped
      Star treatment boundary test.
- [ ] Make required health photos atomic with observation creation; an upload failure can
      currently leave an observation without its required attachment.
- [ ] Reconcile smoke-test drift: old `/protected/today` URLs, outdated control labels,
      the stale Volunteer-insert expectation, and the nonexistent migration reference in
      the RBAC suite.
- [ ] Decide how quickly denial or role changes must revoke an already-issued native-role
      JWT, then enforce and test that behavior.

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
- [ ] **BLOCKED:** add nonblocking water-quality range warnings after staff confirms target
      ranges and whether they vary by system or species.
- [ ] Confirm salinity as an official ninth weekly water-quality parameter and update the
      requirements and analytics schema consistently.
- [ ] Build the Micro-Algae production log.
- [ ] Extend last-used-system defaults, field-linked errors, live announcements, and
      44-pixel touch targets from Star treatments to the older forms.
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

## Star Treatment Closure

- [x] Core schema, eligibility rules, provenance, treatment-time tank snapshot, and indexes.
- [x] Admin/Technician/Volunteer create and update; Admin/Technician hard delete; Viewer and
      unauthenticated access blocked.
- [x] URL-backed form and filtered correction/history surface.
- [ ] Complete the System chemical addition database guard and rerun the full Star treatment
      smoke suite without schema-gated skips.
- [ ] Confirm hosted migration state and complete the separate human-run Tier 4 Graham
      cleanup/import after a fresh backup and source-row spot checks.
- [ ] Deferred: general History, Home/Systems activity, export/timeline integration,
      health-observation links, and duplicate-treatment warnings.

## Staff Decisions

The full context for these questions is in
[lab-operations-plan.md](lab-operations-plan.md#8-open-questions--further-considerations).

- [ ] Feeding cadence by system/species/life stage.
- [ ] Water-quality target ranges and whether they vary by system/species.
- [ ] Health severity criteria and additional photo-required thresholds.
- [ ] Whether empty health observations are valid.
- [ ] Whether salinity is part of the official weekly panel.
- [ ] Animal nickname reuse after death or transfer.
- [ ] Whether the current Volunteer permissions are the intended product contract.
- [ ] Remaining Apex probe coverage.
- [ ] Historical data coverage and paper-backfill ownership/deadline.

## Rollout And Operations

- [ ] Tablet/mobile QA at real lab stations.
- [ ] Pilot with one or two systems for a week.
- [ ] Hands-on training and station QR-code placement.
- [ ] Verify automated backups before any Tier 4 data operation.
- [ ] Wire GitHub and Vercel agent access; wire Resend when maintenance scheduling starts.
- [ ] Optional: add Sentry monitoring.
