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
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  waterQualitySchema,
  type WaterQualityFormInput,
  type WaterQualityFormValues,
} from "@/lib/validation/water-quality";

type SystemOption = { id: number; name: string };

const PARAMETER_LABELS: Record<WaterQualityParameter, string> = {
  ph: "pH",
  magnesium: "Magnesium",
  ammonia: "Ammonia",
  alkalinity: "Alkalinity",
  calcium: "Calcium",
  phosphate: "Phosphate",
  salinity: "Salinity",
};

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
      systemId: defaultSystemId ?? "",
      phSource: "manual",
      ph: "",
      magnesium: "",
      ammonia: "",
      alkalinity: "",
      calcium: "",
      phosphate: "",
      salinity: "",
      notes: "",
    },
  });

  const phSource = watch("phSource");

  const onSubmit = async (values: WaterQualityFormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.from("water_quality_readings").insert({
      system_id: values.systemId,
      ph_source: values.phSource,
      ph: values.ph ? Number(values.ph) : null,
      magnesium: values.magnesium ? Number(values.magnesium) : null,
      ammonia: values.ammonia ? Number(values.ammonia) : null,
      alkalinity: values.alkalinity ? Number(values.alkalinity) : null,
      calcium: values.calcium ? Number(values.calcium) : null,
      phosphate: values.phosphate ? Number(values.phosphate) : null,
      salinity: values.salinity ? Number(values.salinity) : null,
      notes: values.notes?.trim() ? values.notes.trim() : null,
    });
    if (error) {
      setServerError(error.message);
      return;
    }
    router.push("/protected/today");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Water quality reading</CardTitle>
        <CardDescription>
          Log any of the 7 water chemistry parameters for a system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
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
            {WATER_QUALITY_PARAMETERS.map((param) => (
              <div key={param} className="grid gap-2">
                <Label htmlFor={param}>{PARAMETER_LABELS[param]}</Label>
                <Input
                  id={param}
                  inputMode="decimal"
                  placeholder="—"
                  {...register(param)}
                />
                {errors[param] && (
                  <p className="text-sm text-red-500">{errors[param]?.message}</p>
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
