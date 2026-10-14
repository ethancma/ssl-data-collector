"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { DEFAULTS, EXPORT_CHUNK, PAGE_SIZE, buildCsv, dateBounds, filterRows, parseFilters, sortRows, type Column } from "./logic";
import { MOCK_ROWS, SOURCE_LABELS, type Dataset } from "./mock-rows";

// The URL is the source of truth. Writes go through the History API, which Next syncs into useSearchParams.
export function useHistoryPreview(columnsFor: (dataset: Dataset | "all") => Column[]) {
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = parseFilters(params);
  const openId = params.get("row");
  const queryKey = [...params.entries()].filter(([key]) => key !== "row" && key !== "page").map(([key, value]) => `${key}=${value}`).join("&");

  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setLoadedKey(queryKey), 350);
    return () => clearTimeout(timer);
  }, [queryKey]);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || DEFAULTS[key as keyof typeof DEFAULTS] === value) next.delete(key);
      else next.set(key, value);
    }
    if (!("page" in patch) && !("row" in patch)) next.delete("page");
    window.history.replaceState(null, "", next.size ? `${pathname}?${next}` : pathname);
  }

  const [searchKey, setSearchKey] = useState(0);
  function clearAll() {
    update({ system: null, recorder: null, source: null, q: null, oor: null, from: null, to: null });
    setSearchKey((key) => key + 1);
  }

  const columns = columnsFor(filters.dataset);
  const matching = useMemo(() => filterRows(MOCK_ROWS, { ...filters, dataset: "all" }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the URL, not the parsed object identity
    [queryKey]);
  const rows = useMemo(() => sortRows(filters.dataset === "all" ? matching : matching.filter((row) => row.dataset === filters.dataset), columns, filters),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the URL, not the parsed object identity
    [queryKey]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(filters.page, pages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const outOfRange = rows.filter((row) => (row.out_of_range?.length ?? 0) > 0).length;
  const bounds = dateBounds(filters);

  const chips = [
    filters.system !== "all" && { id: "system", label: filters.system, clear: () => update({ system: null }) },
    filters.recorder !== "all" && { id: "recorder", label: filters.recorder, clear: () => update({ recorder: null }) },
    filters.source !== "all" && { id: "source", label: SOURCE_LABELS[filters.source], clear: () => update({ source: null }) },
    filters.q && { id: "q", label: `“${filters.q}”`, clear: () => { update({ q: null }); setSearchKey((key) => key + 1); } },
    filters.oor && { id: "oor", label: "Out of range only", clear: () => update({ oor: null }) },
  ].filter((chip): chip is { id: string; label: string; clear: () => void } => Boolean(chip));

  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  const cancelled = useRef(false);
  // The real export pages through the view 1,000 rows at a time; the mock fakes that cadence.
  async function exportCsv() {
    cancelled.current = false;
    const collected = [] as typeof rows;
    for (let from = 0; from < rows.length; from += EXPORT_CHUNK) {
      if (cancelled.current) { setExporting(null); return; }
      collected.push(...rows.slice(from, from + EXPORT_CHUNK));
      setExporting({ done: collected.length, total: rows.length });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (cancelled.current) { setExporting(null); return; }
    const url = URL.createObjectURL(new Blob([buildCsv(columns, collected)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `history-${filters.dataset === "all" ? "all" : filters.dataset}-${bounds.from}-${bounds.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  const rangeText = filters.range === "custom" ? `from ${bounds.from} to ${bounds.to}`
    : filters.range === "365" ? "in the last year" : `in the last ${filters.range} days`;
  const headline = rows.length === 0 ? `Nothing logged ${rangeText}.`
    : `${rows.length.toLocaleString()} ${rows.length === 1 ? "entry" : "entries"} ${rangeText}.${outOfRange ? ` ${outOfRange} water ${outOfRange === 1 ? "test" : "tests"} out of range.` : ""}`;

  return {
    filters, update, clearAll, chips, columns, rows, pageRows, page, pages, headline, bounds,
    openRow: openId ? MOCK_ROWS.find((row) => row.id === openId) : undefined,
    loading: loadedKey !== queryKey, searchKey,
    exporting, exportCsv, cancelExport: () => { cancelled.current = true; },
  };
}

export type HistoryPreview = ReturnType<typeof useHistoryPreview>;
