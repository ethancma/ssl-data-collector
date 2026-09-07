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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CHECK_TYPES } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  dailyCheckSchema,
  type DailyCheckFormInput,
  type DailyCheckFormValues,
} from "@/lib/validation/daily-check";

type SystemOption = { id: number; name: string };

export function DailyCheckForm({
  systems,
  defaultSystemId,
  defaultCheckType,
}: {
  systems: SystemOption[];
  defaultSystemId?: string;
  defaultCheckType?: (typeof CHECK_TYPES)[number];
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DailyCheckFormInput, unknown, DailyCheckFormValues>({
    resolver: zodResolver(dailyCheckSchema),
    defaultValues: {
      systemId: defaultSystemId ?? "",
      checkType: defaultCheckType ?? "AM",
      waterRunning: true,
      temperature: "",
      notes: "",
    },
  });

  const checkType = watch("checkType");

  const onSubmit = async (values: DailyCheckFormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.from("daily_checks").insert({
      system_id: values.systemId, // already coerced to a positive int by dailyCheckSchema
      check_type: values.checkType,
      water_running: values.waterRunning,
      temperature: values.temperature ? Number(values.temperature) : null,
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
        <CardTitle className="text-2xl">Daily check</CardTitle>
        <CardDescription>
          Log the AM or PM check for a system.
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
                  id="waterRunning"
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v === true)}
                />
              )}
            />
            <Label htmlFor="waterRunning">Water running</Label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="temperature">Temperature (°C)</Label>
            <Input
              id="temperature"
              inputMode="decimal"
              placeholder="e.g. 12.5"
              {...register("temperature")}
            />
            {errors.temperature && (
              <p className="text-sm text-red-500">
                {errors.temperature.message}
              </p>
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
            {isSubmitting ? "Saving…" : "Save check"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
