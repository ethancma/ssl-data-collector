"use client";

import { useMemo } from "react";

import { EmptyNote, Segmented, Tile, focusClass } from "@/components/iseau/shared";
import { MultiLineChart, type ChartSeries } from "@/components/systems/charts";
import { addPacificCalendarDays, formatPacificDateTime } from "@/lib/pacific-date-time";
import { cn } from "@/lib/utils";
import { columnsForDataset } from "./logic";
import { DATASET_LABELS, type HistoryRow } from "./mock-rows";
import { useHistoryPreview, type HistoryPreview } from "./use-history-preview";
import { DesignSwitcher, FilterBar, HistoryHeader, HistoryTable, Pager, RowDetail, RowsSkeleton, SourceBadge } from "./ui";

function ActivityChart({ h }: { h: HistoryPreview }) {
  const { from, to } = h.bounds;
  const series = useMemo<ChartSeries[]>(() => {
    const all = new Map<string, number>();
    const water = new Map<string, number>();
    for (const row of h.rows) {
      all.set(row.occurred_on, (all.get(row.occurred_on) ?? 0) + 1);
      if (row.dataset === "water_quality") water.set(row.occurred_on, (water.get(row.occurred_on) ?? 0) + 1);
    }
    const days: string[] = [];
    for (let day = from; day <= to; day = addPacificCalendarDays(day, 1)) days.push(day);
    const points = (counts: Map<string, number>) => days.map((day) => ({ at: `${day}T12:00:00-07:00`, value: counts.get(day) ?? 0 }));
    return [
      { key: "all", label: "All entries", color: "#6366f1", points: points(all) },
      { key: "water", label: "Water tests", color: "#14b8a6", points: points(water) },
    ];
  }, [h.rows, from, to]);
  return <Tile className="space-y-3">
    <h2 className="text-xl font-semibold tracking-tight">Entries per day</h2>
    <MultiLineChart series={series} emptyMessage="No entries to chart." />
  </Tile>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-3xl bg-muted p-5">
    <dt className="text-sm text-muted-foreground">{label}</dt>
    <dd className="text-4xl font-semibold tracking-tight tabular-nums">{value}</dd>
  </div>;
}

function Entry({ row, h }: { row: HistoryRow; h: HistoryPreview }) {
  const place = [row.system_name, row.tank_name, row.animal_name].filter(Boolean).join(" · ");
  return <button type="button" onClick={() => h.update({ row: row.id })}
    className={cn("flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl px-3 py-2.5 text-left hover:bg-background", focusClass)}>
    <span className="w-16 shrink-0 text-sm tabular-nums text-muted-foreground">{formatPacificDateTime(row.occurred_at, { hour: "numeric", minute: "2-digit" })}</span>
    <span className="min-w-0 flex-1 basis-60">
      <span className="block font-medium">{DATASET_LABELS[row.dataset]}</span>
      <span className={cn("block", row.out_of_range?.length && "text-amber-600 dark:text-amber-400")}>{row.summary}</span>
      <span className="block text-sm text-muted-foreground">{[place, row.recorded_by_name ?? "Unknown"].filter(Boolean).join(" · ")}</span>
    </span>
    <SourceBadge source={row.data_source} />
  </button>;
}

function Timeline({ h }: { h: HistoryPreview }) {
  const days = useMemo(() => {
    const groups = new Map<string, HistoryRow[]>();
    for (const row of h.pageRows) groups.set(row.occurred_on, [...(groups.get(row.occurred_on) ?? []), row]);
    return [...groups];
  }, [h.pageRows]);
  if (h.loading) return <Tile><RowsSkeleton /></Tile>;
  if (days.length === 0) return <Tile><EmptyNote>No entries match these filters. Try a wider date range or clear a filter.</EmptyNote></Tile>;
  return <div className="space-y-3">
    {days.map(([day, rows]) => <section key={day} aria-label={day}>
      <Tile className="space-y-2 p-4 sm:p-6">
        <h2 className="px-3 text-xl font-semibold tracking-tight">
          {formatPacificDateTime(`${day}T12:00:00-07:00`, { weekday: "long", month: "long", day: "numeric" })}
          <span className="ml-3 text-sm font-normal text-muted-foreground">{rows.length} {rows.length === 1 ? "entry" : "entries"}</span>
        </h2>
        <ul>{rows.map((row) => <li key={row.id}><Entry row={row} h={h} /></li>)}</ul>
      </Tile>
    </section>)}
    <Pager h={h} />
  </div>;
}

// Design C: a stat strip and daily chart above entries grouped by Pacific day. A toggle switches to the table.
export default function DesignC() {
  const h = useHistoryPreview(columnsForDataset);
  const activeDays = new Set(h.rows.map((row) => row.occurred_on)).size;
  const days = Math.round((Date.parse(h.bounds.to) - Date.parse(h.bounds.from)) / 86_400_000) + 1;
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8">
    <DesignSwitcher current="c" />
    <HistoryHeader h={h} />
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Entries" value={h.rows.length.toLocaleString()} />
      <Stat label="Days with entries" value={`${activeDays} of ${days}`} />
      <Stat label="Water tests out of range" value={String(h.outOfRange)} />
      <Stat label="Health observations" value={h.rows.filter((row) => row.dataset === "health_observation").length.toLocaleString()} />
    </dl>
    <ActivityChart h={h} />
    <FilterBar h={h} dataset="select">
      <Segmented label="View" value={h.view} onChange={(view) => h.update(view === "table" ? { view } : { view: null, sort: null, dir: null })}
        options={[{ value: "timeline", label: "Timeline" }, { value: "table", label: "Table" }]} />
    </FilterBar>
    {h.view === "table" ? <HistoryTable h={h} columns={h.columns} /> : <Timeline h={h} />}
    <RowDetail h={h} />
  </div>;
}
