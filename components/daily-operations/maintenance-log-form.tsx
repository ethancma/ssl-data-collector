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
import {
  getPacificDateString,
  getPacificTimeString,
  pacificWallTimeToIso,
} from "@/lib/pacific-date-time";
import {
  QUICK_PICK_HEADING_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
  SELECT_CLASS,
} from "@/components/forms/form-classes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAINTENANCE_TASK_TYPES,
  type MaintenanceTaskType,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
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
    let performedAt: string;
    try {
      performedAt = pacificWallTimeToIso(values.date, values.time);
    } catch (error) {
      setError("time", {
        message: error instanceof Error ? error.message : "Enter a valid Pacific time",
      });
      return;
    }

    const supabase = createClient();

    const { error } = await supabase.from("maintenance_logs").insert({
      performed_at: performedAt,
      system_id: values.systemId,
      task_type: values.taskType,
      notes: values.notes?.trim() ? values.notes.trim() : null,
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
          <div className="grid gap-4 rounded-lg border border-input bg-muted/30 p-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" {...register("date")} />
              {errors.date && (
                <p className="text-sm text-red-500">{errors.date.message}</p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="time">Time</Label>
              <Input id="time" type="time" {...register("time")} />
              {errors.time && (
                <p className="text-sm text-red-500">{errors.time.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemId">System</Label>
            <select
              id="systemId"
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
            {errors.systemId && (
              <p className="text-sm text-red-500">{errors.systemId.message}</p>
            )}
          </div>

          <div
            role="group"
            aria-labelledby="maintenance-task-label"
            className="grid content-start gap-2"
          >
            <p id="maintenance-task-label" className={QUICK_PICK_HEADING_CLASS}>
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
                    type="radio"
                    value={taskType}
                    {...register("taskType")}
                  />
                  <span className={QUICK_PICK_LABEL_CLASS}>{TASK_TYPE_LABELS[taskType]}</span>
                </label>
              ))}
            </div>
            {errors.taskType && (
              <p className="text-sm text-red-500">{errors.taskType.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              rows={3}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm",
              )}
              {...register("notes")}
            />
            {errors.notes && (
              <p className="text-sm text-red-500">{errors.notes.message}</p>
            )}
          </div>

          {serverError && <p className="text-sm text-red-500">{serverError}</p>}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save maintenance log"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
