"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

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
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  chemicalAdditionSchema,
  type ChemicalAdditionFormValues,
} from "@/lib/validation/chemical-addition";

type SystemOption = { id: number; name: string };

const CHEMICAL_OPTIONS = ["C-Balance", "DI-Trace", "Mg", "Other"] as const;

const systemChemicalAdditionSchema = chemicalAdditionSchema
  .omit({ chemicalName: true })
  .extend({
    chemicalChoice: z.enum(CHEMICAL_OPTIONS),
    customChemicalName: z
      .string()
      .max(200, "Keep the chemical name under 200 characters"),
  })
  .superRefine((values, context) => {
    if (values.chemicalChoice === "Other" && values.customChemicalName.trim() === "") {
      context.addIssue({
        code: "custom",
        path: ["customChemicalName"],
        message: "Enter a chemical/product name",
      });
    }
  })
  .transform(
    ({ chemicalChoice, customChemicalName, ...values }): ChemicalAdditionFormValues => ({
      ...values,
      chemicalName:
        chemicalChoice === "Other"
          ? customChemicalName.trim().replace(/\s+/g, " ")
          : chemicalChoice,
    }),
  );

type SystemChemicalAdditionFormInput = z.input<typeof systemChemicalAdditionSchema>;

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

export function ChemicalAdditionForm({
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
    formState: { errors, isSubmitting },
  } = useForm<
    SystemChemicalAdditionFormInput,
    unknown,
    ChemicalAdditionFormValues
  >({
    resolver: zodResolver(systemChemicalAdditionSchema),
    defaultValues: {
      date: getTodayDateString(),
      time: getCurrentTimeString(),
      systemId: defaultSystemId ?? "",
      chemicalChoice: "C-Balance",
      customChemicalName: "",
      amount: "",
      unit: "",
      reason: "",
    },
  });
  const chemicalChoice = watch("chemicalChoice");

  const onSubmit = async (values: ChemicalAdditionFormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.from("chemical_additions").insert({
      added_at: combineDateAndTime(values.date, values.time),
      system_id: values.systemId,
      chemical_name: values.chemicalName.trim(),
      amount: Number(values.amount),
      unit: values.unit.trim(),
      reason: values.reason?.trim() ? values.reason.trim() : null,
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
        <CardTitle className="text-2xl">System chemical addition</CardTitle>
        <CardDescription>
          Record a chemical, mineral, trace element, or buffer added to system water.
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
            <legend className="text-sm font-medium">
              Chemical/product added to system water
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {CHEMICAL_OPTIONS.map((option) => (
                <label
                  key={option}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted"
                >
                  <input type="radio" value={option} {...register("chemicalChoice")} />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          {chemicalChoice === "Other" && (
            <div className="grid gap-2">
              <Label htmlFor="customChemicalName">Chemical/product name</Label>
              <Input
                id="customChemicalName"
                className="min-h-11"
                maxLength={200}
                aria-describedby={
                  errors.customChemicalName ? "customChemicalName-error" : undefined
                }
                aria-invalid={Boolean(errors.customChemicalName)}
                {...register("customChemicalName")}
              />
              {errors.customChemicalName && (
                <p id="customChemicalName-error" className="text-sm text-red-500">
                  {errors.customChemicalName.message}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="e.g. 50"
                {...register("amount")}
              />
              {errors.amount && (
                <p className="text-sm text-red-500">{errors.amount.message}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                placeholder="e.g. mL, g"
                {...register("unit")}
              />
              {errors.unit && (
                <p className="text-sm text-red-500">{errors.unit.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="reason">Reason</Label>
            <textarea
              id="reason"
              rows={3}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm",
              )}
              {...register("reason")}
            />
            {errors.reason && (
              <p className="text-sm text-red-500">{errors.reason.message}</p>
            )}
          </div>

          {serverError && <p className="text-sm text-red-500">{serverError}</p>}

          <Button type="submit" className="min-h-11" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save system addition"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
