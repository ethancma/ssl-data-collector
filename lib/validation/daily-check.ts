import { z } from "zod";

import { CHECK_TYPES } from "@/lib/config/reference-data";

const dateField = z
  .string()
  .min(1, "Select a date")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date");

const timeField = z
  .string()
  .min(1, "Select a time")
  .regex(/^\d{2}:\d{2}$/, "Enter a time as HH:mm");

// Validation for the AM/PM check form. Fields stay as strings (form inputs);
// the caller converts temperature/notes to their DB types on submit.
export const dailyCheckSchema = z.object({
  date: dateField,
  time: timeField,
  systemId: z
    .string()
    .min(1, "Select a system")
    .regex(/^\d+$/, "Select a system")
    .transform(Number)
    .pipe(z.number().int().positive("Select a system")),
  checkType: z.enum(CHECK_TYPES),
  waterRunning: z.boolean(),
  temperature: z
    .string()
    .optional()
    .refine(
      (v) =>
        !v || (!Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 50),
      "Enter a temperature in °C between 0 and 50",
    ),
  notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
});

// Raw form state (string values straight from HTML inputs) vs. the parsed,
// DB-ready output (systemId coerced to a number).
export type DailyCheckFormInput = z.input<typeof dailyCheckSchema>;
export type DailyCheckFormValues = z.output<typeof dailyCheckSchema>;
