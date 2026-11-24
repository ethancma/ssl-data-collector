import { z } from "zod";

import {
  HEALTH_ISSUE_TYPES,
  SEVERITY_MAX,
  SEVERITY_MIN,
} from "@/lib/config/reference-data";
import { dateField, idField, timeField } from "@/lib/validation/common-fields";

const severityMessage = `Enter a whole number from ${SEVERITY_MIN} to ${SEVERITY_MAX}`;

// Severity starts blank and must be entered. Spines found applies only to Spine drop;
// blank means not counted and saves null.
export const healthObservationSchema = z.object({
  date: dateField,
  time: timeField,
  animalId: idField("Select an animal"),
  tankId: idField("Select an animal"),
  severity: z
    .string()
    .trim()
    .min(1, "Enter a severity score")
    .regex(/^\d+$/, severityMessage)
    .transform(Number)
    .pipe(z.number().int().min(SEVERITY_MIN, severityMessage).max(SEVERITY_MAX, severityMessage)),
  issues: z.array(z.enum(HEALTH_ISSUE_TYPES)).default([]),
  spineCount: z.string().trim().optional(),
  notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
}).superRefine((values, ctx) => {
  if (!values.issues.includes("spine_drop") || !values.spineCount) return;
  if (!/^\d+$/.test(values.spineCount) || Number(values.spineCount) < 1) {
    ctx.addIssue({
      code: "custom",
      path: ["spineCount"],
      message: "Enter a whole number of 1 or more, or leave blank",
    });
  }
}).transform(({ spineCount, ...values }) => ({
  ...values,
  spineCount: values.issues.includes("spine_drop") && spineCount ? Number(spineCount) : null,
}));

export type HealthObservationFormInput = z.input<typeof healthObservationSchema>;
export type HealthObservationFormValues = z.output<typeof healthObservationSchema>;
