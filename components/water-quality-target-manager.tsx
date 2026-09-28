"use client";

import { Save, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  formatWaterQualityTarget,
  resolveWaterQualityTarget,
  type WaterQualityTargetRange,
} from "@/components/daily-operations/water-quality-targets";
import { SELECT_CLASS } from "@/components/daily-operations/form-classes";
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
import {
  WATER_QUALITY_PARAMS,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/client";

type SystemOption = { id: number; name: string };

type TargetRow = {
  id: number;
  system_id: number | null;
  parameter_key: string;
  min_value: number | string | null;
  max_value: number | string | null;
};

function toTargetRange(row: TargetRow): WaterQualityTargetRange {
  return {
    id: row.id,
    systemId: row.system_id,
    parameterKey: row.parameter_key as WaterQualityParameter,
    minValue: row.min_value === null ? null : Number(row.min_value),
    maxValue: row.max_value === null ? null : Number(row.max_value),
  };
}

function parseBound(value: string, label: string) {
  if (value.trim() === "") return { value: null, error: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: `Enter a valid ${label.toLowerCase()}` };
  }
  return { value: parsed, error: null };
}

export function WaterQualityTargetManager({
  systems,
  initialTargets,
  loadError,
}: {
  systems: SystemOption[];
  initialTargets: WaterQualityTargetRange[];
  loadError?: string | null;
}) {
  const [scope, setScope] = useState("lab");
  const [targets, setTargets] = useState(initialTargets);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [success, setSuccess] = useState<string | null>(null);

  const scopeSystemId = scope === "lab" ? null : Number(scope);
  const selectedSystem = systems.find((system) => system.id === scopeSystemId);
  const scopeName = selectedSystem?.name ?? "Lab-wide";

  const replaceTarget = (target: WaterQualityTargetRange) => {
    setTargets((current) => [
      ...current.filter((candidate) => candidate.id !== target.id),
      target,
    ]);
  };

  const removeTarget = (targetId: number) => {
    setTargets((current) => current.filter((target) => target.id !== targetId));
  };

  return (
    <Card className="w-full max-w-5xl">
      <CardHeader>
        <CardTitle className="text-2xl">Water quality targets</CardTitle>
        <CardDescription>
          Leave either bound empty for a one-sided range. System values override the
          lab-wide value for the same parameter.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="target-scope">Range scope</Label>
          <select
            id="target-scope"
            className={SELECT_CLASS}
            value={scope}
            disabled={pendingAction !== null || Boolean(loadError)}
            onChange={(event) => {
              setScope(event.target.value);
              setError(loadError ?? null);
              setSuccess(null);
            }}
          >
            <option value="lab">Lab-wide</option>
            {systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        <p className="min-h-5 text-sm text-emerald-700 dark:text-emerald-400" role="status" aria-live="polite">
          {success}
        </p>

        {!loadError && targets.length === 0 && (
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            No target ranges are configured. Add a minimum, maximum, or both below.
          </div>
        )}

        {!loadError && (
          <div className="divide-y rounded-md border">
            {WATER_QUALITY_PARAMS.map((parameter) => {
              const target =
                targets.find(
                  (candidate) =>
                    candidate.systemId === scopeSystemId &&
                    candidate.parameterKey === parameter.key,
                ) ?? null;
              const labTarget =
                targets.find(
                  (candidate) =>
                    candidate.systemId === null &&
                    candidate.parameterKey === parameter.key,
                ) ?? null;
              const effectiveTarget =
                scopeSystemId === null
                  ? labTarget
                  : resolveWaterQualityTarget(
                      targets,
                      scopeSystemId,
                      parameter.key,
                    );

              return (
                <TargetRangeEditor
                  key={`${scope}-${parameter.key}-${target?.id ?? "new"}`}
                  parameter={parameter}
                  scopeSystemId={scopeSystemId}
                  scopeName={scopeName}
                  target={target}
                  labTarget={labTarget}
                  effectiveTarget={effectiveTarget}
                  disabled={pendingAction !== null}
                  onPending={setPendingAction}
                  onError={(message) => {
                    setError(message);
                    setSuccess(null);
                  }}
                  onSuccess={(message) => {
                    setError(null);
                    setSuccess(message);
                  }}
                  onSaved={replaceTarget}
                  onDeleted={removeTarget}
                />
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TargetRangeEditor({
  parameter,
  scopeSystemId,
  scopeName,
  target,
  labTarget,
  effectiveTarget,
  disabled,
  onPending,
  onError,
  onSuccess,
  onSaved,
  onDeleted,
}: {
  parameter: (typeof WATER_QUALITY_PARAMS)[number];
  scopeSystemId: number | null;
  scopeName: string;
  target: WaterQualityTargetRange | null;
  labTarget: WaterQualityTargetRange | null;
  effectiveTarget: WaterQualityTargetRange | null;
  disabled: boolean;
  onPending: (action: string | null) => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
  onSaved: (target: WaterQualityTargetRange) => void;
  onDeleted: (targetId: number) => void;
}) {
  const [minimum, setMinimum] = useState(
    target?.minValue === null || target?.minValue === undefined
      ? ""
      : String(target.minValue),
  );
  const [maximum, setMaximum] = useState(
    target?.maxValue === null || target?.maxValue === undefined
      ? ""
      : String(target.maxValue),
  );
  const [rowError, setRowError] = useState<string | null>(null);
  const unitLabel = parameter.unit ?? "unitless";
  const minimumId = `${scopeSystemId ?? "lab"}-${parameter.key}-minimum`;
  const maximumId = `${scopeSystemId ?? "lab"}-${parameter.key}-maximum`;
  const errorId = `${scopeSystemId ?? "lab"}-${parameter.key}-error`;

  const saveTarget = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedMinimum = parseBound(minimum, "Minimum");
    const parsedMaximum = parseBound(maximum, "Maximum");
    const validationError = parsedMinimum.error ?? parsedMaximum.error;

    if (validationError) {
      setRowError(validationError);
      return;
    }
    if (parsedMinimum.value === null && parsedMaximum.value === null) {
      setRowError("Enter a minimum, maximum, or both");
      return;
    }
    if (
      parsedMinimum.value !== null &&
      parsedMaximum.value !== null &&
      parsedMinimum.value > parsedMaximum.value
    ) {
      setRowError("Minimum cannot be greater than maximum");
      return;
    }

    setRowError(null);
    onPending(`save-${parameter.key}`);
    const supabase = createClient();
    const values = {
      system_id: scopeSystemId,
      parameter_key: parameter.key,
      min_value: parsedMinimum.value,
      max_value: parsedMaximum.value,
    };
    const result = target
      ? await supabase
          .from("water_quality_target_ranges")
          .update(values)
          .eq("id", target.id)
          .select("id, system_id, parameter_key, min_value, max_value")
          .single()
      : await supabase
          .from("water_quality_target_ranges")
          .insert(values)
          .select("id, system_id, parameter_key, min_value, max_value")
          .single();
    onPending(null);

    if (result.error || !result.data) {
      onError(result.error?.message ?? "Target range could not be saved.");
      return;
    }

    onSaved(toTargetRange(result.data));
    onSuccess(`${parameter.label} target saved for ${scopeName}.`);
  };

  const deleteTarget = async () => {
    if (!target) return;
    const confirmed = window.confirm(
      `Delete the ${parameter.label} target for ${scopeName}?`,
    );
    if (!confirmed) return;

    setRowError(null);
    onPending(`delete-${parameter.key}`);
    const supabase = createClient();
    const { error } = await supabase
      .from("water_quality_target_ranges")
      .delete()
      .eq("id", target.id);
    onPending(null);

    if (error) {
      onError(error.message);
      return;
    }

    onDeleted(target.id);
    onSuccess(`${parameter.label} target deleted for ${scopeName}.`);
  };

  return (
    <form
      aria-label={`${parameter.label} target for ${scopeName}`}
      className="grid gap-4 p-4 lg:grid-cols-[minmax(9rem,0.8fr)_minmax(0,1.5fr)_minmax(12rem,1fr)_auto] lg:items-start"
      onSubmit={saveTarget}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{parameter.label}</span>
        <span className="text-xs text-muted-foreground">{unitLabel}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={minimumId}>Minimum ({unitLabel})</Label>
          <Input
            id={minimumId}
            inputMode="decimal"
            value={minimum}
            disabled={disabled}
            aria-describedby={rowError ? errorId : undefined}
            aria-invalid={Boolean(rowError)}
            placeholder="No minimum"
            onChange={(event) => setMinimum(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={maximumId}>Maximum ({unitLabel})</Label>
          <Input
            id={maximumId}
            inputMode="decimal"
            value={maximum}
            disabled={disabled}
            aria-describedby={rowError ? errorId : undefined}
            aria-invalid={Boolean(rowError)}
            placeholder="No maximum"
            onChange={(event) => setMaximum(event.target.value)}
          />
        </div>
        {rowError && (
          <p id={errorId} className="text-sm text-red-500 sm:col-span-2" role="alert">
            {rowError}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1 text-sm">
        {scopeSystemId === null ? (
          <span>
            Configured: <span className="font-medium">{formatWaterQualityTarget(target, parameter.unit)}</span>
          </span>
        ) : (
          <>
            <span>
              Effective: <span className="font-medium">{formatWaterQualityTarget(effectiveTarget, parameter.unit)}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {target
                ? "Using this system override"
                : labTarget
                  ? `Lab-wide fallback: ${formatWaterQualityTarget(labTarget, parameter.unit)}`
                  : "No system or lab-wide range"}
            </span>
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button type="submit" disabled={disabled}>
          <Save aria-hidden="true" />
          {target ? "Save" : "Add"}
        </Button>
        {target && (
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={deleteTarget}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}