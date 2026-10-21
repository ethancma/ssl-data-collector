"use client";

import { HydratedForm } from "@/components/forms/hydrated-form";
import { Archive, Save, X } from "lucide-react";
import { useId, useState } from "react";
import type { ZodError } from "zod";

import { FieldError } from "@/components/forms/field-error";
import { SELECT_CLASS } from "@/components/forms/form-classes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { capitalizeLabel, parseTankName } from "@/lib/systems/feeding-schedule";
import {
  animalSchema,
  customLabelError,
  placementFields,
  POSITION_OPTIONS,
  retireSchema,
  RETIRED_STATUSES,
  toTankPlacement,
  type AnimalFormInput,
  type AnimalFormValues,
  type RetiredStatus,
  type TankRecord,
} from "@/lib/validation/animal-setup";

export type SystemOption = { id: number; name: string };
export type SpeciesOption = { id: number; commonName: string; category: string };

export const RETIRED_LABELS: Record<RetiredStatus, string> = {
  deceased: "Deceased",
  transferred: "Transferred",
};

type Errors = Partial<Record<string, string>>;

function firstErrors(error: ZodError) {
  const errors: Errors = {};
  for (const issue of error.issues) errors[String(issue.path[0])] ??= issue.message;
  return errors;
}

function Field({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className ?? "grid content-start gap-2"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function FormActions({ submitLabel, icon, disabled, onCancel }: {
  submitLabel: string;
  icon: React.ReactNode;
  disabled: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={disabled}>
        {icon}
        {submitLabel}
      </Button>
      <Button type="button" variant="outline" disabled={disabled} onClick={onCancel}>
        <X aria-hidden="true" />
        Cancel
      </Button>
    </div>
  );
}

export function AnimalForm({
  heading,
  submitLabel,
  systems,
  species,
  tanks,
  initialValues,
  disabled,
  onSubmit,
  onCancel,
}: {
  heading: string;
  submitLabel: string;
  systems: SystemOption[];
  species: SpeciesOption[];
  tanks: TankRecord[];
  initialValues: AnimalFormInput;
  disabled: boolean;
  onSubmit: (values: AnimalFormValues) => Promise<string | null>;
  onCancel: () => void;
}) {
  const idPrefix = useId();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const fieldId = (key: string) => `${idPrefix}-${key}`;
  const describedBy = (key: string) => (errors[key] ? `${fieldId(key)}-error` : undefined);

  const set = <K extends keyof AnimalFormInput>(key: K, value: AnimalFormInput[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const speciesCategories = [...new Set(species.map((option) => option.category))].sort();
  const systemTanks = tanks.filter((tank) => String(tank.systemId) === values.systemId);
  const sizes = [
    ...new Set(
      systemTanks
        .map((tank) => parseTankName(tank.name).sizeLiters ?? tank.sizeLiters)
        .filter((size): size is number => size !== null),
    ),
  ].sort((a, b) => a - b);
  const placementReady =
    placementFields.sizeLiters.safeParse(values.sizeLiters).success &&
    !(values.position === "other" && customLabelError(values.customLabel));
  const tankName = placementReady ? toTankPlacement(values).name : null;
  const tankExists = systemTanks.some((tank) => tank.name.toLowerCase() === tankName?.toLowerCase());

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = animalSchema.safeParse(values);
    if (!result.success) {
      setErrors(firstErrors(result.error));
      return;
    }
    setServerError(await onSubmit(result.data));
  };

  return (
    <HydratedForm
      aria-label={heading}
      className="grid gap-4 rounded-md border bg-muted/30 p-4"
      onSubmit={submit}
      noValidate
    >
      <p className="text-sm font-medium">{heading}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={fieldId("name")} label="Name" error={errors.name}>
          <Input
            id={fieldId("name")}
            value={values.name}
            disabled={disabled}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name")}
            onChange={(event) => set("name", event.target.value)}
          />
        </Field>
        <Field id={fieldId("speciesId")} label="Species" error={errors.speciesId}>
          <select
            id={fieldId("speciesId")}
            className={SELECT_CLASS}
            value={values.speciesId}
            disabled={disabled}
            aria-invalid={Boolean(errors.speciesId)}
            aria-describedby={describedBy("speciesId")}
            onChange={(event) => set("speciesId", event.target.value)}
          >
            <option value="">Select a species</option>
            {speciesCategories.map((category) => {
              const options = species.filter((option) => option.category === category);
              return (
                <optgroup key={category} label={capitalizeLabel(category.replace(/_/g, " "))}>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.commonName}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </Field>
        <Field id={fieldId("trackingType")} label="Tracking">
          <select
            id={fieldId("trackingType")}
            className={SELECT_CLASS}
            value={values.trackingType}
            disabled={disabled}
            onChange={(event) => {
              const trackingType = event.target.value as AnimalFormInput["trackingType"];
              set("trackingType", trackingType);
              if (trackingType === "individual") set("quantity", "1");
            }}
          >
            <option value="individual">Individual</option>
            <option value="cohort">Cohort</option>
          </select>
        </Field>
        {values.trackingType === "cohort" && (
          <Field id={fieldId("quantity")} label="Quantity" error={errors.quantity}>
            <Input
              id={fieldId("quantity")}
              inputMode="numeric"
              value={values.quantity}
              disabled={disabled}
              aria-invalid={Boolean(errors.quantity)}
              aria-describedby={describedBy("quantity")}
              onChange={(event) => set("quantity", event.target.value)}
            />
          </Field>
        )}
      </div>

      <div role="group" aria-labelledby={fieldId("tank-heading")} className="grid gap-3">
        <p id={fieldId("tank-heading")} className="text-sm font-medium leading-none">
          Tank
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id={fieldId("systemId")} label="System" error={errors.systemId}>
            <select
              id={fieldId("systemId")}
              className={SELECT_CLASS}
              value={values.systemId}
              disabled={disabled}
              aria-invalid={Boolean(errors.systemId)}
              aria-describedby={describedBy("systemId")}
              onChange={(event) => set("systemId", event.target.value)}
            >
              <option value="">Select a system</option>
              {systems.map((system) => (
                <option key={system.id} value={system.id}>
                  {system.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id={fieldId("position")} label="Shelf position (optional)">
            <select
              id={fieldId("position")}
              className={SELECT_CLASS}
              value={values.position}
              disabled={disabled}
              onChange={(event) => {
                set("position", event.target.value as AnimalFormInput["position"]);
                set("customLabel", "");
              }}
            >
              <option value="">None</option>
              {POSITION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="other">Other</option>
            </select>
          </Field>
          {values.position === "other" && (
            <Field id={fieldId("customLabel")} label="Other position (optional)" error={errors.customLabel}>
              <Input
                id={fieldId("customLabel")}
                placeholder="e.g. Middle"
                value={values.customLabel}
                disabled={disabled}
                aria-invalid={Boolean(errors.customLabel)}
                aria-describedby={describedBy("customLabel")}
                onChange={(event) => set("customLabel", event.target.value)}
              />
            </Field>
          )}
          <Field id={fieldId("sizeLiters")} label="Tank size (L)" error={errors.sizeLiters}>
            <Input
              id={fieldId("sizeLiters")}
              inputMode="decimal"
              list={fieldId("sizes")}
              placeholder="e.g. 9.6"
              value={values.sizeLiters}
              disabled={disabled}
              aria-invalid={Boolean(errors.sizeLiters)}
              aria-describedby={describedBy("sizeLiters")}
              onChange={(event) => set("sizeLiters", event.target.value)}
            />
            <datalist id={fieldId("sizes")}>
              {sizes.map((size) => (
                <option key={size} value={size} />
              ))}
            </datalist>
          </Field>
        </div>
        <p className="min-h-5 text-xs text-muted-foreground" aria-live="polite">
          {tankName
            ? `Tank name: ${tankName} (${tankExists ? "existing tank" : "new tank"})`
            : "Enter a size to see the tank name."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={fieldId("lifeStage")} label="Life stage (optional)" error={errors.lifeStage}>
          <Input
            id={fieldId("lifeStage")}
            placeholder="e.g. Juvenile"
            value={values.lifeStage}
            disabled={disabled}
            aria-invalid={Boolean(errors.lifeStage)}
            aria-describedby={describedBy("lifeStage")}
            onChange={(event) => set("lifeStage", event.target.value)}
          />
        </Field>
        <Field id={fieldId("dateAdded")} label="Date added" error={errors.dateAdded}>
          <Input
            id={fieldId("dateAdded")}
            type="date"
            value={values.dateAdded}
            disabled={disabled}
            aria-invalid={Boolean(errors.dateAdded)}
            aria-describedby={describedBy("dateAdded")}
            onChange={(event) => set("dateAdded", event.target.value)}
          />
        </Field>
        <Field
          id={fieldId("notes")}
          label="Notes (optional)"
          error={errors.notes}
          className="grid content-start gap-2 sm:col-span-2"
        >
          <Textarea
            id={fieldId("notes")}
            rows={2}
            value={values.notes}
            disabled={disabled}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={describedBy("notes")}
            onChange={(event) => set("notes", event.target.value)}
          />
        </Field>
      </div>

      <FieldError role="alert" message={serverError ?? undefined} />
      <FormActions
        submitLabel={submitLabel}
        icon={<Save aria-hidden="true" />}
        disabled={disabled}
        onCancel={onCancel}
      />
    </HydratedForm>
  );
}

export type RetireFormValues = { status: RetiredStatus; retiredOn: string; notes: string };

export function RetireForm({
  animalName,
  dateAdded,
  initialValues,
  disabled,
  onSubmit,
  onCancel,
}: {
  animalName: string;
  dateAdded: string;
  initialValues: RetireFormValues;
  disabled: boolean;
  onSubmit: (values: RetireFormValues) => Promise<string | null>;
  onCancel: () => void;
}) {
  const idPrefix = useId();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const fieldId = (key: string) => `${idPrefix}-${key}`;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = retireSchema(dateAdded).safeParse(values);
    if (!result.success) {
      setErrors(firstErrors(result.error));
      return;
    }
    setServerError(await onSubmit(result.data));
  };

  return (
    <HydratedForm
      aria-label={`Retire ${animalName}`}
      className="grid gap-4 rounded-md border bg-muted/30 p-4"
      onSubmit={submit}
      noValidate
    >
      <p className="text-sm font-medium">Retire {animalName}</p>
      <p className="-mt-2 text-xs text-muted-foreground">
        Retired animals leave every form but keep their history.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={fieldId("status")} label="Reason">
          <select
            id={fieldId("status")}
            className={SELECT_CLASS}
            value={values.status}
            disabled={disabled}
            onChange={(event) =>
              setValues((current) => ({ ...current, status: event.target.value as RetiredStatus }))
            }
          >
            {RETIRED_STATUSES.map((status) => (
              <option key={status} value={status}>
                {RETIRED_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field id={fieldId("retiredOn")} label="Date" error={errors.retiredOn}>
          <Input
            id={fieldId("retiredOn")}
            type="date"
            value={values.retiredOn}
            disabled={disabled}
            aria-invalid={Boolean(errors.retiredOn)}
            aria-describedby={errors.retiredOn ? `${fieldId("retiredOn")}-error` : undefined}
            onChange={(event) => {
              setValues((current) => ({ ...current, retiredOn: event.target.value }));
              setErrors((current) => ({ ...current, retiredOn: undefined }));
            }}
          />
        </Field>
        <Field
          id={fieldId("notes")}
          label="Notes (optional)"
          error={errors.notes}
          className="grid content-start gap-2 sm:col-span-2"
        >
          <Textarea
            id={fieldId("notes")}
            rows={2}
            value={values.notes}
            disabled={disabled}
            onChange={(event) => setValues((current) => ({ ...current, notes: event.target.value }))}
          />
        </Field>
      </div>
      <FieldError role="alert" message={serverError ?? undefined} />
      <FormActions
        submitLabel="Retire"
        icon={<Archive aria-hidden="true" />}
        disabled={disabled}
        onCancel={onCancel}
      />
    </HydratedForm>
  );
}
