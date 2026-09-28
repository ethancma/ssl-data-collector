"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnitSelect } from "@/components/unit-select";
import { MEASUREMENT_UNITS } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  chemicalAdditionSchema,
} from "@/lib/validation/chemical-addition";
import {
  attachedCatalogId,
  normalizeSnapshot,
  selectChemicalCatalogItem,
  type ChemicalAdditionCatalogItem,
} from "@/components/daily-operations/quick-pick-catalogs";

type SystemOption = { id: number; name: string };

const systemChemicalAdditionSchema = chemicalAdditionSchema
  .extend({
    catalogId: z
      .string()
      .refine((value) => value === "" || /^\d+$/.test(value), "Select a quick pick"),
  })
  .transform(({ catalogId, ...values }) => ({
    ...values,
    catalogId: catalogId === "" ? null : Number(catalogId),
  }));

type SystemChemicalAdditionFormInput = z.input<typeof systemChemicalAdditionSchema>;
type SystemChemicalAdditionFormValues = z.output<typeof systemChemicalAdditionSchema>;

export function ChemicalAdditionForm({
  systems,
  catalogs,
  catalogLoadError,
  defaultSystemId,
}: {
  systems: SystemOption[];
  catalogs: ChemicalAdditionCatalogItem[];
  catalogLoadError?: string;
  defaultSystemId?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const defaultCatalog = catalogs[0] ?? null;
  const defaultSelection = defaultCatalog
    ? selectChemicalCatalogItem(defaultCatalog)
    : { catalogId: null, name: "", unit: "" };

  const {
    control,
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<
    SystemChemicalAdditionFormInput,
    unknown,
    SystemChemicalAdditionFormValues
  >({
    resolver: zodResolver(systemChemicalAdditionSchema),
    defaultValues: {
      date: getPacificDateString(),
      time: getPacificTimeString(),
      systemId: defaultSystemId ?? "",
      catalogId:
        defaultSelection.catalogId === null ? "" : String(defaultSelection.catalogId),
      chemicalName: defaultSelection.name,
      amount: "",
      unit: defaultSelection.unit,
      reason: "",
    },
  });
  const catalogId = watch("catalogId");

  const onSubmit = async (values: SystemChemicalAdditionFormValues) => {
    setServerError(null);
    let addedAt: string;
    try {
      addedAt = pacificWallTimeToIso(values.date, values.time);
    } catch (error) {
      setError("time", {
        message: error instanceof Error ? error.message : "Enter a valid Pacific time",
      });
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("chemical_additions").insert({
      added_at: addedAt,
      system_id: values.systemId,
      catalog_id: attachedCatalogId(
        { catalogId: values.catalogId, name: values.chemicalName },
        catalogs,
      ),
      chemical_name: normalizeSnapshot(values.chemicalName),
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
          <div className="grid gap-4 rounded-lg border border-input bg-muted/30 p-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" className="min-h-11" {...register("date")} />
              {errors.date && (
                <p className="text-sm text-red-500">{errors.date.message}</p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="time">Time</Label>
              <Input id="time" type="time" className="min-h-11" {...register("time")} />
              {errors.time && (
                <p className="text-sm text-red-500">{errors.time.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemId">System</Label>
            <select
              id="systemId"
              className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
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

          <fieldset className="grid content-start auto-rows-min gap-3">
            <legend className="text-sm font-medium">Quick pick</legend>
            <div className="grid auto-rows-min gap-2 sm:grid-cols-2">
              {catalogs.map((item) => (
                <label
                  key={item.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm [overflow-wrap:anywhere] has-[:checked]:border-foreground has-[:checked]:bg-muted"
                >
                  <input
                    type="radio"
                    value={item.id}
                    {...register("catalogId", {
                      onChange: () => {
                        const selection = selectChemicalCatalogItem(item);
                        setValue("chemicalName", selection.name, { shouldValidate: true });
                        setValue("unit", selection.unit, { shouldValidate: true });
                      },
                    })}
                  />
                  {item.name}
                </label>
              ))}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted">
                <input
                  type="radio"
                  value=""
                  {...register("catalogId", {
                    onChange: () => {
                      setValue("chemicalName", "", { shouldValidate: true });
                      setValue("unit", "", { shouldValidate: true });
                    },
                  })}
                />
                Other
              </label>
            </div>
          </fieldset>

          {catalogLoadError && (
            <p className="text-sm text-red-500" role="alert">
              Quick picks could not be loaded. Enter the chemical and unit manually.
            </p>
          )}

          {catalogId === "" && (
            <div className="grid gap-2">
              <Label htmlFor="chemicalName">Chemical/product name</Label>
              <Input
                id="chemicalName"
                className="min-h-11"
                maxLength={200}
                aria-describedby={errors.chemicalName ? "chemicalName-error" : undefined}
                aria-invalid={Boolean(errors.chemicalName)}
                {...register("chemicalName")}
              />
              {errors.chemicalName && (
                <p id="chemicalName-error" className="text-sm text-red-500">
                  {errors.chemicalName.message}
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] items-start gap-4">
            <div className="grid content-start gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                className="min-h-11"
                inputMode="decimal"
                placeholder="e.g. 50"
                {...register("amount")}
              />
              {errors.amount && (
                <p className="text-sm text-red-500">{errors.amount.message}</p>
              )}
            </div>
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <UnitSelect
                  id="unit"
                  label="Unit"
                  options={MEASUREMENT_UNITS}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.unit?.message}
                />
              )}
            />
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
