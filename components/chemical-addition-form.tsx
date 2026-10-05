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
} from "@/lib/pacific-date-time";
import {
  QUICK_PICK_HEADING_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
  SELECT_CLASS,
} from "@/components/daily-operations/form-classes";
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
} from "@/lib/daily-operations/quick-pick-catalogs";

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

  const onChemicalCatalogChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedCatalog = catalogs.find(
      (item) => String(item.id) === event.target.value,
    );
    if (selectedCatalog) {
      const selection = selectChemicalCatalogItem(selectedCatalog);
      setValue("chemicalName", selection.name, { shouldValidate: true });
      setValue("unit", selection.unit, { shouldValidate: true });
      return;
    }
    setValue("chemicalName", "", { shouldValidate: true });
    setValue("unit", "", { shouldValidate: true });
  };

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
              <Input id="date" type="date" {...register("date")} />
              {errors.date && (
                <p className="text-sm text-red-500">{errors.date.message}</p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="time">Time</Label>
              <Input id="time" type="time" {...register("time")} />
              {errors.time && (
                <p className="text-sm text-red-500">{errors.time.message}</p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="systemId">System</Label>
            <select
              id="systemId"
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
            {errors.systemId && (
              <p className="text-sm text-red-500">{errors.systemId.message}</p>
            )}
          </div>

          <div
            role="group"
            aria-labelledby="chemical-quick-pick-label"
            className="grid content-start gap-2"
          >
            <p id="chemical-quick-pick-label" className={QUICK_PICK_HEADING_CLASS}>
              Quick pick
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalogs.map((item) => (
                <label key={item.id} className={QUICK_PICK_OPTION_CLASS} title={item.name}>
                  <input
                    type="radio"
                    value={item.id}
                    {...register("catalogId", { onChange: onChemicalCatalogChange })}
                  />
                  <span className={QUICK_PICK_LABEL_CLASS}>{item.name}</span>
                </label>
              ))}
              <label className={QUICK_PICK_OPTION_CLASS}>
                <input
                  type="radio"
                  value=""
                  {...register("catalogId", { onChange: onChemicalCatalogChange })}
                />
                <span className={QUICK_PICK_LABEL_CLASS}>Other</span>
              </label>
            </div>
          </div>

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

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
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

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save system addition"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
