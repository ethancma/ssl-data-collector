"use client";

import { HydratedForm } from "@/components/forms/hydrated-form";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Download, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { CompactSelect, FILTER_BOX_CLASS, FilterToggle, Sheet } from "@/components/ui/app-primitives";
import { EmptyNote, PageHeader, Tile, focusClass } from "@/components/ui/app-layout";
import { Button } from "@/components/ui/button";
import {
  DATASET_LABELS, DATA_SOURCES, HISTORY_DATASETS, SOURCE_LABELS, detailFields, formatHistoryTime,
  type HistoryColumn, type HistoryDataSource, type HistoryDataset, type HistoryRow,
} from "@/lib/history/datasets";
import { HISTORY_PAGE_SIZE, RANGE_OPTIONS, type HistoryRange } from "@/lib/history/params";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import type { HistoryState } from "./use-history";

const OUT_OF_RANGE_TEXT = "font-medium text-amber-600 dark:text-amber-400";
const CARD_SKIPPED = new Set(["occurred_at", "data_source", "notes"]);
const rowKey = (row: HistoryRow) => `${row.dataset}-${row.id}`;

export function HistoryHeader({ h }: { h: HistoryState }) {
  return <PageHeader title="History" description={h.headline} />;
}

function SourceBadge({ source }: { source: HistoryDataSource }) {
  return <span className="inline-flex whitespace-nowrap rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs font-medium">{SOURCE_LABELS[source]}</span>;
}

type Choice<T extends string> = { value: T; label: string };

// Own popup instead of the native one, so every browser opens it directly below the control.
function OptionList<T extends string>({ id, options, active, value, empty, onChoose, onHover }: {
  id: string; options: Choice<T>[]; active: number; value: T; empty?: string; onChoose: (option: Choice<T>) => void; onHover: (index: number) => void;
}) {
  return <ul id={`${id}-list`} role="listbox" className="absolute left-0 top-full z-20 mt-1 max-h-72 w-max min-w-full max-w-[calc(100vw-2rem)] overflow-auto rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-border">
    {options.length === 0 && <li role="presentation" className="px-3 py-2 text-sm text-muted-foreground">{empty}</li>}
    {options.map((option, index) => <li key={option.value} id={`${id}-${index}`} role="option" aria-selected={option.value === value}
      onMouseDown={(event) => event.preventDefault()} onClick={() => onChoose(option)} onMouseEnter={() => onHover(index)}
      className={cn("touch-target cursor-pointer whitespace-normal break-words rounded-xl px-3 py-2 text-sm", index === active && "bg-accent", option.value === value && "font-semibold")}>{option.label}</li>)}
  </ul>;
}

// Type to filter; the first match is highlighted, so Enter or Tab fills it in.
function DatasetCombobox({ value, canViewStar, onChange }: { value: HistoryDataset | "all"; canViewStar: boolean; onChange: (value: HistoryDataset | "all") => void }) {
  const options: Choice<HistoryDataset | "all">[] = [
    { value: "all", label: "All datasets" },
    ...HISTORY_DATASETS.filter((dataset) => canViewStar || dataset !== "star_treatment").map((dataset) => ({ value: dataset, label: DATASET_LABELS[dataset] })),
  ];
  const selected = options.find((option) => option.value === value) ?? options[0];
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const needle = (query ?? "").trim().toLowerCase();
  const matches = options.filter((option) => option.label.toLowerCase().includes(needle));
  const close = () => { setOpen(false); setQuery(null); };
  const choose = (option: (typeof options)[number]) => { onChange(option.value); close(); };
  useEffect(() => {
    if (open) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, id, open]);
  return <div className="relative min-w-0">
    <label htmlFor={id} className="sr-only">Dataset</label>
    <input id={id} role="combobox" aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
      aria-activedescendant={open && matches[active] ? `${id}-${active}` : undefined}
      value={query ?? selected.label} className={cn(FILTER_BOX_CLASS, "pl-3 pr-9", focusClass)}
      onFocus={(event) => { setOpen(true); event.target.select(); }}
      onBlur={close}
      onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
          setActive((current) => Math.max(0, Math.min(matches.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))));
        } else if (event.key === "Enter" && open && matches[active]) {
          event.preventDefault();
          choose(matches[active]);
        } else if (event.key === "Home" && open) {
          event.preventDefault();
          setActive(0);
        } else if (event.key === "End" && open) {
          event.preventDefault();
          setActive(Math.max(0, matches.length - 1));
        } else if (event.key === "Tab" && query !== null && matches[active]) {
          choose(matches[active]);
        } else if (event.key === "Escape" && open) {
          event.preventDefault();
          close();
        }
      }} />
    <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    {open && <div ref={listRef}><OptionList id={id} options={matches} active={active} value={value} empty="No matching dataset" onChoose={choose} onHover={setActive} /></div>}
  </div>;
}

function ExportButton({ h }: { h: HistoryState }) {
  if (h.exporting) {
    return <div role="status" className="filter-grid__action flex h-9 min-w-0 items-center justify-between gap-2 text-sm">
      <span className="truncate tabular-nums">Exporting {h.exporting.done.toLocaleString()} of {h.exporting.total.toLocaleString()}</span>
      <Button type="button" variant="outline" size="sm" className="touch-target rounded-full" onClick={h.cancelExport}>Cancel</Button>
    </div>;
  }
  return <Button type="button" variant="outline" disabled={h.total === 0} onClick={() => void h.exportCsv()} className="filter-grid__action touch-target h-9 min-w-0 rounded-full">
    <Download aria-hidden="true" /><span className="truncate">Export {h.total.toLocaleString()} {h.total === 1 ? "row" : "rows"}</span>
  </Button>;
}

export function FilterBar({ h }: { h: HistoryState }) {
  const { params, update } = h;
  const secondaryCount = Number(params.recorder !== null) + Number(params.source !== null) + Number(params.outOfRange);
  const [requestedMoreOpen, setRequestedMoreOpen] = useState<boolean | null>(null);
  const moreOpen = requestedMoreOpen ?? secondaryCount > 0;
  useEffect(() => {
    if (secondaryCount === 0) setRequestedMoreOpen(null);
  }, [secondaryCount]);
  const moreFiltersLabel = `${moreOpen ? "Fewer" : "More"} filters${secondaryCount ? ` · ${secondaryCount}` : ""}`;
  return <div className="filter-toolbar space-y-3">
    <div className={cn("filter-grid", moreOpen && "is-open")}>
      <DatasetCombobox value={params.dataset} canViewStar={h.canViewStar} onChange={(value) => update({ dataset: value, sort: null, dir: null, oor: null })} />
      <CompactSelect<HistoryRange> label="Date range" value={params.range} onChange={(value) => update(value === "custom" ? { range: value, from: params.from, to: params.to } : { range: value, from: null, to: null })} options={[...RANGE_OPTIONS]} />
      {params.range === "custom" && (["from", "to"] as const).map((key) => <input key={key} type="date" aria-label={key === "from" ? "From date" : "To date"} value={params[key]}
        onChange={(event) => event.target.value && update({ [key]: event.target.value })} className={cn(FILTER_BOX_CLASS, "px-3", focusClass)} />)}
      <CompactSelect label="System" value={params.system === null ? "all" : String(params.system)}
        onChange={(value) => update({ system: value === "all" ? null : value })}
        options={[{ value: "all", label: "All systems" }, ...h.systems.map((system) => ({ value: String(system.id), label: system.name }))]} />
      <button type="button" aria-expanded={moreOpen} aria-controls="history-recorder-filter history-source-filter history-range-filter" onClick={() => setRequestedMoreOpen(!moreOpen)}
        className={cn(FILTER_BOX_CLASS, "filter-grid__more items-center justify-center gap-2 px-3 font-medium", focusClass)}>
        <SlidersHorizontal aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="truncate">{moreFiltersLabel}</span>
      </button>
      <HydratedForm role="search" className="filter-grid__wide filter-grid__search relative flex items-center" onSubmit={(event) => {
        event.preventDefault();
        update({ q: String(new FormData(event.currentTarget).get("q") ?? "").trim() });
      }}>
        <label className="sr-only" htmlFor="history-search">Search notes, system, tank, animal, or recorder (press Enter)</label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input key={params.q} id="history-search" name="q" type="search" defaultValue={params.q} placeholder="Search, then Enter" maxLength={100}
          className={cn(FILTER_BOX_CLASS, "pl-9 pr-3 placeholder:text-muted-foreground", focusClass)} />
      </HydratedForm>
      <div id="history-recorder-filter" className="filter-grid__secondary">
        <CompactSelect label="Recorded by" value={params.recorder === null ? "all" : String(params.recorder)}
          onChange={(value) => update({ recorder: value === "all" ? null : value })}
          options={[{ value: "all", label: "Anyone" }, ...h.recorders.map((recorder) => ({ value: String(recorder.id), label: recorder.name }))]} />
      </div>
      <div id="history-source-filter" className="filter-grid__secondary">
        <CompactSelect label="Data source" value={params.source ?? "all"}
          onChange={(value) => update({ source: DATA_SOURCES.find((source) => source === value) ?? null })}
          options={[{ value: "all", label: "Any source" }, ...DATA_SOURCES.map((value) => ({ value, label: SOURCE_LABELS[value] }))]} />
      </div>
      <div id="history-range-filter" className="filter-grid__secondary">
        <FilterToggle label="Out of range only" checked={params.outOfRange} onChange={(checked) => update({ oor: checked ? "1" : null })} />
      </div>
      <ExportButton h={h} />
    </div>
    {h.exportError && <p role="alert" className="text-sm text-red-500">Export failed: {h.exportError}</p>}
    {h.chips.length > 0 && <ul aria-label="Active filters" className="flex min-w-0 flex-wrap items-center gap-2">
        {h.chips.map((chip) => <li key={chip.id}>
          <button type="button" onClick={chip.clear} aria-label={`Remove filter ${chip.label}`} className={cn("touch-target inline-flex h-8 items-center gap-1.5 rounded-full bg-muted pl-3 pr-2 text-sm", focusClass)}>
            {chip.label}<X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </li>)}
        <li><button type="button" onClick={h.clearAll} className={cn("touch-target h-8 rounded-full px-2 text-sm text-muted-foreground underline-offset-4 hover:underline", focusClass)}>Clear all</button></li>
      </ul>}
  </div>;
}

export function RowsSkeleton() {
  return <div role="status" aria-label="Loading entries" className="space-y-2">
    {Array.from({ length: 8 }, (_, index) => <div key={index} className="h-11 animate-pulse rounded-xl bg-background/60" />)}
  </div>;
}

function Pager({ h }: { h: HistoryState }) {
  const page = Math.min(h.params.page, h.pages);
  const first = h.total === 0 ? 0 : (page - 1) * HISTORY_PAGE_SIZE + 1;
  const last = Math.min(page * HISTORY_PAGE_SIZE, h.total);
  const go = (next: number) => h.update({ page: next <= 1 ? null : String(next) });
  return <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
    <p className="text-muted-foreground tabular-nums">Showing {first.toLocaleString()}–{last.toLocaleString()} of {h.total.toLocaleString()}</p>
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1 || h.loading} onClick={() => go(page - 1)}><ChevronLeft aria-hidden="true" />Previous</Button>
      <span className="tabular-nums">Page {page} of {h.pages}</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= h.pages || h.loading} onClick={() => go(page + 1)}>Next<ChevronRight aria-hidden="true" /></Button>
    </div>
  </nav>;
}

function EntryCard({ row, h, columns }: { row: HistoryRow; h: HistoryState; columns: HistoryColumn[] }) {
  const shown = columns.filter((column) => !CARD_SKIPPED.has(column.key) && column.text(row));
  return <button type="button" onClick={() => h.setOpenKey(rowKey(row))} className={cn("block w-full space-y-2 rounded-2xl bg-background p-4 text-left", focusClass)}>
    <span className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">{formatHistoryTime(row.occurred_at)}</span><SourceBadge source={row.data_source} />
    </span>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {shown.map((column) => <div key={column.key} className="min-w-0">
        <dt className="text-muted-foreground">{column.label}</dt>
        <dd className={cn("truncate", column.flag?.(row) && OUT_OF_RANGE_TEXT)}>{column.text(row)}{column.flag?.(row) && <span className="sr-only"> (outside target)</span>}</dd>
      </div>)}
    </dl>
    {row.notes && <span className="line-clamp-2 block text-sm text-muted-foreground">{row.notes}</span>}
  </button>;
}

export function HistoryTable({ h }: { h: HistoryState }) {
  const { params, update, columns } = h;
  function sortBy(column: HistoryColumn) {
    const active = params.sort === column.key;
    update({ sort: column.key, dir: active ? (params.dir === "asc" ? "desc" : "asc") : column.key === "occurred_at" ? "desc" : "asc" });
  }
  return <Tile className="space-y-4 p-4 sm:p-6">
    {h.loading ? <RowsSkeleton /> : h.rows.length === 0 ? <EmptyNote>No entries match these filters. Try a wider date range or clear a filter.</EmptyNote> : <>
      <div className="history-results-container">
      <div className="history-results-table overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {columns.map((column) => {
                const active = params.sort === column.key;
                const Icon = !active ? ChevronsUpDown : params.dir === "asc" ? ArrowUp : ArrowDown;
                return <th key={column.key} scope="col" aria-sort={column.sortable ? (active ? (params.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
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
            {h.rows.map((row) => <tr key={rowKey(row)} onClick={() => h.setOpenKey(rowKey(row))} className="cursor-pointer even:bg-background/50 hover:bg-background">
              {columns.map((column) => {
                const value = column.text(row);
                const flagged = column.flag?.(row) ?? false;
                return <td key={column.key} className={cn("px-3 py-2.5", column.numeric ? "text-right tabular-nums" : "text-left", column.key === "notes" ? "max-w-64 truncate" : "whitespace-nowrap", flagged && OUT_OF_RANGE_TEXT)}>
                  {column.key === "occurred_at"
                    ? <button type="button" onClick={(event) => { event.stopPropagation(); h.setOpenKey(rowKey(row)); }} className={cn("rounded-md text-left font-medium underline-offset-4 hover:underline", focusClass)}>{value}</button>
                    : column.key === "data_source" ? <SourceBadge source={row.data_source} />
                      : value || <span aria-label="No value" className="text-muted-foreground">—</span>}
                  {flagged && <span className="sr-only"> (outside target)</span>}
                </td>;
              })}
            </tr>)}
          </tbody>
        </table>
      </div>
      <ul className="history-results-cards space-y-2">{h.rows.map((row) => <li key={rowKey(row)}><EntryCard row={row} h={h} columns={columns} /></li>)}</ul>
      </div>
    </>}
    <Pager h={h} />
  </Tile>;
}

type Photo = { path: string; url: string };

// Signed in the browser, and only once the sheet is open.
function RowPhotos({ id }: { id: number }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let ignore = false;
    (async () => {
      const supabase = createClient();
      const { data: attachments, error } = await supabase.from("attachments").select("storage_path").eq("parent_table", "health_observations").eq("parent_id", id);
      if (error) { if (!ignore) setFailed(true); return; }
      const paths = (attachments ?? []).map((attachment) => attachment.storage_path as string);
      if (paths.length === 0) { if (!ignore) setPhotos([]); return; }
      const { data: signed, error: signError } = await supabase.storage.from("attachments").createSignedUrls(paths, 3600);
      if (ignore) return;
      if (signError) { setFailed(true); return; }
      setPhotos(signed.flatMap((item) => (item.signedUrl && item.path ? [{ path: item.path, url: item.signedUrl }] : [])));
    })();
    return () => { ignore = true; };
  }, [id]);
  return <div className="mt-6 space-y-2">
    <h3 className="text-sm text-muted-foreground">Photos</h3>
    {failed ? <p role="alert" className="text-sm text-red-500">Photos could not be loaded.</p>
      : photos === null ? <div role="status" aria-label="Loading photos" className="size-28 animate-pulse rounded-2xl bg-muted" />
        : photos.length === 0 ? <p className="text-sm text-muted-foreground">No photos attached.</p>
          : <ul className="flex flex-wrap gap-3">{photos.map((photo, index) => <li key={photo.path}>
            <a href={photo.url} target="_blank" rel="noreferrer" aria-label={`Open photo ${index + 1}`} className={cn("block overflow-hidden rounded-2xl bg-muted", focusClass)}>
              {/* Signed private URLs are not in next/image's allowed remote patterns. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={`Health observation photo ${index + 1}`} className="size-28 object-cover" />
            </a>
          </li>)}</ul>}
  </div>;
}

export function RowDetail({ h }: { h: HistoryState }) {
  const row = h.openRow;
  if (!row) return null;
  const fields = detailFields(row);
  return <Sheet title={`${DATASET_LABELS[row.dataset]} · ${formatHistoryTime(row.occurred_at)}`} onClose={() => h.setOpenKey(null)}>
    {h.openRowStatus === "loading" && <p role="status" className="mb-4 text-sm text-muted-foreground">Loading details…</p>}
    {h.openRowStatus === "error" && <p role="alert" className="mb-4 text-sm text-red-500">Details could not be loaded. Filter by this dataset to see them.</p>}
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {fields.map((field) => <div key={field.label}>
        <dt className="text-sm text-muted-foreground">{field.label}</dt>
        <dd className={cn("text-lg", field.flag && OUT_OF_RANGE_TEXT)}>{field.value || "—"}{field.flag && <span className="sr-only"> (outside target)</span>}</dd>
      </div>)}
      <div><dt className="text-sm text-muted-foreground">Entered</dt><dd className="text-lg">{formatHistoryTime(row.entered_at)}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sm text-muted-foreground">Notes</dt><dd className="whitespace-pre-wrap text-lg">{row.notes || "—"}</dd></div>
    </dl>
    {row.dataset === "health_observation" && row.has_photo && <RowPhotos id={row.id} />}
  </Sheet>;
}
