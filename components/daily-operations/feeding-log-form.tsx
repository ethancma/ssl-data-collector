"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
  pacificWallTimeToIso,
} from "@/lib/pacific-date-time";
import {
  type FoodCatalogItem,
} from "@/lib/daily-operations/quick-pick-catalogs";
import {
  QUICK_PICK_HEADING_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
} from "@/components/forms/form-classes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { feedingLogSchema } from "@/lib/validation/feeding-log";

const FEEDING_SCOPE_TEXT = {
  legend: "Animals fed",
  animalLabel: "Animal",
  allAnimalsOption: "All animals in tank",
  checklistLabel: "Animals to log",
  nounPlural: "animals",
};

export function FeedingLogForm({
  systems,
  tanks,
  animals,
  catalogs,
  catalogLoadError,
}: {
  systems: BatchScopeSystem[];
  tanks: BatchScopeTank[];
  animals: BatchScopeAnimal[];
  catalogs: FoodCatalogItem[];
  catalogLoadError?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<BatchLogResult | null>(null);
  const requestId = useBatchRequestId();
  const batch = useBatchScope({
    logType: "feeding",
    systems,
    tanks,
    animals,
    lastSystemStorageKey: "ssl:last-feeding-system",
    text: FEEDING_SCOPE_TEXT,
    onEdit: requestId.reset,
  });
  const schema = feedingLogSchema
    .pick({
      date: true,
      time: true,
      amount: true,
      notes: true,
    })
    .extend({
      catalogId: z
        .string()
        .min(1, "Select a food")
        .refine(
          (value) => catalogs.some((item) => String(item.id) === value),
          "Select an available food",
        ),
    });
  type FeedingInput = z.input<typeof schema>;
  type FeedingValues = z.output<typeof schema>;

  const defaultValues = (): FeedingInput => ({
    date: getPacificDateString(),
    time: getPacificTimeString(),
    catalogId: catalogs[0] ? String(catalogs[0].id) : "",
    amount: "",
    notes: "",
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FeedingInput, unknown, FeedingValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues(),
  });

  const catalogId = watch("catalogId");
  const selectedFood = catalogs.find((item) => String(item.id) === catalogId);

  useEffect(() => {
    const subscription = watch(() => requestId.reset());
    return () => subscription.unsubscribe();
  }, [requestId, watch]);

  const includedCount = batch.includedIds.length;

  const onSubmit = async (values: FeedingValues) => {
    setServerError(null);
    const { systemId, tankId, animalId } = batch.scope;
    if (systemId === null || includedCount === 0) return;

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
    if (!selectedFood) {
      setServerError(
        "That food is no longer available. Refresh the page and select an active food.",
      );
      return;
    }
    const hasAmount = values.amount.trim() !== "";
    const supabase = createClient();
    const outcome = await runBatchSave(
      () =>
        supabase.rpc("create_feeding_batch", {
          p_request_id: requestId.current(),
          p_system_id: systemId,
          p_tank_id: tankId,
          p_animal_id: animalId,
          p_included_animal_ids: batch.includedIds,
          p_excluded_animal_ids: batch.excludedIds,
          p_fed_at: fedAt,
          p_food_catalog_id: selectedFood.id,
          p_amount_value: hasAmount ? Number(values.amount.trim()) : null,
          p_notes: values.notes?.trim() ? values.notes.trim() : null,
        }),
      FEEDING_SCOPE_TEXT.nounPlural,
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
    router.refresh();
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
        title={savedResult.created_count === 1 ? "Feeding saved" : "Feedings saved"}
        result={savedResult}
        animals={animals}
        nounPlural={savedResult.created_count === 1 ? "feeding" : "feedings"}
      >
        <Button type="button" onClick={logAnother}>
          Log another feeding
        </Button>
      </BatchSuccessCard>
    );
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Feeding log</CardTitle>
        <CardDescription>
          Log a feeding for every animal in a system or tank, or for one animal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
          <div className="grid gap-4 rounded-lg border border-input bg-muted/30 p-4 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                aria-invalid={Boolean(errors.date)}
                aria-describedby={errors.date ? "date-error" : undefined}
                {...register("date")}
              />
              {errors.date && (
                <p id="date-error" className="text-sm text-red-500">
                  {errors.date.message}
                </p>
              )}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor="time">Time</Label>
              <Input
                id="time"
                type="time"
                aria-invalid={Boolean(errors.time)}
                aria-describedby={errors.time ? "time-error" : undefined}
                {...register("time")}
              />
              {errors.time && (
                <p id="time-error" className="text-sm text-red-500">
                  {errors.time.message}
                </p>
              )}
            </div>
          </div>

          <BatchScopeFields batch={batch} idPrefix="feeding" disabled={isSubmitting} />

          <div
            role="group"
            aria-labelledby="feeding-quick-pick-label"
            className="grid content-start gap-2"
          >
            <p id="feeding-quick-pick-label" className={QUICK_PICK_HEADING_CLASS}>
              Food quick pick
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {catalogs.map((item) => (
                <label key={item.id} className={QUICK_PICK_OPTION_CLASS} title={item.name}>
                  <input
                    type="radio"
                    value={item.id}
                    {...register("catalogId")}
                  />
                  <span className={QUICK_PICK_LABEL_CLASS}>{item.name}</span>
                </label>
              ))}
            </div>
            {catalogs.length === 0 && !catalogLoadError && (
              <p className="text-sm text-muted-foreground" role="status">
                No active foods are available. Ask an administrator to add a food to the catalog.
              </p>
            )}
            {errors.catalogId && (
              <p className="text-sm text-red-500" role="alert">
                {errors.catalogId.message}
              </p>
            )}
          </div>

          {catalogLoadError && (
            <p className="text-sm text-red-500" role="alert">
              Food choices could not be loaded. Refresh the page or ask an administrator to check the food catalog.
            </p>
          )}

          <div className="grid content-start gap-2">
            <Label htmlFor="amount">Amount per animal (optional)</Label>
            <div className="flex items-center overflow-hidden rounded-md border border-input">
              <Input
                id="amount"
                inputMode="decimal"
                placeholder="e.g. 2"
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={errors.amount ? "amount-error" : undefined}
                className="rounded-none border-0 shadow-none focus-visible:ring-0"
                {...register("amount")}
              />
              <span className="shrink-0 border-l border-input px-3 py-2 text-sm text-muted-foreground">
                {selectedFood?.defaultUnit ?? "Select food"}
              </span>
            </div>
            {errors.amount && (
              <p id="amount-error" className="text-sm text-red-500">
                {errors.amount.message}
              </p>
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
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? "notes-error" : undefined}
              {...register("notes")}
            />
            {errors.notes && (
              <p id="notes-error" className="text-sm text-red-500">
                {errors.notes.message}
              </p>
            )}
          </div>

          {serverError && (
            <p className="text-sm text-red-500" role="alert">
              {serverError}
            </p>
          )}

          <Button
            type="submit"
            disabled={
              isSubmitting ||
              batch.isRefreshing ||
              includedCount === 0 ||
              catalogs.length === 0
            }
          >
            {isSubmitting
              ? "Saving…"
              : `Save ${includedCount} ${includedCount === 1 ? "feeding" : "feedings"}`}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
