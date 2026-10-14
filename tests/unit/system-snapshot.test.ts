import assert from "node:assert/strict";
import test from "node:test";

import { deriveSystemSnapshot, type SystemSnapshotInput } from "@/lib/systems/snapshot";

// 2026-10-13 14:30 Pacific: past the AM due time, before the PM due time.
const NOW = new Date("2026-10-13T21:30:00Z");

const check = (type: "AM" | "PM", iso: string, extra: { waterRunning?: boolean; temperature?: number | null } = {}) => ({
  type,
  checkedAt: iso,
  waterRunning: extra.waterRunning ?? true,
  temperature: extra.temperature === undefined ? 12 : extra.temperature,
});

const base = (overrides: Partial<SystemSnapshotInput> = {}): SystemSnapshotInput => ({
  systemId: 1,
  now: NOW,
  checks: [
    check("AM", "2026-10-12T15:00:00Z"),
    check("PM", "2026-10-13T01:00:00Z"),
    check("AM", "2026-10-13T15:00:00Z"),
  ],
  healthObservations: [],
  latestWater: null,
  lastFedAt: null,
  feeding: null,
  targets: [],
  ...overrides,
});

test("a logged AM check and a PM check not yet due is all clear", () => {
  const snapshot = deriveSystemSnapshot(base());
  assert.equal(snapshot.status, "ok");
  assert.equal(snapshot.headline, "All clear");
  assert.deepEqual([snapshot.am, snapshot.pm], ["done", "due"]);
});

test("an unlogged AM check after noon is missed and needs attention", () => {
  const snapshot = deriveSystemSnapshot(base({ checks: [check("PM", "2026-10-13T01:00:00Z"), check("AM", "2026-10-12T15:00:00Z")] }));
  assert.equal(snapshot.status, "attention");
  assert.equal(snapshot.am, "missed");
  assert.equal(snapshot.headline, "AM check wasn't logged today");
});

test("water not running at the latest check needs attention", () => {
  const snapshot = deriveSystemSnapshot(base({
    checks: [
      check("AM", "2026-10-12T15:00:00Z"),
      check("PM", "2026-10-13T01:00:00Z"),
      check("AM", "2026-10-13T15:00:00Z", { waterRunning: false }),
    ],
  }));
  assert.equal(snapshot.status, "attention");
  assert.equal(snapshot.headline, "Water wasn't running at the AM check today");
});

test("a missed check yesterday is a watch item", () => {
  const snapshot = deriveSystemSnapshot(base({
    checks: [check("AM", "2026-10-12T15:00:00Z"), check("AM", "2026-10-13T15:00:00Z")],
  }));
  assert.equal(snapshot.status, "watch");
  assert.equal(snapshot.headline, "Yesterday's PM check was missed");
});

test("health observations: high needs attention, medium is a watch, low is ignored", () => {
  const observe = (severity: "low" | "medium" | "high") =>
    deriveSystemSnapshot(base({ healthObservations: [{ observedAt: "2026-10-11T17:00:00Z", severity }] }));
  assert.equal(observe("high").status, "attention");
  assert.equal(observe("high").headline, "High-severity health observation 2 days ago");
  assert.equal(observe("medium").status, "watch");
  assert.equal(observe("low").status, "ok");
});

test("health observations older than 14 days are ignored", () => {
  const snapshot = deriveSystemSnapshot(base({ healthObservations: [{ observedAt: "2026-09-20T17:00:00Z", severity: "high" }] }));
  assert.equal(snapshot.status, "ok");
});

test("out-of-range readings use targets; readings without a target are never judged", () => {
  const targets = [{ id: 1, systemId: null, parameterKey: "ammonia" as const, minValue: 0, maxValue: 0.1 }];
  const snapshot = deriveSystemSnapshot(base({
    targets,
    latestWater: { testedAt: "2026-10-10T17:00:00Z", values: { ammonia: 0.13, nitrite: 900 } },
  }));
  assert.equal(snapshot.status, "watch");
  assert.equal(snapshot.concerns.length, 1);
  assert.equal(snapshot.headline, "Ammonia 0.13 ppm is outside 0–0.1 ppm");
  const nitrite = snapshot.water.readings.find((reading) => reading.key === "nitrite");
  assert.equal(nitrite?.targetText, null);
  assert.equal(nitrite?.outOfRange, false);
});

test("water test and feeding ages are labelled relative to now", () => {
  const snapshot = deriveSystemSnapshot(base({
    latestWater: { testedAt: "2026-10-10T17:00:00Z", values: {} },
    lastFedAt: "2026-10-12T17:00:00Z",
  }));
  assert.equal(snapshot.water.testedAgo, "3 days ago");
  assert.equal(snapshot.fedAgo, "yesterday");
  assert.equal(deriveSystemSnapshot(base()).fedAgo, null);
});

test("concerns are ordered attention first", () => {
  const snapshot = deriveSystemSnapshot(base({
    checks: [check("AM", "2026-10-13T15:00:00Z", { waterRunning: false })],
    healthObservations: [{ observedAt: "2026-10-11T17:00:00Z", severity: "medium" }],
  }));
  assert.deepEqual(snapshot.concerns.map((concern) => concern.kind), ["water_off", "health", "yesterday_missed"]);
});

test("an overdue feeding is a watch item and a next due date is labelled", () => {
  const overdue = deriveSystemSnapshot(base({
    feeding: { dueToday: true, nextDueDate: "2026-10-13", overdueSince: "2026-10-12", overdueScopeLabels: ["Upper"] },
  }));
  assert.equal(overdue.feedingOverdue, true);
  assert.equal(overdue.nextFeedingText, "Feeding due today");
  assert.deepEqual(overdue.concerns.map((concern) => [concern.kind, concern.status]), [["feeding_overdue", "watch"]]);
  assert.equal(overdue.headline, "Feeding was missed yesterday (Upper)");

  const upcoming = deriveSystemSnapshot(base({
    feeding: { dueToday: false, nextDueDate: "2026-10-16", overdueSince: null, overdueScopeLabels: [] },
  }));
  assert.equal(upcoming.status, "ok");
  assert.equal(upcoming.nextFeedingText, "Next feeding Friday");

  const none = deriveSystemSnapshot(base());
  assert.deepEqual([none.nextFeedingDue, none.nextFeedingText, none.feedingOverdue], [null, null, false]);
});
