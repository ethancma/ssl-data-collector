import { z } from "zod";

import {
  HEALTH_ISSUE_TYPES,
  SEVERITY_MAX,
  SEVERITY_MIN,
} from "@/lib/config/reference-data";
import { dateField, idField, timeField } from "@/lib/validation/common-fields";

const severityMessage = `Enter a whole number from ${SEVERITY_MIN} to ${SEVERITY_MAX}`;

// Severity starts blank and must be entered.
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
  notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
});

export type HealthObservationFormInput = z.input<typeof healthObservationSchema>;
export type HealthObservationFormValues = z.output<typeof healthObservationSchema>;
