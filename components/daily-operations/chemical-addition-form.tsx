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
import { DateTimeFields } from "@/components/forms/date-time-fields";
import { FieldError } from "@/components/forms/field-error";
import { Textarea } from "@/components/ui/textarea";
import {
  getPacificDateString,
  getPacificTimeString,
  parsePacificInstant,
} from "@/lib/pacific-date-time";
import {
  QUICK_PICK_HEADING_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
  SELECT_CLASS,
} from "@/components/forms/form-classes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnitSelect } from "@/components/forms/unit-select";
import { MEASUREMENT_UNITS } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { nullIfBlank } from "@/lib/utils";
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
    const instant = parsePacificInstant(values.date, values.time);
    if (instant.error !== undefined) {
      setError("time", { message: instant.error });
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from("chemical_additions").insert({
      added_at: instant.iso,
      system_id: values.systemId,
      catalog_id: attachedCatalogId(
        { catalogId: values.catalogId, name: values.chemicalName },
        catalogs,
      ),
      chemical_name: normalizeSnapshot(values.chemicalName),
      amount: Number(values.amount),
      unit: values.unit.trim(),
      reason: nullIfBlank(values.reason),
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
          <DateTimeFields
            idPrefix="chemical-addition"
            date={register("date")}
            time={register("time")}
            errors={{ date: errors.date?.message, time: errors.time?.message }}
          />

          <div className="grid gap-2">
            <Label htmlFor="chemical-addition-system">System</Label>
            <select
              id="chemical-addition-system"
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
            <FieldError
              id="chemical-addition-system-error"
              message={errors.systemId?.message}
            />
          </div>

          <div
            role="group"
            aria-labelledby="chemical-addition-catalog-id-label"
            className="grid content-start gap-2"
          >
            <p id="chemical-addition-catalog-id-label" className={QUICK_PICK_HEADING_CLASS}>
              Quick pick
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalogs.map((item) => (
                <label key={item.id} className={QUICK_PICK_OPTION_CLASS} title={item.name}>
                  <input
                    id={`chemical-addition-catalog-id-${item.id}`}
                    type="radio"
                    value={item.id}
                    {...register("catalogId", { onChange: onChemicalCatalogChange })}
                  />
                  <span className={QUICK_PICK_LABEL_CLASS}>{item.name}</span>
                </label>
              ))}
              <label className={QUICK_PICK_OPTION_CLASS}>
                <input
                  id="chemical-addition-catalog-id-other"
                  type="radio"
                  value=""
                  {...register("catalogId", { onChange: onChemicalCatalogChange })}
                />
                <span className={QUICK_PICK_LABEL_CLASS}>Other</span>
              </label>
            </div>
          </div>

          <FieldError
            role="alert"
            message={
              catalogLoadError
                ? "Quick picks could not be loaded. Enter the chemical and unit manually."
                : undefined
            }
          />

          {catalogId === "" && (
            <div className="grid gap-2">
              <Label htmlFor="chemical-addition-chemical-name">Chemical/product name</Label>
              <Input
                id="chemical-addition-chemical-name"
                maxLength={200}
                aria-describedby={errors.chemicalName ? "chemical-addition-chemical-name-error" : undefined}
                aria-invalid={Boolean(errors.chemicalName)}
                {...register("chemicalName")}
              />
              <FieldError
                id="chemical-addition-chemical-name-error"
                message={errors.chemicalName?.message}
              />
            </div>
          )}

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="chemical-addition-amount">Amount</Label>
              <Input
                id="chemical-addition-amount"
                inputMode="decimal"
                placeholder="e.g. 50"
                {...register("amount")}
              />
              <FieldError
                id="chemical-addition-amount-error"
                message={errors.amount?.message}
              />
            </div>
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <UnitSelect
                  id="chemical-addition-unit"
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
            <Label htmlFor="chemical-addition-reason">Reason</Label>
            <Textarea
              id="chemical-addition-reason"
              rows={3}
              {...register("reason")}
            />
            <FieldError
              id="chemical-addition-reason-error"
              message={errors.reason?.message}
            />
          </div>

          <FieldError message={serverError ?? undefined} />

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : "Save system addition"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
