# Star Treatments Feature Contract

Use this reference when changing entry, corrections, permissions, or reporting.
The implementation lives in `components/star-treatments/`,
`app/protected/star-treatments/`, `lib/validation/star-treatment.ts`, and the
Star treatment migrations. It is not a migration or rollout plan.

## Scope

| Event | Subject | Examples | Table |
| --- | --- | --- | --- |
| System chemical addition | System water | C-Balance, magnesium, buffers | `core.chemical_additions` |
| Star treatment | One named individual star | Probiotics, Reef Dip, topical treatment | `core.star_treatments` |

Probiotics must not be accepted as System chemical additions, including through direct
API writes. Keep dosing counts/charts separate from treatments. Do not add protocols,
dosage calculators, or unconfirmed warning ranges.

Each row represents one treatment for one star. Batch entry saves one row per checked
eligible star, not one row for the tank. Cohorts and non-star animals are excluded.

## Data and invariants

| Field | Contract |
| --- | --- |
| `id` | Serial primary key |
| `animal_id` | Required FK to the treated star |
| `tank_id` | Required treatment-time location snapshot, not the animal's current location at query time |
| `catalog_id` | Optional catalog link; event labels/units remain snapshots |
| `treatment_type` | Nonblank; canonical `probiotics`, `reef_dip`, or normalized custom text |
| `amount`, `unit` | Nullable pair; supplied amount is positive and requires a nonblank unit |
| `concentration`, `concentration_unit` | Nullable pair with the same rule |
| `administered_at` | Actual event time as `timestamptz` |
| `notes` | Optional context |
| `recorded_by`, `data_source`, `entered_at` | Server-owned, immutable attribution/provenance |

At least one numeric pair is required except for Reef Dip, which may omit both.
Absent values have null units. Do not invent amounts when only concentration is known.
Repeated administrations, even at the same timestamp, can be valid; no uniqueness rule
should prohibit them.

Custom labels are trimmed, whitespace-normalized, limited to 100 characters, and compared
case-insensitively with canonical types. Canonical matches save the canonical value;
reports group other labels under **Other** without discarding their display text.
Units default to `mL` and `ppm` but remain editable. Quick-pick catalog retirement/renames
must not rewrite old events.

Creation validates an active, individually tracked star and matching current tank in the
database transaction. Live entry does not allow a date before the current Pacific lab
date; historical imports require reviewed animal/location attribution.

After creation, `animal_id`, `tank_id`, `recorded_by`, `data_source`, and `entered_at`
cannot change. Moving an animal must not move historical treatments. Corrections may
change event time, treatment details, and notes. Wrong-subject/location records require
an Admin/Technician to delete and recreate; updates/deletes retain before/after history
in the project-wide append-only operational audit.

## Permissions

| Role | Read | Create | Update | Delete |
| --- | --- | --- | --- | --- |
| Admin / Technician | Yes | Yes | Any | Hard delete |
| Volunteer | Yes | Yes | Own entries only | No |
| Viewer / unauthenticated | No | No | No | No |

This is narrower than generic operational-log access: Viewer must not see treatment
navigation, forms, or data. Inactive users are blocked. UI hiding supplements, never
replaces, grants and RLS.

Mutations use narrowly granted RPCs, not direct browser table writes. Each function checks
live role/status, eligibility, location, and provenance, uses a fixed safe `search_path`,
revokes default `PUBLIC` execution, and grants only intended native roles. Update/delete
do not require a reason. Restrictive FKs protect history when reference records are
deleted; prefer retiring roster records and display explicit errors.

## Daily Operations

Star treatment belongs after System chemical addition and before Health observation.
Canonical deep link:

`/protected/daily-operations?type=star-treatment&system=<id>&tank=<id>&animal=<id>`

- URL parameters take precedence over the last successfully used system.
- Log-type changes push browser history; subject/filter changes replace it.
- System changes clear tank/star; tank changes clear star. Invalid selections clear only
  the affected selection and descendants, with an inline explanation.
- System/tank scope selects all eligible stars there; selecting one star narrows the
  batch. Staff can uncheck individuals. Names and species identify choices.
- Field order: date/time, system, tank, stars, treatment, amount/unit,
  concentration/unit, notes.
- Probiotics is the default; Reef Dip and Other are available. Other requires text.
- Require valid subjects, type, date/time, positive supplied values, and paired units.
  Focus the first invalid field and preserve inputs after failure.
- Revalidate subjects in the database, prevent double submit, and surface actionable
  errors. Announce changes and success; show a summary naming treated stars.
- After success, retain valid system/tank filters, clear stars and any health-link URL
  parameter, and reset type to Probiotics, numeric/unit fields, notes, and time.
- Use shared 36px (`h-9`) controls, associated field errors, phone-width stacking,
  and keyboard-accessible navigation without inappropriate ARIA tab semantics.

The correction surface supports date, star, and type filters. Immutable fields remain
read-only. Delete confirmation identifies star, treatment, and time, warns that deletion
cannot be undone, and is shown only to Admins/Technicians.

## Reporting and historical data

Use treatment-time tank/system, never current animal location, for reports. Dashboards
and History query `core` directly; do not recreate an analytics fact schema.
Historical Probiotics without a named star must remain unresolved source data.
For Graham, use the reviewed CSV bundle and its README under `supabase/seeds/`, not
historical schema-wipe instructions. Real-data imports are separate human-run Tier 4
operations with a fresh backup, source checks, and duplicate protection.

Optional health-observation links and duplicate warnings require the decisions in
[implementation-checklist.md](implementation-checklist.md#historical-imports-and-star-treatments).
Do not treat this contract as proof that every reporting integration is implemented.

## Verification

Schema/RLS changes require Tier 3 verification under
[testing-strategy.md](testing-strategy.md): validation boundaries, stale selections,
batch rows, treatment-time location after moves, immutable provenance, direct-write
rejection, all roles, RPC lifecycle, deep links, double-submit behavior, and phone/keyboard
accessibility. Check saved rows/timestamps directly in Supabase and confirm treatments do
not alter chemical-addition counts. Real-data reconciliation additionally requires Tier 4.
