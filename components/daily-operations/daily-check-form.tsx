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
import { HydratedForm } from "@/components/forms/hydrated-form";
import {
  getPacificDateString,
  getPacificTimeString,
  parsePacificInstant,
} from "@/lib/pacific-date-time";
import { QUICK_PICK_HEADING_CLASS } from "@/components/forms/form-classes";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHECK_TYPES, CONSUMPTION_STATUSES } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { nullIfBlank } from "@/lib/utils";
import {
  convertTemperatureInput,
  dailyCheckSchema,
  storedCelsius,
  TEMPERATURE_UNITS,
  temperatureInRange,
  temperatureRangeMessage,
  type DailyCheckFormInput,
  type DailyCheckFormValues,
  type TemperatureUnit,
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

// System | Temperature | Water running | Notes; stacks into one block per system on phones.
const ROW_GRID_CLASS =
  "grid gap-3 sm:grid-cols-[minmax(8rem,1fr)_8rem_9rem_minmax(10rem,2fr)] sm:items-start";

export function DailyCheckForm({
  systems,
  defaultCheckType,
  pendingFeedingLogs = [],
  pendingFeedingLoadError,
}: {
  systems: SystemOption[];
  defaultCheckType?: (typeof CHECK_TYPES)[number];
  pendingFeedingLogs?: PendingFeedingLog[];
  pendingFeedingLoadError?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  // Set once the round inserts, so a retry after a failed consumption follow-up
  // only re-runs the follow-up instead of duplicating every system's check.
  const [checksSaved, setChecksSaved] = useState(false);
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
    clearErrors,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<DailyCheckFormInput, unknown, DailyCheckFormValues>({
    resolver: zodResolver(dailyCheckSchema),
    defaultValues: {
      date: getPacificDateString(),
      time: getPacificTimeString(),
      checkType: defaultCheckType ?? "AM",
      temperatureUnit: "F",
      systems: systems.map((system) => ({
        systemId: String(system.id),
        waterRunning: false,
        temperature: "",
        notes: "",
      })),
    },
  });

  const checkType = watch("checkType");
  const temperatureUnit = watch("temperatureUnit");
  const followUpSystems = systems
    .map((system) => ({
      system,
      logs: pendingFeedingLogs.filter((log) => log.systemId === system.id),
    }))
    .filter(({ logs }) => logs.length > 0);

  const changeTemperatureUnit = (nextUnit: TemperatureUnit) => {
    const currentUnit = getValues("temperatureUnit");
    if (nextUnit === currentUnit) return;

    const currentRows = getValues("systems");
    const invalidIndexes = currentRows.flatMap(({ temperature }, index) => {
      if (!temperature.trim()) return [];
      const value = Number(temperature);
      return Number.isFinite(value) && temperatureInRange(value, currentUnit)
        ? []
        : [index];
    });
    if (invalidIndexes.length > 0) {
      for (const index of invalidIndexes) {
        setError(`systems.${index}.temperature`, {
          message: temperatureRangeMessage(currentUnit),
        });
      }
      return;
    }

    setValue("temperatureUnit", nextUnit, { shouldDirty: true });
    currentRows.forEach(({ temperature, temperatureSource }, index) => {
      if (!temperature.trim()) return;
      const source = temperatureSource ?? { value: temperature, unit: currentUnit };
      setValue(
        `systems.${index}.temperatureSource`,
        source.unit === nextUnit ? undefined : source,
      );
      setValue(`systems.${index}.temperature`, convertTemperatureInput(source.value, source.unit, nextUnit), {
        shouldDirty: true,
      });
      clearErrors(`systems.${index}.temperature`);
    });
  };

  const onSubmit = async (values: DailyCheckFormValues) => {
    setServerError(null);
    const instant = parsePacificInstant(values.date, values.time);
    if (instant.error !== undefined) {
      setError("time", { message: instant.error });
      return;
    }

    const supabase = createClient();
    if (!checksSaved) {
      // One multi-row insert is a single statement, so the round saves all-or-nothing.
      const { error } = await supabase.from("daily_checks").insert(
        values.systems.map((row) => ({
          checked_at: instant.iso,
          system_id: row.systemId,
          check_type: values.checkType,
          water_running: row.waterRunning,
          temperature: row.temperature,
          notes: nullIfBlank(row.notes),
        })),
      );
      if (error) {
        setServerError(error.message);
        return;
      }
      setChecksSaved(true);
    }

    const consumptionUpdates =
      values.checkType === "PM"
        ? pendingFeedingLogs.filter((log) => consumption[log.id])
        : [];
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
        setServerError(
          `Checks saved, but consumption follow-up failed: ${failed.error.message}. Retry saves only the follow-up.`,
        );
        return;
      }
    }

    router.push("/protected/home");
    router.refresh();
  };

  const saveLabel = checksSaved
    ? "Retry consumption follow-up"
    : `Save ${systems.length} ${systems.length === 1 ? "check" : "checks"}`;

  return (
    <Card className="w-full max-w-4xl">
      <CardHeader>
        <CardTitle className="text-2xl">Daily check</CardTitle>
        <CardDescription>
          Log the AM or PM check for every system in one save. Temperatures are saved in Celsius.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <HydratedForm onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 md:gap-5">
          <DateTimeFields
            idPrefix="daily-check"
            date={register("date")}
            time={register("time")}
            errors={{ date: errors.date?.message, time: errors.time?.message }}
          />

          <div className="grid gap-2">
            <Label>Check</Label>
            <div className="flex gap-2 sm:max-w-xs">
              {CHECK_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={checkType === t ? "default" : "outline"}
                  aria-pressed={checkType === t}
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

          <div role="group" aria-labelledby="daily-check-systems-heading" className="grid gap-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p id="daily-check-systems-heading" className={QUICK_PICK_HEADING_CLASS}>
                Systems
              </p>
              <div role="group" aria-label="Temperature unit" className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Temperature unit</span>
                {TEMPERATURE_UNITS.map((unit) => (
                  <Button
                    key={unit}
                    type="button"
                    size="sm"
                    variant={temperatureUnit === unit ? "default" : "outline"}
                    aria-pressed={temperatureUnit === unit}
                    onClick={() => changeTemperatureUnit(unit)}
                  >
                    °{unit}
                  </Button>
                ))}
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-input">
              <div
                aria-hidden="true"
                className={`${ROW_GRID_CLASS} hidden bg-muted/30 px-4 py-2 text-xs text-muted-foreground sm:grid`}
              >
                <span>System</span>
                <span>Temperature (°{temperatureUnit})</span>
                <span>Water running</span>
                <span>Notes</span>
              </div>
              {systems.map((system, index) => {
                const rowErrors = errors.systems?.[index];
                const idPrefix = `daily-check-${system.id}`;
                const temperature = watch(`systems.${index}.temperature`);
                const temperatureSource = watch(`systems.${index}.temperatureSource`);
                const numericTemperature = Number(temperature);
                const celsiusPreview =
                  (temperatureUnit === "F" || temperatureSource) &&
                  temperature.trim() &&
                  Number.isFinite(numericTemperature) &&
                  temperatureInRange(numericTemperature, temperatureUnit)
                    ? storedCelsius(
                        temperatureSource ? Number(temperatureSource.value) : numericTemperature,
                        temperatureSource?.unit ?? temperatureUnit,
                      ).toFixed(2)
                    : null;
                return (
                  <div
                    key={system.id}
                    role="group"
                    aria-labelledby={`${idPrefix}-name`}
                    className={`${ROW_GRID_CLASS} border-t border-input px-4 py-3 [&:nth-child(2)]:border-t-0 sm:[&:nth-child(2)]:border-t`}
                  >
                    <p id={`${idPrefix}-name`} className="text-sm font-medium sm:pt-2">
                      {system.name}
                    </p>
                    <div className="grid gap-1">
                      <Label htmlFor={`${idPrefix}-temperature`} className="sm:sr-only">
                        Temperature (°{temperatureUnit})
                      </Label>
                      <Input
                        id={`${idPrefix}-temperature`}
                        inputMode="decimal"
                        placeholder={temperatureUnit === "F" ? "e.g. 54.5" : "e.g. 12.5"}
                        aria-label={`${system.name} temperature (°${temperatureUnit})`}
                        aria-invalid={Boolean(rowErrors?.temperature)}
                        aria-describedby={
                          rowErrors?.temperature ? `${idPrefix}-temperature-error` : undefined
                        }
                        {...register(`systems.${index}.temperature`, {
                          onChange: () => {
                            setValue(`systems.${index}.temperatureSource`, undefined);
                            clearErrors(`systems.${index}.temperature`);
                          },
                        })}
                      />
                      {celsiusPreview !== null && (
                        <p className="text-xs text-muted-foreground">→ {celsiusPreview} °C</p>
                      )}
                      <FieldError
                        id={`${idPrefix}-temperature-error`}
                        message={rowErrors?.temperature?.message}
                      />
                    </div>
                    <div className="flex h-9 items-center gap-2">
                      <Controller
                        control={control}
                        name={`systems.${index}.waterRunning`}
                        render={({ field }) => (
                          <Checkbox
                            id={`${idPrefix}-water-running`}
                            aria-label={`${system.name} water running`}
                            checked={field.value}
                            onCheckedChange={(v) => field.onChange(v === true)}
                          />
                        )}
                      />
                      <Label htmlFor={`${idPrefix}-water-running`}>
                        <span className="sm:sr-only">Water running</span>
                        <span aria-hidden="true" className="hidden sm:inline">Running</span>
                      </Label>
                    </div>
                    <div className="grid gap-1">
                      <Label htmlFor={`${idPrefix}-notes`} className="sm:sr-only">
                        Notes
                      </Label>
                      <Input
                        id={`${idPrefix}-notes`}
                        aria-label={`${system.name} notes`}
                        aria-invalid={Boolean(rowErrors?.notes)}
                        aria-describedby={
                          rowErrors?.notes ? `${idPrefix}-notes-error` : undefined
                        }
                        {...register(`systems.${index}.notes`)}
                      />
                      <FieldError
                        id={`${idPrefix}-notes-error`}
                        message={rowErrors?.notes?.message}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              Check the box only after you see water running. Unchecked saves as not running.
            </p>
            <FieldError message={errors.systems?.root?.message ?? errors.systems?.message} />
          </div>

          {pendingFeedingLoadError && (
            <p className="text-sm text-red-500" role="alert">
              Pending feeding follow-ups could not be loaded. Consumption updates may be
              incomplete. {pendingFeedingLoadError}
            </p>
          )}

          {followUpSystems.length > 0 && checkType === "PM" && (
            <div className="grid gap-4">
              <Label>Consumption follow-up</Label>
              {followUpSystems.map(({ system, logs }) => (
                <div key={system.id} className="grid gap-3">
                  <p className="text-sm text-muted-foreground">{system.name}</p>
                  {logs.map((log) => (
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
              ))}
            </div>
          )}

          <FieldError message={serverError ?? undefined} />

          <Button type="submit" disabled={isSubmitting} className="sm:self-end">
            {isSubmitting ? "Saving…" : saveLabel}
          </Button>
        </HydratedForm>
      </CardContent>
    </Card>
  );
}
