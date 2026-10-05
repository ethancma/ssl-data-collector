"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { formatPacificDateTime } from "@/lib/pacific-date-time";
import {
  attachedCatalogId,
  getStarTreatmentMeasurementErrors,
  normalizeSnapshot,
  resolveStarTreatmentCatalogItem,
  selectStarTreatmentCatalogItem,
  type StarTreatmentCatalogItem,
} from "@/lib/daily-operations/quick-pick-catalogs";
import {
  QUICK_PICK_HEADING_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
} from "@/components/daily-operations/form-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnitSelect } from "@/components/unit-select";
import { MEASUREMENT_UNITS } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type StarTreatmentRecordData = {
  id: number;
  animalId: number;
  animalName: string;
  tankId: number;
  catalogId: number | null;
  tankName: string;
  systemName: string;
  treatmentType: string;
  amount: string | null;
  unit: string | null;
  concentration: string | null;
  concentrationUnit: string | null;
  notes: string | null;
  administeredAt: string;
  recordedBy: number;
  dataSource: string;
  enteredAt: string;
};

const optionalPositiveNumber = z.string().refine((value) => {
  if (value.trim() === "") return true;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0;
}, "Enter a positive number");

const editSchema = z
  .object({
    catalogId: z
      .string()
      .refine((value) => value === "" || /^\d+$/.test(value), "Select a quick pick"),
    treatmentName: z
      .string()
      .refine((value) => normalizeSnapshot(value) !== "", "Enter the treatment name")
      .max(100, "Keep the treatment name under 100 characters"),
    amount: optionalPositiveNumber,
    unit: z.string().max(50, "Keep the unit under 50 characters"),
    concentration: optionalPositiveNumber,
    concentrationUnit: z
      .string()
      .max(50, "Keep the concentration unit under 50 characters"),
    notes: z.string().max(5000, "Keep notes under 5000 characters"),
  })
  .superRefine((values, context) => {
    const measurementErrors = getStarTreatmentMeasurementErrors({
      treatmentName: values.treatmentName,
      amount: values.amount,
      amountUnit: values.unit,
      concentration: values.concentration,
      concentrationUnit: values.concentrationUnit,
    });

    if (measurementErrors.amount) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: measurementErrors.amount,
      });
    }
    if (measurementErrors.amountUnit) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: measurementErrors.amountUnit,
      });
    }
    if (measurementErrors.concentrationUnit) {
      context.addIssue({
        code: "custom",
        path: ["concentrationUnit"],
        message: measurementErrors.concentrationUnit,
      });
    }
  });

type EditInput = z.input<typeof editSchema>;
type EditValues = z.output<typeof editSchema>;

function displayTreatmentType(value: string) {
  if (value === "probiotics") return "Probiotics";
  if (value === "reef_dip") return "Reef dip";
  return value;
}

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export function StarTreatmentRecord({
  treatment,
  canEdit,
  canDelete,
  catalogs,
}: {
  treatment: StarTreatmentRecordData;
  canEdit: boolean;
  canDelete: boolean;
  catalogs: StarTreatmentCatalogItem[];
}) {
  const router = useRouter();
  // Retired quick picks stay selectable only on the record that already uses them.
  const visibleCatalogs = catalogs.filter(
    (catalog) => catalog.isActive !== false || catalog.id === treatment.catalogId,
  );
  const currentCatalog = resolveStarTreatmentCatalogItem(
    treatment.catalogId,
    treatment.treatmentType,
    visibleCatalogs,
  );
  const defaultTreatment = selectStarTreatmentCatalogItem(
    currentCatalog,
    treatment.treatmentType,
  );
  const [updateMessage, setUpdateMessage] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const fieldId = (name: string) => `treatment-${treatment.id}-${name}`;

  const {
    control,
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditInput, unknown, EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      catalogId:
        defaultTreatment.catalogId === null ? "" : String(defaultTreatment.catalogId),
      treatmentName: defaultTreatment.name,
      amount: treatment.amount ?? "",
      unit: treatment.unit ?? "",
      concentration: treatment.concentration ?? "",
      concentrationUnit: treatment.concentrationUnit ?? "",
      notes: treatment.notes ?? "",
    },
  });

  const catalogId = watch("catalogId");

  const onTreatmentCatalogChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedCatalog = visibleCatalogs.find(
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

  const onUpdate = async (values: EditValues) => {
    setUpdateMessage("");
    const amount = nullableNumber(values.amount);
    const concentration = nullableNumber(values.concentration);
    const treatmentType = normalizeSnapshot(values.treatmentName);
    const catalogId = attachedCatalogId(
      {
        catalogId: values.catalogId === "" ? null : Number(values.catalogId),
        name: values.treatmentName,
      },
      visibleCatalogs,
    );
    const supabase = createClient();
    const { error } = await supabase.rpc("update_star_treatment", {
      p_treatment_id: treatment.id,
      p_treatment_type: treatmentType,
      p_amount: amount,
      p_unit: amount === null ? null : values.unit.trim(),
      p_concentration: concentration,
      p_concentration_unit:
        concentration === null ? null : values.concentrationUnit.trim(),
      p_notes: values.notes.trim() || null,
      p_catalog_id: catalogId,
    });

    if (error) {
      setUpdateMessage(error.message);
      return;
    }

    setUpdateMessage("Correction saved.");
    router.refresh();
  };

  const onDelete = async () => {
    setDeleteError("");
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("hard_delete_star_treatment", {
      p_treatment_id: treatment.id,
    });

    if (error) {
      setDeleteError(error.message);
      setIsDeleting(false);
      return;
    }

    setDeleted(true);
    router.refresh();
  };

  if (deleted) return null;

  return (
    <article
      data-treatment-id={treatment.id}
      className="rounded-md border bg-card p-4 text-card-foreground"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {treatment.animalName}: {displayTreatmentType(treatment.treatmentType)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatPacificDateTime(treatment.administeredAt)} · {treatment.systemName} ·{" "}
            {treatment.tankName}
          </p>
        </div>
        <p className="text-sm tabular-nums">
          {treatment.amount ? `${treatment.amount} ${treatment.unit}` : "No amount"}
          {treatment.concentration
            ? ` · ${treatment.concentration} ${treatment.concentrationUnit}`
            : ""}
        </p>
      </div>

      <details className="mt-4 border-t pt-4">
        <summary className="flex min-h-9 cursor-pointer items-center text-sm font-medium">
          {canEdit ? "View details and correct" : "View details"}
        </summary>

        <div className="grid gap-6 pt-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Star</dt>
              <dd>{treatment.animalName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Treatment-time location</dt>
              <dd>
                {treatment.systemName}, {treatment.tankName}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Administered</dt>
              <dd>{formatPacificDateTime(treatment.administeredAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Recorded by profile</dt>
              <dd>{treatment.recordedBy}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Data source</dt>
              <dd>{treatment.dataSource}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Entered</dt>
              <dd>{formatPacificDateTime(treatment.enteredAt)}</dd>
            </div>
          </dl>

          {canEdit && (
            <form
              onSubmit={handleSubmit(onUpdate)}
              className="flex max-w-lg flex-col gap-6"
              noValidate
            >
            <div
              role="group"
              aria-labelledby={fieldId("type-label")}
              className="grid content-start gap-2"
            >
              <p id={fieldId("type-label")} className={QUICK_PICK_HEADING_CLASS}>
                Treatment type
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {visibleCatalogs.map((item) => (
                  <label
                    key={item.id}
                    className={QUICK_PICK_OPTION_CLASS}
                    title={item.isActive === false ? `${item.name} (retired)` : item.name}
                  >
                    <input
                      type="radio"
                      value={item.id}
                      {...register("catalogId", { onChange: onTreatmentCatalogChange })}
                    />
                    <span className={QUICK_PICK_LABEL_CLASS}>{item.name}</span>
                    {item.isActive === false && (
                      <span className="shrink-0 text-xs text-muted-foreground">(retired)</span>
                    )}
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

            {catalogId === "" && (
              <div className="grid gap-2">
                <Label htmlFor={fieldId("custom-treatment")}>Treatment name</Label>
                <Input
                  id={fieldId("custom-treatment")}
                  maxLength={100}
                  aria-describedby={
                    errors.treatmentName ? fieldId("custom-treatment-error") : undefined
                  }
                  aria-invalid={Boolean(errors.treatmentName)}
                  {...register("treatmentName")}
                />
                {errors.treatmentName && (
                  <p id={fieldId("custom-treatment-error")} className="text-sm text-red-500">
                    {errors.treatmentName.message}
                  </p>
                )}
              </div>
            )}

            <div className="grid items-start gap-4 sm:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor={fieldId("amount")}>Amount</Label>
                <Input
                  id={fieldId("amount")}
                  inputMode="decimal"
                  aria-describedby={errors.amount ? fieldId("amount-error") : undefined}
                  aria-invalid={Boolean(errors.amount)}
                  {...register("amount", {
                    onChange: (event) => {
                      if (event.target.value.trim() && !getValues("unit").trim()) {
                        setValue("unit", "mL");
                      }
                    },
                  })}
                />
                {errors.amount && (
                  <p id={fieldId("amount-error")} className="text-sm text-red-500">
                    {errors.amount.message}
                  </p>
                )}
              </div>
              <Controller
                control={control}
                name="unit"
                render={({ field }) => (
                  <UnitSelect
                    id={fieldId("unit")}
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
                <Label htmlFor={fieldId("concentration")}>Concentration</Label>
                <Input
                  id={fieldId("concentration")}
                  inputMode="decimal"
                  aria-describedby={
                    errors.concentration ? fieldId("concentration-error") : undefined
                  }
                  aria-invalid={Boolean(errors.concentration)}
                  {...register("concentration", {
                    onChange: (event) => {
                      if (
                        event.target.value.trim() &&
                        !getValues("concentrationUnit").trim()
                      ) {
                        setValue("concentrationUnit", "ppm");
                      }
                    },
                  })}
                />
                {errors.concentration && (
                  <p id={fieldId("concentration-error")} className="text-sm text-red-500">
                    {errors.concentration.message}
                  </p>
                )}
              </div>
              <Controller
                control={control}
                name="concentrationUnit"
                render={({ field }) => (
                  <UnitSelect
                    id={fieldId("concentration-unit")}
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
              <Label htmlFor={fieldId("notes")}>Notes</Label>
              <textarea
                id={fieldId("notes")}
                rows={3}
                className={cn(
                  "flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm",
                )}
                aria-describedby={errors.notes ? fieldId("notes-error") : undefined}
                aria-invalid={Boolean(errors.notes)}
                {...register("notes")}
              />
              {errors.notes && (
                <p id={fieldId("notes-error")} className="text-sm text-red-500">
                  {errors.notes.message}
                </p>
              )}
            </div>

            {updateMessage && (
              <p
                className={cn(
                  "text-sm",
                  updateMessage === "Correction saved." ? "text-foreground" : "text-red-500",
                )}
                role={updateMessage === "Correction saved." ? "status" : "alert"}
              >
                {updateMessage}
              </p>
            )}

            <Button type="submit" className="w-fit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save correction"}
            </Button>
            </form>
          )}

          {canDelete && (
            <details className="border-t border-destructive/40 pt-4">
              <summary className="flex min-h-9 cursor-pointer items-center text-sm font-medium text-destructive">
                Delete treatment
              </summary>
              <div className="grid max-w-2xl gap-3 pt-3">
                <p className="text-sm">
                  Permanently delete {displayTreatmentType(treatment.treatmentType)} for{" "}
                  {treatment.animalName} at {formatPacificDateTime(treatment.administeredAt)}? This
                  cannot be undone.
                </p>
                {deleteError && (
                  <p id={fieldId("delete-error")} className="text-sm text-red-500" role="alert">
                    {deleteError}
                  </p>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  className="w-fit"
                  disabled={isDeleting}
                  onClick={onDelete}
                >
                  {isDeleting ? "Deleting…" : "Permanently delete treatment"}
                </Button>
              </div>
            </details>
          )}
        </div>
      </details>
    </article>
  );
}