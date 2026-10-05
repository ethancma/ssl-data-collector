import type {
  BatchScopeSystem,
  BatchScopeTank,
} from "@/lib/daily-operations/batch-selection";
import type { SharedFormData } from "@/components/daily-operations/log-types";
import { pacificDateKey } from "@/lib/pacific-date-time";
import type {
  ChemicalAdditionCatalogItem,
  FoodCatalogItem,
  StarTreatmentCatalogItem,
} from "@/lib/daily-operations/quick-pick-catalogs";
import type { WaterQualityTargetRange } from "@/lib/daily-operations/water-quality-targets";
import {
  WATER_QUALITY_PARAMETERS,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";

export type DailyOperationsAnimalRow = {
  id: number;
  name: string;
  tank_id: number;
  species_id: number;
  tracking_type: string;
};

export type DailyOperationsSourceData = {
  systems: { id: number; name: string }[];
  tanks: { id: number; name: string; system_id: number }[];
  animals: DailyOperationsAnimalRow[];
  waterQualityTargets: {
    id: number;
    system_id: number;
    parameter_key: string;
    min_value: number | string | null;
    max_value: number | string | null;
  }[];
  chemicalCatalog: { id: number; name: string; default_unit: string }[];
  foodCatalog: { id: number; name: string; default_unit: string }[];
  starTreatmentCatalog: {
    id: number;
    name: string;
    default_amount_unit: string | null;
    default_concentration_unit: string | null;
  }[];
};

export type DailyOperationsOptions = Pick<
  SharedFormData,
  | "systems"
  | "animals"
  | "feedingSystems"
  | "feedingTanks"
  | "feedingAnimals"
  | "waterQualityTargets"
  | "chemicalCatalog"
  | "foodCatalog"
  | "starTreatmentCatalog"
> & { tanks: BatchScopeTank[] };

export type PendingFeedingLogRow = {
  id: number;
  fed_at: string;
  animals: unknown;
  tanks: unknown;
};

export type StarTreatmentScope = Pick<SharedFormData, "starSystems" | "starTanks" | "stars">;

export function deriveDailyOperationsOptions(
  source: DailyOperationsSourceData,
): DailyOperationsOptions {
  const systemOptions = source.systems.map((system) => ({
    id: system.id,
    name: system.name,
  }));
  const animalOptions = source.animals.map((animal) => ({
    id: animal.id,
    name: animal.name,
    tankId: animal.tank_id,
  }));
  const tankOptions = source.tanks.map((tank) => ({
    id: tank.id,
    name: tank.name,
    systemId: tank.system_id,
  }));
  const feedingAnimals = source.animals.map((animal) => ({
    id: animal.id,
    name: animal.name,
    tankId: animal.tank_id,
    detail: animal.tracking_type === "cohort" ? "Cohort" : undefined,
  }));
  const feedingTankIds = new Set(feedingAnimals.map((animal) => animal.tankId));
  const feedingTanks = tankOptions.filter((tank) => feedingTankIds.has(tank.id));
  const feedingSystemIds = new Set(feedingTanks.map((tank) => tank.systemId));
  const feedingSystems = systemOptions.filter((system) => feedingSystemIds.has(system.id));
  const targetOptions = source.waterQualityTargets.flatMap((target) => {
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
  const chemicalCatalogOptions: ChemicalAdditionCatalogItem[] = source.chemicalCatalog.map(
    (item) => ({
      id: item.id,
      name: item.name,
      defaultUnit: item.default_unit,
    }),
  );
  const foodCatalogOptions: FoodCatalogItem[] = source.foodCatalog.map((item) => ({
    id: item.id,
    name: item.name,
    defaultUnit: item.default_unit,
  }));
  const starTreatmentCatalogOptions: StarTreatmentCatalogItem[] = source.starTreatmentCatalog.map(
    (item) => ({
      id: item.id,
      name: item.name,
      defaultAmountUnit: item.default_amount_unit,
      defaultConcentrationUnit: item.default_concentration_unit,
    }),
  );

  return {
    systems: systemOptions,
    animals: animalOptions,
    tanks: tankOptions,
    feedingSystems,
    feedingTanks,
    feedingAnimals,
    chemicalCatalog: chemicalCatalogOptions,
    foodCatalog: foodCatalogOptions,
    starTreatmentCatalog: starTreatmentCatalogOptions,
    waterQualityTargets: targetOptions,
  };
}

export function derivePendingFeedingLogs(
  logs: PendingFeedingLogRow[],
  todayKey: string,
): SharedFormData["pendingFeedingLogs"] {
  return logs
    .filter((log) => pacificDateKey(log.fed_at) === todayKey)
    .flatMap((log) => {
      const animal = log.animals as { name: string } | null;
      const tank = log.tanks as { system_id: number } | null;
      if (!tank) return [];
      return [{
        id: log.id,
        animalName: animal?.name ?? "Unknown animal",
        systemId: tank.system_id,
      }];
    });
}

export function deriveStarTreatmentScope(
  systems: BatchScopeSystem[],
  tanks: BatchScopeTank[],
  animals: DailyOperationsAnimalRow[],
  species: { id: number; common_name: string }[],
): StarTreatmentScope {
  const starSpeciesById = new Map(
    species.map((entry) => [entry.id, entry.common_name]),
  );
  const stars = animals
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
  const starTanks = tanks.filter((tank) => eligibleTankIds.has(tank.id));
  const eligibleSystemIds = new Set(starTanks.map((tank) => tank.systemId));
  const starSystems = systems.filter((system) => eligibleSystemIds.has(system.id));

  return { starSystems, starTanks, stars };
}