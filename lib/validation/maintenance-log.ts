import { z } from "zod";

import { MAINTENANCE_TASK_TYPES } from "@/lib/config/reference-data";

// Validation for the maintenance log form.
export const maintenanceLogSchema = z.object({
  systemId: z
    .string()
    .min(1, "Select a system")
    .regex(/^\d+$/, "Select a system")
    .transform(Number)
    .pipe(z.number().int().positive("Select a system")),
  taskTypes: z
    .array(z.enum(MAINTENANCE_TASK_TYPES))
    .min(1, "Select at least one task"),
  notes: z.string().max(2000, "Keep the notes under 2000 characters").optional(),
});

export type MaintenanceLogFormInput = z.input<typeof maintenanceLogSchema>;
export type MaintenanceLogFormValues = z.output<typeof maintenanceLogSchema>;
