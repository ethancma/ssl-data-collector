import { z } from "zod";

import { dateField, idField, timeField } from "@/lib/validation/common-fields";

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
  notes: z.string().max(2000, "Keep notes under 2000 characters").optional(),
});
