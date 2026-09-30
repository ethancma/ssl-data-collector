import {
  ClipboardCheck,
  Droplets,
  FlaskConical,
  HeartPulse,
  Syringe,
  type LucideIcon,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

import { ChemicalAdditionForm } from "@/components/chemical-addition-form";
import { DailyCheckForm } from "@/components/daily-check-form";
import { FeedingLogForm } from "@/components/feeding-log-form";
import { HealthObservationForm } from "@/components/health-observation-form";
import { MaintenanceLogForm } from "@/components/maintenance-log-form";
import { StarTreatmentForm } from "@/components/star-treatment-form";
import { WaterQualityForm } from "@/components/water-quality-form";
import type {
  BatchScopeAnimal,
  BatchScopeSystem,
  BatchScopeTank,
} from "@/components/daily-operations/batch-selection";
import type {
  ChemicalAdditionCatalogItem,
  FoodCatalogItem,
  StarTreatmentCatalogItem,
} from "@/components/daily-operations/quick-pick-catalogs";
import type { WaterQualityTargetRange } from "@/components/daily-operations/water-quality-targets";
import { CHECK_TYPES } from "@/lib/config/reference-data";

export type LogTypeId =
  | "daily-check"
  | "feeding"
  | "water-quality"
  | "chemical-addition"
  | "star-treatment"
  | "health-observation"
  | "maintenance-log";

export type LogType = {
  id: LogTypeId;
  label: string;
  icon: LucideIcon;
};

export type SharedFormData = {
  systems: { id: number; name: string }[];
  animals: { id: number; name: string; tankId: number }[];
  feedingSystems: BatchScopeSystem[];
  feedingTanks: BatchScopeTank[];
  feedingAnimals: BatchScopeAnimal[];
  canManageStarTreatments: boolean;
  starSystems: BatchScopeSystem[];
  starTanks: BatchScopeTank[];
  stars: BatchScopeAnimal[];
  pendingFeedingLogs: {
    id: number;
    animalName: string;
    systemId: number;
  }[];
  chemicalCatalog: ChemicalAdditionCatalogItem[];
  chemicalCatalogLoadError?: string;
  foodCatalog: FoodCatalogItem[];
  foodCatalogLoadError?: string;
  starTreatmentCatalog: StarTreatmentCatalogItem[];
  starTreatmentCatalogLoadError?: string;
  waterQualityTargets: WaterQualityTargetRange[];
  waterQualityTargetLoadError?: string;
  referenceDataLoadError?: string;
  starTreatmentLoadError?: string;
};

export const LOG_TYPES: LogType[] = [
  {
    id: "daily-check",
    label: "Daily check",
    icon: ClipboardCheck,
  },
  {
    id: "feeding",
    label: "Feeding",
    icon: UtensilsCrossed,
  },
  {
    id: "water-quality",
    label: "Water quality",
    icon: Droplets,
  },
  {
    id: "chemical-addition",
    label: "System chemical addition",
    icon: FlaskConical,
  },
  {
    id: "star-treatment",
    label: "Star treatment",
    icon: Syringe,
  },
  {
    id: "health-observation",
    label: "Health observation",
    icon: HeartPulse,
  },
  {
    id: "maintenance-log",
    label: "Maintenance",
    icon: Wrench,
  },
];

// Single spot mapping a log type id to its real, already-tested form component.
export function renderLogForm(
  id: LogTypeId,
  data: SharedFormData,
  selected: {
    systemId?: string;
    checkType?: (typeof CHECK_TYPES)[number];
  },
) {
  if (data.referenceDataLoadError) {
    return (
      <p className="text-sm text-red-500" role="alert">
        Form choices could not be loaded: {data.referenceDataLoadError}
      </p>
    );
  }

  switch (id) {
    case "daily-check":
      return (
        <DailyCheckForm
          systems={data.systems}
          defaultSystemId={selected.systemId}
          defaultCheckType={selected.checkType}
          pendingFeedingLogs={data.pendingFeedingLogs}
        />
      );
    case "feeding":
      return (
        <FeedingLogForm
          systems={data.feedingSystems}
          tanks={data.feedingTanks}
          animals={data.feedingAnimals}
          catalogs={data.foodCatalog}
          catalogLoadError={data.foodCatalogLoadError}
        />
      );
    case "water-quality":
      return (
        <WaterQualityForm
          systems={data.systems}
          targets={data.waterQualityTargets}
          targetLoadError={data.waterQualityTargetLoadError}
          defaultSystemId={selected.systemId}
        />
      );
    case "chemical-addition":
      return (
        <ChemicalAdditionForm
          systems={data.systems}
          catalogs={data.chemicalCatalog}
          catalogLoadError={data.chemicalCatalogLoadError}
          defaultSystemId={selected.systemId}
        />
      );
    case "star-treatment":
      if (!data.canManageStarTreatments) return null;
      if (data.starTreatmentLoadError) {
        return (
          <p className="text-sm text-red-500" role="alert">
            Star treatment choices could not be loaded: {data.starTreatmentLoadError}
          </p>
        );
      }
      return (
        <StarTreatmentForm
          systems={data.starSystems}
          tanks={data.starTanks}
          stars={data.stars}
          catalogs={data.starTreatmentCatalog}
          catalogLoadError={data.starTreatmentCatalogLoadError}
        />
      );
    case "health-observation":
      return <HealthObservationForm animals={data.animals} />;
    case "maintenance-log":
      return <MaintenanceLogForm systems={data.systems} defaultSystemId={selected.systemId} />;
  }
}
