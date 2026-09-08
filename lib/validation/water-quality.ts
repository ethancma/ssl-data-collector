import { z } from "zod";

import { PH_SOURCES } from "@/lib/config/reference-data";

// Validation for the weekly water quality reading form. The 7 params stay as
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

export const waterQualitySchema = z
  .object({
    systemId: z
      .string()
      .min(1, "Select a system")
      .regex(/^\d+$/, "Select a system")
      .transform(Number)
      .pipe(z.number().int().positive("Select a system")),
    phSource: z.enum(PH_SOURCES),
    ph: optionalNumeric("pH"),
    magnesium: optionalNumeric("magnesium"),
    ammonia: optionalNumeric("ammonia"),
    alkalinity: optionalNumeric("alkalinity"),
    calcium: optionalNumeric("calcium"),
    phosphate: optionalNumeric("phosphate"),
    salinity: optionalNumeric("salinity"),
    notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
  })
  .superRefine((values, ctx) => {
    const params = [
      values.ph,
      values.magnesium,
      values.ammonia,
      values.alkalinity,
      values.calcium,
      values.phosphate,
      values.salinity,
    ];
    if (params.every((v) => !v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter at least one water quality parameter",
        path: ["root"],
      });
    }
  });

export type WaterQualityFormInput = z.input<typeof waterQualitySchema>;
export type WaterQualityFormValues = z.output<typeof waterQualitySchema>;
