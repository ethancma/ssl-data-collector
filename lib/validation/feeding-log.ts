import { z } from "zod";

import { FOOD_TYPES, type FoodType } from "@/lib/config/reference-data";

const idField = (label: string) =>
  z
    .string()
    .min(1, label)
    .regex(/^\d+$/, label)
    .transform(Number)
    .pipe(z.number().int().positive(label));

// Validation for the per-animal feeding log form. amount stays free text since
// units vary by food type (e.g. "2 krill", "half a pellet").
export const feedingLogSchema = z.object({
  animalId: idField("Select an animal"),
  tankId: idField("Select an animal"),
  foodType: z
    .enum(FOOD_TYPES)
    .optional()
    .refine((v): v is FoodType => v !== undefined, "Select a food type"),
  amount: z
    .string()
    .min(1, "Enter an amount")
    .max(200, "Keep the amount under 200 characters"),
  notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
});

export type FeedingLogFormInput = z.input<typeof feedingLogSchema>;
export type FeedingLogFormValues = z.output<typeof feedingLogSchema>;
