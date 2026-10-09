"use client";

import { DAY, PARAMETERS, SAMPLE_NOW, lastObservation, locationAt, patientEvents, type Parameter } from "./mock-data";
import { EventDetail, EmptyEvents, SeverityBadge, dateLabel } from "./shared";
import { WaterChart } from "./water-chart";
import type { PreviewState } from "./use-iseau-preview";

export default function Design4PatientChart({ state }: { state: PreviewState }) {
  if (!state.patient) return null;
  const history = patientEvents(state.patient);
  const health = history.filter((event) => event.layer === "health");
  const first = health[health.length - 1];
  const last = lastObservation(state.patient);
  const location = locationAt(state.patient, SAMPLE_NOW);
  const treatment = history.find((event) => event.layer === "treatment");
  const feeding = history.find((event) => event.layer === "feeding");
  return <div className="space-y-6">
    <section aria-label="Patient summary" className="rounded-lg border border-border bg-muted/30 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{state.patient.name}</h2><p className="mt-1 text-sm font-medium">{location.tank} / {location.system}</p><p className="mt-1 text-sm text-muted-foreground">Day {Math.floor((SAMPLE_NOW - Date.parse(first.at)) / DAY) + 1} of observation / Sunflower sea star</p></div><SeverityBadge severity={last.severity!} /></div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Recorded severity trend</dt><dd className="mt-1 text-sm">{first.severity} to {last.severity} <span className="text-xs text-muted-foreground">(first to latest)</span></dd></div>
        <div><dt className="text-xs text-muted-foreground">Last treatment</dt><dd className="mt-1 text-sm">{treatment?.title ?? "None"}</dd>{treatment && <dd className="text-xs text-muted-foreground">{dateLabel(treatment.at)} / {treatment.recordedBy}</dd>}</div>
        <div><dt className="text-xs text-muted-foreground">Last fed</dt><dd className="mt-1 text-sm">{feeding?.title ?? "None"}{feeding ? ` / ${feeding.eaten ? "eaten" : "not eaten"}` : ""}</dd>{feeding && <dd className="text-xs text-muted-foreground">{dateLabel(feeding.at)} / {feeding.recordedBy}</dd>}</div>
      </dl>
    </section>
    {state.layers.includes("water") && <section aria-label="Weekly chemistry sparklines"><h2 className="mb-4 text-base font-semibold">System chemistry</h2><div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(PARAMETERS) as Parameter[]).map((parameter) => <WaterChart key={parameter} parameter={parameter} events={state.events} days={state.days} compact />)}</div></section>}
    <section aria-label="Chronological patient log" className="border-t border-border pt-5"><h2 className="mb-4 text-base font-semibold">Patient log</h2>{!state.events.length ? <EmptyEvents /> : <ol aria-label="Visible event records" className="ml-2 border-l border-border">{state.events.map((event) => <li key={event.id} className="relative pl-6"><span aria-hidden="true" className="absolute -left-1.5 top-5 h-3 w-3 rounded-full border-2 border-background bg-primary" /><EventDetail event={event} /></li>)}</ol>}</section>
  </div>;
}