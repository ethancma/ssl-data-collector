import { z } from "zod";

import {
  getStarTreatmentMeasurementErrors,
  normalizeSnapshot,
} from "@/lib/daily-operations/quick-pick-catalogs";
import { getPacificDateString } from "@/lib/pacific-date-time";

export const optionalPositiveNumber = z.string().refine((value) => {
  if (value.trim() === "") return true;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0;
}, "Enter a positive number");

export function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export const starTreatmentFields = {
  catalogId: z
    .string()
    .refine((value) => value === "" || /^\d+$/.test(value), "Select a quick pick"),
  treatmentName: z
    .string()
    .refine((value) => normalizeSnapshot(value) !== "", "Enter the treatment name")
    .max(100, "Keep the treatment name under 100 characters"),
  amount: optionalPositiveNumber,
  unit: z.string().max(50, "Keep the unit under 50 characters"),
  concentration: optionalPositiveNumber,
  concentrationUnit: z
    .string()
    .max(50, "Keep the concentration unit under 50 characters"),
  notes: z.string().max(5000, "Keep notes under 5000 characters"),
};

function refineStarTreatmentMeasurements(
  values: z.output<z.ZodObject<typeof starTreatmentFields>>,
  context: z.RefinementCtx,
) {
  const measurementErrors = getStarTreatmentMeasurementErrors({
    treatmentName: values.treatmentName,
    amount: values.amount,
    amountUnit: values.unit,
    concentration: values.concentration,
    concentrationUnit: values.concentrationUnit,
  });

  if (measurementErrors.amount) {
    context.addIssue({
      code: "custom",
      path: ["amount"],
      message: measurementErrors.amount,
    });
  }
  if (measurementErrors.amountUnit) {
    context.addIssue({
      code: "custom",
      path: ["unit"],
      message: measurementErrors.amountUnit,
    });
  }
  if (measurementErrors.concentrationUnit) {
    context.addIssue({
      code: "custom",
      path: ["concentrationUnit"],
      message: measurementErrors.concentrationUnit,
    });
  }
}

export const starTreatmentEditSchema = z
  .object(starTreatmentFields)
  .superRefine(refineStarTreatmentMeasurements);

export const starTreatmentSchema = z
  .object({
    date: z
      .string()
      .min(1, "Select a date")
      .refine((value) => value === getPacificDateString(), "Date must be today in the lab"),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time"),
    ...starTreatmentFields,
  })
  .superRefine(refineStarTreatmentMeasurements);

export type StarTreatmentFormInput = z.input<typeof starTreatmentSchema>;
export type StarTreatmentFormValues = z.output<typeof starTreatmentSchema>;
export type StarTreatmentEditInput = z.input<typeof starTreatmentEditSchema>;
export type StarTreatmentEditValues = z.output<typeof starTreatmentEditSchema>;