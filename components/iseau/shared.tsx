"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { CompactSelect } from "@/components/ui/app-primitives";
import { focusClass } from "@/components/ui/app-layout";
import { formatPacificDateTime } from "@/lib/pacific-date-time";
import { severityTone } from "./severity-tone";
import {
  RANGES,
  starsFor,
  daysSince,
  isCurrent,
  lastHealth,
  lastTemperature,
  trend,
  type IseauData,
  type Severity,
  type Star,
} from "@/lib/iseau/data";
import type { IseauState } from "./use-iseau";

export function dateLabel(time: number, withTime = false) {
  return formatPacificDateTime(new Date(time), { month: "short", day: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}
export function relativeDay(time: number, now: number) {
  const days = daysSince(time, now);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}


function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", severityTone(severity).bg, className)} />;
}
export function SeverityLabel({ severity }: { severity: Severity }) {
  return <span className="inline-flex items-center gap-2"><SeverityDot severity={severity} />Severity {severity}</span>;
}

export function starSentence(star: Star, now: number) {
  const latest = lastHealth(star);
  if (!isCurrent(star, now)) return "No score of 2 or higher in the past 14 days.";
  const level = latest.severity;
  switch (trend(star)) {
    case "improving": return `${star.name} is improving, down to severity ${level}.`;
    case "worsening": return `${star.name} is getting worse, now at severity ${level}.`;
    case "steady": return `${star.name} is holding steady at severity ${level}.`;
    default: return `${star.name} was first observed ${relativeDay(latest.at, now)}.`;
  }
}

export function StatusSwitch({ state }: { state: IseauState }) {
  return <CompactSelect label="Patient status" value={state.status} onChange={state.setStatus}
    options={[{ value: "current", label: "Current patients" }, { value: "past", label: "Past patients" }]} />;
}
export function SystemSwitch({ state }: { state: IseauState }) {
  return <CompactSelect label="System" value={String(state.system)} onChange={(value) => state.setSystem(value === "all" ? "all" : Number(value))}
    options={[{ value: "all", label: "All systems" }, ...state.data.systems.map((system) => ({ value: String(system.id), label: `${system.name} (${starsFor(state.data, state.status, system.id).length})` }))]} />;
}
export function RangeSwitch({ state }: { state: IseauState }) {
  return <CompactSelect label="Time range" value={String(state.range)} onChange={(value) => { const days = RANGES.find((option) => String(option) === value); if (days) state.setRange(days); }}
    options={RANGES.map((days) => ({ value: String(days), label: `Last ${days} days` }))} />;
}

export function StarCard({ star, href, data }: { star: Star; href: string; data: IseauData }) {
  const place = star.location;
  const temperature = lastTemperature(star, data);
  // Every line is a single truncated row, so all tiles keep the same height at any width.
  return <Link href={href} prefetch={false} className={cn("flex h-full w-full min-w-0 flex-col gap-1 rounded-2xl bg-muted p-4 text-left transition-colors motion-reduce:transition-none [@media(hover:hover)]:hover:bg-accent", focusClass)}>
    <span className="block truncate text-xl font-semibold tracking-tight">{star.name}</span>
    <span className="block truncate text-sm text-muted-foreground">{place.tank} in {place.system}</span>
    <span className="my-2 block truncate text-sm"><SeverityLabel severity={lastHealth(star).severity} /></span>
    <span className="block truncate text-sm text-muted-foreground">Last observed {relativeDay(lastHealth(star).at, data.now)}</span>
    <span className="block truncate text-sm text-muted-foreground">{temperature ? `AM check ${temperature.celsius.toFixed(1)} °C` : "No AM temperature data"}</span>
  </Link>;
}
