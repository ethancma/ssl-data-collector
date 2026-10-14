import { addPacificCalendarDays } from "@/lib/pacific-date-time";

import { DATA_SOURCES, HISTORY_DATASETS, columnsFor, type HistoryDataSource, type HistoryDataset } from "./datasets";

export const HISTORY_PAGE_SIZE = 50;
const MAX_PAGE = 10_000;
const MAX_SEARCH_LENGTH = 100;

export const RANGE_OPTIONS = [
  { value: "7", label: "7 d" },
  { value: "30", label: "30 d" },
  { value: "90", label: "90 d" },
  { value: "365", label: "1 y" },
  { value: "custom", label: "Custom" },
] as const;
export type HistoryRange = (typeof RANGE_OPTIONS)[number]["value"];

export const DEFAULT_SORT = "occurred_at";

export type HistoryParams = {
  dataset: HistoryDataset | "all";
  range: HistoryRange;
  // Inclusive Pacific dates, resolved from the range.
  from: string;
  to: string;
  system: number | null;
  recorder: number | null;
  source: HistoryDataSource | null;
  q: string;
  outOfRange: boolean;
  sort: string;
  dir: "asc" | "desc";
  page: number;
};

export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

function isCalendarDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function positiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

// Every value is whitelisted; anything unknown falls back to the default.
export function parseHistoryParams(raw: RawSearchParams, today: string, canViewStar: boolean): HistoryParams {
  const outOfRange = first(raw.oor) === "1";
  const requested = first(raw.dataset);
  const allowed = HISTORY_DATASETS.filter((dataset) => canViewStar || dataset !== "star_treatment");
  // Out of range is only defined for water quality, so the filter implies that dataset.
  const dataset: HistoryParams["dataset"] = outOfRange
    ? "water_quality"
    : allowed.find((candidate) => candidate === requested) ?? "all";

  const requestedRange = first(raw.range);
  let range: HistoryRange = RANGE_OPTIONS.find((option) => option.value === requestedRange)?.value ?? "30";
  let from = addPacificCalendarDays(today, -29);
  let to = today;
  if (range === "custom") {
    const customFrom = first(raw.from);
    const customTo = first(raw.to);
    if (isCalendarDate(customFrom) && isCalendarDate(customTo)) {
      [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    } else {
      range = "30";
    }
  } else {
    from = addPacificCalendarDays(today, -(Number(range) - 1));
  }

  const requestedSort = first(raw.sort);
  const sort = columnsFor(dataset).some((column) => column.sortable && column.key === requestedSort)
    ? (requestedSort as string)
    : DEFAULT_SORT;
  const requestedSource = first(raw.source);
  const page = Number(first(raw.page));

  return {
    dataset,
    range,
    from,
    to,
    system: positiveInt(first(raw.system)),
    recorder: positiveInt(first(raw.recorder)),
    source: DATA_SOURCES.find((candidate) => candidate === requestedSource) ?? null,
    q: (first(raw.q) ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    outOfRange,
    sort,
    dir: first(raw.dir) === "asc" ? "asc" : "desc",
    page: Number.isInteger(page) && page > 0 ? Math.min(page, MAX_PAGE) : 1,
  };
}
