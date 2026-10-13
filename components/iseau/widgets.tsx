"use client";

import { FlaskConical, HeartPulse, Image as ImageIcon, Thermometer, Utensils, Waves, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ISSUE_LABELS, PARAMETERS, lastTemperature, recentWater, starData, type Parameter, type Range, type Severity, type Star } from "./mock-data";
import { EmptyNote, SEVERITY, Segmented, SeverityLabel, Sheet, dateLabel, focusClass } from "./shared";

export type SectionId = "health" | "water" | "temperature" | "treatments" | "feeding";
export const SECTIONS: { id: SectionId; title: string; Icon: LucideIcon }[] = [
  { id: "health", title: "Health observations", Icon: HeartPulse },
  { id: "water", title: "Water quality", Icon: Waves },
  { id: "temperature", title: "System temperature", Icon: Thermometer },
  { id: "treatments", title: "Treatments", Icon: FlaskConical },
  { id: "feeding", title: "Feeding", Icon: Utensils },
];
type Props = { star: Star; range: Range };

type Series = { label: string; points: { t: number; v: number }[] };
function LineChart({ series, start, end, band, unit, compact = false, marks = [], label }: {
  series: Series; start: number; end: number; band?: readonly [number, number]; unit: string; compact?: boolean;
  marks?: { t: number; severity: Severity }[]; label: string;
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
    {!compact && marks.map((mark) => <line key={mark.t} x1={x(mark.t)} x2={x(mark.t)} y1={top} y2={bottom} stroke="currentColor" strokeDasharray="3 4" strokeWidth={1.5} className={SEVERITY[mark.severity].text} />)}
    <polyline fill="none" stroke="hsl(var(--chart-3))" strokeWidth={compact ? 2 : 2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
      points={series.points.map((point) => `${x(point.t)},${y(point.v)}`).join(" ")} />
    {(series.points.length <= (compact ? 6 : 20) ? series.points : series.points.slice(-1)).map((point) => <circle key={point.t} cx={x(point.t)} cy={y(point.v)} r={compact ? 4 : 4.5} fill="hsl(var(--chart-3))" />)}
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
const TREATMENT: Tone = { bg: "bg-foreground", text: "text-foreground" };
function TimelineStrip({ items, start, end, label }: { items: { t: number; tone: Tone; hollow?: boolean }[]; start: number; end: number; label: string }) {
  return <span role="img" aria-label={label} className="relative block h-5 rounded-full bg-background/60">
    {items.map((item) => <span key={item.t} className={cn("absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full", item.hollow ? cn("border-2 border-current", item.tone.text) : item.tone.bg)} style={{ left: `${4 + ((item.t - start) / (end - start)) * 92}%` }} />)}
  </span>;
}

function bandNote(parameter: Parameter, value: number) {
  const [low, high] = PARAMETERS[parameter].band;
  return value > high ? "above" : value < low ? "below" : null;
}
function formatValue(parameter: Parameter, value: number) {
  const { unit } = PARAMETERS[parameter];
  return `${Number(value.toFixed(2))}${unit ? ` ${unit}` : ""}`;
}

function HealthBody({ star, range }: Props) {
  const data = starData(star, range);
  if (!data.health.length) return <EmptyNote>No health observations in this range.</EmptyNote>;
  return <ol className="divide-y divide-border">{data.health.map((entry) => <li key={entry.id} className="grid gap-2 py-5 sm:grid-cols-[9rem_1fr]">
    <div className="space-y-1"><time dateTime={new Date(entry.at).toISOString()} className="block text-sm font-medium">{dateLabel(entry.at)}</time><p className="text-xs text-muted-foreground">{entry.tank} in {entry.system}</p></div>
    <div className="space-y-2">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium"><SeverityLabel severity={entry.severity} /><span>{entry.issues.map((issue) => ISSUE_LABELS[issue]).join(", ")}</span></p>
      <p className="text-sm text-muted-foreground">{entry.notes}</p>
      <p className="text-xs text-muted-foreground">Recorded by {entry.by}</p>
      {entry.photo && <div role="img" aria-label={`Sample photo placeholder for ${dateLabel(entry.at)}`} className="flex h-16 w-24 items-center justify-center gap-1 rounded-xl border border-dashed border-border text-xs text-muted-foreground"><ImageIcon aria-hidden="true" className="h-4 w-4" />Photo</div>}
    </div>
  </li>)}</ol>;
}

function WaterBody({ star, range }: Props) {
  const [parameter, setParameter] = useState<Parameter>("ph");
  // Readings are weekly, so a short range would leave the chart nearly empty.
  const data = starData(star, range < 30 ? 30 : range);
  if (!data.water.length) return <EmptyNote>No water readings in this range.</EmptyNote>;
  const latest = data.water.at(-1)!;
  const config = PARAMETERS[parameter];
  const note = bandNote(parameter, latest.values[parameter]);
  return <div className="space-y-6">
    <Segmented label="Water parameter" value={parameter} onChange={setParameter} options={(Object.keys(PARAMETERS) as Parameter[]).map((key) => ({ value: key, label: PARAMETERS[key].label }))} />
    <div><p className="text-5xl font-semibold tabular-nums tracking-tight">{formatValue(parameter, latest.values[parameter])}</p>
      <p className="mt-1 text-sm text-muted-foreground">{config.label} in {latest.system} on {dateLabel(latest.at)}{note ? `, ${note} the sample band` : ", inside the sample band"}</p></div>
    <LineChart label={config.label} unit={config.unit} start={data.start} end={data.end} band={config.band}
      series={{ label: config.label, points: data.water.map((entry) => ({ t: entry.at, v: entry.values[parameter] })) }} />
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">{(Object.keys(PARAMETERS) as Parameter[]).map((key) => {
      const flag = bandNote(key, latest.values[key]);
      return <div key={key}><dt className="text-xs text-muted-foreground">{PARAMETERS[key].label}</dt><dd className="text-sm font-medium tabular-nums">{formatValue(key, latest.values[key])}{flag && <span className="ml-2 text-xs font-medium text-foreground">{flag} band</span>}</dd></div>;
    })}</dl>
    <p className="text-xs text-muted-foreground">Weekly manual readings, so at least 30 days are shown. Bands are sample values, not guidance.</p>
  </div>;
}

function TemperatureBody({ star, range }: Props) {
  const data = starData(star, range);
  const latest = lastTemperature(star);
  return <div className="space-y-6">
    <div><p className="text-5xl font-semibold tabular-nums tracking-tight">{latest.celsius.toFixed(1)} °C</p>
      <p className="mt-1 text-sm text-muted-foreground">{latest.system}, last AM check {dateLabel(latest.at)}</p></div>
    <LineChart label="System temperature" unit="°C" start={data.start} end={data.end} marks={data.health.map((entry) => ({ t: entry.at, severity: entry.severity }))}
      series={{ label: "Temperature", points: data.temperatures.map((entry) => ({ t: entry.at, v: entry.celsius })) }} />
    <p className="text-xs text-muted-foreground">Dashed lines mark health observations. Temperature comes from the AM check of the system the star was in.</p>
  </div>;
}

function TreatmentsBody({ star, range }: Props) {
  const data = starData(star, range);
  if (!data.treatments.length) return <EmptyNote>No treatments in this range.</EmptyNote>;
  return <ol className="divide-y divide-border">{data.treatments.map((entry) => <li key={entry.id} className="grid gap-1 py-5 sm:grid-cols-[9rem_1fr]">
    <time dateTime={new Date(entry.at).toISOString()} className="text-sm font-medium">{dateLabel(entry.at, true)}</time>
    <div><p className="text-sm font-medium">{entry.type}</p><p className="text-sm text-muted-foreground">{entry.amount} {entry.amountUnit} at {entry.concentration} {entry.concentrationUnit}. Recorded by {entry.by}.</p></div>
  </li>)}</ol>;
}

function FeedingBody({ star, range }: Props) {
  const data = starData(star, range);
  if (!data.feedings.length) return <EmptyNote>No feedings in this range.</EmptyNote>;
  const eaten = data.feedings.filter((entry) => entry.eaten).length;
  return <div className="space-y-6">
    <div><p className="text-5xl font-semibold tabular-nums tracking-tight">{eaten} of {data.feedings.length}</p><p className="mt-1 text-sm text-muted-foreground">feedings eaten. Filled dots were eaten, rings were not.</p></div>
    <FeedingStrip star={star} range={range} />
    <ol className="divide-y divide-border">{data.feedings.map((entry) => <li key={entry.id} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr]">
      <time dateTime={new Date(entry.at).toISOString()} className="text-sm font-medium">{dateLabel(entry.at)}</time>
      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{entry.food}, {entry.grams} g.</span> {entry.eaten ? "Eaten" : "Not eaten"}; follow-up by {entry.followUpBy}.</p>
    </li>)}</ol>
  </div>;
}

function FeedingStrip({ star, range }: Props) {
  const data = starData(star, range);
  return <TimelineStrip start={data.start} end={data.end} label={`${data.feedings.filter((entry) => entry.eaten).length} of ${data.feedings.length} feedings eaten`}
    items={data.feedings.map((entry) => ({ t: entry.at, hollow: !entry.eaten, tone: FEEDING }))} />;
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

function sectionSummary(id: SectionId, star: Star, range: Range): { value: string; caption: string } {
  const data = starData(star, range);
  switch (id) {
    case "health": {
      const latest = data.health[0];
      return latest ? { value: SEVERITY[latest.severity].label, caption: `${data.health.length} observation${data.health.length === 1 ? "" : "s"}, latest ${dateLabel(latest.at)}` }
        : { value: "None", caption: "No observations in this range" };
    }
    case "water": {
      const latest = recentWater(star, 1).at(-1);
      if (!latest) return { value: "No data", caption: "No readings in this range" };
      const outside = (Object.keys(PARAMETERS) as Parameter[]).filter((key) => bandNote(key, latest.values[key])).length;
      return { value: `pH ${latest.values.ph.toFixed(2)}`, caption: `${outside} of ${Object.keys(PARAMETERS).length} outside the sample band, ${dateLabel(latest.at)}` };
    }
    case "temperature": {
      const latest = lastTemperature(star);
      return { value: `${latest.celsius.toFixed(1)} °C`, caption: `${latest.system}, AM check ${dateLabel(latest.at)}` };
    }
    case "treatments": {
      const latest = data.treatments[0];
      return latest ? { value: String(data.treatments.length), caption: `Latest: ${latest.type}, ${dateLabel(latest.at)}` } : { value: "None", caption: "No treatments in this range" };
    }
    case "feeding": {
      const eaten = data.feedings.filter((entry) => entry.eaten).length;
      return data.feedings.length ? { value: `${eaten} of ${data.feedings.length}`, caption: "feedings eaten" } : { value: "None", caption: "No feedings in this range" };
    }
  }
}

function SectionPreview({ id, star, range }: Props & { id: SectionId }) {
  const data = starData(star, range);
  switch (id) {
    case "health": return <TimelineStrip start={data.start} end={data.end} label={`${data.health.length} health observations`}
      items={data.health.map((entry) => ({ t: entry.at, tone: SEVERITY[entry.severity] }))} />;
    case "water": {
      const recent = recentWater(star, 4);
      const first = recent[0]?.at ?? 0;
      return <LineChart compact label="Last weekly pH readings" unit="" start={first} end={Math.max(recent.at(-1)?.at ?? 1, first + 1)} band={PARAMETERS.ph.band}
        series={{ label: "pH", points: recent.map((entry) => ({ t: entry.at, v: entry.values.ph })) }} />;
    }
    case "temperature": return <LineChart compact label="System temperature" unit="°C" start={data.start} end={data.end}
      series={{ label: "Temperature", points: data.temperatures.map((entry) => ({ t: entry.at, v: entry.celsius })) }} />;
    case "treatments": return <TimelineStrip start={data.start} end={data.end} label={`${data.treatments.length} treatments`}
      items={data.treatments.map((entry) => ({ t: entry.at, tone: TREATMENT }))} />;
    case "feeding": return <FeedingStrip star={star} range={range} />;
  }
}

export function SectionBox({ id, star, range, onOpen, className }: Props & { id: SectionId; onOpen: () => void; className?: string }) {
  const { title, Icon } = SECTIONS.find((section) => section.id === id)!;
  const summary = sectionSummary(id, star, range);
  return <button type="button" onClick={onOpen} aria-haspopup="dialog" aria-label={`${title} for ${star.name}: ${summary.value}, ${summary.caption}. Open history.`}
    className={cn("flex h-full min-h-64 w-full flex-col justify-between gap-6 rounded-3xl bg-muted p-6 text-left transition-colors hover:bg-accent", focusClass, className)}>
    <span className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />{title}</span>
    <span className="block"><span className="block text-4xl font-semibold tabular-nums tracking-tight">{summary.value}</span><span className="mt-1 block text-sm text-muted-foreground">{summary.caption}</span></span>
    <span className="block"><SectionPreview id={id} star={star} range={range} /></span>
  </button>;
}

const BENTO_SPAN: Record<SectionId, string> = {
  health: "lg:col-span-4", water: "lg:col-span-2", temperature: "lg:col-span-2", treatments: "lg:col-span-2", feeding: "lg:col-span-2",
};
export function SectionBoxes({ star, range, onOpen }: Props & { onOpen: (id: SectionId) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
    {SECTIONS.map(({ id }) => <SectionBox key={id} id={id} star={star} range={range} onOpen={() => onOpen(id)} className={BENTO_SPAN[id]} />)}
  </div>;
}

export function SectionSheet({ id, star, range, onClose }: Props & { id: SectionId; onClose: () => void }) {
  const { title } = SECTIONS.find((section) => section.id === id)!;
  return <Sheet title={`${star.name}: ${title}`} onClose={onClose}><SectionBody id={id} star={star} range={range} /></Sheet>;
}
