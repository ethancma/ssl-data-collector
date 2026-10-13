"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatPacificDateTime } from "@/lib/pacific-date-time";
import {
  RANGES, SYSTEMS, currentLocation, daysSince, isCurrent, lastHealth, lastTemperature, trend,
  type Severity, type Star,
} from "./mock-data";
import { starsFor, type IseauState } from "./use-iseau";

export const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function dateLabel(time: number, withTime = false) {
  return formatPacificDateTime(new Date(time), { month: "short", day: "numeric", ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}) });
}
export function relativeDay(time: number) {
  const days = daysSince(time);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

// Severity keeps fixed hues in both themes so a coral dot always means "high".
export const SEVERITY = {
  low: { label: "Low", bg: "bg-teal-500", text: "text-teal-500" },
  medium: { label: "Medium", bg: "bg-amber-400", text: "text-amber-400" },
  high: { label: "High", bg: "bg-red-500", text: "text-red-500" },
} satisfies Record<Severity, { label: string; bg: string; text: string }>;

function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", SEVERITY[severity].bg, className)} />;
}
export function SeverityLabel({ severity }: { severity: Severity }) {
  return <span className="inline-flex items-center gap-2"><SeverityDot severity={severity} />{SEVERITY[severity].label} severity</span>;
}

export function starSentence(star: Star) {
  const latest = lastHealth(star);
  if (!isCurrent(star)) return `No health observations for ${daysSince(latest.at)} days.`;
  const level = SEVERITY[latest.severity].label.toLowerCase();
  switch (trend(star)) {
    case "improving": return `${star.name} is improving, down to ${level} severity.`;
    case "worsening": return `${star.name} is getting worse, now at ${level} severity.`;
    case "steady": return `${star.name} is holding steady at ${level} severity.`;
    default: return `${star.name} was first observed ${relativeDay(latest.at)}.`;
  }
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <div role="group" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-full bg-muted p-1">
    {options.map((option) => <button key={String(option.value)} type="button" aria-pressed={option.value === value} onClick={() => onChange(option.value)}
      className={cn("rounded-full px-4 py-1.5 text-sm font-medium transition-colors", focusClass, option.value === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{option.label}</button>)}
  </div>;
}
export function StatusSwitch({ state }: { state: IseauState }) {
  return <Segmented label="Patient status" value={state.status} onChange={state.setStatus}
    options={[{ value: "current", label: "Current patients" }, { value: "past", label: "Past patients" }]} />;
}
export function SystemSwitch({ state }: { state: IseauState }) {
  return <Segmented label="System" value={state.system} onChange={state.setSystem}
    options={[{ value: "all", label: "All systems" }, ...SYSTEMS.map((system) => ({ value: system, label: `${system} (${starsFor(state.status, system).length})` }))]} />;
}
export function RangeSwitch({ state }: { state: IseauState }) {
  return <Segmented label="Time range" value={state.range} onChange={state.setRange} options={RANGES.map((days) => ({ value: days, label: `${days} days` }))} />;
}

export function Tile({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-3xl bg-muted p-6 sm:p-8", className)}>{children}</div>;
}
export function EmptyNote({ children }: { children: ReactNode }) {
  return <p role="status" className="py-6 text-sm text-muted-foreground">{children}</p>;
}

export function StarCard({ star, href }: { star: Star; href: string }) {
  const place = currentLocation(star);
  const temperature = lastTemperature(star);
  // Every line is a single truncated row, so all tiles keep the same height at any width.
  return <Link href={href} className={cn("flex h-full w-full min-w-0 flex-col gap-1 rounded-3xl bg-muted p-5 text-left transition-colors hover:bg-accent", focusClass)}>
    <span className="block truncate text-2xl font-semibold tracking-tight">{star.name}</span>
    <span className="block truncate text-sm text-muted-foreground">{place.tank} in {place.system}</span>
    <span className="my-2 block truncate text-sm"><SeverityLabel severity={lastHealth(star).severity} /></span>
    <span className="block truncate text-sm text-muted-foreground">Last observed {relativeDay(lastHealth(star).at)}</span>
    <span className="block truncate text-sm text-muted-foreground">AM check {temperature.celsius.toFixed(1)} °C</span>
  </Link>;
}

// A native dialog gives focus trapping, Escape, and a backdrop without extra code.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    if (ref.current && !ref.current.open) ref.current.showModal();
    return () => { if (opener instanceof HTMLElement) opener.focus(); };
  }, []);
  return <dialog ref={ref} aria-labelledby="iseau-sheet-title" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    className="m-auto max-h-[92vh] w-[min(60rem,calc(100vw-1.5rem))] overflow-y-auto rounded-3xl bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/50">
    <div className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-background/90 px-6 py-4 backdrop-blur sm:px-8">
      <h2 id="iseau-sheet-title" className="text-2xl font-semibold tracking-tight">{title}</h2>
      <button type="button" aria-label="Close" onClick={onClose} className={cn("rounded-full bg-muted p-2 hover:bg-accent", focusClass)}><X aria-hidden="true" className="h-4 w-4" /></button>
    </div>
    <div className="px-6 pb-8 sm:px-8">{children}</div>
  </dialog>;
}

export function PageHeader({ title, description }: { title: string; description: string }) {
  return <header className="max-w-3xl space-y-3">
    <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">{title}</h1>
    <p className="text-lg text-muted-foreground">{description}</p>
  </header>;
}
export function SampleNote() {
  return <p className="text-xs text-muted-foreground">Sample data as of Oct 5, 2026</p>;
}
