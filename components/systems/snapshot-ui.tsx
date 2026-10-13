import { AlertTriangle, Check, Clock } from "lucide-react";
import type { MouseEvent } from "react";

import { SEVERITY } from "@/components/iseau/shared";
import { cn } from "@/lib/utils";
import { formatReading, type CheckState, type SnapshotStatus, type SystemSnapshot, type WaterReadingSummary } from "@/lib/systems/snapshot";

// Status reuses the ISeaU severity hues so teal/amber/coral mean the same thing app-wide.
export const STATUS = {
  ok: { label: "On track", dot: SEVERITY.low.bg },
  watch: { label: "Worth a look", dot: SEVERITY.medium.bg },
  attention: { label: "Needs attention", dot: SEVERITY.high.bg },
} satisfies Record<SnapshotStatus, { label: string; dot: string }>;

export const OUT_OF_RANGE_TEXT = "text-amber-600 dark:text-amber-400";

// Keeps real hrefs for open-in-new-tab while a plain click navigates without a server round trip.
export function onPlainClick(handler: () => void) {
  return (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    handler();
  };
}

export function StatusDot({ status, className }: { status: SnapshotStatus; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-full", STATUS[status].dot, className)} />;
}

export function StatusLabel({ status }: { status: SnapshotStatus }) {
  return <span className="inline-flex items-center gap-2 text-sm font-medium"><StatusDot status={status} />{STATUS[status].label}</span>;
}

const CHECK_TEXT: Record<"AM" | "PM", Record<CheckState, string>> = {
  AM: { done: "AM done", due: "AM due by noon", missed: "AM missed" },
  PM: { done: "PM done", due: "PM due by 6 pm", missed: "PM missed" },
};

export function CheckChip({ type, state }: { type: "AM" | "PM"; state: CheckState }) {
  const Icon = state === "done" ? Check : state === "due" ? Clock : AlertTriangle;
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm",
    state === "missed" ? "bg-red-500/15 font-medium text-red-600 dark:text-red-400" : "bg-background text-muted-foreground")}>
    <Icon aria-hidden="true" className="h-3.5 w-3.5" />{CHECK_TEXT[type][state]}
  </span>;
}

export function temperatureText(snapshot: SystemSnapshot) {
  return snapshot.latestTemperature === null ? "—" : `${snapshot.latestTemperature.toFixed(1)} °C`;
}
export function waterTestedText(snapshot: SystemSnapshot) {
  return snapshot.water.testedAgo ? `Water tested ${snapshot.water.testedAgo}` : "No water test yet";
}
export function fedText(snapshot: SystemSnapshot, hasAnimals: boolean) {
  if (!hasAnimals) return "No animals";
  return snapshot.fedAgo ? `Fed ${snapshot.fedAgo}` : "No feedings in 30 days";
}

export function readingValue(reading: WaterReadingSummary) {
  return <span className={cn("tabular-nums", reading.outOfRange && OUT_OF_RANGE_TEXT)}>{formatReading(reading)}{reading.outOfRange && <span className="sr-only"> (outside target)</span>}</span>;
}

// A track with the target band shaded and a marker at the latest value; no band when no target is set.
export function Gauge({ reading }: { reading: WaterReadingSummary }) {
  const { value, target } = reading;
  if (value === null || !target) return <div aria-hidden="true" className="h-1.5 rounded-full bg-background/60" />;
  const span = (target.max ?? value) - (target.min ?? value) || Math.abs(value) || 1;
  const lo = Math.min(target.min ?? value, value) - span * 0.5;
  const hi = Math.max(target.max ?? value, value) + span * 0.5;
  const pct = (n: number) => `${((n - lo) / (hi - lo)) * 100}%`;
  const left = target.min === null ? "0%" : pct(target.min);
  const right = target.max === null ? "0%" : `${100 - ((target.max - lo) / (hi - lo)) * 100}%`;
  return <div aria-hidden="true" className="relative h-1.5 rounded-full bg-background/60">
    <span className="absolute inset-y-0 rounded-full bg-teal-500/40" style={{ left, right }} />
    <span className={cn("absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-muted",
      reading.outOfRange ? "bg-amber-400" : "bg-foreground")} style={{ left: pct(value) }} />
  </div>;
}
