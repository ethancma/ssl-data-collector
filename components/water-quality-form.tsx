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
} from "@/components/daily-operations/pacific-date-time";
import {
  formatWaterQualityTarget,
  isWaterQualityValueOutOfRange,
  resolveWaterQualityTarget,
  waterQualityValuesRequireNotes,
  type WaterQualityTargetRange,
  type WaterQualityValues,
} from "@/components/daily-operations/water-quality-targets";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PH_SOURCES,
  WATER_QUALITY_PARAMETERS,
  WATER_QUALITY_PARAMS,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  waterQualitySchema,
  type WaterQualityFormInput,
  type WaterQualityFormValues,
} from "@/lib/validation/water-quality";

type SystemOption = { id: number; name: string };

const PH_SOURCE_LABELS: Record<(typeof PH_SOURCES)[number], string> = {
  manual: "Manual",
  apex_probe: "Apex probe",
};

function toNumericReading(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function WaterQualityForm({
  systems,
  targets,
  targetLoadError,
  defaultSystemId,
}: {
  systems: SystemOption[];
  targets: WaterQualityTargetRange[];
  targetLoadError?: string;
  defaultSystemId?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WaterQualityFormInput, unknown, WaterQualityFormValues>({
    resolver: zodResolver(waterQualitySchema),
    defaultValues: {
      date: getPacificDateString(),
      time: getPacificTimeString(),
      systemId: defaultSystemId ?? "",
      phSource: "manual",
      ...Object.fromEntries(WATER_QUALITY_PARAMETERS.map((key) => [key, ""])),
      notes: "",
    },
  });

  const watchedValues = watch();
  const phSource = watchedValues.phSource;
  const selectedSystemId = Number(watchedValues.systemId);

  const onSubmit = async (values: WaterQualityFormValues) => {
    setServerError(null);
    const numericValues = Object.fromEntries(
      WATER_QUALITY_PARAMETERS.map((key) => [
        key,
        toNumericReading(values[key]),
      ]),
    ) as WaterQualityValues;
    if (
      waterQualityValuesRequireNotes(numericValues, targets, values.systemId) &&
      !values.notes?.trim()
    ) {
      setError(
        "notes",
        { message: "Add notes for readings outside their target range" },
        { shouldFocus: true },
      );
      return;
    }

    let testedAt: string;
    try {
      testedAt = pacificWallTimeToIso(values.date, values.time);
    } catch (error) {
      setError("time", {
        message: error instanceof Error ? error.message : "Enter a valid Pacific time",
      });
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("water_quality_readings").insert({
      tested_at: testedAt,
      system_id: values.systemId,
      ph_source: values.phSource,
      ...Object.fromEntries(
        WATER_QUALITY_PARAMETERS.map((key) => [key, values[key] ? Number(values[key]) : null]),
      ),
      notes: values.notes?.trim() ? values.notes.trim() : null,
    });
    if (error) {
      if (error.message.includes("Notes are required when")) {
        setError(
          "notes",
          { message: "Add notes for readings outside their target range" },
          { shouldFocus: true },
        );
        return;
      }
      setServerError(error.message);
      return;
    }
    router.push("/protected/home");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">Water quality reading</CardTitle>
        <CardDescription>
          Log any of the {WATER_QUALITY_PARAMS.length} water chemistry parameters for a system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
          <div className="grid gap-4 rounded-lg border border-input bg-muted/30 p-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                className="min-h-11"
                aria-describedby={errors.date ? "water-quality-date-error" : undefined}
                aria-invalid={Boolean(errors.date)}
                {...register("date")}
              />
              {errors.date && (
                <p id="water-quality-date-error" className="text-sm text-red-500">
                  {errors.date.message}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                className="min-h-11"
                aria-describedby={errors.time ? "water-quality-time-error" : undefined}
                aria-invalid={Boolean(errors.time)}
                {...register("time")}
              />
              {errors.time && (
                <p id="water-quality-time-error" className="text-sm text-red-500">
                  {errors.time.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemId">System</Label>
            <select
              id="systemId"
              className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              aria-describedby={errors.systemId ? "water-quality-system-error" : undefined}
              aria-invalid={Boolean(errors.systemId)}
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
              <p id="water-quality-system-error" className="text-sm text-red-500">
                {errors.systemId.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>pH source</Label>
            <div className="flex gap-2">
              {PH_SOURCES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={phSource === s ? "default" : "outline"}
                  className="min-h-11 flex-1"
                  onClick={() => setValue("phSource", s, { shouldValidate: true })}
                >
                  {PH_SOURCE_LABELS[s]}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {WATER_QUALITY_PARAMS.map((param) => {
              const target =
                Number.isInteger(selectedSystemId) && selectedSystemId > 0
                  ? resolveWaterQualityTarget(targets, selectedSystemId, param.key)
                  : null;
              const warning = isWaterQualityValueOutOfRange(
                toNumericReading(watchedValues[param.key]),
                target,
              );
              const errorId = `water-quality-${param.key}-error`;
              const warningId = `water-quality-${param.key}-warning`;
              const describedBy = [
                errors[param.key] ? errorId : null,
                warning ? warningId : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined;

              return (
                <div key={param.key} className="grid content-start gap-2">
                  <Label htmlFor={param.key}>
                    {param.label} ({param.unit ?? "unitless"})
                  </Label>
                  <Input
                    id={param.key}
                    inputMode="decimal"
                    className="min-h-11"
                    placeholder="—"
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(errors[param.key])}
                    {...register(param.key)}
                  />
                  {errors[param.key] && (
                    <p id={errorId} className="text-sm text-red-500">
                      {errors[param.key]?.message}
                    </p>
                  )}
                  {warning && target && (
                    <p
                      id={warningId}
                      className="text-sm text-amber-700 dark:text-amber-400"
                      role="status"
                    >
                      Outside target {formatWaterQualityTarget(target, param.unit)}. Add notes to save.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <textarea
              id="notes"
              rows={3}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm",
              )}
              aria-describedby={errors.notes ? "water-quality-notes-error" : undefined}
              aria-invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
            {errors.notes && (
              <p id="water-quality-notes-error" className="text-sm text-red-500">
                {errors.notes.message}
              </p>
            )}
          </div>

          {targetLoadError && (
            <p className="text-sm text-red-500" role="alert">
              Target ranges could not be loaded. Refresh before saving: {targetLoadError}
            </p>
          )}

          {errors.root && (
            <p className="text-sm text-red-500">{errors.root.message}</p>
          )}
          {serverError && (
            <p className="text-sm text-red-500" role="alert">
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            className="min-h-11"
            disabled={isSubmitting || Boolean(targetLoadError)}
          >
            {isSubmitting ? "Saving…" : "Save reading"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
