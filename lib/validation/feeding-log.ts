import { z } from "zod";

const idField = (label: string) =>
  z
    .string()
    .min(1, label)
    .regex(/^\d+$/, label)
    .transform(Number)
    .pipe(z.number().int().positive(label));

const dateField = z
  .string()
  .min(1, "Select a date")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date");

const timeField = z
  .string()
  .min(1, "Select a time")
  .regex(/^\d{2}:\d{2}$/, "Enter a time as HH:mm");

export const feedingLogSchema = z.object({
  date: dateField,
  time: timeField,
  animalId: idField("Select an animal"),
  tankId: idField("Select an animal"),
  amount: z
    .string()
    .refine(
      (value) =>
        value.trim() === "" ||
        (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value.trim()) &&
          Number.isFinite(Number(value.trim()))),
      "Enter a finite numeric amount",
    )
    .refine(
      (value) =>
        value.trim() === "" ||
        !Number.isFinite(Number(value.trim())) ||
        Number(value.trim()) > 0,
      "Enter an amount greater than 0",
    ),
  amountUnit: z.string().max(50, "Keep the unit under 50 characters"),
  notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
});

export type FeedingLogFormInput = z.input<typeof feedingLogSchema>;
export type FeedingLogFormValues = z.output<typeof feedingLogSchema>;
