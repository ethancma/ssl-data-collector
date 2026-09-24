import { z } from "zod";

import { MAINTENANCE_TASK_TYPES } from "@/lib/config/reference-data";

const dateField = z
  .string()
  .min(1, "Select a date")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date");

const timeField = z
  .string()
  .min(1, "Select a time")
  .regex(/^\d{2}:\d{2}$/, "Enter a time as HH:mm");

// Validation for the maintenance log form.
export const maintenanceLogSchema = z.object({
  date: dateField,
  time: timeField,
  systemId: z
    .string()
    .min(1, "Select a system")
    .regex(/^\d+$/, "Select a system")
    .transform(Number)
    .pipe(z.number().int().positive("Select a system")),
  taskType: z.enum(MAINTENANCE_TASK_TYPES),
  notes: z.string().max(2000, "Keep the notes under 2000 characters").optional(),
});

export type MaintenanceLogFormInput = z.input<typeof maintenanceLogSchema>;
export type MaintenanceLogFormValues = z.output<typeof maintenanceLogSchema>;
