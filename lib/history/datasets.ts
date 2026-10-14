import {
  HEALTH_ISSUE_LABELS,
  MAINTENANCE_TASK_LABELS,
  WATER_QUALITY_PARAMS,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import { formatPacificDateTime } from "@/lib/pacific-date-time";

export const HISTORY_DATASETS = [
  "daily_check",
  "feeding",
  "water_quality",
  "chemical_addition",
  "health_observation",
  "maintenance",
  "star_treatment",
] as const;
export type HistoryDataset = (typeof HISTORY_DATASETS)[number];

export const DATASET_LABELS: Record<HistoryDataset, string> = {
  daily_check: "AM/PM checks",
  feeding: "Feeding",
  water_quality: "Water quality",
  chemical_addition: "Chemical additions",
  health_observation: "Health observations",
  maintenance: "Maintenance",
  star_treatment: "Star treatments",
};

export const DATASET_VIEWS: Record<HistoryDataset | "all", string> = {
  all: "v_history_events",
  daily_check: "v_history_daily_checks",
  feeding: "v_history_feeding",
  water_quality: "v_history_water_quality",
  chemical_addition: "v_history_chemical_additions",
  health_observation: "v_history_health_observations",
  maintenance: "v_history_maintenance",
  star_treatment: "v_history_star_treatments",
};

export const DATA_SOURCES = ["live", "import", "paper_backfill"] as const;
export type HistoryDataSource = (typeof DATA_SOURCES)[number];
export const SOURCE_LABELS: Record<HistoryDataSource, string> = {
  live: "Live",
  import: "Import",
  paper_backfill: "Paper backfill",
};

// One row of any core.v_history_* view. Columns outside the shared set exist only on their dataset's view.
export type HistoryRow = {
  dataset: HistoryDataset;
  id: number;
  occurred_at: string;
  occurred_on: string;
  system_id: number | null;
  system_name: string | null;
  tank_id: number | null;
  tank_name: string | null;
  animal_id: number | null;
  animal_name: string | null;
  recorded_by: number | null;
  recorded_by_name: string | null;
  data_source: HistoryDataSource;
  entered_at: string;
  notes: string | null;
  check_type?: string | null;
  water_running?: boolean | null;
  temperature?: number | null;
  food_name?: string | null;
  amount_value?: number | null;
  amount_unit?: string | null;
  consumption_status?: string | null;
  consumption_checked_at?: string | null;
  ph_source?: string | null;
  out_of_range?: string[] | null;
  chemical_name?: string | null;
  amount?: number | null;
  unit?: string | null;
  reason?: string | null;
  severity?: string | null;
  issues?: string[] | null;
  has_photo?: boolean | null;
  task_type?: string | null;
  treatment_type?: string | null;
  concentration?: number | null;
  concentration_unit?: string | null;
} & Partial<Record<WaterQualityParameter, number | null>>;

export type HistoryColumn = {
  // The view column; it is also the `sort` URL value.
  key: string;
  label: string;
  numeric?: boolean;
  sortable: boolean;
  text: (row: HistoryRow) => string;
  flag?: (row: HistoryRow) => boolean;
};

export function formatHistoryTime(iso: string) {
  return formatPacificDateTime(iso, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const capitalize = (value: string | null | undefined) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
const yesNo = (value: boolean | null | undefined) =>
  value === null || value === undefined ? "" : value ? "Yes" : "No";
const quantity = (value: number | null | undefined, unit: string | null | undefined) =>
  value === null || value === undefined ? "" : `${value} ${unit ?? ""}`.trim();

function textColumn(
  key: string,
  label: string,
  read: (row: HistoryRow) => string | null | undefined,
  sortable = true,
): HistoryColumn {
  return { key, label, sortable, text: (row) => read(row) ?? "" };
}

function numberColumn(
  key: string,
  label: string,
  read: (row: HistoryRow) => number | null | undefined,
): HistoryColumn {
  return {
    key,
    label,
    sortable: true,
    numeric: true,
    text: (row) => {
      const value = read(row);
      return value === null || value === undefined ? "" : String(value);
    },
  };
}

const TIME = textColumn("occurred_at", "Time", (row) => formatHistoryTime(row.occurred_at));
const DATASET = textColumn("dataset", "Dataset", (row) => DATASET_LABELS[row.dataset]);
const SYSTEM = textColumn("system_name", "System", (row) => row.system_name);
const TANK = textColumn("tank_name", "Tank", (row) => row.tank_name);
const ANIMAL = textColumn("animal_name", "Animal", (row) => row.animal_name);
const RECORDED_BY = textColumn("recorded_by_name", "Recorded by", (row) => row.recorded_by_name ?? "Unknown");
const SOURCE = textColumn("data_source", "Source", (row) => SOURCE_LABELS[row.data_source], false);
const NOTES = textColumn("notes", "Notes", (row) => row.notes, false);

const ALL_COLUMNS: HistoryColumn[] = [TIME, DATASET, SYSTEM, TANK, ANIMAL, RECORDED_BY, SOURCE];

export const DATASET_COLUMNS: Record<HistoryDataset, HistoryColumn[]> = {
  daily_check: [
    TIME,
    SYSTEM,
    textColumn("check_type", "Check", (row) => row.check_type),
    textColumn("water_running", "Water running", (row) => yesNo(row.water_running)),
    numberColumn("temperature", "Temperature (°C)", (row) => row.temperature),
    RECORDED_BY,
    SOURCE,
    NOTES,
  ],
  feeding: [
    TIME,
    SYSTEM,
    TANK,
    ANIMAL,
    textColumn("food_name", "Food", (row) => row.food_name),
    { ...numberColumn("amount_value", "Amount", (row) => row.amount_value), numeric: false, text: (row) => quantity(row.amount_value, row.amount_unit) },
    textColumn("consumption_status", "Consumption", (row) => capitalize(row.consumption_status)),
    textColumn("consumption_checked_at", "Checked", (row) => (row.consumption_checked_at ? formatHistoryTime(row.consumption_checked_at) : "")),
    RECORDED_BY,
    SOURCE,
    NOTES,
  ],
  water_quality: [
    TIME,
    SYSTEM,
    textColumn("ph_source", "pH source", (row) => row.ph_source),
    ...WATER_QUALITY_PARAMS.map((param): HistoryColumn => ({
      ...numberColumn(param.key, param.unit ? `${param.label} (${param.unit})` : param.label, (row) => row[param.key]),
      flag: (row) => row.out_of_range?.includes(param.key) ?? false,
    })),
    RECORDED_BY,
    SOURCE,
    NOTES,
  ],
  chemical_addition: [
    TIME,
    SYSTEM,
    textColumn("chemical_name", "Chemical", (row) => row.chemical_name),
    { ...numberColumn("amount", "Amount", (row) => row.amount), numeric: false, text: (row) => quantity(row.amount, row.unit) },
    textColumn("reason", "Reason", (row) => row.reason),
    RECORDED_BY,
    SOURCE,
    NOTES,
  ],
  health_observation: [
    TIME,
    SYSTEM,
    TANK,
    ANIMAL,
    textColumn("severity", "Severity", (row) => capitalize(row.severity)),
    textColumn("issues", "Issues", (row) => row.issues?.map((issue) => HEALTH_ISSUE_LABELS[issue as keyof typeof HEALTH_ISSUE_LABELS] ?? issue).join("; ")),
    textColumn("has_photo", "Photo", (row) => yesNo(row.has_photo)),
    RECORDED_BY,
    SOURCE,
    NOTES,
  ],
  maintenance: [
    TIME,
    SYSTEM,
    textColumn("task_type", "Task", (row) => (row.task_type ? (MAINTENANCE_TASK_LABELS[row.task_type as keyof typeof MAINTENANCE_TASK_LABELS] ?? row.task_type) : "")),
    RECORDED_BY,
    SOURCE,
    NOTES,
  ],
  star_treatment: [
    TIME,
    SYSTEM,
    TANK,
    ANIMAL,
    textColumn("treatment_type", "Treatment", (row) => row.treatment_type),
    { ...numberColumn("amount", "Amount", (row) => row.amount), numeric: false, text: (row) => quantity(row.amount, row.unit) },
    { ...numberColumn("concentration", "Concentration", (row) => row.concentration), numeric: false, text: (row) => quantity(row.concentration, row.concentration_unit) },
    RECORDED_BY,
    SOURCE,
    NOTES,
  ],
};

export const columnsFor = (dataset: HistoryDataset | "all") =>
  dataset === "all" ? ALL_COLUMNS : DATASET_COLUMNS[dataset];

const SHARED_DETAIL_KEYS = new Set(["occurred_at", "system_name", "tank_name", "animal_name", "recorded_by_name", "data_source", "notes"]);

// Every field for the row sheet: the shared ones first, then the dataset's own columns.
export function detailFields(row: HistoryRow) {
  return [...ALL_COLUMNS, ...DATASET_COLUMNS[row.dataset].filter((column) => !SHARED_DETAIL_KEYS.has(column.key))].map((column) => ({
    label: column.label,
    value: column.text(row),
    flag: column.flag?.(row) ?? false,
  }));
}
