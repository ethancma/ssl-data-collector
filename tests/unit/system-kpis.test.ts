import assert from "node:assert/strict";
import test from "node:test";

import { deriveSystemKpis } from "@/lib/systems/kpis";

const now = new Date("2026-10-13T21:30:00Z");
const targets = [{ id: 1, systemId: null, parameterKey: "ammonia" as const, minValue: 0, maxValue: 0.1 }];

test("counts tests in range over 30 days and ignores tests without targeted values", () => {
  const kpis = deriveSystemKpis({
    now,
    systemId: 1,
    targets,
    waterReadings: [
      { testedAt: "2026-10-10T17:00:00Z", values: { ammonia: 0.05 } },
      { testedAt: "2026-10-03T17:00:00Z", values: { ammonia: 0.13 } },
      { testedAt: "2026-09-26T17:00:00Z", values: { nitrite: 8 } },
      { testedAt: "2026-08-01T17:00:00Z", values: { ammonia: 0.5 } },
    ],
    checks: [],
  });
  assert.deepEqual(kpis.testsInRange, { inRange: 1, judged: 2 });
});

test("no targets means nothing is judged", () => {
  const kpis = deriveSystemKpis({ now, systemId: 1, targets: [], waterReadings: [{ testedAt: "2026-10-10T17:00:00Z", values: { ammonia: 0.5 } }], checks: [] });
  assert.deepEqual(kpis.testsInRange, { inRange: 0, judged: 0 });
});

test("temperature range uses non-null checks from the last 30 days", () => {
  const kpis = deriveSystemKpis({
    now,
    systemId: 1,
    targets,
    waterReadings: [],
    checks: [
      { checkedAt: "2026-10-12T15:00:00Z", temperature: 12.4 },
      { checkedAt: "2026-10-01T15:00:00Z", temperature: 13.6 },
      { checkedAt: "2026-10-05T15:00:00Z", temperature: null },
      { checkedAt: "2026-08-01T15:00:00Z", temperature: 20 },
    ],
  });
  assert.deepEqual(kpis.temperature, { min: 12.4, max: 13.6 });
  assert.equal(deriveSystemKpis({ now, systemId: 1, targets, waterReadings: [], checks: [] }).temperature, null);
});
