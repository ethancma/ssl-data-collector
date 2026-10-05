"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DateTimeFields } from "@/components/forms/date-time-fields";
import { FieldError } from "@/components/forms/field-error";
import { Textarea } from "@/components/ui/textarea";
import {
  getPacificDateString,
  getPacificTimeString,
  parsePacificInstant,
} from "@/lib/pacific-date-time";
import {
  QUICK_PICK_HEADING_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
  SELECT_CLASS,
} from "@/components/forms/form-classes";
import { Label } from "@/components/ui/label";
import {
  MAINTENANCE_TASK_TYPES,
  type MaintenanceTaskType,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { nullIfBlank } from "@/lib/utils";
import {
  maintenanceLogSchema,
  type MaintenanceLogFormInput,
  type MaintenanceLogFormValues,
} from "@/lib/validation/maintenance-log";

type SystemOption = { id: number; name: string };

const TASK_TYPE_LABELS: Record<MaintenanceTaskType, string> = {
  filter_change: "Filter change",
  sump_flush: "Sump flush",
  other: "Other",
};

export function MaintenanceLogForm({
  systems,
  defaultSystemId,
}: {
  systems: SystemOption[];
  defaultSystemId?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MaintenanceLogFormInput, unknown, MaintenanceLogFormValues>({
    resolver: zodResolver(maintenanceLogSchema),
    defaultValues: {
      date: getPacificDateString(),
      time: getPacificTimeString(),
      systemId: defaultSystemId ?? "",
      taskType: "filter_change",
      notes: "",
    },
  });

  const onSubmit = async (values: MaintenanceLogFormValues) => {
    setServerError(null);
    const instant = parsePacificInstant(values.date, values.time);
    if (instant.error !== undefined) {
      setError("time", { message: instant.error });
      return;
    }

    const supabase = createClient();

    const { error } = await supabase.from("maintenance_logs").insert({
      performed_at: instant.iso,
      system_id: values.systemId,
      task_type: values.taskType,
      notes: nullIfBlank(values.notes),
    });
    if (error) {
      setServerError(error.message);
      return;
    }

    router.push("/protected/home");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Maintenance</CardTitle>
        <CardDescription>
          Log a filter change, sump flush, or other maintenance task for a system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <DateTimeFields
            idPrefix="maintenance"
            date={register("date")}
            time={register("time")}
            errors={{ date: errors.date?.message, time: errors.time?.message }}
          />

          <div className="grid gap-2">
            <Label htmlFor="maintenance-system">System</Label>
            <select
              id="maintenance-system"
              className={SELECT_CLASS}
              {...register("systemId")}
            >
              <option value="">Select a system…</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <FieldError
              id="maintenance-system-error"
              message={errors.systemId?.message}
            />
          </div>

          <div
            role="group"
            aria-labelledby="maintenance-task-type-label"
            className="grid content-start gap-2"
          >
            <p id="maintenance-task-type-label" className={QUICK_PICK_HEADING_CLASS}>
              Task
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {MAINTENANCE_TASK_TYPES.map((taskType) => (
                <label
                  key={taskType}
                  className={QUICK_PICK_OPTION_CLASS}
                  title={TASK_TYPE_LABELS[taskType]}
                >
                  <input
                    id={`maintenance-task-type-${taskType.replace(/_/g, "-")}`}
                    type="radio"
                    value={taskType}
                    {...register("taskType")}
                  />
                  <span className={QUICK_PICK_LABEL_CLASS}>{TASK_TYPE_LABELS[taskType]}</span>
                </label>
              ))}
            </div>
            <FieldError
              id="maintenance-task-type-error"
              message={errors.taskType?.message}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="maintenance-notes">Notes</Label>
            <Textarea
              id="maintenance-notes"
              rows={3}
              {...register("notes")}
            />
            <FieldError
              id="maintenance-notes-error"
              message={errors.notes?.message}
            />
          </div>

          <FieldError message={serverError ?? undefined} />

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save maintenance log"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
