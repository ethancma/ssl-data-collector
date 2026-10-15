import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveFeedingScheduleStatus,
  deriveSystemFeeding,
  capitalizeLabel,
  formatTankGroup,
  formatTankName,
  formatWeekdays,
  isoWeekday,
  listOverrideScopes,
  parseTankName,
  resolveTankSchedule,
  summarizeFeeding,
  type FeedingScheduleRow,
} from "@/lib/systems/feeding-schedule";

// Tuesday 2026-10-13, 14:30 Pacific.
const NOW = new Date("2026-10-13T21:30:00Z");
const LONG_AGO = "2026-09-01T00:00:00Z";
const MON = 1;
const TUE = 2;
const WED = 3;
const FRI = 5;

const status = (weekdays: number[], lastFedAt: string | null, effectiveFrom = LONG_AGO, now = NOW) =>
  deriveFeedingScheduleStatus({ weekdays, lastFedAt, effectiveFrom, now });

test("isoWeekday maps Monday to 1 and Sunday to 7", () => {
  assert.equal(isoWeekday("2026-10-12"), 1);
  assert.equal(isoWeekday("2026-10-18"), 7);
});

test("formatWeekdays uses the short labels, Monday first", () => {
  assert.equal(formatWeekdays([7, 5, 1, 3, 2, 4, 6]), "M Tu W Th F Sa Su");
});

test("a scheduled day not yet fed is due today", () => {
  assert.deepEqual(status([TUE, FRI], null), { dueToday: true, nextDueDate: "2026-10-13", overdueSince: null });
});

test("a feeding today clears due and points to the next scheduled day", () => {
  assert.deepEqual(status([TUE, FRI], "2026-10-13T16:00:00Z"), {
    dueToday: false,
    nextDueDate: "2026-10-16",
    overdueSince: null,
  });
});

test("an unscheduled day is not due and finds the next day, wrapping the week", () => {
  const result = status([MON], "2026-10-12T17:00:00Z");
  assert.equal(result.dueToday, false);
  assert.equal(result.nextDueDate, "2026-10-19");
});

test("a scheduled day that ended unfed is overdue the next day", () => {
  const result = status([MON, WED], "2026-10-09T17:00:00Z");
  assert.equal(result.overdueSince, "2026-10-12");
  assert.equal(result.nextDueDate, "2026-10-14");
});

test("a feeding on the scheduled day, or a catch-up feeding today, is not overdue", () => {
  assert.equal(status([MON], "2026-10-12T17:00:00Z").overdueSince, null);
  assert.equal(status([MON], "2026-10-13T17:00:00Z").overdueSince, null);
});

test("overdue rolls off after the following day", () => {
  const wednesday = new Date("2026-10-14T21:30:00Z");
  assert.equal(status([MON], null, LONG_AGO, wednesday).overdueSince, null);
});

test("a schedule never counts days up to its own edit date as missed", () => {
  assert.equal(status([MON], null, "2026-10-12T20:00:00Z").overdueSince, null);
  assert.equal(status([MON], null, "2026-10-11T20:00:00Z").overdueSince, "2026-10-12");
});

test("Pacific midnight, not UTC, ends the due day", () => {
  // 2026-10-14 06:00Z is still Tuesday 23:00 Pacific.
  const lateTuesday = new Date("2026-10-14T06:00:00Z");
  assert.equal(status([TUE], null, LONG_AGO, lateTuesday).dueToday, true);
});

const row = (
  weekdays: number[],
  tankPosition: FeedingScheduleRow["tankPosition"] = null,
  sizeLiters: number | null = null,
): FeedingScheduleRow => ({ tankPosition, sizeLiters, weekdays, updatedAt: LONG_AGO });

test("parseTankName reads the position prefix and size from the name", () => {
  assert.deepEqual(parseTankName("Lower-14.6L"), { position: "lower", sizeLiters: 14.6 });
  assert.deepEqual(parseTankName("Upper-30L"), { position: "upper", sizeLiters: 30 });
  assert.deepEqual(parseTankName("right 90L"), { position: "right", sizeLiters: 90 });
  assert.deepEqual(parseTankName("Left-90L"), { position: "left", sizeLiters: 90 });
  assert.deepEqual(parseTankName("200L"), { position: null, sizeLiters: 200 });
  assert.deepEqual(parseTankName("Overflow"), { position: null, sizeLiters: null });
  assert.deepEqual(parseTankName("Lowerlevel 5"), { position: null, sizeLiters: null });
});

test("formatTankName builds names parseTankName reads back", () => {
  assert.equal(formatTankName("Lower", 9.6), "Lower-9.6L");
  assert.equal(formatTankName(" Middle ", 9.6), "Middle-9.6L");
  assert.equal(formatTankName(null, 200), "200L");
  assert.equal(formatTankName("  ", 3), "3L");
  assert.deepEqual(parseTankName(formatTankName("Lower", 9.6)), { position: "lower", sizeLiters: 9.6 });
  assert.deepEqual(parseTankName(formatTankName("Middle", 9.6)), { position: null, sizeLiters: 9.6 });
  assert.deepEqual(parseTankName(formatTankName(null, 0.125)), { position: null, sizeLiters: 0.125 });
});

test("capitalizeLabel keeps the first letter upper case and the rest lower case", () => {
  assert.equal(capitalizeLabel("middle"), "Middle");
  assert.equal(capitalizeLabel(" MIDDLE "), "Middle");
  assert.equal(capitalizeLabel(""), "");
});

test("formatTankGroup labels a group", () => {
  assert.equal(formatTankGroup({ position: "lower", sizeLiters: null }), "Lower");
  assert.equal(formatTankGroup({ position: "lower", sizeLiters: 3 }), "Lower 3L");
  assert.equal(formatTankGroup({ position: null, sizeLiters: 200 }), "200L");
});

test("the most specific schedule wins: position and size, position, size, then system", () => {
  const system = row([MON]);
  const lower = row([TUE], "lower");
  const lower3 = row([WED], "lower", 3);
  const size200 = row([FRI], null, 200);
  const all = [system, lower, lower3, size200];
  assert.equal(resolveTankSchedule(all, { position: "lower", sizeLiters: 3 }), lower3);
  assert.equal(resolveTankSchedule(all, { position: "lower", sizeLiters: 14.6 }), lower);
  assert.equal(resolveTankSchedule(all, { position: null, sizeLiters: 200 }), size200);
  assert.equal(resolveTankSchedule(all, { position: "upper", sizeLiters: 30 }), system);
  assert.equal(resolveTankSchedule(all, { position: null, sizeLiters: null }), system);
  assert.equal(resolveTankSchedule([lower], { position: "upper", sizeLiters: 30 }), null);
});

test("listOverrideScopes offers positions, sizes within a multi-size position, and unprefixed sizes", () => {
  const scopes = listOverrideScopes(
    ["Lower-14.6L", "Lower-3L", "Upper-30L", "Overflow"],
    [],
  );
  assert.deepEqual(scopes.map(formatTankGroup), ["Lower", "Lower 3L", "Lower 14.6L", "Upper"]);
  assert.deepEqual(listOverrideScopes(["200L"], []).map(formatTankGroup), ["200L"]);
  assert.deepEqual(listOverrideScopes(["Left-90L", "Right-90L"], []).map(formatTankGroup), ["Left", "Right"]);
});

test("listOverrideScopes keeps saved overrides whose tanks were renamed", () => {
  const scopes = listOverrideScopes(["Overflow"], [{ position: null, sizeLiters: null }, { position: "upper", sizeLiters: null }]);
  assert.deepEqual(scopes.map(formatTankGroup), ["Upper"]);
});

const TANKS = [
  { id: 1, name: "Lower-14.6L" },
  { id: 2, name: "Upper-30L" },
  { id: 3, name: "Upper-3L" },
];

test("a system schedule covers every tank that has no override", () => {
  const statuses = deriveSystemFeeding({
    schedules: [row([TUE])],
    tanks: TANKS,
    feedings: [{ tankId: 2, fedAt: "2026-10-13T16:00:00Z" }],
    now: NOW,
  });
  assert.equal(statuses.length, 1);
  assert.equal(statuses[0].scopeLabel, null);
  assert.equal(statuses[0].dueToday, false);
});

test("a position override replaces the system schedule for its tanks and keeps their feedings out of the system scope", () => {
  const statuses = deriveSystemFeeding({
    schedules: [row([TUE]), row([WED], "lower")],
    tanks: TANKS,
    feedings: [{ tankId: 1, fedAt: "2026-10-13T16:00:00Z" }],
    now: NOW,
  });
  const system = statuses.find((s) => s.scopeLabel === null);
  const lower = statuses.find((s) => s.scopeLabel === "Lower");
  assert.equal(system?.dueToday, true);
  assert.equal(lower?.dueToday, false);
  assert.equal(lower?.nextDueDate, "2026-10-14");
});

test("a size override inside a position applies only to that size", () => {
  const statuses = deriveSystemFeeding({
    schedules: [row([TUE]), row([WED], "upper", 3)],
    tanks: TANKS,
    feedings: [],
    now: NOW,
  });
  assert.deepEqual(statuses.map((s) => s.scopeLabel), [null, "Upper 3L"]);
});

test("a schedule that no tank matches is dropped", () => {
  const statuses = deriveSystemFeeding({
    schedules: [row([TUE]), row([WED], "left")],
    tanks: TANKS,
    feedings: [],
    now: NOW,
  });
  assert.deepEqual(statuses.map((s) => s.scopeLabel), [null]);
});

test("the system scope is dropped when every tank is overridden", () => {
  const statuses = deriveSystemFeeding({
    schedules: [row([TUE]), row([WED], "lower")],
    tanks: [TANKS[0]],
    feedings: [],
    now: NOW,
  });
  assert.deepEqual(statuses.map((s) => s.scopeLabel), ["Lower"]);
});

test("no schedule rows means no feeding schedule", () => {
  assert.deepEqual(deriveSystemFeeding({ schedules: [], tanks: TANKS, feedings: [], now: NOW }), []);
  assert.equal(summarizeFeeding([]), null);
});

test("the summary takes the earliest next due date and names overdue override groups", () => {
  const summary = summarizeFeeding(
    deriveSystemFeeding({
      schedules: [row([FRI]), row([MON], "upper")],
      tanks: TANKS,
      feedings: [],
      now: NOW,
    }),
  );
  assert.equal(summary?.nextDueDate, "2026-10-16");
  assert.equal(summary?.overdueSince, "2026-10-12");
  assert.deepEqual(summary?.overdueScopeLabels, ["Upper"]);
  assert.equal(summary?.dueToday, false);
});
