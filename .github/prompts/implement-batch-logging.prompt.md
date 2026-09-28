---
description: "Implement system/tank-scoped batch logging with per-animal exclusions for Feeding and Star treatments in Daily Operations, following the approved decisions."
name: "Implement Batch Feeding And Star Treatment Logging"
argument-hint: "Slice to implement (for example: 'schema', 'ui', 'verify'); omit to run all slices in order"
agent: "ssl-lead"
---

# Implement batch Feeding and Star treatment logging

Implement the approved design below. If `${input}` names a slice (`schema`, `ui`, or
`verify`), work only on that slice. Otherwise run all three in order: schema first, then UI,
then verification.

Follow [AGENTS.md](../../AGENTS.md), [docs/testing-strategy.md](../../docs/testing-strategy.md),
and [docs/implementation-checklist.md](../../docs/implementation-checklist.md). Delegate
schema/RPC work to `schema-migrator`, form work to `form-builder`, and end-to-end
verification to `e2e-verifier`. This is a **Tier 3** change.

## Approved product decisions

- **Generic scope.** Every system works the same way; no Graham- or tank-name logic.
  - System only: every eligible subject in the system.
  - System + tank: every eligible subject in that tank.
  - System + tank + animal: one subject (kept for deep links).
- **One row per animal.** A batch writes one ordinary `feeding_logs` or `star_treatments`
  row per included animal. No multi-animal rows.
- **Amount is per animal.** Feeding amount and Star treatment amount/concentration apply to
  each animal and are copied unchanged to every row. Never divide a total across animals.
- **Exclusions are allowed.** Eligible animals appear as a checklist, all checked by
  default. Unchecking an animal excludes it from the save.
- **Exclusion reasons use the existing Notes field.** Do not add a per-animal reason field.
  The Notes value is saved on every created row, like the other shared values.
- **Home shows nothing about exclusions for now.** Do not change Home completion logic or
  add "not fed" or "excluded" indicators.
- **Eligibility.**
  - Feeding: all active animal records in scope, including cohorts (one cohort = one logging
    unit). Do not filter by feeding cadence; that decision is still BLOCKED.
  - Star treatment: active, individually tracked animals whose species category is `star`.

## Schema and RPC contract (`schema-migrator`)

- Add a new additive migration; do not amend shipped migrations. Use
  `supabase migration new <name>` to create it.
- Add `create_feeding_batch(...)` and `create_star_treatment_batch(...)` RPCs. Inputs:
  request UUID, system ID, optional tank ID, optional animal ID, included animal IDs,
  excluded animal IDs, and the existing form fields for that log type.
- In one transaction:
  1. Validate the active caller and role. Admin, Technician, and Volunteer may create;
     Viewer may not. Star treatments stay hidden from Viewer entirely.
  2. Validate that the tank belongs to the system and the animal belongs to the scope.
  3. Resolve the current eligible set server-side and lock those animal rows `FOR SHARE`.
  4. Reject unless included ∪ excluded exactly equals the eligible set, the two sets do not
     overlap, and at least one animal is included. A mismatch is a stale-preview error.
  5. Insert one row per included animal, snapshotting each animal's current `tank_id`.
  6. Reject a scope with zero eligible animals instead of reporting success.
- Any failure rolls back every row.
- Keep server-owned provenance (`recorded_by`, `entered_at`, `data_source = 'live'`) and
  existing validation: feeding keeps its current date behavior, and Star treatments keep the
  current-Pacific-date restriction, catalog snapshots, and Reef Dip exception.
- Add an append-only `core.operational_batch_requests` ledger for request UUID, operation
  type, system/tank/animal scope, canonical payload (including notes), included and excluded
  animal IDs, actor, server timestamp, and stored result. Only Admin and Technician may read
  it directly; clients may not write it.
- Add nullable `batch_id` references on both log tables, plus partial unique indexes on
  `(batch_id, animal_id)`.
- Idempotency: replaying the same request UUID with the same payload returns the stored
  result without writing again. Reusing a UUID with a different payload or actor fails. A
  new UUID may repeat a treatment intentionally.
- Return `request_id`, `replayed`, `created_count`, `excluded_animal_ids`, and `records`
  (`id`, `animal_id`, `tank_id` for each row).
- Use `SECURITY DEFINER` only with a fixed `search_path`, an internal active-profile check,
  revoked `PUBLIC` execute, and grants to the intended roles. Run database advisors.
- Keep the existing single-animal `create_star_treatment` RPC for compatibility.
- Add a shared result type under `lib/models/**`.

## UI contract (`form-builder`)

- Build one shared scope-and-checklist component and use it in both
  [feeding-log-form.tsx](../../components/feeding-log-form.tsx) and
  [star-treatment-form.tsx](../../components/star-treatment-form.tsx).
- Field order:
  - Feeding: date/time → system → tank → animal → checklist → food type → amount per
    animal → notes → save.
  - Star treatment: date/time → system → tank → star → checklist → treatment type →
    amount/unit → concentration/unit → notes → save.
- Checklist:
  - Group eligible animals by tank and list every name, not only a count.
  - All animals start checked; provide **Select all**, **Clear all**, and a per-tank toggle
    for system-wide batches.
  - Show a summary such as "4 of 6 selected · 2 excluded".
  - Label the save button with the included count (`Save 4 feedings`, `Save 4 treatments`)
    and disable it when no animals are included or none are eligible.
- URL state: `?type=<type>&system=<id>[&tank=<id>][&animal=<id>]`. Do not persist
  exclusions in the URL; a reload or shared link starts with everyone checked. Changing the
  system clears tank and animal; changing the tank clears animal. Switching between Feeding
  and Star treatment keeps system and tank but clears animal. Update the Daily Operations
  hub so it no longer drops `tank`/`animal` for Feeding.
- The on-page checklist is the confirmation; do not add a modal.
- Success: list the animals logged and the animals excluded, keep system and tank, and
  offer to log another.
- Failure: keep every entered value and announce that nothing was saved.
- Stale preview: show a specific message and refresh the list. Keep existing exclusions;
  animals new to the scope appear unchecked and must be checked explicitly.
- Generate the request UUID once per submit attempt and reuse it on retry.
- Accessibility and mobile: labeled native selects, a fieldset and legend for scope,
  labeled checkboxes, keyboard operation, `aria-live` count/success messages, `role="alert"`
  errors, linked field errors, 36px (`h-9`) controls matching the other forms, and no horizontal scroll at 390px.
- Do not change Home.

## Verification (`e2e-verifier`)

- Fixtures: uniquely tagged disposable Graham animals in at least two tanks (Middle and
  Small), plus inactive, cohort, non-star, and out-of-system controls. Do not move or
  retire SSL25.
- For both forms, cover:
  - Graham-wide, Middle-only, and single-animal batches.
  - Batches with one or more exclusions.
  - Direct database checks that rows exist only for the included animal IDs, with identical
    shared values on every row, correct tank snapshots, provenance, and `batch_id`.
  - Ledger checks that included and excluded IDs are recorded accurately.
  - Stale-preview rejection with zero rows written.
  - Idempotent replay and double submission.
  - Forced rollback with zero rows written.
  - Disabled save when everyone is unchecked.
  - Reload resetting everyone to checked.
- Verify Admin, Technician, Volunteer, and Viewer through the UI and direct RPC calls.
- Confirm Home is unchanged.
- Run focused checks first, then `npm run test:e2e:full`. Apply migrations to a scratch or
  staging project before any hosted project. Never push or merge without explicit
  permission.

## Docs

After implementation, update [docs/implementation-checklist.md](../../docs/implementation-checklist.md),
[docs/star-treatments-design.md](../../docs/star-treatments-design.md) (it currently says to
submit one form per star), and the feeding description in
[docs/lab-operations-plan.md](../../docs/lab-operations-plan.md).
