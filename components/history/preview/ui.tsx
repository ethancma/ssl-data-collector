"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown, Download, ImageIcon, Search, X } from "lucide-react";

import { EmptyNote, PageHeader, Segmented, Sheet, Tile, focusClass } from "@/components/iseau/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DATASETS, DATASET_LABELS, DATA_SOURCES, RECORDER_NAMES, SAMPLE_TODAY, SOURCE_LABELS, SYSTEM_NAMES, type DataSource, type HistoryRow } from "./mock-rows";
import { PAGE_SIZE, RANGE_OPTIONS, detailFields, formatTime, type Column, type RangeKey } from "./logic";
import type { HistoryPreview } from "./use-history-preview";

const OUT_OF_RANGE_TEXT = "font-medium text-amber-600 dark:text-amber-400";
const pillClass = "h-9 rounded-full bg-muted px-4 text-sm";

export function HistorySampleNote() {
  return <p className="text-xs text-muted-foreground">Sample data as of Oct 14, 2026</p>;
}

export function DesignSwitcher({ current }: { current: "a" | "b" | "c" }) {
  return <nav aria-label="Sample designs" className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
    <Link href="/protected/history" className={cn("rounded-full px-1 underline-offset-4 hover:underline", focusClass)}>All designs</Link>
    {(["a", "b", "c"] as const).map((design) => <Link key={design} href={`/protected/history?design=${design}`} aria-current={design === current ? "page" : undefined}
      className={cn("rounded-full px-3 py-1", focusClass, design === current ? "bg-foreground text-background" : "bg-muted hover:text-foreground")}>Design {design.toUpperCase()}</Link>)}
    <HistorySampleNote />
  </nav>;
}

export function HistoryHeader({ h }: { h: HistoryPreview }) {
  return <PageHeader title={h.headline} description="Every log in one place. Filter, sort, open a row for detail, or export what you see." />;
}

export function SourceBadge({ source }: { source: DataSource }) {
  return <span className="inline-flex whitespace-nowrap rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs font-medium">{SOURCE_LABELS[source]}</span>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return <label className="inline-flex">
    <span className="sr-only">{label}</span>
    <select value={value} onChange={(event) => onChange(event.target.value)} className={cn(pillClass, focusClass)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

function ExportButton({ h }: { h: HistoryPreview }) {
  if (h.exporting) {
    return <div role="status" className="inline-flex items-center gap-3 text-sm">
      <span className="tabular-nums">Exporting {h.exporting.done.toLocaleString()} of {h.exporting.total.toLocaleString()} rows</span>
      <Button type="button" variant="outline" size="sm" onClick={h.cancelExport}>Cancel</Button>
    </div>;
  }
  return <Button type="button" variant="outline" disabled={h.rows.length === 0} onClick={() => void h.exportCsv()}>
    <Download aria-hidden="true" />Export {h.rows.length.toLocaleString()} {h.rows.length === 1 ? "row" : "rows"}
  </Button>;
}

// `dataset="pills"` adds the dataset switcher; Design B renders its own tabs instead.
export function FilterBar({ h, dataset, children }: { h: HistoryPreview; dataset: "pills" | "none"; children?: ReactNode }) {
  const { filters, update } = h;
  const toggle = (pressed: boolean) => cn("inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors", focusClass,
    pressed ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground");
  return <div className="space-y-3">
    {dataset === "pills" && <Segmented label="Dataset" value={filters.dataset} onChange={(value) => update({ dataset: value })}
      options={[{ value: "all", label: "All" }, ...DATASETS.map((value) => ({ value, label: DATASET_LABELS[value] }))]} />}
    <div className="flex flex-wrap items-center gap-3">
      <Segmented<RangeKey> label="Date range" value={filters.range} onChange={(value) => update({ range: value })} options={[...RANGE_OPTIONS]} />
      {filters.range === "custom" && <>
        {(["from", "to"] as const).map((key) => <label key={key} className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="capitalize">{key}</span>
          <input type="date" value={h.bounds[key]} max={SAMPLE_TODAY} onChange={(event) => event.target.value && update({ [key]: event.target.value })} className={cn(pillClass, "text-foreground", focusClass)} />
        </label>)}
      </>}
      <FilterSelect label="System" value={filters.system} onChange={(value) => update({ system: value })}
        options={[{ value: "all", label: "All systems" }, ...SYSTEM_NAMES.map((value) => ({ value, label: value }))]} />
      <FilterSelect label="Recorded by" value={filters.recorder} onChange={(value) => update({ recorder: value })}
        options={[{ value: "all", label: "Anyone" }, ...RECORDER_NAMES.map((value) => ({ value, label: value }))]} />
      <FilterSelect label="Data source" value={filters.source} onChange={(value) => update({ source: value })}
        options={[{ value: "all", label: "Any source" }, ...DATA_SOURCES.map((value) => ({ value, label: SOURCE_LABELS[value] }))]} />
      <label className="relative inline-flex items-center">
        <span className="sr-only">Search notes, system, tank, animal, or recorder</span>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted-foreground" />
        <input key={h.searchKey} type="search" defaultValue={filters.q} placeholder="Search" maxLength={100} onChange={(event) => update({ q: event.target.value.trim() })}
          className={cn(pillClass, "w-48 pl-10 placeholder:text-muted-foreground", focusClass)} />
      </label>
      <button type="button" aria-pressed={filters.oor} onClick={() => update({ oor: filters.oor ? null : "1" })} className={toggle(filters.oor)}>Out of range only</button>
      {children}
      <div className="ml-auto"><ExportButton h={h} /></div>
    </div>
    {h.chips.length > 0 && <ul aria-label="Active filters" className="flex flex-wrap items-center gap-2">
      {h.chips.map((chip) => <li key={chip.id}>
        <button type="button" onClick={chip.clear} aria-label={`Remove filter ${chip.label}`} className={cn("inline-flex items-center gap-1.5 rounded-full bg-muted py-1 pl-3 pr-2 text-sm", focusClass)}>
          {chip.label}<X aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </li>)}
      <li><button type="button" onClick={h.clearAll} className={cn("rounded-full px-2 py-1 text-sm text-muted-foreground underline-offset-4 hover:underline", focusClass)}>Clear all</button></li>
    </ul>}
  </div>;
}

export function RowsSkeleton() {
  return <div role="status" aria-label="Loading entries" className="space-y-2">
    {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-background/60" />)}
  </div>;
}

export function Pager({ h }: { h: HistoryPreview }) {
  const first = h.rows.length === 0 ? 0 : (h.page - 1) * PAGE_SIZE + 1;
  const last = Math.min(h.page * PAGE_SIZE, h.rows.length);
  const go = (page: number) => h.update({ page: page <= 1 ? null : String(page) });
  return <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
    <p className="text-muted-foreground tabular-nums">Showing {first.toLocaleString()}–{last.toLocaleString()} of {h.rows.length.toLocaleString()}</p>
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={h.page <= 1} onClick={() => go(h.page - 1)}><ChevronLeft aria-hidden="true" />Previous</Button>
      <span className="tabular-nums">Page {h.page} of {h.pages}</span>
      <Button type="button" variant="outline" size="sm" disabled={h.page >= h.pages} onClick={() => go(h.page + 1)}>Next<ChevronRight aria-hidden="true" /></Button>
    </div>
  </nav>;
}

function placeText(row: HistoryRow) {
  return [row.system_name, row.tank_name, row.animal_name].filter(Boolean).join(" · ");
}

export function EntryCard({ row, h }: { row: HistoryRow; h: HistoryPreview }) {
  return <button type="button" onClick={() => h.update({ row: row.id })} className={cn("block w-full space-y-1 rounded-2xl bg-background p-4 text-left", focusClass)}>
    <span className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">{formatTime(row.occurred_at)}</span><SourceBadge source={row.data_source} />
    </span>
    <span className="block text-sm text-muted-foreground">{DATASET_LABELS[row.dataset]}{placeText(row) && ` · ${placeText(row)}`}</span>
    <span className={cn("block", row.out_of_range?.length && OUT_OF_RANGE_TEXT)}>{row.summary}</span>
    <span className="block text-sm text-muted-foreground">{row.recorded_by_name ?? "Unknown"}</span>
  </button>;
}

export function HistoryTable({ h, columns }: { h: HistoryPreview; columns: Column[] }) {
  const { filters, update } = h;
  function sortBy(column: Column) {
    const active = filters.sort === column.key;
    update({ sort: column.key, dir: active ? (filters.dir === "asc" ? "desc" : "asc") : column.key === "time" ? "desc" : "asc" });
  }
  return <Tile className="space-y-4 p-4 sm:p-6">
    {h.loading ? <RowsSkeleton /> : h.rows.length === 0 ? <EmptyNote>No entries match these filters. Try a wider date range or clear a filter.</EmptyNote> : <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = filters.sort === column.key;
                const Icon = !active ? ChevronsUpDown : filters.dir === "asc" ? ArrowUp : ArrowDown;
                return <th key={column.key} scope="col" aria-sort={column.sortable ? (active ? (filters.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                  className={cn("whitespace-nowrap px-3 py-2 font-medium text-muted-foreground", column.numeric ? "text-right" : "text-left")}>
                  {column.sortable
                    ? <button type="button" onClick={() => sortBy(column)} className={cn("inline-flex items-center gap-1 rounded-md hover:text-foreground", focusClass, active && "text-foreground")}>
                      {column.label}<Icon aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                    : column.label}
                </th>;
              })}
            </tr>
          </thead>
          <tbody>
            {h.pageRows.map((row) => <tr key={row.id} onClick={() => update({ row: row.id })} className="cursor-pointer even:bg-background/50 hover:bg-background">
              {columns.map((column) => {
                const value = column.text(row);
                const flagged = column.flag?.(row) ?? false;
                return <td key={column.key} className={cn("px-3 py-2.5", column.numeric ? "text-right tabular-nums" : "text-left", column.key === "notes" ? "max-w-64 truncate" : column.key === "summary" ? "min-w-48" : "whitespace-nowrap", flagged && OUT_OF_RANGE_TEXT)}>
                  {column.key === "time"
                    ? <button type="button" onClick={(event) => { event.stopPropagation(); update({ row: row.id }); }} className={cn("rounded-md text-left font-medium underline-offset-4 hover:underline", focusClass)}>{value}</button>
                    : column.key === "source" ? <SourceBadge source={row.data_source} />
                      : value || <span aria-label="No value" className="text-muted-foreground">—</span>}
                  {flagged && <span className="sr-only"> (outside target)</span>}
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 sm:hidden">{h.pageRows.map((row) => <li key={row.id}><EntryCard row={row} h={h} /></li>)}</ul>
    </>}
    <Pager h={h} />
  </Tile>;
}

export function RowDetail({ h }: { h: HistoryPreview }) {
  const row = h.openRow;
  if (!row) return null;
  const fields = detailFields(row);
  return <Sheet title={`${DATASET_LABELS[row.dataset]} · ${formatTime(row.occurred_at)}`} onClose={() => h.update({ row: null })}>
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {fields.map((field) => <div key={field.label}>
        <dt className="text-sm text-muted-foreground">{field.label}</dt>
        <dd className={cn("text-lg", field.flag && OUT_OF_RANGE_TEXT)}>{field.value || "—"}{field.flag && <span className="sr-only"> (outside target)</span>}</dd>
      </div>)}
      <div><dt className="text-sm text-muted-foreground">Entered</dt><dd className="text-lg">{formatTime(row.entered_at)}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap text-lg">{row.notes || "—"}</dd></div>
    </dl>
    {row.has_photo && <div className="mt-6 space-y-2">
      <h3 className="text-sm text-muted-foreground">Photos</h3>
      <ul className="flex flex-wrap gap-3">{[1, 2].map((index) => <li key={index} role="img" aria-label={`Sample photo ${index}`} className="grid size-28 place-items-center rounded-2xl bg-muted text-muted-foreground"><ImageIcon aria-hidden="true" /></li>)}</ul>
    </div>}
  </Sheet>;
}

