---
description: "Build the feeding schedule feature: Admin/Technician-managed weekday schedules, next-due and overdue display on the Systems page, and a due-today item on Home."
name: "Build feeding schedule"
argument-hint: "Optional: a decision to override below (e.g. 'schedule per tank')"
agent: "agent"
---

# Feeding schedule

Admins and Technicians set when each system is fed. The app then shows when the next
feeding is due and when one is overdue. Read [AGENTS.md](../../AGENTS.md) first and follow its
rules (no push, never touch the port-3000 dev server, run `npm run verify`).

## Decisions already made
- **Scope:** one schedule per system, with optional per-tank overrides. A tank without an
  override follows its system's schedule.
- **Shape:** specific weekdays (for example Mon/Wed/Fri), not every N days.
- **Who edits:** Admin and Technician. Volunteer and Viewer read only (same split as
  `core.water_quality_target_ranges`, see
  [the migration](../../supabase/migrations/20260927022059_p1_database_ownership_operational_rules.sql)).
- **Where it shows:**
  - Systems lineup tile and system detail hero: next feeding due, plus an explicit
    **Overdue** indicator.
  - Home to-do list: a "feeding due today" item.
- **Overdue** is shown as its own label. Whether it also raises the overall system status
  to "worth a look" is not decided. Default to display only and confirm with the human.
- **No feeding cadence is hardcoded.** Schedules come from the database. Do not invent
  values (the checklist marks cadence by species and life stage as BLOCKED).

## Graham and tank names
Graham has an upper and a lower shelf with different feeding schedules, but it stays one
system. Those tanks get a `Lower` or `Upper` prefix, and tank names will later be based on
container volume (the human will supply those names, so do not rename any tanks). Graham's
different schedules are expressed with per-tank overrides.

## Plan
1. **Migration** (use the `supabase-migrations` and `supabase-postgres-best-practices`
   skills). New `core.feeding_schedules`: `system_id` (required), optional `tank_id`,
   `weekdays smallint[]` (ISO 1 to 7, non-empty, no duplicates), `updated_at` trigger,
   one row per system (and per system+tank for overrides). RLS and grants as above.
   Local only. Hosted changes go to a human.
2. **Pure logic** in `lib/systems/` (for example `feeding-schedule.ts`) with unit tests in
   `tests/unit/`. Input: weekdays, last feeding time, now. Output: `due today`, `next due`
   and `overdue since`. Use Pacific dates from
   [lib/pacific-date-time.ts](../../lib/pacific-date-time.ts). A feeding is overdue once a
   scheduled day has ended with no feeding that day.
3. **Settings page** at `app/protected/settings/feeding-schedules/`, modeled on
   `app/protected/settings/water-quality-targets/` and
   [water-quality-target-manager.tsx](../../components/settings/water-quality-target-manager.tsx).
   Weekday picker per system with a per-tank override. Add the sidebar link next to the
   existing settings links in
   [protected-sidebar.tsx](../../components/layout/protected-sidebar.tsx).
4. **Systems page.** Extend `fetchAllSystemsDetailData` in
   [app/protected/systems/data.ts](../../app/protected/systems/data.ts) to read schedules,
   and add `nextFeedingDue` and `feedingOverdue` to the snapshot in
   [lib/systems/snapshot.ts](../../lib/systems/snapshot.ts). Show them with the shared
   pieces in [snapshot-ui.tsx](../../components/systems/snapshot-ui.tsx) on the lineup tile,
   compare table, and detail hero. The feeding lookback is currently 30 days, so
   `fedText` says "No feedings in 30 days" beyond that.
5. **Home.** Add the due-today item in
   [app/protected/home/derivations.ts](../../app/protected/home/derivations.ts). Today it
   treats "any feeding for the system today" as done. This closes the checklist item
   "Make Home completion logic cadence-aware".
6. **Tests and docs.** Unit tests for step 2. Extend the matching e2e sections (the planner
   selects them: `npm run test:e2e:plan -- --files <files>`). Run them from a worktree with
   the local database, never against hosted. Update
   [docs/platform-architecture.md](../../docs/platform-architecture.md) and tick the
   checklist items in [docs/implementation-checklist.md](../../docs/implementation-checklist.md).

## Context
- The Systems page is lineup (`/protected/systems`), compare (`?compare=1`) and system detail
  (`?system=slug`). View state comes from the URL via the History API in
  [systems-page-client.tsx](../../components/systems/systems-page-client.tsx).
- Feedings live in `core.feeding_logs` (per animal, joined to the system through the tank).
- The detail page has a "Water and activity" chart
  ([water-activity-card.tsx](../../components/systems/water-activity-card.tsx)) with a feeding
  lane. Scheduled-but-skipped feedings could show there, or in a 14-day cadence grid (one row
  per activity, a red ring on a skipped scheduled day) if that design is revisited.
