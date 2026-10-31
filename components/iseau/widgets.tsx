"use client";

import { FlaskConical, HeartPulse, Image as ImageIcon, Thermometer, Utensils, Waves, type LucideIcon } from "lucide-react";
import { useState } from "react";
import {
  ISSUE_LABELS,
  lastTemperature,
  recentWater,
  starData,
  targetFor,
  type IseauData,
  type Parameter,
  type Range,
  type Star,
  type TargetRange,
} from "@/lib/iseau/data";
import { cn } from "@/lib/utils";
import { WATER_QUALITY_PARAMS } from "@/lib/config/reference-data";
import { EmptyNote, Segmented, SeverityLabel, Sheet, dateLabel, focusClass } from "./shared";
import { severityTone } from "./severity-tone";

export type SectionId = "health" | "water" | "temperature" | "treatments" | "feeding";
export const SECTIONS: { id: SectionId; title: string; Icon: LucideIcon }[] = [
  { id: "health", title: "Health observations", Icon: HeartPulse },
  { id: "water", title: "Water quality", Icon: Waves },
  { id: "temperature", title: "System temperature", Icon: Thermometer },
  { id: "treatments", title: "Treatments", Icon: FlaskConical },
  { id: "feeding", title: "Feeding", Icon: Utensils },
];
type Props = { data: IseauData; star: Star; range: Range };

type Series = { label: string; points: { t: number; v: number }[] };
function LineChart({ series, start, end, band, unit, compact = false, marks = [], label }: {
  series: Series; start: number; end: number; band?: readonly [number, number]; unit: string; compact?: boolean;
  marks?: { t: number; severity: number }[]; label: string;
}) {
  if (!series.points.length) return compact ? <span className="block text-xs text-muted-foreground">No readings</span> : <EmptyNote>No readings in this range.</EmptyNote>;
  const height = compact ? 72 : 240;
  const left = compact ? 4 : 48;
  const right = 596;
  const top = compact ? 6 : 12;
  const bottom = height - (compact ? 6 : 28);
  const values = [...series.points.map((point) => point.v), ...(band ?? [])];
  const pad = ((Math.max(...values) - Math.min(...values)) || 1) * 0.15;
  const low = Math.min(...values) - pad;
  const high = Math.max(...values) + pad;
  const x = (time: number) => left + ((time - start) / (end - start)) * (right - left);
  const y = (value: number) => bottom - ((value - low) / (high - low)) * (bottom - top);
  const round = (value: number) => Number(value.toFixed(2));
  return <svg role="img" viewBox={`0 0 600 ${height}`} className="w-full" aria-label={`${label}: ${series.points.length} readings from ${dateLabel(start)} to ${dateLabel(end)}, latest ${round(series.points.at(-1)!.v)} ${unit}`.trim()}>
    {band && <rect x={left} y={y(band[1])} width={right - left} height={Math.max(y(band[0]) - y(band[1]), 0)} fill="hsl(var(--chart-2))" opacity={0.14} />}
    {!compact && marks.map((mark, index) => <line key={index} x1={x(mark.t)} x2={x(mark.t)} y1={top} y2={bottom} stroke="currentColor" strokeDasharray="3 4" strokeWidth={1.5} className={severityTone(mark.severity).text} />)}
    <polyline fill="none" stroke="hsl(var(--chart-3))" strokeWidth={compact ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
      points={series.points.map((point) => `${x(point.t)},${y(point.v)}`).join(" ")} />
    {(series.points.length <= (compact ? 6 : 20) ? series.points : series.points.slice(-1)).map((point, index) => <circle key={index} cx={x(point.t)} cy={y(point.v)} r={compact ? 4 : 4.5} fill="hsl(var(--chart-3))" />)}
    {!compact && <g className="text-xs text-muted-foreground" fill="currentColor">
      <text x={left - 8} y={y(Math.max(...series.points.map((point) => point.v))) + 4} textAnchor="end">{round(Math.max(...series.points.map((point) => point.v)))}</text>
      <text x={left - 8} y={y(Math.min(...series.points.map((point) => point.v))) + 4} textAnchor="end">{round(Math.min(...series.points.map((point) => point.v)))}</text>
      <text x={left} y={height - 6}>{dateLabel(start)}</text><text x={right} y={height - 6} textAnchor="end">{dateLabel(end)}</text>
    </g>}
  </svg>;
}

// Dots placed by time so gaps between records are visible at a glance.
type Tone = { bg: string; text: string };
const FEEDING: Tone = { bg: "bg-chart-2", text: "text-chart-2" };
const PARTIAL_FEEDING: Tone = { bg: "bg-chart-3", text: "text-chart-3" };
const TREATMENT: Tone = { bg: "bg-foreground", text: "text-foreground" };
function TimelineStrip({ items, start, end, label }: { items: { t: number; tone: Tone; hollow?: boolean }[]; start: number; end: number; label: string }) {
  return <span role="img" aria-label={label} className="relative block h-5 rounded-full bg-background/60">
    {items.map((item, index) => <span key={index} className={cn("absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full", item.hollow ? cn("border-2 border-current", item.tone.text) : item.tone.bg)} style={{ left: `${4 + ((item.t - start) / (end - start)) * 92}%` }} />)}
  </span>;
}

function bandNote(target: TargetRange | null, value: number) {
  if (!target) return null;
  return target.max !== null && value > target.max ? "above"
    : target.min !== null && value < target.min ? "below"
      : null;
}
function formatValue(parameter: Parameter, value: number | null) {
  if (value === null) return "No reading";
  const unit = WATER_QUALITY_PARAMS.find((entry) => entry.key === parameter)?.unit ?? null;
  return `${Number(value.toFixed(2))}${unit ? ` ${unit}` : ""}`;
}

function HealthBody({ star, range, data: appData }: Props) {
  const data = starData(star, range, appData);
  if (!data.health.length) return <EmptyNote>No health observations in this range.</EmptyNote>;
  return <ol className="divide-y divide-border">{data.health.map((entry) => <li key={entry.id} className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr]">
    <div className="space-y-1"><time dateTime={new Date(entry.at).toISOString()} className="block text-sm font-medium">{dateLabel(entry.at)}</time><p className="text-xs text-muted-foreground">{entry.place.tank} in {entry.place.system}</p></div>
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium"><SeverityLabel severity={entry.severity} /><span>{entry.issues.map((issue) => ISSUE_LABELS[issue]).join(", ")}</span></p>
      <p className="text-sm text-muted-foreground">{entry.notes}</p>
      <p className="text-xs text-muted-foreground">Recorded by {entry.by}</p>
      {entry.photo && <div className="flex items-center gap-1 text-xs text-muted-foreground"><ImageIcon aria-hidden="true" className="h-4 w-4" />Photo attached</div>}
    </div>
  </li>)}</ol>;
}

function WaterBody({ star, range, data: appData }: Props) {
  const [parameter, setParameter] = useState<Parameter>("ph");
  // Readings are weekly, so a short range would leave the chart nearly empty.
  const data = starData(star, range < 30 ? 30 : range, appData);
  const readings = data.water.filter((entry) => entry.values[parameter] !== null);
  const latest = readings.at(-1);
  if (!latest) return <EmptyNote>No {WATER_QUALITY_PARAMS.find((entry) => entry.key === parameter)?.label ?? parameter} readings in this range.</EmptyNote>;
  const config = WATER_QUALITY_PARAMS.find((entry) => entry.key === parameter)!;
  const latestValue = latest.values[parameter];
  if (latestValue === null) return <EmptyNote>No readings for this parameter in this range.</EmptyNote>;
  const target = targetFor(latest.systemId, parameter, appData);
  const note = bandNote(target, latestValue);
  const hasSameTarget = readings.every((entry) => {
    const entryTarget = targetFor(entry.systemId, parameter, appData);
    return entryTarget?.min === target?.min && entryTarget?.max === target?.max;
  });
  const chartBand = hasSameTarget && target?.min !== null && target?.min !== undefined && target.max !== null
    ? [target.min, target.max] as const
    : undefined;
  const targetDescription = target
    ? `Target ${target.min ?? "—"} to ${target.max ?? "—"}${config.unit ? ` ${config.unit}` : ""}`
    : "No target configured";
  return <div className="space-y-6">
    <Segmented label="Water parameter" value={parameter} onChange={setParameter} options={WATER_QUALITY_PARAMS.map((param) => ({ value: param.key, label: param.label }))} />
    <div><p className="text-5xl font-semibold tabular-nums tracking-tight">{formatValue(parameter, latestValue)}</p>
      <p className="mt-1 text-sm text-muted-foreground">{config.label} in {latest.system} on {dateLabel(latest.at)}{note ? `, ${note} configured target` : target ? ", within configured bounds" : ", no target configured"}. {targetDescription}.</p></div>
    <LineChart label={config.label} unit={config.unit ?? ""} start={data.start} end={data.end} band={chartBand}
      series={{ label: config.label, points: readings.map((entry) => ({ t: entry.at, v: entry.values[parameter]! })) }} />
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{WATER_QUALITY_PARAMS.map(({ key, label }) => {
      const latestForParameter = [...data.water].reverse().find((entry) => entry.values[key] !== null);
      const value = latestForParameter?.values[key] ?? null;
      const targetForValue = latestForParameter ? targetFor(latestForParameter.systemId, key, appData) : null;
      const flag = value === null ? null : bandNote(targetForValue, value);
      return <div key={key}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-sm font-medium tabular-nums">{formatValue(key, value)}{flag && <span className="ml-2 text-xs font-medium text-foreground">{flag} target</span>}</dd></div>;
    })}</dl>
    {readings.some((entry) => {
      const entryTarget = targetFor(entry.systemId, parameter, appData);
      return entryTarget?.min !== target?.min || entryTarget?.max !== target?.max;
    }) && <p className="text-xs text-muted-foreground">The chart spans systems with different target ranges, so no single target band is shown.</p>}
  </div>;
}

function TemperatureBody({ star, range, data: appData }: Props) {
  const data = starData(star, range, appData);
  const latest = data.temperatures.at(-1);
  if (!latest) return <EmptyNote>No system temperature readings in this range.</EmptyNote>;
  return <div className="space-y-6">
    <div><p className="text-5xl font-semibold tabular-nums tracking-tight">{latest.celsius.toFixed(1)} °C</p>
      <p className="mt-1 text-sm text-muted-foreground">{latest.system}, last AM check {dateLabel(latest.at)}. Recorded by {latest.by}.</p></div>
    <LineChart label="System temperature" unit="°C" start={data.start} end={data.end} marks={data.health.map((entry) => ({ t: entry.at, severity: entry.severity }))}
      series={{ label: "Temperature", points: data.temperatures.map((entry) => ({ t: entry.at, v: entry.celsius })) }} />
    <p className="text-xs text-muted-foreground">Dashed lines mark health observations. Temperature comes from the AM check of the system the star was in.</p>
  </div>;
}

function TreatmentsBody({ star, range, data: appData }: Props) {
  const data = starData(star, range, appData);
  if (!appData.treatmentsAvailable) return <EmptyNote>Treatment history is not available for your role.</EmptyNote>;
  if (!data.treatments.length) return <EmptyNote>No treatments in this range.</EmptyNote>;
  return <ol className="divide-y divide-border">{data.treatments.map((entry) => <li key={entry.id} className="grid gap-1 py-5 sm:grid-cols-[9rem_1fr]">
    <time dateTime={new Date(entry.at).toISOString()} className="text-sm font-medium">{dateLabel(entry.at, true)}</time>
    <div>
      <p className="text-sm font-medium">{entry.type}</p>
      <p className="text-sm text-muted-foreground">
        {[
          entry.amount === null ? "" : `${entry.amount} ${entry.amountUnit}`,
          entry.concentration === null ? "" : `${entry.concentration} ${entry.concentrationUnit}`,
        ].filter(Boolean).join(" at ") || "No quantity recorded"}.
        {" "}{entry.place.tank} in {entry.place.system}. Recorded by {entry.by}.
      </p>
      {entry.notes && <p className="mt-1 text-sm text-muted-foreground">{entry.notes}</p>}
    </div>
  </li>)}</ol>;
}

const CONSUMPTION_LABELS = {
  full: "Full",
  partial: "Partial",
  none: "None",
  unknown: "Unknown",
} as const;

function FeedingBody({ star, range, data: appData }: Props) {
  const data = starData(star, range, appData);
  if (!data.feedings.length) return <EmptyNote>No feedings in this range.</EmptyNote>;
  const full = data.feedings.filter((entry) => entry.status === "full").length;
  return <div className="space-y-6">
    <div><p className="text-5xl font-semibold tabular-nums tracking-tight">{full} of {data.feedings.length}</p><p className="mt-1 text-sm text-muted-foreground">feedings with full consumption.</p></div>
    <FeedingStrip star={star} range={range} data={appData} />
    <ol className="divide-y divide-border">{data.feedings.map((entry) => <li key={entry.id} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr]">
      <time dateTime={new Date(entry.at).toISOString()} className="text-sm font-medium">{dateLabel(entry.at)}</time>
      <div className="text-sm text-muted-foreground">
        <p><span className="font-medium text-foreground">{entry.food}{entry.amount === null ? "" : `, ${entry.amount}${entry.unit ? ` ${entry.unit}` : ""}`}. Consumption: {CONSUMPTION_LABELS[entry.status]}.</span> {entry.place.tank} in {entry.place.system}. Recorded by {entry.by}.</p>
        {entry.notes && <p className="mt-1">{entry.notes}</p>}
      </div>
    </li>)}</ol>
  </div>;
}

function FeedingStrip({ star, range, data: appData }: Props) {
  const data = starData(star, range, appData);
  const counts = Object.fromEntries(
    (Object.keys(CONSUMPTION_LABELS) as (keyof typeof CONSUMPTION_LABELS)[])
      .map((status) => [status, data.feedings.filter((entry) => entry.status === status).length]),
  ) as Record<keyof typeof CONSUMPTION_LABELS, number>;
  const label = Object.entries(counts).map(([status, count]) => `${count} ${status}`).join(", ");
  return <TimelineStrip start={data.start} end={data.end} label={`Feedings: ${label}`}
    items={data.feedings.map((entry) => ({
      t: entry.at,
      hollow: entry.status === "none" || entry.status === "unknown",
      tone: entry.status === "partial" ? PARTIAL_FEEDING : entry.status === "unknown" ? { bg: "", text: "text-muted-foreground" } : FEEDING,
    }))} />;
}

function SectionBody({ id, ...props }: Props & { id: SectionId }) {
  switch (id) {
    case "health": return <HealthBody {...props} />;
    case "water": return <WaterBody {...props} />;
    case "temperature": return <TemperatureBody {...props} />;
    case "treatments": return <TreatmentsBody {...props} />;
    case "feeding": return <FeedingBody {...props} />;
  }
}

function sectionSummary(id: SectionId, star: Star, range: Range, appData: IseauData): { value: string; caption: string } {
  const data = starData(star, range, appData);
  switch (id) {
    case "health": {
      const latest = data.health[0];
      return latest ? { value: severityTone(latest.severity).label, caption: `${data.health.length} observation${data.health.length === 1 ? "" : "s"}, latest ${dateLabel(latest.at)}` }
        : { value: "None", caption: "No observations in this range" };
    }
    case "water": {
      const recent = recentWater(star, appData.water.length, appData);
      const latest = [...recent].reverse().find((entry) => entry.values.ph !== null);
      if (!latest) return { value: "No data", caption: "No readings in this range" };
      const values = WATER_QUALITY_PARAMS.flatMap(({ key }) => {
        const entry = [...recent].reverse().find((reading) => reading.values[key] !== null);
        if (!entry || entry.values[key] === null) return [];
        return [{ entry, key, value: entry.values[key]! }];
      });
      const configured = values.filter(({ entry, key }) => targetFor(entry.systemId, key, appData) !== null);
      const outside = configured.filter(({ entry, key, value }) => bandNote(targetFor(entry.systemId, key, appData), value)).length;
      const caption = configured.length
        ? `${outside} of ${configured.length} parameters outside configured targets, ${dateLabel(latest.at)}`
        : `No target ranges configured, ${dateLabel(latest.at)}`;
      return { value: `pH ${latest.values.ph!.toFixed(2)}`, caption };
    }
    case "temperature": {
      const latest = lastTemperature(star, appData);
      return latest
        ? { value: `${latest.celsius.toFixed(1)} °C`, caption: `${latest.system}, AM check ${dateLabel(latest.at)}` }
        : { value: "No data", caption: "No AM temperature readings" };
    }
    case "treatments": {
      if (!appData.treatmentsAvailable) return { value: "Unavailable", caption: "Treatment history is not available for your role" };
      const latest = data.treatments[0];
      return latest ? { value: String(data.treatments.length), caption: `Latest: ${latest.type}, ${dateLabel(latest.at)}` } : { value: "None", caption: "No treatments in this range" };
    }
    case "feeding": {
      const full = data.feedings.filter((entry) => entry.status === "full").length;
      return data.feedings.length ? { value: `${full} full`, caption: `${data.feedings.length} feeding records in this range` } : { value: "None", caption: "No feedings in this range" };
    }
  }
}

function SectionPreview({ id, star, range, data: appData }: Props & { id: SectionId }) {
  const data = starData(star, range, appData);
  switch (id) {
    case "health": return <TimelineStrip start={data.start} end={data.end} label={`${data.health.length} health observations`}
      items={data.health.map((entry) => ({ t: entry.at, tone: severityTone(entry.severity) }))} />;
    case "water": {
      const recent = recentWater(star, 4, appData).filter((entry) => entry.values.ph !== null);
      const first = recent[0]?.at ?? 0;
      const latest = recent.at(-1);
      const target = latest ? targetFor(latest.systemId, "ph", appData) : null;
      const sameTarget = recent.every((entry) => {
        const entryTarget = targetFor(entry.systemId, "ph", appData);
        return entryTarget?.min === target?.min && entryTarget?.max === target?.max;
      });
      const band = sameTarget && target?.min !== null && target?.min !== undefined && target.max !== null
        ? [target.min, target.max] as const
        : undefined;
      return <LineChart compact label="Recent pH readings" unit="" start={first} end={Math.max(recent.at(-1)?.at ?? 1, first + 1)} band={band}
        series={{ label: "pH", points: recent.map((entry) => ({ t: entry.at, v: entry.values.ph! })) }} />;
    }
    case "temperature": return <LineChart compact label="System temperature" unit="°C" start={data.start} end={data.end}
      series={{ label: "Temperature", points: data.temperatures.map((entry) => ({ t: entry.at, v: entry.celsius })) }} />;
    case "treatments": return !appData.treatmentsAvailable
      ? <span className="text-xs text-muted-foreground">Unavailable for this role</span>
      : <TimelineStrip start={data.start} end={data.end} label={`${data.treatments.length} treatments`}
      items={data.treatments.map((entry) => ({ t: entry.at, tone: TREATMENT }))} />;
    case "feeding": return <FeedingStrip star={star} range={range} data={appData} />;
  }
}

export function SectionBox({ id, star, range, data, onOpen, className }: Props & { id: SectionId; onOpen: () => void; className?: string }) {
  const { title, Icon } = SECTIONS.find((section) => section.id === id)!;
  const summary = sectionSummary(id, star, range, data);
  return <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={`${title} for ${star.name}: ${summary.value}, ${summary.caption}. Open history.`}
    className={cn("flex h-full min-h-64 w-full flex-col justify-between gap-6 rounded-3xl bg-muted p-6 text-left transition-colors hover:bg-accent", focusClass, className)}>
    <span className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />{title}</span>
    <span className="block"><span className="block text-4xl font-semibold tabular-nums tracking-tight">{summary.value}</span><span className="mt-1 block text-sm text-muted-foreground">{summary.caption}</span></span>
    <span className="block"><SectionPreview id={id} data={data} star={star} range={range} /></span>
  </button>;
}

const BENTO_SPAN: Record<SectionId, string> = {
  health: "lg:col-span-4", water: "lg:col-span-2", temperature: "lg:col-span-2", treatments: "lg:col-span-2", feeding: "lg:col-span-2",
};
export function SectionBoxes({ star, range, data, onOpen }: Props & { onOpen: (id: SectionId) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
    {SECTIONS.map(({ id }) => <SectionBox key={id} data={data} id={id} star={star} range={range} onOpen={() => onOpen(id)} className={BENTO_SPAN[id]} />)}
  </div>;
}

export function SectionSheet({ id, star, range, data, onClose }: Props & { id: SectionId; onClose: () => void }) {
  const { title } = SECTIONS.find((section) => section.id === id)!;
  return <Sheet title={`${star.name}: ${title}`} onClose={onClose}><SectionBody id={id} data={data} star={star} range={range} /></Sheet>;
}
