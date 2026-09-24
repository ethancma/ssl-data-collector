"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type StarTreatmentRecordData = {
  id: number;
  animalId: number;
  animalName: string;
  tankId: number;
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
    treatmentChoice: z.enum(["probiotics", "reef_dip", "other"]),
    customTreatment: z.string().max(100, "Keep the treatment name under 100 characters"),
    amount: optionalPositiveNumber,
    unit: z.string().max(50, "Keep the unit under 50 characters"),
    concentration: optionalPositiveNumber,
    concentrationUnit: z
      .string()
      .max(50, "Keep the concentration unit under 50 characters"),
    notes: z.string().max(5000, "Keep notes under 5000 characters"),
    correctionReason: z
      .string()
      .trim()
      .min(1, "Enter a correction reason")
      .max(1000, "Keep the correction reason under 1000 characters"),
  })
  .superRefine((values, context) => {
    const hasAmount = values.amount.trim() !== "";
    const hasConcentration = values.concentration.trim() !== "";

    if (!hasAmount && !hasConcentration) {
      context.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Enter an amount or concentration",
      });
    }
    if (hasAmount && !values.unit.trim()) {
      context.addIssue({
        code: "custom",
        path: ["unit"],
        message: "Enter an amount unit",
      });
    }
    if (hasConcentration && !values.concentrationUnit.trim()) {
      context.addIssue({
        code: "custom",
        path: ["concentrationUnit"],
        message: "Enter a concentration unit",
      });
    }
    if (values.treatmentChoice === "other" && !values.customTreatment.trim()) {
      context.addIssue({
        code: "custom",
        path: ["customTreatment"],
        message: "Enter the treatment name",
      });
    }
  });

const deleteReasonSchema = z
  .string()
  .trim()
  .min(1, "Enter a deletion reason")
  .max(1000, "Keep the deletion reason under 1000 characters");

type EditInput = z.input<typeof editSchema>;
type EditValues = z.output<typeof editSchema>;

function displayTreatmentType(value: string) {
  if (value === "probiotics") return "Probiotics";
  if (value === "reef_dip") return "Reef dip";
  return value;
}

function formatLabDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export function StarTreatmentRecord({
  treatment,
  canDelete,
}: {
  treatment: StarTreatmentRecordData;
  canDelete: boolean;
}) {
  const router = useRouter();
  const defaultTreatmentChoice: EditInput["treatmentChoice"] =
    treatment.treatmentType === "probiotics" || treatment.treatmentType === "reef_dip"
      ? treatment.treatmentType
      : "other";
  const isCanonical = defaultTreatmentChoice !== "other";
  const [updateMessage, setUpdateMessage] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const fieldId = (name: string) => `treatment-${treatment.id}-${name}`;

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<EditInput, unknown, EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      treatmentChoice: defaultTreatmentChoice,
      customTreatment: isCanonical ? "" : treatment.treatmentType,
      amount: treatment.amount ?? "",
      unit: treatment.unit ?? "",
      concentration: treatment.concentration ?? "",
      concentrationUnit: treatment.concentrationUnit ?? "",
      notes: treatment.notes ?? "",
      correctionReason: "",
    },
  });

  const treatmentChoice = watch("treatmentChoice");

  const onUpdate = async (values: EditValues) => {
    setUpdateMessage("");
    const amount = nullableNumber(values.amount);
    const concentration = nullableNumber(values.concentration);
    const treatmentType =
      values.treatmentChoice === "other"
        ? values.customTreatment.trim().replace(/\s+/g, " ")
        : values.treatmentChoice;
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
      p_correction_reason: values.correctionReason,
    });

    if (error) {
      setUpdateMessage(error.message);
      return;
    }

    setValue("correctionReason", "");
    setUpdateMessage("Correction saved.");
    router.refresh();
  };

  const onDelete = async () => {
    setDeleteError("");
    const parsedReason = deleteReasonSchema.safeParse(deleteReason);
    if (!parsedReason.success) {
      setDeleteError(parsedReason.error.issues[0]?.message ?? "Enter a deletion reason");
      return;
    }

    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("hard_delete_star_treatment", {
      p_treatment_id: treatment.id,
      p_correction_reason: parsedReason.data,
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
    <article className="rounded-md border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {treatment.animalName}: {displayTreatmentType(treatment.treatmentType)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatLabDateTime(treatment.administeredAt)} · {treatment.systemName} ·{" "}
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
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">
          View details and correct
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
              <dd>{formatLabDateTime(treatment.administeredAt)}</dd>
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
              <dd>{formatLabDateTime(treatment.enteredAt)}</dd>
            </div>
          </dl>

          <form onSubmit={handleSubmit(onUpdate)} className="grid gap-5" noValidate>
            <fieldset className="grid gap-3">
              <legend className="text-sm font-medium">Treatment type</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ["probiotics", "Probiotics"],
                  ["reef_dip", "Reef dip"],
                  ["other", "Other"],
                ].map(([value, label]) => (
                  <label
                    key={value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted"
                  >
                    <input type="radio" value={value} {...register("treatmentChoice")} />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            {treatmentChoice === "other" && (
              <div className="grid gap-2">
                <Label htmlFor={fieldId("custom-treatment")}>Treatment name</Label>
                <Input
                  id={fieldId("custom-treatment")}
                  className="min-h-11"
                  maxLength={100}
                  aria-describedby={
                    errors.customTreatment ? fieldId("custom-treatment-error") : undefined
                  }
                  aria-invalid={Boolean(errors.customTreatment)}
                  {...register("customTreatment")}
                />
                {errors.customTreatment && (
                  <p id={fieldId("custom-treatment-error")} className="text-sm text-red-500">
                    {errors.customTreatment.message}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-3 rounded-md border p-4">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <div className="grid gap-2">
                    <Label htmlFor={fieldId("amount")}>Amount</Label>
                    <Input
                      id={fieldId("amount")}
                      className="min-h-11"
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
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={fieldId("unit")}>Unit</Label>
                    <Input
                      id={fieldId("unit")}
                      className="min-h-11"
                      placeholder="mL"
                      aria-describedby={errors.unit ? fieldId("unit-error") : undefined}
                      aria-invalid={Boolean(errors.unit)}
                      {...register("unit")}
                    />
                    {errors.unit && (
                      <p id={fieldId("unit-error")} className="text-sm text-red-500">
                        {errors.unit.message}
                      </p>
                    )}
                  </div>
                </div>
                {errors.amount && (
                  <p id={fieldId("amount-error")} className="text-sm text-red-500">
                    {errors.amount.message}
                  </p>
                )}
              </div>

              <div className="grid gap-3 rounded-md border p-4">
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
                  <div className="grid gap-2">
                    <Label htmlFor={fieldId("concentration")}>Concentration</Label>
                    <Input
                      id={fieldId("concentration")}
                      className="min-h-11"
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
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={fieldId("concentration-unit")}>Unit</Label>
                    <Input
                      id={fieldId("concentration-unit")}
                      className="min-h-11"
                      placeholder="ppm"
                      aria-describedby={
                        errors.concentrationUnit
                          ? fieldId("concentration-unit-error")
                          : undefined
                      }
                      aria-invalid={Boolean(errors.concentrationUnit)}
                      {...register("concentrationUnit")}
                    />
                    {errors.concentrationUnit && (
                      <p
                        id={fieldId("concentration-unit-error")}
                        className="text-sm text-red-500"
                      >
                        {errors.concentrationUnit.message}
                      </p>
                    )}
                  </div>
                </div>
                {errors.concentration && (
                  <p id={fieldId("concentration-error")} className="text-sm text-red-500">
                    {errors.concentration.message}
                  </p>
                )}
              </div>
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

            <div className="grid gap-2">
              <Label htmlFor={fieldId("correction-reason")}>Correction reason</Label>
              <textarea
                id={fieldId("correction-reason")}
                rows={2}
                className={cn(
                  "flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm",
                )}
                aria-describedby={
                  errors.correctionReason ? fieldId("correction-reason-error") : undefined
                }
                aria-invalid={Boolean(errors.correctionReason)}
                {...register("correctionReason")}
              />
              {errors.correctionReason && (
                <p id={fieldId("correction-reason-error")} className="text-sm text-red-500">
                  {errors.correctionReason.message}
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

            <Button type="submit" className="min-h-11 w-fit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save correction"}
            </Button>
          </form>

          {canDelete && (
            <details className="border-t border-destructive/40 pt-4">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-destructive">
                Delete treatment
              </summary>
              <div className="grid max-w-2xl gap-3 pt-3">
                <p className="text-sm">
                  Permanently delete {displayTreatmentType(treatment.treatmentType)} for{" "}
                  {treatment.animalName} at {formatLabDateTime(treatment.administeredAt)}?
                </p>
                <Label htmlFor={fieldId("delete-reason")}>Deletion reason</Label>
                <textarea
                  id={fieldId("delete-reason")}
                  rows={2}
                  value={deleteReason}
                  onChange={(event) => setDeleteReason(event.target.value)}
                  className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                  aria-describedby={deleteError ? fieldId("delete-error") : undefined}
                  aria-invalid={Boolean(deleteError)}
                />
                {deleteError && (
                  <p id={fieldId("delete-error")} className="text-sm text-red-500" role="alert">
                    {deleteError}
                  </p>
                )}
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-11 w-fit"
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