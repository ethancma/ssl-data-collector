"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  getPacificDateString,
  getPacificTimeString,
  pacificWallTimeToIso,
} from "@/components/daily-operations/pacific-date-time";
import {
  attachedCatalogId,
  getStarTreatmentMeasurementErrors,
  normalizeSnapshot,
  selectStarTreatmentCatalogItem,
  type StarTreatmentCatalogItem,
} from "@/components/daily-operations/quick-pick-catalogs";
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
import { UnitSelect } from "@/components/unit-select";
import { MEASUREMENT_UNITS } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type StarTreatmentSystemOption = { id: number; name: string };
export type StarTreatmentTankOption = {
  id: number;
  name: string;
  systemId: number;
};
export type StarTreatmentAnimalOption = {
  id: number;
  name: string;
  tankId: number;
  speciesName: string;
};

const LAST_SYSTEM_STORAGE_KEY = "ssl:last-star-treatment-system";

const requiredId = (message: string) =>
  z
    .string()
    .min(1, message)
    .regex(/^\d+$/, message)
    .transform(Number)
    .pipe(z.number().int().positive(message));

const optionalPositiveNumber = z.string().refine((value) => {
  if (value.trim() === "") return true;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0;
}, "Enter a positive number");

const starTreatmentSchema = z
  .object({
    date: z
      .string()
      .min(1, "Select a date")
      .refine((value) => value === getPacificDateString(), "Date must be today in the lab"),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time"),
    systemId: requiredId("Select a system"),
    tankId: requiredId("Select a tank"),
    animalId: requiredId("Select a star"),
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

type StarTreatmentFormInput = z.input<typeof starTreatmentSchema>;
type StarTreatmentFormValues = z.output<typeof starTreatmentSchema>;

function nullableNumber(value: string) {
  return value.trim() === "" ? null : Number(value);
}

export function StarTreatmentForm({
  systems,
  tanks,
  stars,
  catalogs,
  catalogLoadError,
}: {
  systems: StarTreatmentSystemOption[];
  tanks: StarTreatmentTankOption[];
  stars: StarTreatmentAnimalOption[];
  catalogs: StarTreatmentCatalogItem[];
  catalogLoadError?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [serverError, setServerError] = useState<string | null>(null);
  const [filterMessage, setFilterMessage] = useState("");
  const [savedStarName, setSavedStarName] = useState<string | null>(null);

  const rawSystemId = searchParams.get("system") ?? "";
  const rawTankId = searchParams.get("tank") ?? "";
  const rawAnimalId = searchParams.get("animal") ?? "";
  const validSystem = systems.find((system) => String(system.id) === rawSystemId);
  const validTank = tanks.find(
    (tank) => String(tank.id) === rawTankId && tank.systemId === validSystem?.id,
  );
  const validStar = stars.find(
    (star) => String(star.id) === rawAnimalId && star.tankId === validTank?.id,
  );
  const defaultCatalog = catalogs[0] ?? null;
  const defaultTreatment = selectStarTreatmentCatalogItem(defaultCatalog);

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
    defaultValues: {
      date: getPacificDateString(),
      time: getPacificTimeString(),
      systemId: validSystem ? String(validSystem.id) : "",
      tankId: validTank ? String(validTank.id) : "",
      animalId: validStar ? String(validStar.id) : "",
      catalogId:
        defaultTreatment.catalogId === null ? "" : String(defaultTreatment.catalogId),
      treatmentName: defaultTreatment.name,
      amount: "",
      unit: defaultTreatment.amountUnit,
      concentration: "",
      concentrationUnit: defaultTreatment.concentrationUnit,
      notes: "",
    },
  });

  const systemId = watch("systemId");
  const tankId = watch("tankId");
  const catalogId = watch("catalogId");

  const filteredTanks = tanks.filter((tank) => String(tank.systemId) === systemId);
  const filteredStars = stars.filter((star) => String(star.tankId) === tankId);

  const replaceFilters = useCallback(
    (updates: Record<string, string | null>) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("type", "star-treatment");
      for (const [key, value] of Object.entries(updates)) {
        if (value) nextParams.set(key, value);
        else nextParams.delete(key);
      }
      router.replace(`/protected/daily-operations?${nextParams.toString()}`, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (!rawSystemId) {
      const storedSystemId = window.localStorage.getItem(LAST_SYSTEM_STORAGE_KEY);
      if (systems.some((system) => String(system.id) === storedSystemId)) {
        replaceFilters({ system: storedSystemId, tank: null, animal: null });
        setValue("systemId", storedSystemId ?? "");
      }
      return;
    }

    if (!validSystem) {
      setFilterMessage("The linked system is unavailable. Select a system to continue.");
      replaceFilters({ system: null, tank: null, animal: null });
      setValue("systemId", "");
      setValue("tankId", "");
      setValue("animalId", "");
      return;
    }

    setValue("systemId", String(validSystem.id));
    if (rawTankId && !validTank) {
      setFilterMessage("The linked tank is not available in that system.");
      replaceFilters({ tank: null, animal: null });
      setValue("tankId", "");
      setValue("animalId", "");
      return;
    }

    setValue("tankId", validTank ? String(validTank.id) : "");
    if (rawAnimalId && !validStar) {
      setFilterMessage("The linked star is not available in that tank.");
      replaceFilters({ animal: null });
      setValue("animalId", "");
      return;
    }

    setValue("animalId", validStar ? String(validStar.id) : "");
  }, [
    rawAnimalId,
    rawSystemId,
    rawTankId,
    replaceFilters,
    setValue,
    systems,
    validStar,
    validSystem,
    validTank,
  ]);

  const onSystemChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextSystemId = event.target.value;
    setFilterMessage("");
    setSavedStarName(null);
    setValue("systemId", nextSystemId, { shouldValidate: true });
    setValue("tankId", "");
    setValue("animalId", "");
    replaceFilters({ system: nextSystemId || null, tank: null, animal: null });
  };

  const onTankChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextTankId = event.target.value;
    setFilterMessage("");
    setSavedStarName(null);
    setValue("tankId", nextTankId, { shouldValidate: true });
    setValue("animalId", "");
    replaceFilters({ tank: nextTankId || null, animal: null });
  };

  const onStarChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const nextAnimalId = event.target.value;
    setFilterMessage("");
    setSavedStarName(null);
    setValue("animalId", nextAnimalId, { shouldValidate: true });
    replaceFilters({ animal: nextAnimalId || null });
  };

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
    const selectedStar = stars.find((star) => star.id === values.animalId);
    if (!selectedStar || selectedStar.tankId !== values.tankId) {
      setError("animalId", { message: "Select a star in the selected tank" });
      return;
    }

    let administeredAt: string;
    try {
      administeredAt = pacificWallTimeToIso(values.date, values.time);
    } catch (error) {
      setError("time", {
        message: error instanceof Error ? error.message : "Enter a valid Pacific time",
      });
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
    const { error } = await supabase.rpc("create_star_treatment", {
      p_animal_id: values.animalId,
      p_tank_id: selectedStar.tankId,
      p_amount: amountValue,
      p_unit: amountValue === null ? null : values.unit.trim(),
      p_concentration: concentrationValue,
      p_concentration_unit:
        concentrationValue === null ? null : values.concentrationUnit.trim(),
      p_treatment_type: treatmentType,
      p_notes: values.notes.trim() || null,
      p_administered_at: administeredAt,
      p_catalog_id: catalogId,
    });

    if (error) {
      setServerError(error.message);
      return;
    }

    window.localStorage.setItem(LAST_SYSTEM_STORAGE_KEY, String(values.systemId));
    setSavedStarName(selectedStar.name);
    replaceFilters({
      animal: null,
      health: null,
      "health-observation": null,
      healthObservation: null,
    });
  };

  const logAnother = () => {
    const retainedSystemId = systemId;
    const retainedTankId = tankId;
    reset({
      date: getPacificDateString(),
      time: getPacificTimeString(),
      systemId: retainedSystemId,
      tankId: retainedTankId,
      animalId: "",
      catalogId:
        defaultTreatment.catalogId === null ? "" : String(defaultTreatment.catalogId),
      treatmentName: defaultTreatment.name,
      amount: "",
      unit: defaultTreatment.amountUnit,
      concentration: "",
      concentrationUnit: defaultTreatment.concentrationUnit,
      notes: "",
    });
    setSavedStarName(null);
    setServerError(null);
    replaceFilters({ animal: null });
  };

  if (savedStarName) {
    return (
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl">Star treatment saved</CardTitle>
          <CardDescription role="status" aria-live="polite">
            Treatment recorded for {savedStarName}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button type="button" className="min-h-11" onClick={logAnother}>
            Log another treatment
          </Button>
          <Button asChild variant="outline" className="min-h-11">
            <Link href="/protected/star-treatments">View treatments</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="text-2xl">Star treatment</CardTitle>
        <CardDescription>
          Record treatment administered to one individually tracked star.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
          <div className="grid gap-4 rounded-lg border border-input bg-muted/30 p-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="star-treatment-date">Administered date</Label>
              <Input
                id="star-treatment-date"
                type="date"
                className="min-h-11"
                min={getPacificDateString()}
                max={getPacificDateString()}
                aria-describedby={errors.date ? "star-treatment-date-error" : undefined}
                aria-invalid={Boolean(errors.date)}
                {...register("date")}
              />
              {errors.date && (
                <p id="star-treatment-date-error" className="text-sm text-red-500">
                  {errors.date.message}
                </p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="star-treatment-time">Time</Label>
              <Input
                id="star-treatment-time"
                type="time"
                className="min-h-11"
                aria-describedby={errors.time ? "star-treatment-time-error" : undefined}
                aria-invalid={Boolean(errors.time)}
                {...register("time")}
              />
              {errors.time && (
                <p id="star-treatment-time-error" className="text-sm text-red-500">
                  {errors.time.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="star-treatment-system">System</Label>
              <select
                id="star-treatment-system"
                className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
                aria-describedby={errors.systemId ? "star-treatment-system-error" : undefined}
                aria-invalid={Boolean(errors.systemId)}
                {...register("systemId", { onChange: onSystemChange })}
              >
                <option value="">Select a system…</option>
                {systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </select>
              {errors.systemId && (
                <p id="star-treatment-system-error" className="text-sm text-red-500">
                  {errors.systemId.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="star-treatment-tank">Tank</Label>
              <select
                id="star-treatment-tank"
                className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm"
                disabled={!systemId}
                aria-describedby={errors.tankId ? "star-treatment-tank-error" : undefined}
                aria-invalid={Boolean(errors.tankId)}
                {...register("tankId", { onChange: onTankChange })}
              >
                <option value="">Select a tank…</option>
                {filteredTanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tank.name}
                  </option>
                ))}
              </select>
              {errors.tankId && (
                <p id="star-treatment-tank-error" className="text-sm text-red-500">
                  {errors.tankId.message}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="star-treatment-animal">Treated star</Label>
              <select
                id="star-treatment-animal"
                className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 md:text-sm"
                disabled={!tankId}
                aria-describedby={errors.animalId ? "star-treatment-animal-error" : undefined}
                aria-invalid={Boolean(errors.animalId)}
                {...register("animalId", { onChange: onStarChange })}
              >
                <option value="">Select a star…</option>
                {filteredStars.map((star) => (
                  <option key={star.id} value={star.id}>
                    {star.name} — {star.speciesName}
                  </option>
                ))}
              </select>
              {errors.animalId && (
                <p id="star-treatment-animal-error" className="text-sm text-red-500">
                  {errors.animalId.message}
                </p>
              )}
            </div>
          </div>

          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {filterMessage}
          </p>

          <fieldset className="grid content-start auto-rows-min gap-3">
            <legend className="text-sm font-medium">Treatment type</legend>
            <div className="grid auto-rows-min gap-2 sm:grid-cols-3">
              {catalogs.map((item) => (
                <label
                  key={item.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm [overflow-wrap:anywhere] has-[:checked]:border-foreground has-[:checked]:bg-muted"
                >
                  <input
                    type="radio"
                    value={item.id}
                    {...register("catalogId", { onChange: onTreatmentCatalogChange })}
                  />
                  {item.name}
                </label>
              ))}
              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted">
                <input
                  type="radio"
                  value=""
                  {...register("catalogId", { onChange: onTreatmentCatalogChange })}
                />
                Other
              </label>
            </div>
          </fieldset>

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
                className="min-h-11"
                maxLength={100}
                aria-describedby={
                  errors.treatmentName ? "star-treatment-custom-error" : undefined
                }
                aria-invalid={Boolean(errors.treatmentName)}
                {...register("treatmentName")}
              />
              {errors.treatmentName && (
                <p id="star-treatment-custom-error" className="text-sm text-red-500">
                  {errors.treatmentName.message}
                </p>
              )}
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className="grid content-start gap-4 rounded-md border p-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] items-start gap-4">
                <div className="grid content-start gap-2">
                  <Label htmlFor="star-treatment-amount">Amount</Label>
                  <Input
                    id="star-treatment-amount"
                    type="text"
                    className="min-h-11"
                    inputMode="decimal"
                    placeholder="Optional"
                    aria-describedby={errors.amount ? "star-treatment-amount-error" : undefined}
                    aria-invalid={Boolean(errors.amount)}
                    {...register("amount")}
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
              {errors.amount && (
                <p id="star-treatment-amount-error" className="text-sm text-red-500">
                  {errors.amount.message}
                </p>
              )}
            </div>

            <div className="grid content-start gap-4 rounded-md border p-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,7rem),1fr))] items-start gap-4">
                <div className="grid content-start gap-2">
                  <Label htmlFor="star-treatment-concentration">Concentration</Label>
                  <Input
                    id="star-treatment-concentration"
                    type="text"
                    className="min-h-11"
                    inputMode="decimal"
                    placeholder="Optional"
                    aria-describedby={
                      errors.concentration ? "star-treatment-concentration-error" : undefined
                    }
                    aria-invalid={Boolean(errors.concentration)}
                    {...register("concentration")}
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
              {errors.concentration && (
                <p id="star-treatment-concentration-error" className="text-sm text-red-500">
                  {errors.concentration.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="star-treatment-notes">Notes</Label>
            <textarea
              id="star-treatment-notes"
              rows={4}
              className={cn(
                "flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm",
              )}
              aria-describedby={errors.notes ? "star-treatment-notes-error" : undefined}
              aria-invalid={Boolean(errors.notes)}
              {...register("notes")}
            />
            {errors.notes && (
              <p id="star-treatment-notes-error" className="text-sm text-red-500">
                {errors.notes.message}
              </p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-red-500" role="alert">
              {serverError}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="min-h-11" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save star treatment"}
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/protected/star-treatments">View treatments</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}