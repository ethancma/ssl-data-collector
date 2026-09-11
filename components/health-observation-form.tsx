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
import {
  HEALTH_ISSUE_TYPES,
  SEVERITY_LEVELS,
  type HealthIssueType,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  healthObservationSchema,
  type HealthObservationFormInput,
  type HealthObservationFormValues,
} from "@/lib/validation/health-observation";

type AnimalOption = { id: number; name: string; tankId: number };

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

const ISSUE_LABELS: Record<HealthIssueType, string> = {
  arm_drop: "Arm drop",
  spine_drop: "Spine drop",
  lesion: "Lesion",
  arm_curling: "Arm curling",
  flattening: "Flattening",
  other: "Other",
};

const SEVERITY_LABELS: Record<(typeof SEVERITY_LEVELS)[number], string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export function HealthObservationForm({
  animals,
}: {
  animals: AnimalOption[];
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
  } = useForm<HealthObservationFormInput, unknown, HealthObservationFormValues>({
    resolver: zodResolver(healthObservationSchema),
    defaultValues: {
      date: getTodayDateString(),
      time: getCurrentTimeString(),
      animalId: "",
      tankId: "",
      severity: undefined,
      issues: [],
      photoFile: undefined,
      notes: "",
    },
  });

  const severity = watch("severity");

  const onAnimalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const animal = animals.find((a) => String(a.id) === e.target.value);
    setValue("tankId", animal ? String(animal.tankId) : "", {
      shouldValidate: true,
    });
  };

  const onSubmit = async (values: HealthObservationFormValues) => {
    setServerError(null);
    const supabase = createClient();

    const { data: observation, error } = await supabase
      .from("health_observations")
      .insert({
        observed_at: combineDateAndTime(values.date, values.time),
        animal_id: values.animalId,
        tank_id: values.tankId,
        severity: values.severity,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      })
      .select("id")
      .single();
    if (error || !observation) {
      setServerError(error?.message ?? "Failed to save observation");
      return;
    }

    if (values.issues.length > 0) {
      const { error: issuesError } = await supabase
        .from("health_observation_issues")
        .insert(
          values.issues.map((issue) => ({
            health_observation_id: observation.id,
            issue,
          })),
        );
      if (issuesError) {
        setServerError(issuesError.message);
        return;
      }
    }

    if (values.photoFile) {
      const path = `health_observations/${observation.id}/${values.photoFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("attachments")
        .upload(path, values.photoFile);
      if (uploadError) {
        setServerError(uploadError.message);
        return;
      }

      const { error: attachmentError } = await supabase
        .from("attachments")
        .insert({
          parent_table: "health_observations",
          parent_id: observation.id,
          storage_path: path,
        });
      if (attachmentError) {
        setServerError(attachmentError.message);
        return;
      }

      const { error: updateError } = await supabase
        .from("health_observations")
        .update({ has_photo: true })
        .eq("id", observation.id);
      if (updateError) {
        setServerError(updateError.message);
        return;
      }
    }

    router.push("/protected/home");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Health observation</CardTitle>
        <CardDescription>Log an issue observed on an animal.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <input type="hidden" {...register("tankId")} />

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
            <Label htmlFor="animalId">Animal</Label>
            <select
              id="animalId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
              {...register("animalId", { onChange: onAnimalChange })}
            >
              <option value="">Select an animal…</option>
              {animals.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {(errors.animalId || errors.tankId) && (
              <p className="text-sm text-red-500">
                {errors.animalId?.message ?? errors.tankId?.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Severity</Label>
            <div className="flex gap-2">
              {SEVERITY_LEVELS.map((level) => (
                <Button
                  key={level}
                  type="button"
                  variant={severity === level ? "default" : "outline"}
                  className="flex-1"
                  onClick={() =>
                    setValue("severity", level, { shouldValidate: true })
                  }
                >
                  {SEVERITY_LABELS[level]}
                </Button>
              ))}
            </div>
            {errors.severity && (
              <p className="text-sm text-red-500">{errors.severity.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label>Issues</Label>
            <Controller
              control={control}
              name="issues"
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  {HEALTH_ISSUE_TYPES.map((issue) => (
                    <div key={issue} className="flex items-center gap-2">
                      <Checkbox
                        id={`issue-${issue}`}
                        checked={field.value?.includes(issue) ?? false}
                        onCheckedChange={(checked) => {
                          const current = field.value ?? [];
                          field.onChange(
                            checked === true
                              ? [...current, issue]
                              : current.filter((i) => i !== issue),
                          );
                        }}
                      />
                      <Label htmlFor={`issue-${issue}`}>
                        {ISSUE_LABELS[issue]}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="photoFile">Photo</Label>
            <input
              id="photoFile"
              type="file"
              accept="image/*"
              className="text-sm"
              onChange={(e) =>
                setValue("photoFile", e.target.files?.[0], {
                  shouldValidate: true,
                })
              }
            />
            {errors.photoFile && (
              <p className="text-sm text-red-500">{errors.photoFile.message}</p>
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
            {isSubmitting ? "Saving…" : "Save observation"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
