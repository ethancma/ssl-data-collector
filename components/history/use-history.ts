"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { buildCsv } from "@/lib/history/csv";
import { DATASET_VIEWS, SOURCE_LABELS, columnsFor, type HistoryRow } from "@/lib/history/datasets";
import { DEFAULT_SORT, HISTORY_PAGE_SIZE, type HistoryParams } from "@/lib/history/params";
import { applyHistoryFilters, applyHistoryOrder } from "@/lib/history/query";
import { formatPacificDateTime } from "@/lib/pacific-date-time";
import { createClient } from "@/lib/supabase/client";

type HistoryOption = { id: number; name: string };

export type HistoryData = {
  params: HistoryParams;
  rows: HistoryRow[];
  total: number;
  // Water tests out of range under the current filters; null when the dataset has none.
  outOfRange: number | null;
  systems: HistoryOption[];
  recorders: HistoryOption[];
  canViewStar: boolean;
};

// PostgREST returns at most this many rows per request (max_rows in supabase/config.toml).
const EXPORT_CHUNK = 1000;

const URL_DEFAULTS: Record<string, string> = { dataset: "all", range: "30", system: "all", recorder: "all", source: "all", sort: DEFAULT_SORT, dir: "desc" };

const dateLabel = (date: string) => formatPacificDateTime(`${date}T20:00:00Z`, { month: "short", day: "numeric", year: "numeric" });

// The URL is the source of truth: a change rewrites the query string and the server page re-queries.
export function useHistory(data: HistoryData) {
  const { params } = data;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [openKey, setOpenKey] = useState<string | null>(null);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || URL_DEFAULTS[key] === value) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in patch)) next.delete("page");
    startTransition(() => router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false }));
  }

  function clearAll() {
    update({ system: null, recorder: null, source: null, q: null, oor: null });
  }

  const columns = columnsFor(params.dataset);
  const pages = Math.max(1, Math.ceil(data.total / HISTORY_PAGE_SIZE));

  const chips = [
    params.system !== null && { id: "system", label: data.systems.find((system) => system.id === params.system)?.name ?? "System", clear: () => update({ system: null }) },
    params.recorder !== null && { id: "recorder", label: data.recorders.find((recorder) => recorder.id === params.recorder)?.name ?? "Recorder", clear: () => update({ recorder: null }) },
    params.source !== null && { id: "source", label: SOURCE_LABELS[params.source], clear: () => update({ source: null }) },
    params.q && { id: "q", label: `“${params.q}”`, clear: () => update({ q: null }) },
    params.outOfRange && { id: "oor", label: "Out of range only", clear: () => update({ oor: null }) },
  ].filter((chip): chip is { id: string; label: string; clear: () => void } => Boolean(chip));

  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const cancelled = useRef(false);

  async function exportCsv() {
    cancelled.current = false;
    setExportError(null);
    const supabase = createClient();
    const collected: HistoryRow[] = [];
    setExporting({ done: 0, total: data.total });
    for (let from = 0; ; from += EXPORT_CHUNK) {
      const { data: chunk, error } = await applyHistoryOrder(applyHistoryFilters(supabase.from(DATASET_VIEWS[params.dataset]).select("*"), params), params)
        .range(from, from + EXPORT_CHUNK - 1);
      if (cancelled.current) { setExporting(null); return; }
      if (error) { setExportError(error.message); setExporting(null); return; }
      collected.push(...(chunk as HistoryRow[]));
      setExporting({ done: collected.length, total: data.total });
      if (chunk.length < EXPORT_CHUNK) break;
    }
    const url = URL.createObjectURL(new Blob([buildCsv(columns, collected)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `history-${params.dataset}-${params.from}-${params.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  const rangeText = params.range === "custom" ? `from ${dateLabel(params.from)} to ${dateLabel(params.to)}`
    : params.range === "365" ? "in the last year" : `in the last ${params.range} days`;
  const outOfRange = data.outOfRange;
  const headline = data.total === 0 ? `Nothing logged ${rangeText}.`
    : `${data.total.toLocaleString()} ${data.total === 1 ? "entry" : "entries"} ${rangeText}.${outOfRange ? ` ${outOfRange} water ${outOfRange === 1 ? "test" : "tests"} out of range.` : ""}`;

  return {
    ...data, update, clearAll, chips, columns, pages, headline, loading: pending,
    openRow: openKey ? data.rows.find((row) => `${row.dataset}-${row.id}` === openKey) : undefined,
    setOpenKey,
    exporting, exportError, exportCsv, cancelExport: () => { cancelled.current = true; },
  };
}

export type HistoryState = ReturnType<typeof useHistory>;
