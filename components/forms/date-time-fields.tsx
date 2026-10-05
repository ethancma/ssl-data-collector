import type { UseFormRegisterReturn } from "react-hook-form";

import { FieldError } from "@/components/forms/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function DateTimeFields({
  idPrefix,
  date,
  time,
  errors,
  dateLabel = "Date",
  dateMin,
  dateMax,
}: {
  idPrefix: string;
  date: UseFormRegisterReturn;
  time: UseFormRegisterReturn;
  errors: { date?: string; time?: string };
  dateLabel?: string;
  dateMin?: string;
  dateMax?: string;
}) {
  const dateId = `${idPrefix}-date`;
  const timeId = `${idPrefix}-time`;
  const dateErrorId = `${idPrefix}-date-error`;
  const timeErrorId = `${idPrefix}-time-error`;

  return (
    <div className="grid gap-4 rounded-lg border border-input bg-muted/30 p-4 sm:grid-cols-2">
      <div className="grid content-start gap-2">
        <Label htmlFor={dateId}>{dateLabel}</Label>
        <Input
          id={dateId}
          type="date"
          aria-invalid={Boolean(errors.date)}
          aria-describedby={errors.date ? dateErrorId : undefined}
          {...date}
          min={dateMin}
          max={dateMax}
        />
        <FieldError id={dateErrorId} message={errors.date} />
      </div>
      <div className="grid content-start gap-2">
        <Label htmlFor={timeId}>Time</Label>
        <Input
          id={timeId}
          type="time"
          aria-invalid={Boolean(errors.time)}
          aria-describedby={errors.time ? timeErrorId : undefined}
          {...time}
        />
        <FieldError id={timeErrorId} message={errors.time} />
      </div>
    </div>
  );
}
