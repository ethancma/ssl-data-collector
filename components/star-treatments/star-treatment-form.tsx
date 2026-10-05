"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  BatchScopeFields,
  BatchSuccessCard,
  useBatchRequestId,
  useBatchScope,
} from "@/components/daily-operations/batch-scope-checklist";
import {
  runBatchSave,
  type BatchLogResult,
  type BatchScopeAnimal,
  type BatchScopeSystem,
  type BatchScopeTank,
} from "@/lib/daily-operations/batch-selection";
import {
  getPacificDateString,
  getPacificTimeString,
  parsePacificInstant,
} from "@/lib/pacific-date-time";
import {
  attachedCatalogId,
  normalizeSnapshot,
  selectStarTreatmentCatalogItem,
  type StarTreatmentCatalogItem,
} from "@/lib/daily-operations/quick-pick-catalogs";
import {
  nullableNumber,
  starTreatmentSchema,
  type StarTreatmentFormInput,
  type StarTreatmentFormValues,
} from "@/lib/validation/star-treatment";
import {
  QUICK_PICK_HEADING_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
} from "@/components/forms/form-classes";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UnitSelect } from "@/components/forms/unit-select";
import { MEASUREMENT_UNITS } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { nullIfBlank } from "@/lib/utils";

const STAR_SCOPE_TEXT = {
  legend: "Stars treated",
  animalLabel: "Treated star",
  allAnimalsOption: "All stars in tank",
  checklistLabel: "Stars to log",
  nounPlural: "stars",
};

export function StarTreatmentForm({
  systems,
  tanks,
  stars,
  catalogs,
  catalogLoadError,
}: {
  systems: BatchScopeSystem[];
  tanks: BatchScopeTank[];
  stars: BatchScopeAnimal[];
  catalogs: StarTreatmentCatalogItem[];
  catalogLoadError?: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<BatchLogResult | null>(null);
  const requestId = useBatchRequestId();
  const batch = useBatchScope({
    logType: "star-treatment",
    systems,
    tanks,
    animals: stars,
    lastSystemStorageKey: "ssl:last-star-treatment-system",
    text: STAR_SCOPE_TEXT,
    onEdit: requestId.reset,
  });
  const defaultCatalog = catalogs[0] ?? null;
  const defaultTreatment = selectStarTreatmentCatalogItem(defaultCatalog);
  const defaultValues = (): StarTreatmentFormInput => ({
    date: getPacificDateString(),
    time: getPacificTimeString(),
    catalogId:
      defaultTreatment.catalogId === null ? "" : String(defaultTreatment.catalogId),
    treatmentName: defaultTreatment.name,
    amount: "",
    unit: defaultTreatment.amountUnit,
    concentration: "",
    concentrationUnit: defaultTreatment.concentrationUnit,
    notes: "",
  });

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StarTreatmentFormInput, unknown, StarTreatmentFormValues>({
    resolver: zodResolver(starTreatmentSchema),
    defaultValues: defaultValues(),
  });

  const catalogId = watch("catalogId");
  const includedCount = batch.includedIds.length;

  useEffect(() => {
    const subscription = watch(() => requestId.reset());
    return () => subscription.unsubscribe();
  }, [requestId, watch]);

  const onTreatmentCatalogChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedCatalog = catalogs.find(
      (catalog) => String(catalog.id) === event.target.value,
    );
    const selection = selectStarTreatmentCatalogItem(selectedCatalog ?? null);
    setValue(
      "catalogId",
      selection.catalogId === null ? "" : String(selection.catalogId),
      { shouldValidate: true },
    );
    setValue("treatmentName", selection.name, { shouldValidate: true });
    setValue("unit", selection.amountUnit, { shouldValidate: true });
    setValue("concentrationUnit", selection.concentrationUnit, {
      shouldValidate: true,
    });
  };

  const onSubmit = async (values: StarTreatmentFormValues) => {
    setServerError(null);
    const { systemId, tankId, animalId } = batch.scope;
    if (systemId === null || includedCount === 0) return;

    const instant = parsePacificInstant(values.date, values.time);
    if (instant.error !== undefined) {
      setError("time", { message: instant.error });
      return;
    }

    const treatmentType = normalizeSnapshot(values.treatmentName);
    const catalogId = attachedCatalogId(
      {
        catalogId: values.catalogId === "" ? null : Number(values.catalogId),
        name: values.treatmentName,
      },
      catalogs,
    );
    const amountValue = nullableNumber(values.amount);
    const concentrationValue = nullableNumber(values.concentration);
    const supabase = createClient();
    const outcome = await runBatchSave(
      () =>
        supabase.rpc("create_star_treatment_batch", {
          p_request_id: requestId.current(),
          p_system_id: systemId,
          p_tank_id: tankId,
          p_animal_id: animalId,
          p_included_animal_ids: batch.includedIds,
          p_excluded_animal_ids: batch.excludedIds,
          p_administered_at: instant.iso,
          p_amount: amountValue,
          p_unit: amountValue === null ? null : values.unit.trim(),
          p_concentration: concentrationValue,
          p_concentration_unit:
            concentrationValue === null ? null : values.concentrationUnit.trim(),
          p_treatment_type: treatmentType,
          p_notes: nullIfBlank(values.notes),
          p_catalog_id: catalogId,
        }),
      STAR_SCOPE_TEXT.nounPlural,
    );

    if (!outcome.ok) {
      const { kind, message } = outcome.error;
      if (kind !== "unconfirmed") requestId.reset();
      if (kind === "stale" || kind === "no-eligible") batch.refreshAfterStale();
      if (kind === "missing-time") setError("time", { message });
      setServerError(message);
      return;
    }

    requestId.reset();
    batch.rememberSystem();
    setSavedResult(outcome.result);
  };

  const logAnother = () => {
    reset(defaultValues());
    requestId.reset();
    batch.selectAnimal("");
    setServerError(null);
    setSavedResult(null);
  };

  if (savedResult) {
    return (
      <BatchSuccessCard
        title={
          savedResult.created_count === 1 ? "Star treatment saved" : "Star treatments saved"
        }
        result={savedResult}
        animals={stars}
        nounPlural={savedResult.created_count === 1 ? "treatment" : "treatments"}
      >
        <Button type="button" onClick={logAnother}>
          Log another treatment
        </Button>
        <Button asChild variant="outline">
          <Link href="/protected/star-treatments">View treatments</Link>
        </Button>
      </BatchSuccessCard>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Star treatment</CardTitle>
        <CardDescription>
          Record a treatment for every individually tracked star in a system or tank, or for
          one star.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
          <DateTimeFields
            idPrefix="star-treatment"
            date={register("date")}
            time={register("time")}
            errors={{ date: errors.date?.message, time: errors.time?.message }}
            dateLabel="Administered date"
            dateMin={getPacificDateString()}
            dateMax={getPacificDateString()}
          />

          <BatchScopeFields
            batch={batch}
            idPrefix="star-treatment"
            disabled={isSubmitting}
          />

          <div
            role="group"
            aria-labelledby="star-treatment-type-label"
            className="grid content-start gap-2"
          >
            <p id="star-treatment-type-label" className={QUICK_PICK_HEADING_CLASS}>
              Treatment type
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalogs.map((item) => (
                <label key={item.id} className={QUICK_PICK_OPTION_CLASS} title={item.name}>
                  <input
                    type="radio"
                    value={item.id}
                    {...register("catalogId", { onChange: onTreatmentCatalogChange })}
                  />
                  <span className={QUICK_PICK_LABEL_CLASS}>{item.name}</span>
                </label>
              ))}
              <label className={QUICK_PICK_OPTION_CLASS}>
                <input
                  type="radio"
                  value=""
                  {...register("catalogId", { onChange: onTreatmentCatalogChange })}
                />
                <span className={QUICK_PICK_LABEL_CLASS}>Other</span>
              </label>
            </div>
          </div>

          {catalogLoadError && (
            <p className="text-sm text-red-500" role="alert">
              Quick picks could not be loaded. Enter the treatment manually.
            </p>
          )}

          {catalogId === "" && (
            <div className="grid gap-2">
              <Label htmlFor="star-treatment-custom">Treatment name</Label>
              <Input
                id="star-treatment-custom"
                maxLength={100}
                aria-describedby={
                  errors.treatmentName ? "star-treatment-custom-error" : undefined
                }
                aria-invalid={Boolean(errors.treatmentName)}
                {...register("treatmentName")}
              />
              <FieldError
                id="star-treatment-custom-error"
                message={errors.treatmentName?.message}
              />
            </div>
          )}

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="star-treatment-amount">Amount per star</Label>
              <Input
                id="star-treatment-amount"
                type="text"
                inputMode="decimal"
                placeholder="Optional"
                aria-describedby={errors.amount ? "star-treatment-amount-error" : undefined}
                aria-invalid={Boolean(errors.amount)}
                {...register("amount")}
              />
              <FieldError
                id="star-treatment-amount-error"
                message={errors.amount?.message}
              />
            </div>
            <Controller
              control={control}
              name="unit"
              render={({ field }) => (
                <UnitSelect
                  id="star-treatment-unit"
                  label="Unit"
                  placeholder="Select…"
                  options={MEASUREMENT_UNITS}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.unit?.message}
                />
              )}
            />
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="star-treatment-concentration">Concentration</Label>
              <Input
                id="star-treatment-concentration"
                type="text"
                inputMode="decimal"
                placeholder="Optional"
                aria-describedby={
                  errors.concentration ? "star-treatment-concentration-error" : undefined
                }
                aria-invalid={Boolean(errors.concentration)}
                {...register("concentration")}
              />
              <FieldError
                id="star-treatment-concentration-error"
                message={errors.concentration?.message}
              />
            </div>
            <Controller
              control={control}
              name="concentrationUnit"
              render={({ field }) => (
                <UnitSelect
                  id="star-treatment-concentration-unit"
                  label="Unit"
                  placeholder="Select…"
                  options={MEASUREMENT_UNITS}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.concentrationUnit?.message}
                />
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="star-treatment-notes">Notes</Label>
            <Textarea
              id="star-treatment-notes"
              rows={4}
              className="min-h-24"
              aria-describedby={errors.notes ? "star-treatment-notes-error" : undefined}
              aria-invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
            <FieldError
              id="star-treatment-notes-error"
              message={errors.notes?.message}
            />
          </div>

          <FieldError role="alert" message={serverError ?? undefined} />

          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={isSubmitting || batch.isRefreshing || includedCount === 0}
            >
              {isSubmitting
                ? "Saving…"
                : `Save ${includedCount} ${includedCount === 1 ? "treatment" : "treatments"}`}
            </Button>
            <Button asChild variant="outline">
              <Link href="/protected/star-treatments">View treatments</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}