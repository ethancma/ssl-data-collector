// Shared types for the systems detail page (Grid Overview layout).
// See app/protected/systems/data.ts for how these are populated from Supabase.

import type { WaterQualityParameter } from "@/lib/config/reference-data";

// Trend chart window options — the client slices the already-fetched 60-day
// superset down to one of these rather than re-fetching per selection.
export const CHART_RANGE_DAYS = [14, 30, 60] as const;
export type ChartRangeDays = (typeof CHART_RANGE_DAYS)[number];

export type SystemOverviewEntry = {
  slug: string;
  name: string;
  latestTemperature: number | null;
  amDoneToday: boolean;
  pmDoneToday: boolean;
};

export type DailyCheckPoint = {
  id: number;
  checkType: "AM" | "PM";
  waterRunning: boolean;
  temperature: number | null;
  checkedAt: string;
};

export type WaterQualityPoint = {
  id: number;
  testedAt: string;
  phSource: string | null;
} & Record<WaterQualityParameter, number | null>;

export type ChemicalAdditionPoint = {
  id: number;
  chemicalName: string;
  amount: number;
  unit: string;
  addedAt: string;
  reason: string | null;
};

export type HealthObservationPoint = {
  id: number;
  observedAt: string;
  severity: "low" | "medium" | "high";
  notes: string | null;
  hasPhoto: boolean;
  tankName: string;
  issues: string[];
};

export type MaintenanceLogPoint = {
  id: number;
  performedAt: string;
  notes: string | null;
  taskType: string;
};

export type HighlightKind =
  | "chemical_addition"
  | "health_observation"
  | "maintenance_log"
  | "missed_check";

export type HighlightItem = {
  id: string;
  kind: HighlightKind;
  at: string;
  title: string;
  detail: string | null;
  severity?: "low" | "medium" | "high";
};

export type SystemDetailData = {
  slug: string;
  name: string;
  category: string;
  layoutNotes: string;
  overview: SystemOverviewEntry[];
  // 60-day superset (trend charts slice this client-side per the range
  // toggle instead of re-fetching).
  dailyChecks: DailyCheckPoint[];
  waterQuality: WaterQualityPoint[];
  // Fixed 14-day window (used for the Key Highlights feed, unaffected by
  // the trend chart range toggle).
  chemicalAdditions: ChemicalAdditionPoint[];
  healthObservations: HealthObservationPoint[];
  maintenanceLogs: MaintenanceLogPoint[];

  highlights: HighlightItem[];
};
