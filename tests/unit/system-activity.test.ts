import assert from "node:assert/strict";
import test from "node:test";

import { buildActivityEvents } from "@/lib/systems/activity";

const none = { feedings: [], treatments: [], chemicals: [], maintenance: [] };

test("feeding rows from one batch become a single event", () => {
  const events = buildActivityEvents({
    ...none,
    feedings: [
      { fedAt: "2026-10-12T16:00:05+00:00" },
      { fedAt: "2026-10-12T16:00:07+00:00" },
      { fedAt: "2026-10-10T16:30:00+00:00" },
    ],
  });
  assert.deepEqual(events.map((e) => [e.kind, e.detail]), [
    ["feeding", "2 animals fed"],
    ["feeding", "1 animal fed"],
  ]);
});

test("probiotics get their own kind and other treatments are labelled", () => {
  const events = buildActivityEvents({
    ...none,
    treatments: [
      { administeredAt: "2026-10-11T17:00:00+00:00", treatmentType: "probiotics", amount: 0.5, unit: "mL" },
      { administeredAt: "2026-10-11T17:00:01+00:00", treatmentType: "probiotics", amount: 0.5, unit: "mL" },
      { administeredAt: "2026-10-09T17:00:00+00:00", treatmentType: "reef_dip", amount: null, unit: null },
    ],
  });
  assert.deepEqual(events.map((e) => [e.kind, e.title, e.detail]), [
    ["probiotic", "Probiotics", "2 stars, 0.5 mL each"],
    ["treatment", "Reef dip", "1 star"],
  ]);
});

test("chemicals and maintenance merge newest first", () => {
  const events = buildActivityEvents({
    ...none,
    chemicals: [{ id: 1, chemicalName: "Calcium chloride", amount: 25, unit: "mL", addedAt: "2026-10-01T18:00:00+00:00", reason: "raise calcium" }],
    maintenance: [{ id: 2, performedAt: "2026-10-05T20:00:00+00:00", taskType: "Filter change", notes: null }],
  });
  assert.deepEqual(events.map((e) => [e.id, e.detail]), [
    ["maintenance-2", null],
    ["chemical-1", "25 mL, raise calcium"],
  ]);
});
