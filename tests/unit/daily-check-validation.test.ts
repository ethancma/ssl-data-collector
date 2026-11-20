import assert from "node:assert/strict";
import test from "node:test";

import { convertTemperatureInput, dailyCheckSchema } from "@/lib/validation/daily-check";

const round = (systems: Record<string, unknown>[]) => ({
  date: "2026-11-19",
  time: "08:30",
  checkType: "AM",
  temperatureUnit: "F",
  systems,
});

const row = (overrides: Record<string, unknown> = {}) => ({
  systemId: "3",
  waterRunning: true,
  temperature: "54.5",
  notes: "",
  ...overrides,
});

test("a full round parses each system row into insert-ready values", () => {
  const result = dailyCheckSchema.parse(
    round([row(), row({ systemId: "7", waterRunning: false, temperature: " 32 " })]),
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
    ["abc", "Enter a valid temperature"],
    ["122.1", "Enter a temperature in °F between 32 and 122"],
    ["31.9", "Enter a temperature in °F between 32 and 122"],
  ]) {
    const result = dailyCheckSchema.safeParse(round([row(), row({ systemId: "4", temperature })]));
    assert.equal(result.success, false, temperature);
    const issue = result.error?.issues[0];
    assert.deepEqual(issue?.path, ["systems", 1, "temperature"], temperature);
    assert.equal(issue?.message, message, temperature);
  }
});

test("Fahrenheit bounds are inclusive and Celsius values are saved to two decimals", () => {
  const result = dailyCheckSchema.parse(
    round([row({ temperature: "32" }), row({ temperature: "122" })]),
  );
  assert.deepEqual(result.systems.map(({ temperature }) => temperature), [0, 50]);

  const celsiusBounds = dailyCheckSchema.parse({
    ...round([row({ temperature: "0" }), row({ temperature: "50" })]),
    temperatureUnit: "C",
  });
  assert.deepEqual(celsiusBounds.systems.map(({ temperature }) => temperature), [0, 50]);

  const celsius = dailyCheckSchema.parse({
    ...round([row({ temperature: "12.345" })]),
    temperatureUnit: "C",
  });
  assert.equal(celsius.systems[0]?.temperature, 12.35);
});

test("Celsius storage rounds decimal midpoints correctly in either input unit", () => {
  for (const [unit, input, expected] of [
    ["C", "1.0049999", 1],
    ["C", "1.005", 1.01],
    ["C", "1.0050001", 1.01],
    ["C", "1e-7", 0],
    ["F", "32.0989999", 0.05],
    ["F", "32.099", 0.06],
    ["F", "32.0990001", 0.06],
  ] as const) {
    const result = dailyCheckSchema.parse({
      ...round([row({ temperature: input })]),
      temperatureUnit: unit,
    });
    assert.equal(result.systems[0]?.temperature, expected, `${input} °${unit}`);
  }
});

test("unit switching preserves the entered reading and its Celsius storage value", () => {
  assert.equal(convertTemperatureInput("55.1", "F", "C"), "12.833333");
  assert.equal(convertTemperatureInput("55.1", "F", "F"), "55.1");

  const original = "32.0989999";
  const displayed = convertTemperatureInput(original, "F", "C");
  assert.equal(displayed, "0.0549999");
  const switched = dailyCheckSchema.parse({
    ...round([row({
      temperature: displayed,
      temperatureSource: { value: original, unit: "F" },
    })]),
    temperatureUnit: "C",
  });
  assert.equal(switched.systems[0]?.temperature, 0.05);
  assert.equal("temperatureSource" in switched.systems[0], false);
});

test("invalid Fahrenheit and Celsius values are rejected with unit-specific errors", () => {
  const fahrenheit = dailyCheckSchema.safeParse(round([row({ temperature: "12.5" })]));
  assert.equal(fahrenheit.success, false);
  assert.equal(fahrenheit.error?.issues[0]?.message, "Enter a temperature in °F between 32 and 122");

  for (const temperature of ["-0.1", "50.1"]) {
    const celsius = dailyCheckSchema.safeParse({
      ...round([row({ temperature })]),
      temperatureUnit: "C",
    });
    assert.equal(celsius.success, false, temperature);
    assert.equal(
      celsius.error?.issues[0]?.message,
      "Enter a temperature in °C between 0 and 50",
      temperature,
    );
  }
});

test("a round needs at least one configured system", () => {
  const result = dailyCheckSchema.safeParse(round([]));
  assert.equal(result.success, false);
  assert.equal(result.error?.issues[0]?.message, "No systems are configured");
});
