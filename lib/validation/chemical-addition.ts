import { z } from "zod";

// Validation for the chemical addition log form.
export const chemicalAdditionSchema = z.object({
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
