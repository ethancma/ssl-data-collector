"use client";

import { DAY, LAYERS, SAMPLE_NOW, lastObservation, locationAt, visibleEvents, worstSeverity } from "./mock-data";
import { SeverityBadge, dateLabel, focusClass } from "./shared";
import { SwimlaneTimeline } from "./design-1-swimlane";
import type { PreviewState } from "./use-iseau-preview";

export default function Design5WardBoard({ state }: { state: PreviewState }) {
  return <div className="space-y-6">
    <section aria-label={`${state.tab === "current" ? "Current" : "Past"} patient ward board`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {state.patients.map((patient) => {
        const last = lastObservation(patient);
        const location = locationAt(patient, SAMPLE_NOW);
        const events = visibleEvents(patient, state.days, state.layers);
        const severity = worstSeverity(patient, state.days);
        return <button key={patient.id} type="button" aria-pressed={state.patient?.id === patient.id} onClick={() => state.selectPatient(patient.id)} className={`min-w-0 rounded-lg border border-border border-t-4 bg-card p-4 text-left hover:bg-accent ${focusClass}`} style={{ borderTopColor: severity === "high" ? "hsl(var(--destructive))" : severity === "medium" ? "hsl(var(--chart-4))" : "hsl(var(--chart-2))", outline: state.patient?.id === patient.id ? "2px solid hsl(var(--ring))" : undefined }}>
          <span className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{patient.name}</span><SeverityBadge severity={severity} /></span>
          <span className="mt-2 block text-sm text-muted-foreground">{location.tank} / {location.system}</span>
          <span className="mt-3 block text-xs text-muted-foreground">{Math.floor((SAMPLE_NOW - Date.parse(last.at)) / DAY)} days since observation / {dateLabel(last.at)}</span>
          <span className="mt-1 block text-xs text-muted-foreground">Last observation by {last.recordedBy}</span>
          <span aria-hidden="true" className="mt-4 flex h-5 items-center gap-1 overflow-hidden">{events.slice().reverse().slice(-20).map((event) => <span key={event.id} className="h-3 w-2 shrink-0 rounded-sm" style={{ background: LAYERS.find((layer) => layer.id === event.layer)!.color }} />)}</span>
          <span className="mt-2 block text-xs text-muted-foreground">{events.length} visible events</span>
        </button>;
      })}
    </section>
    <section aria-label="Selected patient detail" className="border-t border-border pt-5"><h2 className="mb-4 text-base font-semibold">{state.patient?.name} / Patient detail</h2><SwimlaneTimeline key={state.patient?.id} events={state.events} days={state.days} layers={state.layers} /></section>
  </div>;
}