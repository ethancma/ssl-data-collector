"use client";

import { HydratedForm } from "@/components/forms/hydrated-form";
import { Save, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  QUICK_PICK_HEADING_CLASS,
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
  SELECT_CLASS,
} from "@/components/forms/form-classes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  formatTankGroup,
  formatWeekdays,
  listOverrideScopes,
  parseTankName,
  WEEKDAY_LABELS,
  WEEKDAY_NAMES,
  type TankGroup,
  type TankPosition,
} from "@/lib/systems/feeding-schedule";

type SystemOption = { id: number; name: string };
type TankOption = { id: number; systemId: number; name: string };

export type FeedingScheduleRecord = {
  id: number;
  systemId: number;
  tankPosition: TankPosition | null;
  sizeLiters: number | null;
  weekdays: number[];
};

type ScheduleRow = {
  id: number;
  system_id: number;
  tank_position: string | null;
  size_liters: number | string | null;
  weekdays: number[];
};

const SELECT_COLUMNS = "id, system_id, tank_position, size_liters, weekdays";

function toScheduleRecord(row: ScheduleRow): FeedingScheduleRecord {
  return {
    id: row.id,
    systemId: row.system_id,
    tankPosition: row.tank_position as TankPosition | null,
    sizeLiters: row.size_liters === null ? null : Number(row.size_liters),
    weekdays: row.weekdays,
  };
}

const isSameGroup = (record: FeedingScheduleRecord, group: TankGroup) =>
  record.tankPosition === group.position && record.sizeLiters === group.sizeLiters;

export function FeedingScheduleManager({
  systems,
  tanks,
  initialSchedules,
  loadError,
}: {
  systems: SystemOption[];
  tanks: TankOption[];
  initialSchedules: FeedingScheduleRecord[];
  loadError?: string | null;
}) {
  const [systemId, setSystemId] = useState<number | null>(systems[0]?.id ?? null);
  const [schedules, setSchedules] = useState(initialSchedules);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);
  const [success, setSuccess] = useState<string | null>(null);

  const system = systems.find((candidate) => candidate.id === systemId) ?? null;
  const systemTanks = tanks.filter((tank) => tank.systemId === systemId);
  const systemRecords = schedules.filter((schedule) => schedule.systemId === systemId);
  const systemSchedule =
    systemRecords.find((record) => record.tankPosition === null && record.sizeLiters === null) ?? null;
  const overrideScopes = listOverrideScopes(
    systemTanks.map((tank) => tank.name),
    systemRecords.map((record) => ({ position: record.tankPosition, sizeLiters: record.sizeLiters })),
  );
  const ungroupedTanks = systemTanks.filter((tank) => {
    const group = parseTankName(tank.name);
    return group.position === null && group.sizeLiters === null;
  });

  const save = async (
    existing: FeedingScheduleRecord | null,
    group: TankGroup,
    weekdays: number[],
    label: string,
  ) => {
    if (systemId === null) return false;
    setPendingAction(`save-${formatTankGroup(group) || "system"}`);
    const supabase = createClient();
    const result = existing
      ? await supabase
          .from("feeding_schedules")
          .update({ weekdays })
          .eq("id", existing.id)
          .select(SELECT_COLUMNS)
          .single()
      : await supabase
          .from("feeding_schedules")
          .insert({
            system_id: systemId,
            tank_position: group.position,
            size_liters: group.sizeLiters,
            weekdays,
          })
          .select(SELECT_COLUMNS)
          .single();
    setPendingAction(null);

    if (result.error || !result.data) {
      setError(result.error?.message ?? "Feeding schedule could not be saved.");
      setSuccess(null);
      return false;
    }
    const saved = toScheduleRecord(result.data);
    setSchedules((current) => [...current.filter((candidate) => candidate.id !== saved.id), saved]);
    setError(null);
    setSuccess(`${label} saved: ${formatWeekdays(saved.weekdays)}.`);
    return true;
  };

  const remove = async (existing: FeedingScheduleRecord, label: string) => {
    if (!window.confirm(`Remove the ${label}?`)) return false;
    setPendingAction(`delete-${existing.id}`);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("feeding_schedules")
      .delete()
      .eq("id", existing.id);
    setPendingAction(null);

    if (deleteError) {
      setError(deleteError.message);
      setSuccess(null);
      return false;
    }
    setSchedules((current) => current.filter((candidate) => candidate.id !== existing.id));
    setError(null);
    setSuccess(`${label} removed.`);
    return true;
  };

  return (
    <Card className="w-full max-w-5xl">
      <CardHeader>
        <CardTitle className="text-2xl">Feeding schedules</CardTitle>
        <CardDescription>
          Choose the weekdays each system is fed. Tank names set the overrides: a Lower,
          Upper, Left or Right prefix is used first, then the size (e.g. Lower-14.6L, 200L).
          Systems without a schedule show no feeding due.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid max-w-sm gap-2">
          <Label htmlFor="feeding-schedule-system">System</Label>
          <select
            id="feeding-schedule-system"
            className={SELECT_CLASS}
            value={systemId ?? ""}
            disabled={pendingAction !== null || Boolean(loadError)}
            onChange={(event) => {
              setSystemId(Number(event.target.value));
              setError(loadError ?? null);
              setSuccess(null);
            }}
          >
            {systems.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
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

        {!loadError && system && (
          <div className="divide-y rounded-md border">
            <ScheduleEditor
              key={`system-${system.id}-${systemSchedule?.weekdays.join(",") ?? "none"}`}
              idPrefix={`system-${system.id}`}
              heading={`${system.name} schedule`}
              hint={systemSchedule ? null : "No schedule. No feeding is shown as due."}
              schedule={systemSchedule}
              disabled={pendingAction !== null}
              onSave={(weekdays) => save(systemSchedule, { position: null, sizeLiters: null }, weekdays, `${system.name} schedule`)}
              onRemove={systemSchedule ? () => remove(systemSchedule, `${system.name} schedule`) : null}
            />
            {overrideScopes.map((scope) => {
              const override = systemRecords.find((record) => isSameGroup(record, scope)) ?? null;
              const name = formatTankGroup(scope);
              const label = `${name} override`;
              const idKey = `${scope.position ?? "any"}-${scope.sizeLiters ?? "any"}`;
              const matching = systemTanks
                .filter((tank) => {
                  const group = parseTankName(tank.name);
                  return (
                    (scope.position === null || group.position === scope.position) &&
                    (scope.sizeLiters === null || group.sizeLiters === scope.sizeLiters)
                  );
                })
                .map((tank) => tank.name);
              return (
                <ScheduleEditor
                  key={`override-${idKey}-${override?.weekdays.join(",") ?? "none"}`}
                  idPrefix={`override-${idKey}`}
                  heading={name}
                  hint={[
                    matching.length > 0 ? `Tanks: ${matching.join(", ")}` : "No tank matches this name now",
                    override
                      ? "Using this override"
                      : systemSchedule
                        ? `Follows the system schedule: ${formatWeekdays(systemSchedule.weekdays)}`
                        : "No schedule",
                  ].join(". ")}
                  schedule={override}
                  saveLabel={override ? "Save override" : "Add override"}
                  removeLabel="Use system schedule"
                  disabled={pendingAction !== null}
                  onSave={(weekdays) => save(override, scope, weekdays, label)}
                  onRemove={override ? () => remove(override, label) : null}
                />
              );
            })}
            {ungroupedTanks.length > 0 && (
              <p className="p-4 text-xs text-muted-foreground">
                No override is possible for {ungroupedTanks.map((tank) => tank.name).join(", ")}: the
                name has no Lower, Upper, Left or Right prefix and no size. These follow the system
                schedule.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleEditor({
  idPrefix,
  heading,
  hint,
  schedule,
  saveLabel,
  removeLabel = "Remove",
  disabled,
  onSave,
  onRemove,
}: {
  idPrefix: string;
  heading: string;
  hint: string | null;
  schedule: FeedingScheduleRecord | null;
  saveLabel?: string;
  removeLabel?: string;
  disabled: boolean;
  onSave: (weekdays: number[]) => Promise<boolean>;
  onRemove: (() => Promise<boolean>) | null;
}) {
  const [selected, setSelected] = useState<number[]>(schedule?.weekdays ?? []);
  const [rowError, setRowError] = useState<string | null>(null);
  const headingId = `${idPrefix}-heading`;
  const errorId = `${idPrefix}-error`;

  const toggle = (day: number, checked: boolean) => {
    setRowError(null);
    setSelected((current) =>
      checked ? [...current, day].sort((a, b) => a - b) : current.filter((value) => value !== day),
    );
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (selected.length === 0) {
      setRowError("Choose at least one weekday");
      return;
    }
    await onSave(selected);
  };

  return (
    <HydratedForm
      aria-labelledby={headingId}
      className="grid gap-4 p-4 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(0,2.4fr)_auto] lg:items-start"
      onSubmit={submit}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <span id={headingId} className="text-sm font-medium">
          {heading}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>

      <div role="group" aria-labelledby={headingId} className="grid gap-2">
        <p className={QUICK_PICK_HEADING_CLASS}>Weekdays</p>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {WEEKDAY_LABELS.map((label, index) => {
            const day = index + 1;
            return (
              <label key={label} className={QUICK_PICK_OPTION_CLASS}>
                <input
                  id={`${idPrefix}-day-${day}`}
                  type="checkbox"
                  aria-label={WEEKDAY_NAMES[index]}
                  checked={selected.includes(day)}
                  disabled={disabled}
                  aria-describedby={rowError ? errorId : undefined}
                  onChange={(event) => toggle(day, event.target.checked)}
                />
                <span className={QUICK_PICK_LABEL_CLASS}>{label}</span>
              </label>
            );
          })}
        </div>
        {rowError && (
          <p id={errorId} className="text-sm text-red-500" role="alert">
            {rowError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button type="submit" disabled={disabled}>
          <Save aria-hidden="true" />
          {saveLabel ?? (schedule ? "Save" : "Add")}
        </Button>
        {onRemove && (
          <Button type="button" variant="outline" disabled={disabled} onClick={() => void onRemove()}>
            <Trash2 aria-hidden="true" />
            {removeLabel}
          </Button>
        )}
      </div>
    </HydratedForm>
  );
}
