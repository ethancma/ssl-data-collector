"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

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
import { FOOD_TYPES, type FoodType } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  feedingLogSchema,
  type FeedingLogFormInput,
  type FeedingLogFormValues,
} from "@/lib/validation/feeding-log";

type AnimalOption = { id: number; name: string; tankId: number };

const FOOD_TYPE_LABELS: Record<FoodType, string> = {
  krill: "Krill",
  brine_shrimp: "Brine shrimp",
  abalone: "Abalone",
  urchin_purple: "Purple urchin",
  urchin_white: "White urchin",
  microalgae: "Microalgae",
  other: "Other",
};

export function FeedingLogForm({ animals }: { animals: AnimalOption[] }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FeedingLogFormInput, unknown, FeedingLogFormValues>({
    resolver: zodResolver(feedingLogSchema),
    defaultValues: {
      animalId: "",
      tankId: "",
      foodType: undefined,
      amount: "",
      notes: "",
    },
  });

  const foodType = watch("foodType");

  const onAnimalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const animal = animals.find((a) => String(a.id) === e.target.value);
    setValue("tankId", animal ? String(animal.tankId) : "", {
      shouldValidate: true,
    });
  };

  const onSubmit = async (values: FeedingLogFormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.from("feeding_logs").insert({
      animal_id: values.animalId,
      tank_id: values.tankId,
      food_type: values.foodType,
      amount: values.amount.trim(),
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

          <div className="grid gap-2">
            <Label htmlFor="animalId">Animal</Label>
            <select
              id="animalId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
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

          <div className="grid gap-2">
            <Label>Food type</Label>
            <div className="flex flex-wrap gap-2">
              {FOOD_TYPES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  variant={foodType === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setValue("foodType", t, { shouldValidate: true })}
                >
                  {FOOD_TYPE_LABELS[t]}
                </Button>
              ))}
            </div>
            {errors.foodType && (
              <p className="text-sm text-red-500">{errors.foodType.message}</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              placeholder='e.g. "2 krill" or "half a pellet"'
              {...register("amount")}
            />
            {errors.amount && (
              <p className="text-sm text-red-500">{errors.amount.message}</p>
            )}
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
