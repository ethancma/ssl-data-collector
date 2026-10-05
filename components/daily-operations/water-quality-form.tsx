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
import { SELECT_CLASS } from "@/components/forms/form-classes";
import {
  formatWaterQualityTarget,
  isWaterQualityValueOutOfRange,
  resolveWaterQualityTarget,
  waterQualityValuesRequireNotes,
  type WaterQualityTargetRange,
  type WaterQualityValues,
} from "@/lib/daily-operations/water-quality-targets";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PH_SOURCES,
  WATER_QUALITY_PARAMETERS,
  WATER_QUALITY_PARAMS,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { nullIfBlank } from "@/lib/utils";
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

    const instant = parsePacificInstant(values.date, values.time);
    if (instant.error !== undefined) {
      setError("time", { message: instant.error });
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("water_quality_readings").insert({
      tested_at: instant.iso,
      system_id: values.systemId,
      ph_source: values.phSource,
      ...Object.fromEntries(
        WATER_QUALITY_PARAMETERS.map((key) => [key, values[key] ? Number(values[key]) : null]),
      ),
      notes: nullIfBlank(values.notes),
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
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Water quality reading</CardTitle>
        <CardDescription>
          Log any of the {WATER_QUALITY_PARAMS.length} water chemistry parameters for a system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
          <DateTimeFields
            idPrefix="water-quality"
            date={register("date")}
            time={register("time")}
            errors={{ date: errors.date?.message, time: errors.time?.message }}
          />

          <div className="grid gap-2">
            <Label htmlFor="water-quality-system">System</Label>
            <select
              id="water-quality-system"
              className={SELECT_CLASS}
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
            <FieldError id="water-quality-system-error" message={errors.systemId?.message} />
          </div>

          <div className="grid gap-2">
            <Label>pH source</Label>
            <div className="flex gap-2">
              {PH_SOURCES.map((s) => (
                <Button
                  key={s}
                  type="button"
                  variant={phSource === s ? "default" : "outline"}
                  className="flex-1"
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
              const paramId = `water-quality-${param.key.replace(/_/g, "-")}`;
              const errorId = `${paramId}-error`;
              const warningId = `${paramId}-warning`;
              const describedBy = [
                errors[param.key] ? errorId : null,
                warning ? warningId : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined;

              return (
                <div key={param.key} className="grid content-start gap-2">
                  <Label htmlFor={paramId}>
                    {param.label} ({param.unit ?? "unitless"})
                  </Label>
                  <Input
                    id={paramId}
                    inputMode="decimal"
                    placeholder="—"
                    aria-describedby={describedBy}
                    aria-invalid={Boolean(errors[param.key])}
                    {...register(param.key)}
                  />
                  <FieldError id={errorId} message={errors[param.key]?.message} />
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
            <Label htmlFor="water-quality-notes">Notes</Label>
            <Textarea
              id="water-quality-notes"
              rows={3}
              aria-describedby={errors.notes ? "water-quality-notes-error" : undefined}
              aria-invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
            <FieldError id="water-quality-notes-error" message={errors.notes?.message} />
          </div>

          <FieldError
            role="alert"
            message={
              targetLoadError
                ? `Target ranges could not be loaded. Refresh before saving: ${targetLoadError}`
                : undefined
            }
          />

          <FieldError message={errors.root?.message} />
          <FieldError role="alert" message={serverError ?? undefined} />

          <Button
            type="submit"
            disabled={isSubmitting || Boolean(targetLoadError)}
          >
            {isSubmitting ? "Saving…" : "Save reading"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
