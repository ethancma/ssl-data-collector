"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";

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
import { SELECT_CLASS } from "@/components/forms/form-classes";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHECK_TYPES, CONSUMPTION_STATUSES } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { nullIfBlank } from "@/lib/utils";
import {
  dailyCheckSchema,
  type DailyCheckFormInput,
  type DailyCheckFormValues,
} from "@/lib/validation/daily-check";

type SystemOption = { id: number; name: string };
type PendingFeedingLog = { id: number; animalName: string; systemId: number };
type ConsumptionStatus = (typeof CONSUMPTION_STATUSES)[number];

const CONSUMPTION_LABELS: Record<ConsumptionStatus, string> = {
  full: "Full",
  partial: "Partial",
  none: "None",
  unknown: "Unknown",
};

export function DailyCheckForm({
  systems,
  defaultSystemId,
  defaultCheckType,
  pendingFeedingLogs = [],
}: {
  systems: SystemOption[];
  defaultSystemId?: string;
  defaultCheckType?: (typeof CHECK_TYPES)[number];
  pendingFeedingLogs?: PendingFeedingLog[];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  // Per-animal consumption picks for the PM follow-up section; kept outside the
  // zod-validated form state since it's optional and shouldn't block the check.
  const [consumption, setConsumption] = useState<
    Record<number, ConsumptionStatus | "">
  >({});

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DailyCheckFormInput, unknown, DailyCheckFormValues>({
    resolver: zodResolver(dailyCheckSchema),
    defaultValues: {
      date: getPacificDateString(),
      time: getPacificTimeString(),
      systemId: defaultSystemId ?? "",
      checkType: defaultCheckType ?? "AM",
      waterRunning: true,
      temperature: "",
      notes: "",
    },
  });

  const checkType = watch("checkType");
  const systemId = watch("systemId");
  const pendingFeedingLogsForSystem = pendingFeedingLogs.filter(
    (log) => log.systemId === Number(systemId),
  );

  const onSubmit = async (values: DailyCheckFormValues) => {
    setServerError(null);
    const instant = parsePacificInstant(values.date, values.time);
    if (instant.error !== undefined) {
      setError("time", { message: instant.error });
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("daily_checks").insert({
      checked_at: instant.iso,
      system_id: values.systemId, // already coerced to a positive int by dailyCheckSchema
      check_type: values.checkType,
      water_running: values.waterRunning,
      temperature: values.temperature ? Number(values.temperature) : null,
      notes: nullIfBlank(values.notes),
    });
    if (error) {
      setServerError(error.message);
      return;
    }

    const consumptionUpdates = pendingFeedingLogsForSystem.filter(
      (log) => consumption[log.id],
    );
    if (consumptionUpdates.length > 0) {
      const results = await Promise.all(
        consumptionUpdates.map((log) =>
          supabase
            .from("feeding_logs")
            .update({
              consumption_status: consumption[log.id],
              consumption_checked_at: new Date().toISOString(),
            })
            .eq("id", log.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) {
        // The daily check already saved; surface this without re-submitting it.
        setServerError(
          `Check saved, but consumption follow-up failed: ${failed.error.message}`,
        );
        return;
      }
    }

    router.push("/protected/home");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Daily check</CardTitle>
        <CardDescription>
          Log the AM or PM check for a system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <DateTimeFields
            idPrefix="daily-check"
            date={register("date")}
            time={register("time")}
            errors={{ date: errors.date?.message, time: errors.time?.message }}
          />

          <div className="grid gap-2">
            <Label htmlFor="daily-check-system">System</Label>
            <select
              id="daily-check-system"
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
              id="daily-check-system-error"
              message={errors.systemId?.message}
            />
          </div>

          <div className="grid gap-2">
            <Label>Check</Label>
            <div className="flex gap-2">
              {CHECK_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={checkType === t ? "default" : "outline"}
                  className="flex-1"
                  onClick={() =>
                    setValue("checkType", t, { shouldValidate: true })
                  }
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="waterRunning"
              render={({ field }) => (
                <Checkbox
                  id="daily-check-water-running"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            <Label htmlFor="daily-check-water-running">Water running</Label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="daily-check-temperature">Temperature (°C)</Label>
            <Input
              id="daily-check-temperature"
              inputMode="decimal"
              placeholder="e.g. 12.5"
              {...register("temperature")}
            />
            <FieldError
              id="daily-check-temperature-error"
              message={errors.temperature?.message}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="daily-check-notes">Notes</Label>
            <Textarea
              id="daily-check-notes"
              rows={3}
              {...register("notes")}
            />
            <FieldError
              id="daily-check-notes-error"
              message={errors.notes?.message}
            />
          </div>

          {pendingFeedingLogsForSystem.length > 0 && checkType === "PM" && (
            <div className="grid gap-4">
              <Label>Consumption follow-up</Label>
              {pendingFeedingLogsForSystem.map((log) => (
                <div key={log.id} className="grid gap-2">
                  <Label>{log.animalName}</Label>
                  <div className="flex gap-2">
                    {CONSUMPTION_STATUSES.map((status) => (
                      <Button
                        key={status}
                        type="button"
                        variant={
                          consumption[log.id] === status ? "default" : "outline"
                        }
                        className="flex-1"
                        onClick={() =>
                          setConsumption((prev) => ({
                            ...prev,
                            [log.id]: status,
                          }))
                        }
                      >
                        {CONSUMPTION_LABELS[status]}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <FieldError message={serverError ?? undefined} />

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save check"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
