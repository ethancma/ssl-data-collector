"use client";

import { useState } from "react";

import { Tile, focusClass } from "@/components/iseau/shared";
import { ALL_WATER_QUALITY_PARAMS, WATER_QUALITY_LABELS } from "@/components/systems/chart-data";
import type { SystemDetailData } from "@/components/systems/types";
import { WATER_QUALITY_PARAMS } from "@/lib/config/reference-data";
import type { ActivityKind } from "@/lib/systems/activity";
import { getPacificDateTimeParts } from "@/lib/pacific-date-time";
import { cn } from "@/lib/utils";

const DAY = 86_400_000;
const W = 640, LEFT = 88, RIGHT = 12, TOP = 12, PLOT_H = 200, LANE_H = 24;
const LANES: { kind: ActivityKind; label: string; color: string }[] = [
  { kind: "feeding", label: "Feeding", color: "text-foreground" },
  { kind: "probiotic", label: "Probiotics", color: "text-teal-500" },
  { kind: "treatment", label: "Treatments", color: "text-violet-500" },
  { kind: "chemical", label: "Chemicals", color: "text-amber-500" },
  { kind: "maintenance", label: "Maintenance", color: "text-sky-500" },
];

type MetricKey = "temperature" | (typeof ALL_WATER_QUALITY_PARAMS)[number];
type Point = { t: number; v: number };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Built by hand: Intl output differs between Node and browsers and breaks hydration.
const shortDate = (time: number) => {
  const [, month, day] = getPacificDateTimeParts(new Date(time)).date.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
};
const shortDateTime = (time: number) => {
  const [hour, minute] = getPacificDateTimeParts(new Date(time)).time.split(":").map(Number);
  return `${shortDate(time)}, ${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};

function Marker({ kind, cx, cy, title }: { kind: ActivityKind; cx: number; cy: number; title: string }) {
  const color = LANES.find((lane) => lane.kind === kind)!.color;
  const shape = kind === "feeding" ? <circle cx={cx} cy={cy} r={3.5} />
    : kind === "probiotic" ? <polygon points={`${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`} />
    : kind === "treatment" ? <circle cx={cx} cy={cy} r={3.5} fill="none" stroke="currentColor" strokeWidth={2} />
    : kind === "chemical" ? <polygon points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`} />
    : <rect x={cx - 4} y={cy - 4} width={8} height={8} />;
  return <g className={color} fill="currentColor"><title>{title}</title>{shape}</g>;
}

// One water parameter (or temperature) over 30 days with a lane per activity on the same time axis,
// so a dose and the chemistry that follows read together.
export function WaterActivityCard({ data }: { data: SystemDetailData }) {
  const end = Date.parse(data.generatedAt);
  const start = end - 30 * DAY;
  const x = (t: number) => LEFT + ((t - start) / (end - start)) * (W - LEFT - RIGHT);

  const pointsFor = (key: MetricKey): Point[] => key === "temperature"
    ? data.dailyChecks.filter((c) => c.temperature !== null).map((c) => ({ t: Date.parse(c.checkedAt), v: c.temperature as number }))
    : data.waterQuality.filter((w) => w[key] !== null).map((w) => ({ t: Date.parse(w.testedAt), v: w[key] as number }));
  const inWindow = (points: Point[]) => points.filter((p) => p.t >= start && p.t <= end);

  const metrics: { key: MetricKey; label: string; unit: string }[] = [
    ...WATER_QUALITY_PARAMS.filter((p) => inWindow(pointsFor(p.key)).length > 0).map((p) => ({ key: p.key as MetricKey, label: p.label, unit: p.unit ?? "" })),
    ...(inWindow(pointsFor("temperature")).length > 0 ? [{ key: "temperature" as MetricKey, label: "Temperature", unit: "°C" }] : []),
  ];
  const flagged = data.snapshot.water.readings.find((r) => r.outOfRange && metrics.some((m) => m.key === r.key))?.key;
  const [chosen, setChosen] = useState<MetricKey | null>(null);
  const key = chosen ?? flagged ?? (metrics.find((m) => m.key === "ph") ?? metrics[0])?.key ?? "ph";
  const metric = metrics.find((m) => m.key === key);

  const points = inWindow(pointsFor(key)).sort((a, b) => a.t - b.t);
  const band = key === "temperature" ? null : data.snapshot.water.readings.find((r) => r.key === key)?.target ?? null;
  const values = [...points.map((p) => p.v), ...(band ? [band.min, band.max].filter((v): v is number => v !== null) : [])];
  const lo = values.length ? Math.min(...values) : 0, hi = values.length ? Math.max(...values) : 1, pad = (hi - lo || 1) * 0.15;
  const yLo = lo - pad, yHi = hi + pad;
  const y = (v: number) => TOP + PLOT_H - ((v - yLo) / (yHi - yLo)) * PLOT_H;
  const lanesTop = TOP + PLOT_H + 20;
  const height = lanesTop + LANES.length * LANE_H + 28;
  const latest = points.at(-1);
  const ticks = [lo, lo + (hi - lo) / 2, hi];
  const events = data.activity.filter((event) => Date.parse(event.at) >= start);
  const label = key === "temperature" ? "Temperature" : WATER_QUALITY_LABELS[key];

  const { testsInRange, temperature } = data.kpis;
  const kpis = [
    testsInRange.judged
      ? { label: "Tests in range", value: `${testsInRange.inRange} of ${testsInRange.judged}`, note: "water tests, 30 days" }
      : { label: "Tests in range", value: "\u2014", note: "No targets set" },
    temperature
      ? { label: "Temperature swing", value: `${(temperature.max - temperature.min).toFixed(1)} \u00b0C`, note: `${temperature.min.toFixed(1)} to ${temperature.max.toFixed(1)} \u00b0C, 30 days` }
      : { label: "Temperature swing", value: "\u2014", note: "No checks in 30 days" },
    { label: "Last water test", value: data.snapshot.water.testedAgo ?? "\u2014", note: data.snapshot.water.testedAgo ? "Tested weekly" : "No test yet" },
  ];

  return <Tile className="flex min-w-0 flex-col gap-6">
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Water and activity</h2>
        <p className="text-sm text-muted-foreground">
          {latest ? `${label} was ${Number(latest.v.toFixed(2))}${metric?.unit ? ` ${metric.unit}` : ""} on ${shortDate(latest.t)}. ` : `No ${label.toLowerCase()} readings in the last 30 days. `}
          Markers show what was done to the system.
        </p>
      </div>
      <div role="group" aria-label="Activity chart parameter" className="flex flex-wrap gap-1 rounded-3xl bg-background/60 p-1">
        {metrics.map((m) => <button key={m.key} type="button" aria-label={`Activity chart: ${m.label}`} aria-pressed={m.key === key} onClick={() => setChosen(m.key)}
          className={cn("rounded-full px-3 py-1 text-xs font-medium transition-colors", focusClass, m.key === key ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{m.label}</button>)}
      </div>
    </div>
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${label} over 30 days with feeding, probiotic, treatment, chemical and maintenance events`} className="w-full min-w-[30rem]">
        <g className="text-xs text-muted-foreground" fill="currentColor">
          {points.length > 0 && ticks.map((v, i) => <text key={i} x={LEFT - 8} y={y(v) + 4} textAnchor="end">{Number(v.toFixed(2))}</text>)}
          {[0, 10, 20, 30].map((d) => <text key={d} x={x(start + d * DAY)} y={height - 6} textAnchor={d === 0 ? "start" : d === 30 ? "end" : "middle"}>{shortDate(start + d * DAY)}</text>)}
          {LANES.map((lane, i) => <text key={lane.kind} x={0} y={lanesTop + i * LANE_H + 4}>{lane.label}</text>)}
        </g>
        {band && <rect x={LEFT} y={band.max === null ? TOP : y(band.max)} width={W - LEFT - RIGHT}
          height={(band.min === null ? TOP + PLOT_H : y(band.min)) - (band.max === null ? TOP : y(band.max))} className="text-teal-500" fill="currentColor" opacity={0.14} />}
        {LANES.map((lane, i) => <line key={lane.kind} x1={LEFT} x2={W - RIGHT} y1={lanesTop + i * LANE_H} y2={lanesTop + i * LANE_H} className="text-border" stroke="currentColor" strokeDasharray="2 4" />)}
        {points.length > 1 && <polyline fill="none" stroke="currentColor" strokeWidth={2} className="text-foreground" points={points.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} />}
        {points.length <= 8 && points.map((p, i) => <circle key={`${p.t}-${i}`} cx={x(p.t)} cy={y(p.v)} r={4} className="text-foreground" fill="currentColor"><title>{`${shortDateTime(p.t)}: ${Number(p.v.toFixed(2))}`}</title></circle>)}
        {events.map((event) => <Marker key={event.id} kind={event.kind} cx={x(Date.parse(event.at))} cy={lanesTop + LANES.findIndex((lane) => lane.kind === event.kind) * LANE_H}
          title={`${shortDateTime(Date.parse(event.at))}: ${event.title}${event.detail ? `, ${event.detail}` : ""}`} />)}
      </svg>
    </div>
    <p className="text-xs text-muted-foreground">{band ? "Shaded band is the target range. " : key === "temperature" ? "" : `No target range set for ${label}. `}Hover a marker for details.</p>
    <dl className="mt-auto grid gap-3 sm:grid-cols-3">
      {kpis.map((kpi) => <div key={kpi.label} className="rounded-2xl bg-background/60 p-4">
        <dt className="text-xs text-muted-foreground">{kpi.label}</dt>
        <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{kpi.value}</dd>
        <dd className="text-xs text-muted-foreground">{kpi.note}</dd>
      </div>)}
    </dl>
  </Tile>;
}
