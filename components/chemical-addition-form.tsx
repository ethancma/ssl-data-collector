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
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  chemicalAdditionSchema,
  type ChemicalAdditionFormInput,
  type ChemicalAdditionFormValues,
} from "@/lib/validation/chemical-addition";

type SystemOption = { id: number; name: string };

export function ChemicalAdditionForm({
  systems,
  defaultSystemId,
}: {
  systems: SystemOption[];
  defaultSystemId?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChemicalAdditionFormInput, unknown, ChemicalAdditionFormValues>({
    resolver: zodResolver(chemicalAdditionSchema),
    defaultValues: {
      systemId: defaultSystemId ?? "",
      chemicalName: "",
      amount: "",
      unit: "",
      reason: "",
    },
  });

  const onSubmit = async (values: ChemicalAdditionFormValues) => {
    setServerError(null);
    const supabase = createClient();
    const { error } = await supabase.from("chemical_additions").insert({
      system_id: values.systemId,
      chemical_name: values.chemicalName.trim(),
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
        <CardTitle className="text-2xl">Chemical addition</CardTitle>
        <CardDescription>Log a dosing event for a system.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <div className="grid gap-2">
            <Label htmlFor="systemId">System</Label>
            <select
              id="systemId"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
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

          <div className="grid gap-2">
            <Label htmlFor="chemicalName">Chemical</Label>
            <Input
              id="chemicalName"
              placeholder="e.g. Baking soda"
              {...register("chemicalName")}
            />
            {errors.chemicalName && (
              <p className="text-sm text-red-500">
                {errors.chemicalName.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
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
            <div className="grid gap-2">
              <Label htmlFor="unit">Unit</Label>
              <Input
                id="unit"
                placeholder="e.g. mL, g"
                {...register("unit")}
              />
              {errors.unit && (
                <p className="text-sm text-red-500">{errors.unit.message}</p>
              )}
            </div>
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
            {isSubmitting ? "Saving…" : "Save addition"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
