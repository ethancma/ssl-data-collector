# Unresolved Requirements And Implementation Constraints

This file retains requirements that affect implementation, not delivery status or a
sequenced backlog. The filename is retained for existing code and agent references.
Do not invent values marked **BLOCKED**. Lab context and staff questions live in
[lab-operations-plan.md](lab-operations-plan.md); hosting and release procedures live in
[workers-deployment.md](workers-deployment.md).

## Staff Decisions

- **BLOCKED: feeding cadence.** Staff must supply schedules by system/species/life stage.
  Settings supports weekday schedules with tank overrides; no cadences are seeded.
- Health severity is a whole-number score from 1 (healthy) to 5 (dead), matching the
  historical heat-map scores. Dashboards treat 2 as watch and 3-5 as attention. Photos
  are always optional.
- **BLOCKED: empty health observations.** Confirm whether selecting no issues is valid.
- **BLOCKED: nickname reuse.** Confirm whether names may be reused after death or transfer.
  Current names are unique lab-wide.
- **BLOCKED: Apex coverage.** Only Graham and Wholey pH probes are confirmed.
- **BLOCKED: historical sources.** Inventory systems, date ranges, and Sheets/paper coverage;
  identify the paper-backfill owner and deadline before building import workflows.
- Water-quality ranges are optional lab-wide values with per-system overrides, configured
  by Admins/Technicians with no seeded numeric defaults. Salinity is part of the weekly
  panel and uses `ppt`.
- Volunteer permissions are lab-wide read/create, update only their own entries without
  time/provenance-source restrictions, and no delete. Star treatments exclude Viewer access.

## Health Photos And Follow-Ups

Photo uploads are not atomic with observation creation: upload failure can leave
an observation without its attachment. A reliable implementation must support retry and
reconciliation without duplicate observations. Image-processing requirements are retained
in [workers-deployment.md](workers-deployment.md#photo-processing-and-recovery-requirements).

The daily-check **Flag issue** requirement calls for a linked health follow-up that may
remain incomplete and visibly flagged on the check; it does not require a separate
dashboard notification. The relationship is not implemented.

## Domain Extensions

These are requirements, not claims that the corresponding tables or workflows exist:

- Animal movements must preserve location history rather than rewrite historical events.
- Larval cone-bottom pairs are the cohort logging unit.
- Micro-Algae production needs timestamped density, harvest volume, and condition notes.
- Recurring maintenance is configured per system, with due/overdue state; reminder digests
  go only to Admins/lead techs, not all volunteers and technicians.
- Station deep links should open system-filtered Daily Operations.
- Chemistry timelines need health-event markers for correlation; export format is plain CSV.

## Historical Imports And Star Treatments

Keep import event time separate from entry time and tag rows as `import` or
`paper_backfill`. Reusable import tools need durable batch/source-row identity to prevent
duplicates; `data_source` alone is insufficient. Paper backfill should support grid entry
and optional source-sheet photos.

Historical Probiotics records without a named treated star cannot become Star treatments
or System chemical additions. Preserve unresolved source records until staff supplies
attribution. Use the reviewed bundle's own instructions for Graham imports, not an old
schema-rebuild plan. Real-data operations remain human-run Tier 4 work with a fresh backup.

Optional treatment-to-health links require explicit cardinality, permission, and workflow
decisions. Duplicate-treatment warnings require a staff-approved time window; do not add
an arbitrary threshold or dosage warning range.
