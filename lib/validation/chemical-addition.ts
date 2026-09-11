import { z } from "zod";

const dateField = z
  .string()
  .min(1, "Select a date")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date");

const timeField = z
  .string()
  .min(1, "Select a time")
  .regex(/^\d{2}:\d{2}$/, "Enter a time as HH:mm");

// Validation for the chemical addition log form.
export const chemicalAdditionSchema = z.object({
  date: dateField,
  time: timeField,
  systemId: z
    .string()
    .min(1, "Select a system")
    .regex(/^\d+$/, "Select a system")
    .transform(Number)
    .pipe(z.number().int().positive("Select a system")),
  chemicalName: z
    .string()
    .min(1, "Enter a chemical name")
    .max(200, "Keep the chemical name under 200 characters"),
  amount: z
    .string()
    .min(1, "Enter an amount")
    .refine(
      (v) => !Number.isNaN(Number(v)) && Number(v) > 0,
      "Enter a positive number",
    ),
  unit: z.string().min(1, "Enter a unit").max(50, "Keep the unit under 50 characters"),
  reason: z.string().max(2000, "Keep the reason under 2000 characters").optional(),
});

export type ChemicalAdditionFormInput = z.input<typeof chemicalAdditionSchema>;
export type ChemicalAdditionFormValues = z.output<typeof chemicalAdditionSchema>;
