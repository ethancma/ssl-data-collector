import assert from "node:assert/strict";
import test from "node:test";

import type { HomeDashboardSourceData } from "@/app/protected/home/data";
import { deriveHomeDashboard } from "@/app/protected/home/derivations";

test("deriveHomeDashboard preserves Pacific-day totals and daily status", () => {
  const source: HomeDashboardSourceData = {
    systems: [{ id: 1, name: "Graham" }],
    checks: [
      { system_id: 1, check_type: "AM", checked_at: "2026-09-26T15:00:00.000Z" },
      { system_id: 1, check_type: "PM", checked_at: "2026-09-27T06:30:00.000Z" },
      { system_id: 1, check_type: "PM", checked_at: "2026-09-27T08:30:00.000Z" },
    ],
    feedingLogs: [
      { fed_at: "2026-09-27T06:00:00.000Z", tanks: { system_id: 1 } },
    ],
    waterQualityReadings: [
      { system_id: 1, tested_at: "2026-09-25T18:00:00.000Z", ph: 7.8 },
      { system_id: 1, tested_at: "2026-09-25T20:00:00.000Z", ph: 8.0 },
      { system_id: 1, tested_at: "2026-09-26T18:00:00.000Z", ph: 8.1 },
    ],
    chemicalAdditions: [{ added_at: "2026-09-27T06:15:00.000Z" }],
    recentHealthObservations: [
      {
        id: 7,
        observed_at: "2026-09-20T18:00:00.000Z",
        severity: "medium",
        issues: ["arm_curling"],
        tanks: { systems: { name: "Graham" } },
      },
    ],
    healthObservationsToday: 8,
    animals: [{ quantity: 3 }, { quantity: 4 }],
    totalTanks: 2,
  };

  const dashboard = deriveHomeDashboard(source, new Date("2026-09-27T06:45:00.000Z"));

  assert.equal(dashboard.checksLogged, 2);
  assert.equal(dashboard.feedingLogsToday, 1);
  assert.equal(dashboard.chemicalAdditionsToday, 1);
  assert.equal(dashboard.healthObservationsToday, 8);
  assert.equal(dashboard.totalAnimals, 7);
  assert.deepEqual(dashboard.allClearSystems, ["Graham"]);
  assert.deepEqual(dashboard.waterQualityTrend, [7.9, 8.1]);
  assert.equal(dashboard.healthObservationEntries[0].issue, "Arm curling");
});