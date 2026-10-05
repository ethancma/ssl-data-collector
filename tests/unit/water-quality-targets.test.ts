import assert from "node:assert/strict";
import test from "node:test";

import {
  isWaterQualityValueOutOfRange,
  resolveWaterQualityTarget,
  waterQualityValuesRequireNotes,
  type WaterQualityTargetRange,
} from "@/lib/daily-operations/water-quality-targets";

const targets: WaterQualityTargetRange[] = [
  {
    id: 1,
    systemId: null,
    parameterKey: "ph",
    minValue: 7.8,
    maxValue: 8.4,
  },
  {
    id: 2,
    systemId: 3,
    parameterKey: "ph",
    minValue: 8,
    maxValue: 8.2,
  },
];

test("prefers a system target over the lab-wide target", () => {
  assert.equal(resolveWaterQualityTarget(targets, 3, "ph")?.id, 2);
});

test("falls back to the lab-wide target", () => {
  assert.equal(resolveWaterQualityTarget(targets, 4, "ph")?.id, 1);
});

test("treats both target bounds as inclusive", () => {
  const target = targets[1];

  assert.equal(isWaterQualityValueOutOfRange(8, target), false);
  assert.equal(isWaterQualityValueOutOfRange(8.2, target), false);
  assert.equal(isWaterQualityValueOutOfRange(7.99, target), true);
  assert.equal(isWaterQualityValueOutOfRange(8.21, target), true);
});

test("evaluates one-sided target bounds", () => {
  const minimumOnly = { ...targets[0], maxValue: null };
  const maximumOnly = { ...targets[0], minValue: null };

  assert.equal(isWaterQualityValueOutOfRange(7.7, minimumOnly), true);
  assert.equal(isWaterQualityValueOutOfRange(8.5, minimumOnly), false);
  assert.equal(isWaterQualityValueOutOfRange(8.5, maximumOnly), true);
  assert.equal(isWaterQualityValueOutOfRange(7.7, maximumOnly), false);
});

test("ignores null readings and missing targets", () => {
  assert.equal(isWaterQualityValueOutOfRange(null, targets[0]), false);
  assert.equal(isWaterQualityValueOutOfRange(8.1, null), false);
});

test("requires notes only when a value is outside its effective target", () => {
  assert.equal(waterQualityValuesRequireNotes({ ph: 8.1 }, targets, 3), false);
  assert.equal(waterQualityValuesRequireNotes({ ph: 8.3 }, targets, 3), true);
  assert.equal(waterQualityValuesRequireNotes({ ph: null }, targets, 3), false);
  assert.equal(waterQualityValuesRequireNotes({ salinity: 40 }, targets, 3), false);
});