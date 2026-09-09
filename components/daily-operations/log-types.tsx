import {
  ClipboardCheck,
  Droplets,
  FlaskConical,
  HeartPulse,
  type LucideIcon,
  UtensilsCrossed,
  Wrench,
} from "lucide-react";

import { ChemicalAdditionForm } from "@/components/chemical-addition-form";
import { DailyCheckForm } from "@/components/daily-check-form";
import { FeedingLogForm } from "@/components/feeding-log-form";
import { HealthObservationForm } from "@/components/health-observation-form";
import { MaintenanceLogForm } from "@/components/maintenance-log-form";
import { WaterQualityForm } from "@/components/water-quality-form";

export type LogTypeId =
  | "daily-check"
  | "feeding"
  | "water-quality"
  | "chemical-addition"
  | "health-observation"
  | "maintenance-log";

export type LogType = {
  id: LogTypeId;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type SharedFormData = {
  systems: { id: number; name: string }[];
  animals: { id: number; name: string; tankId: number }[];
};

export const LOG_TYPES: LogType[] = [
  {
    id: "daily-check",
    label: "Daily check",
    description: "AM/PM water-running + temperature check for a system.",
    icon: ClipboardCheck,
  },
  {
    id: "feeding",
    label: "Feeding",
    description: "Log a feeding for an individual animal.",
    icon: UtensilsCrossed,
  },
  {
    id: "water-quality",
    label: "Water quality",
    description: "Log any of the 7 water chemistry parameters.",
    icon: Droplets,
  },
  {
    id: "chemical-addition",
    label: "Chemical addition",
    description: "Log a dosing event for a system.",
    icon: FlaskConical,
  },
  {
    id: "health-observation",
    label: "Health observation",
    description: "Log an issue observed on an animal.",
    icon: HeartPulse,
  },
  {
    id: "maintenance-log",
    label: "Maintenance",
    description: "Log a filter swap, sump flush, or other maintenance task.",
    icon: Wrench,
  },
];

// Single spot mapping a log type id to its real, already-tested form component.
export function renderLogForm(id: LogTypeId, data: SharedFormData) {
  switch (id) {
    case "daily-check":
      return <DailyCheckForm systems={data.systems} />;
    case "feeding":
      return <FeedingLogForm animals={data.animals} />;
    case "water-quality":
      return <WaterQualityForm systems={data.systems} />;
    case "chemical-addition":
      return <ChemicalAdditionForm systems={data.systems} />;
    case "health-observation":
      return <HealthObservationForm animals={data.animals} />;
    case "maintenance-log":
      return <MaintenanceLogForm systems={data.systems} />;
  }
}
