import { z } from "zod";

export const dateField = z
  .string()
  .min(1, "Select a date")
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date as YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year < 100) {
      date.setUTCFullYear(year, month - 1, day);
    }
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "Enter a valid date");

export const timeField = z
  .string()
  .min(1, "Select a time")
  .regex(/^\d{2}:\d{2}$/, "Enter a time as HH:mm");

export const idField = (label: string) =>
  z
    .string()
    .min(1, label)
    .regex(/^\d+$/, label)
    .transform(Number)
    .pipe(z.number().int().positive(label));