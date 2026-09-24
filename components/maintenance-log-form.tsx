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

function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function getCurrentTimeString(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

// Combines the user-picked date and time-of-day into a single timestamp.
function combineDateAndTime(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

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
    formState: { errors, isSubmitting },
  } = useForm<MaintenanceLogFormInput, unknown, MaintenanceLogFormValues>({
    resolver: zodResolver(maintenanceLogSchema),
    defaultValues: {
      date: getTodayDateString(),
      time: getCurrentTimeString(),
      systemId: defaultSystemId ?? "",
      taskType: "filter_change",
      notes: "",
    },
  });

  const onSubmit = async (values: MaintenanceLogFormValues) => {
    setServerError(null);
    const supabase = createClient();

    const { error } = await supabase.from("maintenance_logs").insert({
      performed_at: combineDateAndTime(values.date, values.time),
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
          <div className="grid gap-2 rounded-lg border border-input bg-muted/30 p-4">
            <Label htmlFor="date">Date</Label>
            <Input id="date" type="date" {...register("date")} />
            {errors.date && (
              <p className="text-sm text-red-500">{errors.date.message}</p>
            )}
            <Label htmlFor="time">Time</Label>
            <Input id="time" type="time" {...register("time")} />
            {errors.time && (
              <p className="text-sm text-red-500">{errors.time.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemId">System</Label>
            <select
              id="systemId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
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

          <fieldset className="grid gap-3">
            <legend className="text-sm font-medium">Task</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MAINTENANCE_TASK_TYPES.map((taskType) => (
                <label
                  key={taskType}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted"
                >
                  <input
                    type="radio"
                    value={taskType}
                    {...register("taskType")}
                  />
                  {TASK_TYPE_LABELS[taskType]}
                </label>
              ))}
            </div>
            {errors.taskType && (
              <p className="text-sm text-red-500">{errors.taskType.message}</p>
            )}
          </fieldset>

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
