---
description: "Implement the approved SSL Data Collection architecture, integrity, UI consistency, duplication-reduction, dead-code, and performance roadmap in priority order."
name: "Implement SSL Efficiency Roadmap"
argument-hint: "Priority or phase to implement (for example: 'P0 audit trail and provenance'); omit to review the roadmap"
agent: "ssl-lead"
---

# Implement the SSL efficiency roadmap

Implement the approved roadmap below. If `${input}` names a priority or phase, work only
on that slice and its required verification. Otherwise, summarize current repository
status against the roadmap and ask which phase to begin.

Follow [AGENTS.md](../../AGENTS.md), the risk tiers in
[docs/testing-strategy.md](../../docs/testing-strategy.md), and the current backlog in
[docs/implementation-checklist.md](../../docs/implementation-checklist.md). Delegate
schema/RLS work to `schema-migrator`, form/dashboard work to `form-builder`, and required
end-to-end verification to `e2e-verifier`.

## Approved architecture decisions

- The database is authoritative for systems, species, operational defaults, and target
  ranges. Do not duplicate mutable database metadata in TypeScript config.
- Unauthenticated users may access only the landing page and authentication flow. The
  landing page may retain its static public list of system names, but must not query or
  expose protected operational records.
- Interpret user-entered event date/time values in `America/Los_Angeles`, store the
  resulting instant as `timestamptz`, and display operational timestamps in Pacific time.
- Reject nonexistent spring-forward wall times. Resolve an ambiguous fall-back time to
  its earlier occurrence.
- Keep one wide `water_quality_readings` row per testing session. Measurements remain
  nullable numeric columns; `NULL` means no numeric result was recorded. Do not add a
  generalized analyte catalog or a "not detected" state.
- Admins and Technicians define optional lab-wide or per-system water-quality target
  ranges through a management UI. Ship with no seeded ranges; a system-specific range
  overrides the lab-wide range. Bounds are inclusive and may be one-sided. Out-of-range
  values remain valid but show a warning and require the existing Notes field before
  saving. Range changes do not rewrite or invalidate historical readings.
- Database-owned Chemical addition quick picks are `C-Balance`, `Mg`, and `DI-Trace`, each
  defaulting to `mL`. Database-owned Star treatment quick picks are `Probiotics`, with
  amount unit `mL` and concentration unit `ppm`, and `Reef Dip`, with no defaults yet.
  Reef Dip may be saved with neither amount nor concentration. Defaults are suggestions
  that users may override. Keep free-text entry.
- Quick picks are lab-wide. Do not add manufacturer, lot, expiration, review-queue, or
  active/retired behavior. Admins manage quick picks. Events keep a nullable catalog
  reference plus immutable entered-name/unit snapshots; prevent deletion of a referenced
  quick pick, and do not rewrite historical snapshots after a rename.
- Admin and Technician may update and delete operational entries. Volunteer may create
  entries and update only entries they recorded; Volunteer may not delete. Viewer is
  read-only under the general role contract, while existing Star treatment visibility
  remains narrower.
- Maintain an append-only audit trail for operational updates and deletes. Record the
  table, row identity, action, old/new values, actor, and timestamp. Clients cannot write,
  update, or delete audit records.
- Keep the existing analytics schema for later population. Operational features must not
  depend on it until a synchronization design is implemented.
- Prefer typed functions, immutable data, hooks, schema composition, and React component
  composition. Use classes only where identity, lifecycle, mutable state, or meaningful
  invariants justify them; do not preserve trivial wrapper classes merely to appear OOP.

## P0 - Security and data integrity

1. Align grants, RLS, UI capabilities, tests, and docs with the approved role contract.
2. Protect `recorded_by`, `entered_at`, and `data_source` from client overrides using
   server-controlled database mutations.
3. Add the append-only update/delete audit trail and Admin-readable audit access.
4. Replace destructive reference-data cascades with restrictions that preserve history.
5. Keep public routes and Data API access from exposing protected operational metadata.

This is Tier 3. Use additive migrations, apply them to scratch/staging first, run database
advisors, verify all four roles directly, and run the complete e2e skill.

## P1 - Database ownership and operational rules

Implement this database/operational section before the separate P1 UI-consistency section.
The hosted P0 push/e2e gate is explicitly deferred for now; do not push it without renewed
permission, but keep P1 changes local and compatible with the pending P0 migration.

1. Query systems and species from the database throughout authenticated application code.
  Order systems alphabetically by database-owned name, with an ID tie-breaker; do not add
  separate ordering metadata or config. Remove duplicated runtime constants only after all
  consumers are migrated. Keep the static system-name list on the public landing page.
2. Create one shared, DST-aware Pacific date/time implementation and adopt it across all
   operational forms, corrections, and displays.
3. Preserve the wide water-quality table and its fixed units: pH unitless; salinity `ppt`;
  magnesium, ammonia, calcium, phosphate, and nitrate `ppm`; nitrite `ppb`; alkalinity
  `dKH`. Salinity is an official weekly-panel parameter.
4. Add Admin/Technician-managed target ranges with optional per-system overrides and no
  seeded values. Enforce the existing Notes field for out-of-range submissions on the
  server as well as in the UI; do nothing when no applicable range is configured.
5. Add Admin-managed database quick-pick definitions, nullable event references, immutable
  event snapshots, and the approved default units for Chemical additions and Star
  treatments while preserving editable units and free-text entry.

Schema/RLS portions are Tier 3 and require the complete e2e skill. UI adoption against the
completed contract is Tier 2: pass the files touched in that slice to the e2e selector and
run its selected sections, escalating to the complete suite when directed.

## P1 - UI consistency and duplication reduction

1. Use the Star Treatment flow as the interaction baseline for older operational forms:
   44-pixel targets, field-linked errors, live status, URL/last-used-system precedence,
   responsive layouts, and consistent save behavior.
2. Extract shared Pacific date/time fields, reusable Zod fragments, field errors, form
   status, and select/textarea primitives.
3. Centralize stable labels and dashboard formatting. Keep domain payload mapping and
   forms explicit; do not build a universal metadata-driven form.
4. Conform typography, semantic colors, numeric formatting, keyboard behavior, and chart
   accessibility to [docs/style-guide.md](../../docs/style-guide.md).

This is Tier 2. Run focused checks after each small edit, then pass only that slice's touched
files to the e2e selector and run the selected sections before a PR. Run the complete suite
when the selector escalates a broad/shared change.

## P2 - Dead code and maintainability

1. Establish a clean baseline with `npm run lint`, `npx tsc --noEmit`, and
   `npm run build`.
2. Run a dead-file/export scan and confirm every candidate against imports, Next.js route
   conventions, scripts, migration history, and documented future work.
3. Delete the duplicate Settings layout and unused model wrappers after confirmation.
4. Adopt or remove the unused shared-form module; do not leave speculative helpers.
5. Retain documented future routes such as History and all applied migration/history
   artifacts.
6. Enable stricter unused-symbol checks where compatible with the framework.

Pure deletion and visual cleanup are Tier 1. Any shared form or behavioral refactor is
Tier 2.

## P2 - Measured performance

1. Measure Home and Systems query count, latency, returned rows, server-component payload,
   and client hydration cost before changing behavior.
2. Remove overlapping queries where an existing result can safely derive the same value.
3. Separate data loading, pure derivation, and rendering in oversized pages.
4. Add or change indexes only from measured query plans.

Treat query behavior changes as Tier 2 and schema/index changes as Tier 3.

## P3 - Deferred work

- Populate analytics only after defining its synchronization and freshness contract.
- Build audit-history UI, History browsing, exports, scheduling, and imports after the
  integrity foundation is complete.
- Do not implement behavior still blocked on feeding cadence, health severity/photo rules,
  empty health observations, nickname reuse, or Apex coverage.

## Required execution order

1. Authorization, provenance, audit trail, and deletion safety.
2. Database-owned systems/species and Pacific timestamps.
3. Water-quality targets and database-owned quick picks.
4. Form and dashboard consistency.
5. Dead-code and duplication cleanup.
6. Performance measurement and optimization.

For every selected phase, inspect the nearest owning code and tests, make the smallest
coherent change, validate immediately, update relevant documentation and the implementation
checklist, and report completed work plus any `BLOCKED` human decisions. Never push or merge.