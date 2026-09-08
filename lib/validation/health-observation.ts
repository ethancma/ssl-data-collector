import { z } from "zod";

import {
  HEALTH_ISSUE_TYPES,
  PHOTO_ALWAYS_REQUIRED_ISSUES,
  SEVERITY_LEVELS,
  type SeverityLevel,
} from "@/lib/config/reference-data";

const idField = (label: string) =>
  z
    .string()
    .min(1, label)
    .regex(/^\d+$/, label)
    .transform(Number)
    .pipe(z.number().int().positive(label));

// Validation for the health observation form. severity has no meaningful default
// (the exact scale criteria are still an open question per
// docs/implementation-checklist.md), so it starts unset and must be chosen.
export const healthObservationSchema = z
  .object({
    animalId: idField("Select an animal"),
    tankId: idField("Select an animal"),
    severity: z
      .enum(SEVERITY_LEVELS)
      .optional()
      .refine(
        (v): v is SeverityLevel => v !== undefined,
        "Select a severity",
      ),
    issues: z.array(z.enum(HEALTH_ISSUE_TYPES)).default([]),
    photoFile: z.instanceof(File).optional(),
    notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
  })
  .superRefine((values, ctx) => {
    const requiresPhoto = values.issues.some((issue) =>
      PHOTO_ALWAYS_REQUIRED_ISSUES.includes(issue),
    );
    if (requiresPhoto && !values.photoFile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A photo is required for arm drop, spine drop, or lesion observations",
        path: ["photoFile"],
      });
    }
  });

export type HealthObservationFormInput = z.input<typeof healthObservationSchema>;
export type HealthObservationFormValues = z.output<typeof healthObservationSchema>;
