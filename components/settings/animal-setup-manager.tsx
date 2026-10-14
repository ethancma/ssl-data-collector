"use client";

import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { useState } from "react";

import {
  AnimalForm,
  RETIRED_LABELS,
  RetireForm,
  type RetireFormValues,
  type SpeciesOption,
  type SystemOption,
} from "@/components/settings/animal-setup-form";
import { SELECT_CLASS } from "@/components/forms/form-classes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getPacificDateString } from "@/lib/pacific-date-time";
import { createClient } from "@/lib/supabase/client";
import {
  ANIMAL_COLUMNS,
  animalSaveError,
  placementFromTank,
  TANK_COLUMNS,
  toAnimalRecord,
  toTankPlacement,
  toTankRecord,
  type AnimalFormInput,
  type AnimalFormValues,
  type AnimalRecord,
  type TankPlacement,
  type TankRecord,
} from "@/lib/validation/animal-setup";

type Editing =
  | { kind: "add" }
  | { kind: "edit" | "retire" | "reactivate"; animalId: number }
  | null;

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, undefined, { numeric: true });

function formValuesFor(animal: AnimalRecord, tank: TankRecord | undefined): AnimalFormInput {
  return {
    name: animal.name,
    speciesId: String(animal.speciesId),
    trackingType: animal.trackingType,
    quantity: String(animal.quantity),
    ...(tank
      ? placementFromTank(tank)
      : { systemId: "", position: "", customLabel: "", sizeLiters: "" }),
    lifeStage: animal.lifeStage ?? "",
    dateAdded: animal.dateAdded,
    notes: animal.notes ?? "",
  };
}

export function AnimalSetupManager({
  systems,
  species,
  initialTanks,
  initialAnimals,
  loadError,
}: {
  systems: SystemOption[];
  species: SpeciesOption[];
  initialTanks: TankRecord[];
  initialAnimals: AnimalRecord[];
  loadError?: string | null;
}) {
  const [systemId, setSystemId] = useState<number | null>(systems[0]?.id ?? null);
  const [tanks, setTanks] = useState(initialTanks);
  const [animals, setAnimals] = useState(initialAnimals);
  const [editing, setEditing] = useState<Editing>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const system = systems.find((candidate) => candidate.id === systemId) ?? null;
  const tankById = new Map(tanks.map((tank) => [tank.id, tank]));
  const speciesName = new Map(species.map((option) => [option.id, option.commonName]));
  const systemTanks = tanks.filter((tank) => tank.systemId === systemId).sort(byName);
  const inSystem = (animal: AnimalRecord) => tankById.get(animal.tankId)?.systemId === systemId;
  const activeAnimals = animals.filter((animal) => animal.status === "active");
  const retiredAnimals = animals.filter((animal) => animal.status !== "active" && inSystem(animal));
  const disabled = pending || Boolean(loadError);

  const startEditing = (next: Editing) => {
    setEditing(next);
    setSuccess(null);
  };

  // Finds the tank with this name in the system, or creates it.
  const resolveTank = async (
    supabase: ReturnType<typeof createClient>,
    targetSystemId: number,
    placement: TankPlacement,
  ): Promise<{ tank: TankRecord } | { error: string }> => {
    const existing = tanks.find(
      (tank) => tank.systemId === targetSystemId && tank.name === placement.name,
    );
    if (existing) return { tank: existing };

    const inserted = await supabase
      .from("tanks")
      .insert({
        system_id: targetSystemId,
        name: placement.name,
        tank_type: "shelf",
        shelf_position: placement.shelfPosition,
        size_liters: placement.sizeLiters,
      })
      .select(TANK_COLUMNS)
      .single();
    // Someone else created it first; use theirs.
    const result =
      inserted.error?.code === "23505"
        ? await supabase
            .from("tanks")
            .select(TANK_COLUMNS)
            .eq("system_id", targetSystemId)
            .eq("name", placement.name)
            .single()
        : inserted;
    if (result.error || !result.data) {
      return { error: result.error?.message ?? "The tank could not be created." };
    }
    const tank = toTankRecord(result.data);
    setTanks((current) => [...current.filter((candidate) => candidate.id !== tank.id), tank]);
    return { tank };
  };

  const saveAnimal = async (
    values: AnimalFormValues,
    existing: AnimalRecord | null,
  ): Promise<string | null> => {
    setPending(true);
    const supabase = createClient();
    const targetSystemId = Number(values.systemId);
    const resolved = await resolveTank(supabase, targetSystemId, toTankPlacement(values));
    if ("error" in resolved) {
      setPending(false);
      return resolved.error;
    }
    const reactivating = existing !== null && existing.status !== "active";
    const payload = {
      name: values.name,
      species_id: Number(values.speciesId),
      tracking_type: values.trackingType,
      quantity: Number(values.quantity),
      tank_id: resolved.tank.id,
      life_stage: values.lifeStage || null,
      date_added: values.dateAdded,
      notes: values.notes.trim() || null,
      ...(reactivating ? { status: "active", retired_on: null } : {}),
    };
    const result = existing
      ? await supabase
          .from("animals")
          .update(payload)
          .eq("id", existing.id)
          .select(ANIMAL_COLUMNS)
          .single()
      : await supabase.from("animals").insert(payload).select(ANIMAL_COLUMNS).single();
    setPending(false);

    if (result.error || !result.data) {
      return result.error
        ? animalSaveError(result.error, values.name)
        : "The animal could not be saved.";
    }
    const saved = toAnimalRecord(result.data);
    setAnimals((current) => [...current.filter((animal) => animal.id !== saved.id), saved]);
    setSystemId(targetSystemId);
    setEditing(null);
    const tankName = resolved.tank.name;
    setSuccess(
      !existing
        ? `${saved.name} added to ${tankName}.`
        : reactivating
          ? `${saved.name} reactivated in ${tankName}.`
          : existing.tankId !== saved.tankId
            ? `${saved.name} moved to ${tankName}.`
            : `${saved.name} saved.`,
    );
    return null;
  };

  const retireAnimal = async (
    animal: AnimalRecord,
    values: RetireFormValues,
  ): Promise<string | null> => {
    setPending(true);
    const supabase = createClient();
    const result = await supabase
      .from("animals")
      .update({ status: values.status, retired_on: values.retiredOn, notes: values.notes.trim() || null })
      .eq("id", animal.id)
      .select(ANIMAL_COLUMNS)
      .single();
    setPending(false);

    if (result.error || !result.data) {
      return result.error?.message ?? "The animal could not be retired.";
    }
    const saved = toAnimalRecord(result.data);
    setAnimals((current) => [...current.filter((candidate) => candidate.id !== saved.id), saved]);
    setEditing(null);
    setSuccess(`${saved.name} retired (${RETIRED_LABELS[values.status].toLowerCase()}).`);
    return null;
  };

  const formProps = {
    systems,
    species,
    tanks,
    disabled: pending,
    onCancel: () => setEditing(null),
  };

  const animalSummary = (animal: AnimalRecord) =>
    [
      speciesName.get(animal.speciesId) ?? "Unknown species",
      animal.trackingType === "cohort" ? `Cohort of ${animal.quantity}` : "Individual",
      animal.lifeStage,
      `Added ${animal.dateAdded}`,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <Card className="w-full max-w-5xl">
      <CardHeader>
        <CardTitle className="text-2xl">Animals</CardTitle>
        <CardDescription>
          Pick a system to see its tanks and animals. A tank is named from its shelf position
          and size (e.g. Lower-9.6L, or 9.6L with no position) and is created the first time an
          animal is placed in it. Feeding schedule overrides use the same names.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid w-full max-w-sm gap-2">
            <Label htmlFor="animal-setup-system">System</Label>
            <select
              id="animal-setup-system"
              className={SELECT_CLASS}
              value={systemId ?? ""}
              disabled={disabled}
              onChange={(event) => {
                setSystemId(Number(event.target.value));
                setEditing(null);
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
          <Button
            type="button"
            disabled={disabled || editing?.kind === "add"}
            onClick={() => startEditing({ kind: "add" })}
          >
            <Plus aria-hidden="true" />
            Add animal
          </Button>
        </div>

        {loadError && (
          <p className="text-sm text-red-500" role="alert">
            {loadError}
          </p>
        )}
        <p className="min-h-5 text-sm text-emerald-700 dark:text-emerald-400" role="status" aria-live="polite">
          {success}
        </p>

        {editing?.kind === "add" && (
          <AnimalForm
            {...formProps}
            heading="Add animal"
            submitLabel="Add animal"
            initialValues={{
              name: "",
              speciesId: "",
              trackingType: "individual",
              quantity: "1",
              systemId: systemId === null ? "" : String(systemId),
              position: "",
              customLabel: "",
              sizeLiters: "",
              lifeStage: "",
              dateAdded: getPacificDateString(),
              notes: "",
            }}
            onSubmit={(values) => saveAnimal(values, null)}
          />
        )}

        {!loadError && system && (
          systemTanks.length === 0 ? (
            <p className="rounded-md border p-4 text-sm text-muted-foreground">
              No tanks in {system.name} yet. Add an animal to create one.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {systemTanks.map((tank) => {
                const tankAnimals = activeAnimals.filter((animal) => animal.tankId === tank.id).sort(byName);
                const headingId = `animal-setup-tank-${tank.id}`;
                return (
                  <section key={tank.id} aria-labelledby={headingId} className="flex flex-col gap-3 p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <h2 id={headingId} className="text-sm font-medium">
                        {tank.name}
                      </h2>
                      <span className="text-xs text-muted-foreground">
                        {tankAnimals.length === 0
                          ? "Empty"
                          : `${tankAnimals.length} ${tankAnimals.length === 1 ? "animal" : "animals"}`}
                      </span>
                    </div>
                    {tankAnimals.length > 0 && (
                      <ul className="flex flex-col gap-2">
                        {tankAnimals.map((animal) => (
                          <li key={animal.id}>
                            {editing?.kind === "edit" && editing.animalId === animal.id ? (
                              <AnimalForm
                                {...formProps}
                                heading={`Edit ${animal.name}`}
                                submitLabel="Save"
                                initialValues={formValuesFor(animal, tank)}
                                onSubmit={(values) => saveAnimal(values, animal)}
                              />
                            ) : editing?.kind === "retire" && editing.animalId === animal.id ? (
                              <RetireForm
                                animalName={animal.name}
                                dateAdded={animal.dateAdded}
                                initialValues={{
                                  status: "deceased",
                                  retiredOn: getPacificDateString(),
                                  notes: animal.notes ?? "",
                                }}
                                disabled={pending}
                                onSubmit={(values) => retireAnimal(animal, values)}
                                onCancel={() => setEditing(null)}
                              />
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                                <div className="flex min-w-0 flex-col">
                                  <span className="truncate text-sm font-medium">{animal.name}</span>
                                  <span className="text-xs text-muted-foreground">{animalSummary(animal)}</span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    aria-label={`Edit or move ${animal.name}`}
                                    disabled={disabled}
                                    onClick={() => startEditing({ kind: "edit", animalId: animal.id })}
                                  >
                                    <Pencil aria-hidden="true" />
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    aria-label={`Retire ${animal.name}`}
                                    disabled={disabled}
                                    onClick={() => startEditing({ kind: "retire", animalId: animal.id })}
                                  >
                                    <Archive aria-hidden="true" />
                                    Retire
                                  </Button>
                                </div>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )
        )}

        {!loadError && retiredAnimals.length > 0 && (
          <details className="rounded-md border">
            <summary className="cursor-pointer p-4 text-sm font-medium">
              Retired animals ({retiredAnimals.length})
            </summary>
            <ul className="flex flex-col gap-2 px-4 pb-4">
              {retiredAnimals.sort(byName).map((animal) => {
                const tank = tankById.get(animal.tankId);
                return (
                  <li key={animal.id}>
                    {editing?.kind === "reactivate" && editing.animalId === animal.id ? (
                      <AnimalForm
                        {...formProps}
                        heading={`Reactivate ${animal.name}`}
                        submitLabel="Reactivate"
                        initialValues={formValuesFor(animal, tank)}
                        onSubmit={(values) => saveAnimal(values, animal)}
                      />
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-sm font-medium">{animal.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {[
                              animal.status === "active" ? null : RETIRED_LABELS[animal.status],
                              animal.retiredOn,
                              tank ? `last in ${tank.name}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          aria-label={`Reactivate ${animal.name}`}
                          disabled={disabled}
                          onClick={() => startEditing({ kind: "reactivate", animalId: animal.id })}
                        >
                          <RotateCcw aria-hidden="true" />
                          Reactivate
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
