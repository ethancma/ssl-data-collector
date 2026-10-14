import { WATER_QUALITY_PARAMS } from "@/lib/config/reference-data";
import { addPacificCalendarDays, formatPacificDateTime } from "@/lib/pacific-date-time";
import { DATASETS, DATA_SOURCES, DATASET_LABELS, ISSUE_LABELS, SAMPLE_TODAY, SOURCE_LABELS, TASK_LABELS, type Dataset, type DataSource, type HistoryRow } from "./mock-rows";

export const PAGE_SIZE = 50;
export const EXPORT_CHUNK = 60;

export const RANGE_OPTIONS = [
  { value: "7", label: "7 d" }, { value: "30", label: "30 d" }, { value: "90", label: "90 d" }, { value: "365", label: "1 y" }, { value: "custom", label: "Custom" },
] as const;
export type RangeKey = (typeof RANGE_OPTIONS)[number]["value"];

export type Filters = {
  dataset: Dataset | "all"; range: RangeKey; from: string; to: string; system: string; recorder: string;
  source: DataSource | "all"; q: string; oor: boolean; sort: string; dir: "asc" | "desc"; page: number;
};

export const DEFAULTS = { dataset: "all", range: "30", system: "all", recorder: "all", source: "all", sort: "time", dir: "desc" } as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFilters(params: URLSearchParams): Filters {
  const dataset = params.get("dataset");
  const range = RANGE_OPTIONS.find((option) => option.value === params.get("range"))?.value ?? DEFAULTS.range;
  const source = params.get("source");
  const page = Number(params.get("page"));
  const from = params.get("from");
  const to = params.get("to");
  return {
    dataset: (DATASETS as readonly string[]).includes(dataset ?? "") ? (dataset as Dataset) : "all",
    range,
    from: from && DATE.test(from) ? from : addPacificCalendarDays(SAMPLE_TODAY, -29),
    to: to && DATE.test(to) ? to : SAMPLE_TODAY,
    system: params.get("system") ?? "all",
    recorder: params.get("recorder") ?? "all",
    source: (DATA_SOURCES as readonly string[]).includes(source ?? "") ? (source as DataSource) : "all",
    q: (params.get("q") ?? "").slice(0, 100),
    oor: params.get("oor") === "1",
    sort: params.get("sort") ?? DEFAULTS.sort,
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function dateBounds(filters: Filters) {
  if (filters.range === "custom") return filters.from <= filters.to ? { from: filters.from, to: filters.to } : { from: filters.to, to: filters.from };
  return { from: addPacificCalendarDays(SAMPLE_TODAY, -(Number(filters.range) - 1)), to: SAMPLE_TODAY };
}

export function filterRows(rows: HistoryRow[], filters: Filters) {
  const { from, to } = dateBounds(filters);
  const needle = filters.q.trim().toLowerCase();
  return rows.filter((row) =>
    row.occurred_on >= from && row.occurred_on <= to
    && (filters.dataset === "all" || row.dataset === filters.dataset)
    && (filters.system === "all" || row.system_name === filters.system)
    && (filters.recorder === "all" || row.recorded_by_name === filters.recorder)
    && (filters.source === "all" || row.data_source === filters.source)
    && (!filters.oor || (row.out_of_range?.length ?? 0) > 0)
    && (!needle || [row.notes, row.system_name, row.tank_name, row.animal_name, row.recorded_by_name].some((field) => field?.toLowerCase().includes(needle))));
}

export type Column = {
  key: string; label: string; sortable: boolean; numeric?: boolean;
  text: (row: HistoryRow) => string;
  sortValue?: (row: HistoryRow) => string | number | null;
  flag?: (row: HistoryRow) => boolean;
};

export function formatTime(iso: string) {
  return formatPacificDateTime(iso, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const text = (key: string, label: string, read: (row: HistoryRow) => string | null | undefined, sortable = true): Column =>
  ({ key, label, sortable, text: (row) => read(row) ?? "", sortValue: (row) => read(row) ?? null });
const number = (key: string, label: string, read: (row: HistoryRow) => number | undefined, format: (value: number) => string = String): Column =>
  ({ key, label, sortable: true, numeric: true, text: (row) => { const value = read(row); return value === undefined ? "" : format(value); }, sortValue: (row) => read(row) ?? null });

const TIME: Column = { key: "time", label: "Time", sortable: true, text: (row) => formatTime(row.occurred_at), sortValue: (row) => row.occurred_at };
const DATASET = text("dataset", "Dataset", (row) => DATASET_LABELS[row.dataset]);
const SYSTEM = text("system", "System", (row) => row.system_name);
const TANK = text("tank", "Tank", (row) => row.tank_name);
const ANIMAL = text("animal", "Animal", (row) => row.animal_name);
const RECORDED_BY = text("recorded_by", "Recorded by", (row) => row.recorded_by_name ?? "Unknown");
const SOURCE = text("source", "Source", (row) => SOURCE_LABELS[row.data_source], false);
const SUMMARY = text("summary", "Summary", (row) => row.summary, false);
const NOTES = text("notes", "Notes", (row) => row.notes, false);

export const ALL_COLUMNS: Column[] = [TIME, DATASET, SYSTEM, TANK, ANIMAL, SUMMARY, RECORDED_BY, SOURCE];

export const DATASET_COLUMNS: Record<Dataset, Column[]> = {
  daily_check: [TIME, SYSTEM, text("check_type", "Check", (row) => row.check_type),
    text("water_running", "Water running", (row) => (row.water_running === undefined ? "" : row.water_running ? "Yes" : "No")),
    number("temperature", "Temperature (°C)", (row) => row.temperature), RECORDED_BY, SOURCE, NOTES],
  feeding: [TIME, SYSTEM, TANK, ANIMAL, text("food", "Food", (row) => row.food_name),
    text("amount", "Amount", (row) => (row.amount_value === undefined ? "" : `${row.amount_value} ${row.amount_unit ?? ""}`.trim())),
    text("consumption", "Consumption", (row) => row.consumption_status),
    text("checked", "Checked", (row) => (row.consumption_checked_at ? formatTime(row.consumption_checked_at) : "")), RECORDED_BY, SOURCE, NOTES],
  water_quality: [TIME, SYSTEM, text("ph_source", "pH source", (row) => row.ph_source),
    ...WATER_QUALITY_PARAMS.map((param): Column => ({
      ...number(param.key, param.unit ? `${param.label} (${param.unit})` : param.label, (row) => row[param.key]),
      flag: (row) => row.out_of_range?.includes(param.key) ?? false,
    })), RECORDED_BY, SOURCE, NOTES],
  chemical_addition: [TIME, SYSTEM, text("chemical", "Chemical", (row) => row.chemical_name),
    text("amount", "Amount", (row) => (row.amount === undefined ? "" : `${row.amount} ${row.unit ?? ""}`.trim())),
    text("reason", "Reason", (row) => row.reason), RECORDED_BY, SOURCE, NOTES],
  health_observation: [TIME, SYSTEM, TANK, ANIMAL, text("severity", "Severity", (row) => row.severity),
    text("issues", "Issues", (row) => row.issues?.map((issue) => ISSUE_LABELS[issue as keyof typeof ISSUE_LABELS] ?? issue).join("; ")),
    text("photo", "Photo", (row) => (row.has_photo === undefined ? "" : row.has_photo ? "Yes" : "No")), RECORDED_BY, SOURCE, NOTES],
  maintenance: [TIME, SYSTEM, TANK, text("task", "Task", (row) => TASK_LABELS[row.task_type as keyof typeof TASK_LABELS] ?? row.task_type), RECORDED_BY, SOURCE, NOTES],
  star_treatment: [TIME, SYSTEM, TANK, ANIMAL, text("treatment", "Treatment", (row) => row.treatment_type),
    text("amount", "Amount", (row) => (row.amount === undefined ? "" : `${row.amount} ${row.unit ?? ""}`.trim())),
    text("concentration", "Concentration", (row) => (row.concentration === undefined ? "" : `${row.concentration} ${row.concentration_unit ?? ""}`.trim())),
    RECORDED_BY, SOURCE, NOTES],
};

export function sortRows(rows: HistoryRow[], columns: Column[], filters: Filters) {
  const column = columns.find((candidate) => candidate.key === filters.sort && candidate.sortable) ?? TIME;
  const sign = filters.dir === "asc" ? 1 : -1;
  return [...rows].sort((first, second) => {
    const a = column.sortValue?.(first) ?? null;
    const b = column.sortValue?.(second) ?? null;
    if (a === b) return second.occurred_at.localeCompare(first.occurred_at);
    if (a === null) return 1;
    if (b === null) return -1;
    return (typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b))) * sign;
  });
}

const BASE_KEYS = new Set(["time", "system", "tank", "animal", "recorded_by", "source", "notes"]);
export function detailFields(row: HistoryRow) {
  return [
    ...ALL_COLUMNS.filter((column) => column.key !== "summary"),
    ...DATASET_COLUMNS[row.dataset].filter((column) => !BASE_KEYS.has(column.key)),
  ].map((column) => ({ label: column.label, value: column.text(row), flag: column.flag?.(row) ?? false }));
}

// Quotes every cell (RFC 4180) and prefixes formula triggers so spreadsheets read them as text.
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function buildCsv(columns: Column[], rows: HistoryRow[]) {
  const lines = [columns.map((column) => column.label), ...rows.map((row) => columns.map((column) => column.text(row)))];
  return `\uFEFF${lines.map((line) => line.map(csvCell).join(",")).join("\r\n")}`;
}
