---
name: feature-data-wiring
description: "Wire SSL features to real Supabase data. Use when replacing mocks, adding database-backed loaders/forms, changing shared domain values (severity, units, status), or fixing cross-page data consistency. Not for copy-only, CSS polish, or isolated pure helpers."
---

# Feature data wiring

## Route first

Start at the matching [README file-map row](../../../README.md#file-map), not an
open-ended search. Read the nearest loader, pure helper, validator, and matching test.
Keep [AGENTS.md](../../../AGENTS.md) as the authority for safety and implementation patterns.

## Contract before code

1. Write measurable acceptance criteria in session state: qualifying records, inclusive
   thresholds, time window/boundary, null behavior, role visibility, and expected UI/output.
   Ask about ambiguous product behavior; do not infer it from mock data.
2. Map each displayed/written field to the actual migration-backed table/column and source
   timestamp. Migrations are authoritative; the architecture diagram also lists unimplemented
   requirements. Do not invent tables, movement history, catalogs, ranges, or BLOCKED values.
3. Identify every consumer of changed domain values: input/validation, persisted rows,
   loader/derivation, Home/Systems/ISeaU, History/CSV, and fixtures/tests. Search exact identifiers
   in those mapped surfaces; update only consumers that actually depend on the change.

## Implement in pattern

- Copy the closest existing loader and shared form pieces. Separate Supabase reads from pure
  transformations; extend matching unit tests rather than hiding logic in React.
- Use existing Supabase clients, reference-data constants, and Pacific date/time helpers.
- Handle PostgREST row limits with deterministic pagination; preserve errors and role filtering.
- Check numeric/string/null conversions and finite values. Missing data is not zero.
- Use recorded event-location snapshots for historical displays; do not silently attribute old
  events to the animal's current tank or claim inferred snapshots are exact movement history.
- Preserve event time, entry time, provenance, recorder, and correction behavior.
- For SQL/schema/RLS work, load the existing Postgres and migration skills before authoring SQL.
  Hosted changes remain human-operated.

## Verify the contract

1. Test exact thresholds, window boundaries, healthy follow-ups, missing data, location
   changes, and ordering where applicable. Include pagination beyond one page when required.
2. Run `npm run verify`. Select browser sections from this session's touched files using
   [e2e-testing](../e2e-testing/SKILL.md); its target preflight precedes writes.
3. Use deterministic synthetic Local/Dev fixtures, never copied production observations
   or a magic animal name. Confirm both UI behavior and the actual stored rows.
4. Report exact commands/results and uncovered cases. Use
   [prepare-pr](../../prompts/prepare-pr.prompt.md) before PR preparation.
