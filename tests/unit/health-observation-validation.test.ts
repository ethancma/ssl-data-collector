import assert from "node:assert/strict";
import test from "node:test";

import { healthObservationSchema } from "@/lib/validation/health-observation";

const observation = (overrides: Record<string, unknown> = {}) => ({
  date: "2026-11-19",
  time: "08:30",
  animalId: "1",
  tankId: "2",
  severity: "2",
  issues: ["spine_drop"],
  spineCount: "",
  notes: "",
  ...overrides,
});

test("spines found saves a positive whole number and blank as unknown", () => {
  assert.equal(healthObservationSchema.parse(observation({ spineCount: " 3 " })).spineCount, 3);
  assert.equal(healthObservationSchema.parse(observation()).spineCount, null);
  assert.equal(healthObservationSchema.parse(observation({ spineCount: undefined })).spineCount, null);
});

test("spines found rejects zero, negative, and decimal counts", () => {
  for (const spineCount of ["0", "-1", "2.5", "abc"]) {
    const result = healthObservationSchema.safeParse(observation({ spineCount }));
    assert.equal(result.success, false, spineCount);
    assert.deepEqual(result.error?.issues[0]?.path, ["spineCount"], spineCount);
  }
});

test("spines found is dropped when Spine drop is not selected", () => {
  const result = healthObservationSchema.parse(
    observation({ issues: ["balding"], spineCount: "0" }),
  );
  assert.deepEqual(result.issues, ["balding"]);
  assert.equal(result.spineCount, null);
});
