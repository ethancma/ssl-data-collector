import { z } from "zod";

import {
  PH_SOURCES,
  WATER_QUALITY_PARAMS,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";

// Validation for the weekly water quality reading form. The params stay as
// strings (form inputs); the caller parses them to numbers on submit, same as
// temperature in daily-check.ts. No target-range validation yet — the ranges are
// an open question per docs/implementation-checklist.md §3, so we only check that
// a filled-in value parses as a number.
const optionalNumeric = (label: string) =>
  z
    .string()
    .optional()
    .refine(
      (v) => !v || !Number.isNaN(Number(v)),
      `Enter a valid number for ${label}`,
    );

// Built once from WATER_QUALITY_PARAMS so adding a param there is enough.
const paramFields = Object.fromEntries(
  WATER_QUALITY_PARAMS.map((p) => [p.key, optionalNumeric(p.label)]),
) as Record<WaterQualityParameter, ReturnType<typeof optionalNumeric>>;

const dateField = z
  .string()
  .min(1, "Select a date")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date");

const timeField = z
  .string()
  .min(1, "Select a time")
  .regex(/^\d{2}:\d{2}$/, "Enter a time as HH:mm");

export const waterQualitySchema = z
  .object({
    date: dateField,
    time: timeField,
    systemId: z
      .string()
      .min(1, "Select a system")
      .regex(/^\d+$/, "Select a system")
      .transform(Number)
      .pipe(z.number().int().positive("Select a system")),
    phSource: z.enum(PH_SOURCES),
    ...paramFields,
    notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
  })
  .superRefine((values, ctx) => {
    const hasAnyParam = WATER_QUALITY_PARAMS.some((p) => values[p.key]);
    if (!hasAnyParam) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter at least one water quality parameter",
        path: ["root"],
      });
    }
  });

export type WaterQualityFormInput = z.input<typeof waterQualitySchema>;
export type WaterQualityFormValues = z.output<typeof waterQualitySchema>;
