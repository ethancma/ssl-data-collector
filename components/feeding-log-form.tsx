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
import {
  catalogNameKey,
  DEFAULT_FOOD_UNIT,
  normalizeSnapshot,
  type FoodCatalogItem,
} from "@/components/daily-operations/quick-pick-catalogs";
import {
  QUICK_PICK_FIELDSET_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_LEGEND_CLASS,
  QUICK_PICK_OPTION_CLASS,
  SELECT_CLASS,
} from "@/components/daily-operations/form-classes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UnitSelect } from "@/components/unit-select";
import { FOOD_UNITS } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { feedingLogSchema } from "@/lib/validation/feeding-log";

type AnimalOption = { id: number; name: string; tankId: number };

export function FeedingLogForm({
  animals,
  catalogs,
  catalogLoadError,
}: {
  animals: AnimalOption[];
  catalogs: FoodCatalogItem[];
  catalogLoadError?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const schema = feedingLogSchema
    .pick({
      date: true,
      time: true,
      animalId: true,
      tankId: true,
      amount: true,
      amountUnit: true,
      notes: true,
    })
    .extend({
      catalogId: z.string().refine(
        (value) => value === "" || catalogs.some((item) => String(item.id) === value),
        "Select a quick pick",
      ),
      foodName: z.string().max(200, "Keep the food name under 200 characters"),
    })
    .superRefine((values, context) => {
      if (values.amount.trim() !== "" && normalizeSnapshot(values.amountUnit) === "") {
        context.addIssue({
          code: "custom",
          path: ["amountUnit"],
          message: "Enter an amount unit",
        });
      }
      if (values.catalogId !== "") return;
      const name = normalizeSnapshot(values.foodName);
      if (!name || catalogNameKey(name) === "other") {
        context.addIssue({
          code: "custom",
          path: ["foodName"],
          message: "Enter a food name other than Other",
        });
      }
    });
  type FeedingInput = z.input<typeof schema>;
  type FeedingValues = z.output<typeof schema>;

  const {
    control,
    register,
    handleSubmit,
    watch,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FeedingInput, unknown, FeedingValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      date: getPacificDateString(),
      time: getPacificTimeString(),
      animalId: "",
      tankId: "",
      catalogId: catalogs[0] ? String(catalogs[0].id) : "",
      foodName: "",
      amount: "",
      amountUnit: catalogs[0]?.defaultUnit ?? DEFAULT_FOOD_UNIT,
      notes: "",
    },
  });

  const catalogId = watch("catalogId");

  const onAnimalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const animal = animals.find((a) => String(a.id) === e.target.value);
    setValue("tankId", animal ? String(animal.tankId) : "", {
      shouldValidate: true,
    });
  };

  const onSubmit = async (values: FeedingValues) => {
    setServerError(null);
    let fedAt: string;
    try {
      fedAt = pacificWallTimeToIso(values.date, values.time);
    } catch (error) {
      setError("time", {
        message: error instanceof Error ? error.message : "Enter a valid Pacific time",
      });
      return;
    }

    const selectedFood = catalogs.find((item) => String(item.id) === values.catalogId);
    const hasAmount = values.amount.trim() !== "";
    const supabase = createClient();
    const { error } = await supabase.from("feeding_logs").insert({
      fed_at: fedAt,
      animal_id: values.animalId,
      tank_id: values.tankId,
      food_catalog_id: selectedFood?.id ?? null,
      ...(selectedFood ? {} : { food_name: normalizeSnapshot(values.foodName) }),
      amount_value: hasAmount ? Number(values.amount.trim()) : null,
      amount_unit: hasAmount ? normalizeSnapshot(values.amountUnit) : null,
      notes: values.notes?.trim() ? values.notes.trim() : null,
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
        <CardTitle className="text-2xl">Feeding log</CardTitle>
        <CardDescription>Log a feeding for an individual animal.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <input type="hidden" {...register("tankId")} />

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
            <Label htmlFor="animalId">Animal</Label>
            <select
              id="animalId"
              className={SELECT_CLASS}
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

          <fieldset className={QUICK_PICK_FIELDSET_CLASS}>
            <legend className={QUICK_PICK_LEGEND_CLASS}>Food quick pick</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalogs.map((item) => (
                <label key={item.id} className={QUICK_PICK_OPTION_CLASS} title={item.name}>
                  <input
                    type="radio"
                    value={item.id}
                    {...register("catalogId", {
                      onChange: () => {
                        setValue("foodName", "");
                        setValue("amountUnit", item.defaultUnit, { shouldValidate: true });
                      },
                    })}
                  />
                  <span className={QUICK_PICK_LABEL_CLASS}>{item.name}</span>
                </label>
              ))}
              <label className={QUICK_PICK_OPTION_CLASS}>
                <input
                  type="radio"
                  value=""
                  {...register("catalogId", {
                    onChange: () =>
                      setValue("amountUnit", DEFAULT_FOOD_UNIT, { shouldValidate: true }),
                  })}
                />
                <span className={QUICK_PICK_LABEL_CLASS}>Other</span>
              </label>
            </div>
            {errors.catalogId && (
              <p className="mt-2 text-sm text-red-500">{errors.catalogId.message}</p>
            )}
          </fieldset>

          {catalogLoadError && (
            <p className="text-sm text-red-500" role="alert">
              Quick picks could not be loaded. Enter the food manually.
            </p>
          )}

          {catalogId === "" && (
            <div className="grid gap-2">
              <Label htmlFor="foodName">Food name</Label>
              <Input
                id="foodName"
                maxLength={200}
                aria-invalid={Boolean(errors.foodName)}
                aria-describedby={errors.foodName ? "foodName-error" : undefined}
                {...register("foodName")}
              />
              {errors.foodName && (
                <p id="foodName-error" className="text-sm text-red-500">
                  {errors.foodName.message}
                </p>
              )}
            </div>
          )}

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="amount">Amount (optional)</Label>
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="e.g. 2"
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? "amount-error" : undefined}
                {...register("amount", { deps: "amountUnit" })}
              />
              {errors.amount && (
                <p id="amount-error" className="text-sm text-red-500">
                  {errors.amount.message}
                </p>
              )}
            </div>
            <Controller
              control={control}
              name="amountUnit"
              render={({ field }) => (
                <UnitSelect
                  id="amountUnit"
                  label="Unit"
                  options={FOOD_UNITS}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  error={errors.amountUnit?.message}
                />
              )}
            />
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
            {isSubmitting ? "Saving…" : "Save feeding"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
