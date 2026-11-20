import assert from "node:assert/strict";
import test from "node:test";

import { dailyCheckSchema } from "@/lib/validation/daily-check";

const round = (systems: Record<string, unknown>[]) => ({
  date: "2026-11-19",
  time: "08:30",
  checkType: "AM",
  systems,
});

const row = (overrides: Record<string, unknown> = {}) => ({
  systemId: "3",
  waterRunning: true,
  temperature: "12.5",
  notes: "",
  ...overrides,
});

test("a full round parses each system row into insert-ready values", () => {
  const result = dailyCheckSchema.parse(
    round([row(), row({ systemId: "7", waterRunning: false, temperature: " 0 " })]),
  );
  assert.deepEqual(
    result.systems.map(({ systemId, waterRunning, temperature }) => ({
      systemId,
      waterRunning,
      temperature,
    })),
    [
      { systemId: 3, waterRunning: true, temperature: 12.5 },
      { systemId: 7, waterRunning: false, temperature: 0 },
    ],
  );
});

test("an unchecked water box is a valid 'not running' answer and notes stay optional", () => {
  const result = dailyCheckSchema.safeParse(round([row({ waterRunning: false, notes: undefined })]));
  assert.equal(result.success, true);
});

test("every system needs a temperature in range", () => {
  for (const [temperature, message] of [
    ["", "Enter a temperature"],
    ["   ", "Enter a temperature"],
    ["abc", "Enter a temperature in °C between 0 and 50"],
    ["50.1", "Enter a temperature in °C between 0 and 50"],
    ["-1", "Enter a temperature in °C between 0 and 50"],
  ]) {
    const result = dailyCheckSchema.safeParse(round([row(), row({ systemId: "4", temperature })]));
    assert.equal(result.success, false, temperature);
    const issue = result.error?.issues[0];
    assert.deepEqual(issue?.path, ["systems", 1, "temperature"], temperature);
    assert.equal(issue?.message, message, temperature);
  }
});

test("a round needs at least one configured system", () => {
  const result = dailyCheckSchema.safeParse(round([]));
  assert.equal(result.success, false);
  assert.equal(result.error?.issues[0]?.message, "No systems are configured");
});
