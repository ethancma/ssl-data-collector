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

const PH_SOURCE_LABELS: Record<(typeof PH_SOURCES)[number], string> = {
  manual: "Manual",
  apex_probe: "Apex probe",
};

export function WaterQualityForm({
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
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<WaterQualityFormInput, unknown, WaterQualityFormValues>({
    resolver: zodResolver(waterQualitySchema),
    defaultValues: {
      date: getTodayDateString(),
      time: getCurrentTimeString(),
      systemId: defaultSystemId ?? "",
      phSource: "manual",
      ...Object.fromEntries(WATER_QUALITY_PARAMETERS.map((key) => [key, ""])),
      notes: "",
    },
  });

  const phSource = watch("phSource");

  const onSubmit = async (values: WaterQualityFormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.from("water_quality_readings").insert({
      tested_at: combineDateAndTime(values.date, values.time),
      system_id: values.systemId,
      ph_source: values.phSource,
      ...Object.fromEntries(
        WATER_QUALITY_PARAMETERS.map((key) => [key, values[key] ? Number(values[key]) : null]),
      ),
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
        <CardTitle className="text-2xl">Water quality reading</CardTitle>
        <CardDescription>
          Log any of the {WATER_QUALITY_PARAMS.length} water chemistry parameters for a system.
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

          <div className="grid grid-cols-2 gap-4">
            {WATER_QUALITY_PARAMS.map((param) => (
              <div key={param.key} className="grid gap-2">
                <Label htmlFor={param.key}>{param.label}</Label>
                <Input
                  id={param.key}
                  inputMode="decimal"
                  placeholder="—"
                  {...register(param.key)}
                />
                {errors[param.key] && (
                  <p className="text-sm text-red-500">{errors[param.key]?.message}</p>
                )}
              </div>
            ))}
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

          {errors.root && (
            <p className="text-sm text-red-500">{errors.root.message}</p>
          )}
          {serverError && <p className="text-sm text-red-500">{serverError}</p>}

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save reading"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
