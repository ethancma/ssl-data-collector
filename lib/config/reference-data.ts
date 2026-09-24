// Shared enums mirroring the Postgres enums in docs/platform-architecture.md §4.
// Keep this file as the single source of truth for dropdown options and future
// zod/DB-check-constraint validation, so the app and schema never drift apart.

export const TANK_TYPES = ["shelf", "cone_bottom", "main"] as const;
export type TankType = (typeof TANK_TYPES)[number];

export const FOOD_TYPES = [
  "krill",
  "brine_shrimp",
  "abalone",
  "urchin_purple",
  "urchin_white",
  "microalgae",
  "other",
] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

export const CONSUMPTION_STATUSES = ["full", "partial", "none", "unknown"] as const;
export type ConsumptionStatus = (typeof CONSUMPTION_STATUSES)[number];

export const HEALTH_ISSUE_TYPES = [
  "arm_drop",
  "spine_drop",
  "lesion",
  "arm_curling",
  "flattening",
  "other",
] as const;
export type HealthIssueType = (typeof HEALTH_ISSUE_TYPES)[number];

// These always require a photo regardless of severity (lab-operations-plan.md §3).
export const PHOTO_ALWAYS_REQUIRED_ISSUES: readonly HealthIssueType[] = [
  "arm_drop",
  "spine_drop",
  "lesion",
];

// 3-level scale confirmed with staff; exact labels/criteria are still an open question.
export const SEVERITY_LEVELS = ["low", "medium", "high"] as const;
export type SeverityLevel = (typeof SEVERITY_LEVELS)[number];

export const CHECK_TYPES = ["AM", "PM"] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export const MAINTENANCE_TASK_TYPES = ["filter_change", "sump_flush", "other"] as const;
export type MaintenanceTaskType = (typeof MAINTENANCE_TASK_TYPES)[number];

export const DATA_SOURCES = ["live", "import", "paper_backfill"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export const PH_SOURCES = ["manual", "apex_probe"] as const;
export type PhSource = (typeof PH_SOURCES)[number];

export const PROFILE_ROLES = ["admin", "technician", "volunteer", "viewer"] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const PROFILE_STATUSES = ["pending", "active", "denied"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

// Weekly water-quality parameters; target/safe ranges per parameter are still an
// open question to gather from staff before building inline validation.
// Single source of truth: label + chart color live here so adding a new test
// (once its DB column exists) is a one-line addition to this array — every
// consumer (validation, form, charts, types, data fetch) derives from it.
export type WaterQualityParamConfig = {
  key: string;
  label: string;
  color: string;
};

export const WATER_QUALITY_PARAMS = [
  { key: "ph", label: "pH", color: "#6366f1" },
  { key: "magnesium", label: "Magnesium", color: "#f59e0b" },
  { key: "ammonia", label: "Ammonia", color: "#ef4444" },
  { key: "alkalinity", label: "Alkalinity", color: "#10b981" },
  { key: "calcium", label: "Calcium", color: "#3b82f6" },
  { key: "phosphate", label: "Phosphate", color: "#a855f7" },
  { key: "salinity", label: "Salinity", color: "#14b8a6" },
  { key: "nitrate", label: "Nitrate", color: "#f97316" },
  { key: "nitrite", label: "Nitrite", color: "#84cc16" },
] as const satisfies readonly WaterQualityParamConfig[];

export type WaterQualityParameter = (typeof WATER_QUALITY_PARAMS)[number]["key"];
export const WATER_QUALITY_PARAMETERS = WATER_QUALITY_PARAMS.map(
  (p) => p.key,
) as WaterQualityParameter[];
