import { z } from "zod";

import { CHECK_TYPES } from "@/lib/config/reference-data";
import { dateField, idField, timeField } from "@/lib/validation/common-fields";

// One row per configured system. The water box starts unchecked, so unchecked is saved as
// "not running"; temperature is required so every system is actually read in the round.
const dailyCheckSystemSchema = z.object({
  systemId: idField("Select a system"),
  waterRunning: z.boolean(),
  temperature: z
    .string()
    .trim()
    .min(1, "Enter a temperature")
    .refine(
      (v) => !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 50,
      "Enter a temperature in °C between 0 and 50",
    )
    .transform(Number),
  notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
});

// Validation for the AM/PM check round: shared date/time/check type plus every system.
export const dailyCheckSchema = z.object({
  date: dateField,
  time: timeField,
  checkType: z.enum(CHECK_TYPES),
  systems: z.array(dailyCheckSystemSchema).min(1, "No systems are configured"),
});

// Raw form state (string values straight from HTML inputs) vs. the parsed,
// DB-ready output (ids and temperatures coerced to numbers).
export type DailyCheckFormInput = z.input<typeof dailyCheckSchema>;
export type DailyCheckFormValues = z.output<typeof dailyCheckSchema>;
