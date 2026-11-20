import { z } from "zod";

import { CHECK_TYPES } from "@/lib/config/reference-data";
import { dateField, idField, timeField } from "@/lib/validation/common-fields";

export const TEMPERATURE_UNITS = ["F", "C"] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

export function temperatureInRange(value: number, unit: TemperatureUnit) {
  return unit === "F" ? value >= 32 && value <= 122 : value >= 0 && value <= 50;
}

export function temperatureRangeMessage(unit: TemperatureUnit) {
  return unit === "F"
    ? "Enter a temperature in °F between 32 and 122"
    : "Enter a temperature in °C between 0 and 50";
}

function convertTemperature(
  value: number,
  from: TemperatureUnit,
  to: TemperatureUnit,
) {
  if (from === to) return value;
  return from === "F" ? ((value - 32) * 5) / 9 : (value * 9) / 5 + 32;
}

export function storedCelsius(value: number, unit: TemperatureUnit) {
  const [coefficient = "0", exponent = "0"] = value.toString().split("e");
  const [whole = "0", fraction = ""] = coefficient.split(".");
  const power = Number(exponent) - fraction.length;
  let numerator = BigInt(`${whole}${fraction}`);
  let denominator = BigInt(1);
  if (power < 0) denominator = BigInt(10) ** BigInt(-power);
  else numerator *= BigInt(10) ** BigInt(power);

  if (unit === "F") {
    numerator = (numerator - BigInt(32) * denominator) * BigInt(5);
    denominator *= BigInt(9);
  }
  // Match numeric(5,2)'s decimal rounding without binary floating-point tie errors.
  return Number((numerator * BigInt(200) + denominator) / (denominator * BigInt(2))) / 100;
}

export function convertTemperatureInput(value: string, from: TemperatureUnit, to: TemperatureUnit) {
  if (from === to) return value;
  const numeric = Number(value);
  const converted = convertTemperature(numeric, from, to);
  const saved = storedCelsius(numeric, from);
  for (let precision = 6; precision <= 12; precision += 1) {
    const displayed = String(Number(converted.toFixed(precision)));
    if (storedCelsius(Number(displayed), to) === saved) return displayed;
  }
  return String(converted);
}

const temperatureField = z
  .string()
  .trim()
  .min(1, "Enter a temperature")
  .refine((value) => Number.isFinite(Number(value)), "Enter a valid temperature")
  .transform(Number);

// One row per configured system. The water box starts unchecked, so unchecked is saved as
// "not running"; temperature is required so every system is actually read in the round.
const dailyCheckSystemSchema = z.object({
  systemId: idField("Select a system"),
  waterRunning: z.boolean(),
  temperature: temperatureField,
  temperatureSource: z.object({
    value: temperatureField,
    unit: z.enum(TEMPERATURE_UNITS),
  }).optional(),
  notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
});

// Validation for the AM/PM check round: shared date/time/check type plus every system.
export const dailyCheckSchema = z
  .object({
    date: dateField,
    time: timeField,
    checkType: z.enum(CHECK_TYPES),
    temperatureUnit: z.enum(TEMPERATURE_UNITS),
    systems: z.array(dailyCheckSystemSchema).min(1, "No systems are configured"),
  })
  .superRefine((values, ctx) => {
    values.systems.forEach((system, index) => {
      if (!temperatureInRange(system.temperature, values.temperatureUnit)) {
        ctx.addIssue({
          code: "custom",
          path: ["systems", index, "temperature"],
          message: temperatureRangeMessage(values.temperatureUnit),
        });
      }
      if (system.temperatureSource && !temperatureInRange(
        system.temperatureSource.value,
        system.temperatureSource.unit,
      )) {
        ctx.addIssue({
          code: "custom",
          path: ["systems", index, "temperature"],
          message: temperatureRangeMessage(system.temperatureSource.unit),
        });
      }
    });
  })
  .transform((values) => ({
    ...values,
    systems: values.systems.map(({ temperatureSource, ...system }) => {
      return {
        ...system,
        temperature: storedCelsius(
          temperatureSource?.value ?? system.temperature,
          temperatureSource?.unit ?? values.temperatureUnit,
        ),
      };
    }),
  }));

// Raw form state (string values straight from HTML inputs) vs. the parsed,
// DB-ready output (ids and temperatures coerced to numbers).
export type DailyCheckFormInput = z.input<typeof dailyCheckSchema>;
export type DailyCheckFormValues = z.output<typeof dailyCheckSchema>;
