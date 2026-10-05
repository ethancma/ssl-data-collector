"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  QUICK_PICK_LABEL_CLASS,
  QUICK_PICK_OPTION_CLASS,
  SELECT_CLASS,
} from "@/components/daily-operations/form-classes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import {
  eligibleAnimalsForScope,
  freezeSelectionForRefresh,
  isAnimalChecked,
  setAnimalsChecked,
  splitSelection,
  type BatchLogResult,
  type BatchScopeAnimal,
  type BatchScopeIds,
  type BatchScopeSystem,
  type BatchScopeTank,
  type BatchSelection,
} from "@/lib/daily-operations/batch-selection";

type ScopeParamUpdates = Partial<Record<"system" | "tank" | "animal", string | null>>;

type BatchScopeText = {
  legend: string;
  animalLabel: string;
  allAnimalsOption: string;
  checklistLabel: string;
  nounPlural: string;
};

const FRESH_SELECTION: BatchSelection = {
  scopeKey: "",
  checked: new Map(),
  newAnimalsChecked: true,
};

function scopeKeyFor(scope: BatchScopeIds) {
  return `${scope.systemId ?? ""}:${scope.tankId ?? ""}:${scope.animalId ?? ""}`;
}

// One request ID per submit attempt: kept across unconfirmed retries, dropped on any edit or server verdict.
export function useBatchRequestId() {
  const requestIdRef = useRef<string | null>(null);
  return useMemo(
    () => ({
      current: () => {
        requestIdRef.current ??= crypto.randomUUID();
        return requestIdRef.current;
      },
      reset: () => {
        requestIdRef.current = null;
      },
    }),
    [],
  );
}

export function useBatchScope({
  logType,
  systems,
  tanks,
  animals,
  lastSystemStorageKey,
  text,
  onEdit,
}: {
  logType: "feeding" | "star-treatment";
  systems: BatchScopeSystem[];
  tanks: BatchScopeTank[];
  animals: BatchScopeAnimal[];
  lastSystemStorageKey: string;
  text: BatchScopeText;
  onEdit: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRefreshing, startRefresh] = useTransition();
  const [scopeMessage, setScopeMessage] = useState("");
  const [selectionState, setSelectionState] = useState<BatchSelection>(FRESH_SELECTION);
  const restoredSystemRef = useRef(false);

  const rawSystemId = searchParams.get("system") ?? "";
  const rawTankId = searchParams.get("tank") ?? "";
  const rawAnimalId = searchParams.get("animal") ?? "";
  const system = systems.find((option) => String(option.id) === rawSystemId);
  const tank = system
    ? tanks.find((option) => String(option.id) === rawTankId && option.systemId === system.id)
    : undefined;
  const animal = tank
    ? animals.find((option) => String(option.id) === rawAnimalId && option.tankId === tank.id)
    : undefined;
  // A dropped tank/animal link must not silently widen into an all-checked batch.
  const linkWidened = Boolean((rawTankId && !tank) || (rawAnimalId && !animal));

  const scope: BatchScopeIds = {
    systemId: system?.id ?? null,
    tankId: tank?.id ?? null,
    animalId: animal?.id ?? null,
  };
  const scopeKey = scopeKeyFor(scope);
  const selection: BatchSelection =
    selectionState.scopeKey === scopeKey
      ? selectionState
      : { scopeKey, checked: new Map(), newAnimalsChecked: !linkWidened };

  const tanksInSystem = tanks.filter((option) => option.systemId === scope.systemId);
  const animalsInTank = animals.filter((option) => option.tankId === scope.tankId);
  const eligible = eligibleAnimalsForScope(scope, tanks, animals);
  const { includedIds, excludedIds } = splitSelection(eligible, selection);

  const replaceScopeParams = useCallback(
    (updates: ScopeParamUpdates) => {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.set("type", logType);
      for (const [key, value] of Object.entries(updates)) {
        if (value) nextParams.set(key, value);
        else nextParams.delete(key);
      }
      window.history.replaceState(null, "", `?${nextParams.toString()}`);
    },
    [logType],
  );

  useEffect(() => {
    if (restoredSystemRef.current) return;
    restoredSystemRef.current = true;
    if (rawSystemId) return;
    const storedSystemId = window.localStorage.getItem(lastSystemStorageKey);
    if (systems.some((option) => String(option.id) === storedSystemId)) {
      replaceScopeParams({ system: storedSystemId, tank: null, animal: null });
    }
  }, [lastSystemStorageKey, rawSystemId, replaceScopeParams, systems]);

  useEffect(() => {
    if (rawSystemId && !system) {
      setScopeMessage("The linked system is unavailable. Select a system to continue.");
      replaceScopeParams({ system: null, tank: null, animal: null });
      return;
    }
    if (!linkWidened) return;
    setSelectionState({ scopeKey, checked: new Map(), newAnimalsChecked: false });
    setScopeMessage(
      rawTankId && !tank
        ? `The linked tank has no eligible ${text.nounPlural} in that system. Nothing is selected; check the ${text.nounPlural} to log.`
        : `The linked ${text.animalLabel.toLowerCase()} is not available in that tank. Nothing is selected; check the ${text.nounPlural} to log.`,
    );
    replaceScopeParams(rawTankId && !tank ? { tank: null, animal: null } : { animal: null });
  }, [
    linkWidened,
    rawSystemId,
    rawTankId,
    replaceScopeParams,
    scopeKey,
    system,
    tank,
    text.animalLabel,
    text.nounPlural,
  ]);

  const changeScope = (updates: ScopeParamUpdates) => {
    setScopeMessage("");
    setSelectionState(FRESH_SELECTION);
    onEdit();
    replaceScopeParams(updates);
  };

  return {
    text,
    systems,
    tanksInSystem,
    animalsInTank,
    animals,
    tanks,
    scope,
    eligible,
    includedIds,
    excludedIds,
    scopeMessage,
    isRefreshing,
    isChecked: (animalId: number) => isAnimalChecked(selection, animalId),
    setChecked: (animalIds: number[], checked: boolean) => {
      onEdit();
      setSelectionState(setAnimalsChecked(selection, animalIds, checked));
    },
    selectSystem: (value: string) =>
      changeScope({ system: value || null, tank: null, animal: null }),
    selectTank: (value: string) => changeScope({ tank: value || null, animal: null }),
    selectAnimal: (value: string) => changeScope({ animal: value || null }),
    refreshAfterStale: () => {
      setSelectionState(freezeSelectionForRefresh(selection, eligible));
      startRefresh(() => router.refresh());
    },
    rememberSystem: () => {
      if (scope.systemId !== null) {
        window.localStorage.setItem(lastSystemStorageKey, String(scope.systemId));
      }
    },
  };
}

type BatchScope = ReturnType<typeof useBatchScope>;

function animalOptionLabel(animal: BatchScopeAnimal) {
  return animal.detail ? `${animal.name} — ${animal.detail}` : animal.name;
}

export function BatchScopeFields({
  batch,
  idPrefix,
  disabled = false,
}: {
  batch: BatchScope;
  idPrefix: string;
  disabled?: boolean;
}) {
  const { text, scope, eligible, includedIds, excludedIds } = batch;
  const groups = batch.tanks.flatMap((tank) => {
    const tankAnimals = eligible.filter((animal) => animal.tankId === tank.id);
    return tankAnimals.length > 0 ? [{ tank, animals: tankAnimals }] : [];
  });
  const eligibleIds = eligible.map((animal) => animal.id);
  const allChecked = includedIds.length === eligible.length;
  const noneChecked = includedIds.length === 0;

  let summary: string;
  if (batch.isRefreshing) summary = "Refreshing the list…";
  else if (scope.systemId === null) summary = `Select a system to list ${text.nounPlural}.`;
  else if (eligible.length === 0) summary = `No eligible ${text.nounPlural} in this scope.`;
  else {
    summary = `${includedIds.length} of ${eligible.length} selected · ${excludedIds.length} excluded`;
  }

  return (
    <fieldset className="min-w-0" disabled={disabled}>
      <legend className="sr-only">{text.legend}</legend>
      <div className="grid gap-6">
        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-system`}>System</Label>
          <select
            id={`${idPrefix}-system`}
            className={SELECT_CLASS}
            value={scope.systemId === null ? "" : String(scope.systemId)}
            onChange={(event) => batch.selectSystem(event.target.value)}
          >
            <option value="">Select a system…</option>
            {batch.systems.map((system) => (
              <option key={system.id} value={system.id}>
                {system.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-tank`}>Tank</Label>
          <select
            id={`${idPrefix}-tank`}
            className={SELECT_CLASS}
            disabled={scope.systemId === null}
            value={scope.tankId === null ? "" : String(scope.tankId)}
            onChange={(event) => batch.selectTank(event.target.value)}
          >
            <option value="">All tanks in system</option>
            {batch.tanksInSystem.map((tank) => (
              <option key={tank.id} value={tank.id}>
                {tank.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${idPrefix}-animal`}>{text.animalLabel}</Label>
          <select
            id={`${idPrefix}-animal`}
            className={SELECT_CLASS}
            disabled={scope.tankId === null}
            value={scope.animalId === null ? "" : String(scope.animalId)}
            onChange={(event) => batch.selectAnimal(event.target.value)}
          >
            <option value="">{text.allAnimalsOption}</option>
            {batch.animalsInTank.map((animal) => (
              <option key={animal.id} value={animal.id}>
                {animalOptionLabel(animal)}
              </option>
            ))}
          </select>
          {/* sr-only while empty keeps the live region mounted without adding an extra gap row. */}
          <p
            className="text-sm text-muted-foreground empty:sr-only"
            role="status"
            aria-live="polite"
          >
            {batch.scopeMessage}
          </p>
        </div>

        <div
          role="group"
          aria-labelledby={`${idPrefix}-checklist-label`}
          aria-describedby={`${idPrefix}-checklist-summary`}
          className="grid min-w-0 gap-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id={`${idPrefix}-checklist-label`} className="text-sm font-medium leading-none">
              {text.checklistLabel}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={eligible.length === 0 || allChecked || batch.isRefreshing}
                onClick={() => batch.setChecked(eligibleIds, true)}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9"
                disabled={eligible.length === 0 || noneChecked || batch.isRefreshing}
                onClick={() => batch.setChecked(eligibleIds, false)}
              >
                Clear all
              </Button>
            </div>
          </div>

          <p
            id={`${idPrefix}-checklist-summary`}
            className="text-sm tabular-nums text-muted-foreground"
            role="status"
            aria-live="polite"
          >
            {summary}
          </p>

          {groups.map(({ tank, animals }) => {
            const tankIds = animals.map((animal) => animal.id);
            const tankIncluded = tankIds.filter((id) => batch.isChecked(id)).length;
            const tankAllChecked = tankIncluded === tankIds.length;
            const headingId = `${idPrefix}-checklist-tank-${tank.id}`;
            return (
              <div
                key={tank.id}
                role="group"
                aria-labelledby={headingId}
                className="grid min-w-0 gap-2 rounded-lg border border-input p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-sm font-medium">
                    <span id={headingId}>{tank.name}</span>{" "}
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {tankIncluded} of {tankIds.length}
                    </span>
                  </p>
                  {scope.tankId === null && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9"
                      disabled={batch.isRefreshing}
                      aria-label={`${tankAllChecked ? "Clear tank" : "Select tank"} ${tank.name}`}
                      onClick={() => batch.setChecked(tankIds, !tankAllChecked)}
                    >
                      {tankAllChecked ? "Clear tank" : "Select tank"}
                    </Button>
                  )}
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {animals.map((animal) => (
                    <li key={animal.id} className="min-w-0">
                      <label className={QUICK_PICK_OPTION_CLASS} title={animalOptionLabel(animal)}>
                        <input
                          type="checkbox"
                          className="size-4 shrink-0"
                          checked={batch.isChecked(animal.id)}
                          disabled={batch.isRefreshing}
                          onChange={(event) =>
                            batch.setChecked([animal.id], event.target.checked)
                          }
                        />
                        <span className={QUICK_PICK_LABEL_CLASS}>{animal.name}</span>
                        {animal.detail && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {animal.detail}
                          </span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </fieldset>
  );
}

export function BatchSuccessCard({
  title,
  result,
  animals,
  nounPlural,
  children,
}: {
  title: string;
  result: BatchLogResult;
  animals: BatchScopeAnimal[];
  nounPlural: string;
  children: ReactNode;
}) {
  const headingRef = useRef<HTMLDivElement>(null);
  const nameFor = (animalId: number) =>
    animals.find((animal) => animal.id === animalId)?.name ?? `Animal #${animalId}`;
  const logged = result.records.map((record) => nameFor(record.animal_id));
  const excluded = result.excluded_animal_ids.map(nameFor);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle
          ref={headingRef}
          role="heading"
          aria-level={2}
          tabIndex={-1}
          className="text-2xl outline-none"
        >
          {title}
        </CardTitle>
        <CardDescription role="status" aria-live="polite">
          {result.replayed
            ? `This save was already recorded; no duplicates were created. ${result.created_count} ${nounPlural} logged.`
            : `${result.created_count} ${nounPlural} logged.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-2">
          <p className="text-sm font-medium leading-none">Logged ({logged.length})</p>
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {logged.map((name, index) => (
              <li key={result.records[index].id} className="break-words">
                {name}
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-medium leading-none">Excluded ({excluded.length})</p>
          {excluded.length === 0 ? (
            <p className="text-sm text-muted-foreground">None</p>
          ) : (
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {excluded.map((name, index) => (
                <li key={result.excluded_animal_ids[index]} className="break-words">
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-3">{children}</div>
      </CardContent>
    </Card>
  );
}
