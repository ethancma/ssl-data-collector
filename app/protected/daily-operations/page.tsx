import { Suspense } from "react";
import { notFound } from "next/navigation";

import { DailyOperationsHub } from "@/components/daily-operations/daily-operations-hub";
import type {
  BatchScopeAnimal,
  BatchScopeSystem,
  BatchScopeTank,
} from "@/components/daily-operations/batch-selection";
import { pacificDateKey } from "@/components/daily-operations/pacific-date-time";
import type {
  ChemicalAdditionCatalogItem,
  FoodCatalogItem,
  StarTreatmentCatalogItem,
} from "@/components/daily-operations/quick-pick-catalogs";
import type { WaterQualityTargetRange } from "@/components/daily-operations/water-quality-targets";
import {
  WATER_QUALITY_PARAMETERS,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

export default async function DailyOperationsPage() {
  const profile = await getCurrentProfile();
  const canAccessDailyOperations =
    profile?.status === "active" &&
    ["admin", "technician", "volunteer"].includes(profile.role);

  if (!canAccessDailyOperations) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Sunflower Star Laboratory</p>
        <h1 className="text-3xl font-semibold tracking-tight">Daily Operations</h1>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <DailyOperationsContent />
      </Suspense>
    </div>
  );
}

async function DailyOperationsContent() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canManageStarTreatments =
    profile?.status === "active" &&
    ["admin", "technician", "volunteer"].includes(profile.role);

  const [
    { data: systems, error: systemsError },
    { data: tanks, error: tanksError },
    { data: animals, error: animalsError },
    { data: waterQualityTargets, error: waterQualityTargetsError },
    { data: chemicalCatalog, error: chemicalCatalogError },
    { data: foodCatalog, error: foodCatalogError },
    { data: starTreatmentCatalog, error: starTreatmentCatalogError },
  ] = await Promise.all([
    supabase
      .from("systems")
      .select("id, name")
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("tanks").select("id, name, system_id").order("name").order("id"),
    supabase
      .from("animals")
      .select("id, name, tank_id, species_id, tracking_type, status")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("water_quality_target_ranges")
      .select("id, system_id, parameter_key, min_value, max_value"),
    supabase
      .from("chemical_addition_catalog")
      .select("id, name, default_unit")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("food_catalog")
      .select("id, name, default_unit")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("star_treatment_catalog")
      .select("id, name, default_amount_unit, default_concentration_unit")
      .eq("is_active", true)
      .order("name"),
  ]);
  const systemOptions = (systems ?? []).map((system) => ({
    id: system.id,
    name: system.name,
  }));
  const referenceDataLoadError =
    systemsError?.message ??
    tanksError?.message ??
    animalsError?.message ??
    (systemOptions.length === 0 ? "No systems are configured." : undefined);

  const animalOptions = (animals ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    tankId: a.tank_id,
  }));
  const tankOptions = (tanks ?? []).map((tank) => ({
    id: tank.id,
    name: tank.name,
    systemId: tank.system_id,
  }));
  // Mirrors create_feeding_batch eligibility: every active animal, cohorts included.
  const feedingAnimals = (animals ?? []).map((animal) => ({
    id: animal.id,
    name: animal.name,
    tankId: animal.tank_id,
    detail: animal.tracking_type === "cohort" ? "Cohort" : undefined,
  }));
  const feedingTankIds = new Set(feedingAnimals.map((animal) => animal.tankId));
  const feedingTanks = tankOptions.filter((tank) => feedingTankIds.has(tank.id));
  const feedingSystemIds = new Set(feedingTanks.map((tank) => tank.systemId));
  const feedingSystems = systemOptions.filter((system) => feedingSystemIds.has(system.id));
  const targetOptions = (waterQualityTargets ?? []).flatMap((target) => {
    if (
      !WATER_QUALITY_PARAMETERS.includes(
        target.parameter_key as WaterQualityParameter,
      )
    ) {
      return [];
    }

    return [
      {
        id: target.id,
        systemId: target.system_id,
        parameterKey: target.parameter_key as WaterQualityParameter,
        minValue: target.min_value === null ? null : Number(target.min_value),
        maxValue: target.max_value === null ? null : Number(target.max_value),
      } satisfies WaterQualityTargetRange,
    ];
  });
  const chemicalCatalogOptions: ChemicalAdditionCatalogItem[] = (
    chemicalCatalog ?? []
  ).map((item) => ({
    id: item.id,
    name: item.name,
    defaultUnit: item.default_unit,
  }));
  const foodCatalogOptions: FoodCatalogItem[] = (foodCatalog ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    defaultUnit: item.default_unit,
  }));
  const starTreatmentCatalogOptions: StarTreatmentCatalogItem[] = (
    starTreatmentCatalog ?? []
  ).map((item) => ({
    id: item.id,
    name: item.name,
    defaultAmountUnit: item.default_amount_unit,
    defaultConcentrationUnit: item.default_concentration_unit,
  }));

  let pendingFeedingLogs: {
    id: number;
    animalName: string;
    systemId: number;
  }[] = [];
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  let pendingFeedingQuery = supabase
    .from("feeding_logs")
    .select("id, fed_at, animals(name), tanks!inner(system_id)")
    .is("consumption_status", null)
    .gte("fed_at", since)
    .order("fed_at", { ascending: false });

  if (profile?.role === "volunteer") {
    pendingFeedingQuery = pendingFeedingQuery.eq("recorded_by", profile.id);
  }

  const { data: logs } = await pendingFeedingQuery;

  const todayKey = pacificDateKey(new Date());
  pendingFeedingLogs = (logs ?? [])
    .filter((log) => pacificDateKey(log.fed_at) === todayKey)
    .flatMap((log) => {
      const animal = log.animals as unknown as { name: string } | null;
      const tank = log.tanks as unknown as { system_id: number } | null;
      if (!tank) return [];
      return [{
        id: log.id,
        animalName: animal?.name ?? "Unknown animal",
        systemId: tank.system_id,
      }];
    });

  let starSystems: BatchScopeSystem[] = [];
  let starTanks: BatchScopeTank[] = [];
  let stars: BatchScopeAnimal[] = [];
  let starTreatmentLoadError: string | undefined;

  if (canManageStarTreatments) {
    const speciesResult = await supabase
      .from("species")
      .select("id, common_name, category")
      .eq("category", "star")
      .order("common_name")
      .order("id");
    const starSpeciesById = new Map(
      (speciesResult.data ?? []).map((species) => [species.id, species.common_name]),
    );
    stars = (animals ?? [])
      .filter(
        (animal) =>
          animal.tracking_type === "individual" && starSpeciesById.has(animal.species_id),
      )
      .map((animal) => ({
        id: animal.id,
        name: animal.name,
        tankId: animal.tank_id,
        detail: starSpeciesById.get(animal.species_id) ?? "Star",
      }));
    const eligibleTankIds = new Set(stars.map((star) => star.tankId));
    starTanks = tankOptions.filter((tank) => eligibleTankIds.has(tank.id));
    const eligibleSystemIds = new Set(starTanks.map((tank) => tank.systemId));
    starSystems = systemOptions.filter((system) => eligibleSystemIds.has(system.id));
    starTreatmentLoadError =
      systemsError?.message ??
      animalsError?.message ??
      tanksError?.message ??
      speciesResult.error?.message ??
      ((speciesResult.data ?? []).length === 0
        ? "No star species are configured."
        : undefined);
  }

  return (
    <DailyOperationsHub
      systems={systemOptions}
      animals={animalOptions}
      feedingSystems={feedingSystems}
      feedingTanks={feedingTanks}
      feedingAnimals={feedingAnimals}
      canManageStarTreatments={canManageStarTreatments}
      starSystems={starSystems}
      starTanks={starTanks}
      stars={stars}
      pendingFeedingLogs={pendingFeedingLogs}
      chemicalCatalog={chemicalCatalogOptions}
      chemicalCatalogLoadError={chemicalCatalogError?.message}
      foodCatalog={foodCatalogOptions}
      foodCatalogLoadError={foodCatalogError?.message}
      starTreatmentCatalog={starTreatmentCatalogOptions}
      starTreatmentCatalogLoadError={starTreatmentCatalogError?.message}
      waterQualityTargets={targetOptions}
      waterQualityTargetLoadError={waterQualityTargetsError?.message}
      referenceDataLoadError={referenceDataLoadError}
      starTreatmentLoadError={starTreatmentLoadError}
    />
  );
}
