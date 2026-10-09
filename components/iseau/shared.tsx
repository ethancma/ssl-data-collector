"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRightLeft, ClipboardCheck, Download, FlaskConical, HeartPulse, Image as ImageIcon, Utensils, Waves } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatPacificDateTime } from "@/lib/pacific-date-time";
import { DESIGNS, LAYERS, SAMPLE_NOW, eventDetails, locationAt, worstSeverity, type Layer, type SampleEvent, type Severity } from "./mock-data";
import type { PreviewState } from "./use-iseau-preview";

export const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
export const selectClass = `h-9 max-w-full rounded-md border border-input bg-background px-2 text-sm ${focusClass}`;
const LAYER_ICONS = { health: HeartPulse, treatment: FlaskConical, feeding: Utensils, water: Waves, chemical: FlaskConical, check: ClipboardCheck, move: ArrowRightLeft };
export function dateLabel(at: string | number, time = false) {
  return formatPacificDateTime(new Date(at), { month: "short", day: "numeric", ...(time ? { hour: "numeric", minute: "2-digit" } : {}) });
}
export function SeverityBadge({ severity }: { severity: Severity }) {
  return <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium", severity === "high" ? "border-destructive/40 text-destructive" : "border-border text-foreground")}>
    <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: severity === "high" ? "hsl(var(--destructive))" : severity === "medium" ? "hsl(var(--chart-4))" : "hsl(var(--chart-2))" }} />{severity}
  </span>;
}
export function LayerIcon({ layer }: { layer: Layer }) {
  const Icon = LAYER_ICONS[layer];
  return <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />;
}
export function PreviewFrame({ design, state, children }: { design: number; state: PreviewState; children: ReactNode }) {
  const current = DESIGNS.find((candidate) => candidate.id === design)!;
  const location = state.patient ? locationAt(state.patient, SAMPLE_NOW) : undefined;
  return <div className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="space-y-3">
      <Link href="/protected/iseau" className={cn("inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground", focusClass)}><ArrowLeft aria-hidden="true" className="h-4 w-4" />All designs</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-3xl font-semibold">ISeaU</h1><p className="mt-1 text-sm text-muted-foreground">Design {design}: {current.title}</p></div>
        <span className="rounded border border-dashed border-border px-3 py-1 text-xs text-muted-foreground">Sample data / Oct 5, 2026</span>
      </div>
      <nav aria-label="Preview designs" className="flex flex-wrap gap-1">{DESIGNS.map((item) => <Button key={item.id} asChild size="sm" variant={item.id === design ? "secondary" : "ghost"}><Link aria-current={item.id === design ? "page" : undefined} href={`/protected/iseau/preview/${item.id}`}>Design {item.id}</Link></Button>)}</nav>
    </header>
    <section aria-label="Patient and event filters" className="space-y-4 border-y border-border py-4">
      <div role="tablist" aria-label="Patient status" className="flex flex-wrap gap-1">{(["current", "past"] as const).map((tab) => <Button key={tab} role="tab" id={`patient-tab-${tab}`} aria-controls="patient-panel" aria-selected={state.tab === tab} tabIndex={state.tab === tab ? 0 : -1} variant={state.tab === tab ? "secondary" : "ghost"} onClick={() => state.setTab(tab)} onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === "Home" ? "current" : event.key === "End" ? "past" : tab === "current" ? "past" : "current";
        state.setTab(next);
        document.getElementById(`patient-tab-${next}`)?.focus();
      }}>{tab === "current" ? "Current patients" : "Past patients"}</Button>)}</div>
      <div role="tabpanel" id="patient-panel" aria-labelledby={`patient-tab-${state.tab}`} className="flex flex-wrap items-end gap-3">
        <label className="flex w-full min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:w-auto sm:flex-1" htmlFor="iseau-patient">Sunflower sea star
          <select id="iseau-patient" value={state.patient?.id ?? ""} onChange={(event) => state.selectPatient(event.target.value)} className={cn(selectClass, "w-full sm:min-w-64")} disabled={!state.patients.length}>
            {state.patients.length ? state.patients.map((patient) => { const at = locationAt(patient, SAMPLE_NOW); return <option key={patient.id} value={patient.id}>{patient.name} / {at.tank} / {at.system} / worst: {worstSeverity(patient, state.days)}</option>; }) : <option value="">No patients</option>}
          </select>
        </label>
        <fieldset><legend className="mb-1 text-xs text-muted-foreground">Window</legend><div className="flex gap-1">{([7, 14, 30] as const).map((days) => <Button key={days} size="sm" className="h-9" aria-pressed={state.days === days} variant={state.days === days ? "default" : "outline"} onClick={() => state.setDays(days)}>{days} days</Button>)}</div></fieldset>
        <Button variant="outline" onClick={state.exportCsv} disabled={!state.patient}><Download aria-hidden="true" />Export CSV</Button>
      </div>
      <fieldset><legend className="mb-2 text-xs text-muted-foreground">Event layers</legend><div className="flex flex-wrap gap-x-4 gap-y-3">{LAYERS.map((layer) => <label key={layer.id} className="flex cursor-pointer items-center gap-2 text-xs"><input type="checkbox" checked={state.layers.includes(layer.id)} onChange={() => state.toggleLayer(layer.id)} className={cn("h-4 w-4 accent-primary", focusClass)} /><LayerIcon layer={layer.id} />{layer.label}</label>)}</div></fieldset>
    </section>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="font-medium">{state.patient?.name ?? "No patient"}{location ? ` / ${location.tank} / ${location.system}` : ""}</p><p role="status" className="text-xs text-muted-foreground">{state.events.length} visible events / {dateLabel(SAMPLE_NOW)}</p></div>
    {state.patient ? children : <EmptyEvents message="No patients in this tab for the selected window." />}
  </div>;
}
export function EmptyEvents({ message = "No events match the selected window and layers." }: { message?: string }) {
  return <p role="status" className="py-8 text-sm text-muted-foreground">{message}</p>;
}
export function EventDetail({ event }: { event: SampleEvent }) {
  return <article className="min-w-0 space-y-2 py-3">
    <div className="flex flex-wrap items-center gap-2"><LayerIcon layer={event.layer} /><h3 className="text-sm font-medium">{event.title}</h3>{event.severity && <SeverityBadge severity={event.severity} />}</div>
    <p className="text-xs text-muted-foreground"><time dateTime={event.at}>{dateLabel(event.at, true)}</time> / {event.system}{event.tank ? ` / ${event.tank}` : ""} / Recorded by {event.recordedBy}</p>
    <p className="break-words text-sm text-muted-foreground">{eventDetails(event)}</p>
    {event.photo && <div role="img" aria-label={`Sample health photo placeholder for ${dateLabel(event.at)}`} className="flex h-16 w-24 items-center justify-center gap-1 rounded border border-dashed border-border bg-muted text-xs text-muted-foreground"><ImageIcon aria-hidden="true" className="h-4 w-4" />Photo</div>}
  </article>;
}
export function EventList({ events, onHighlight, highlighted }: { events: SampleEvent[]; onHighlight?: (id: string) => void; highlighted?: string }) {
  if (!events.length) return <EmptyEvents />;
  return <ol aria-label="Visible event records" className="divide-y divide-border">{events.map((event) => <li key={event.id} className={cn("relative min-w-0 px-2", highlighted === event.id && "bg-accent")}>
    <EventDetail event={event} />
    {onHighlight ? <button type="button" aria-label={`Highlight ${event.title} on ${dateLabel(event.at)}, recorded by ${event.recordedBy}`} onFocus={() => onHighlight(event.id)} onMouseEnter={() => onHighlight(event.id)} onClick={() => onHighlight(event.id)} className={cn("absolute inset-0 w-full rounded", focusClass)} /> : null}
  </li>)}</ol>;
}