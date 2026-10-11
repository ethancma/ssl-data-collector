"use client";

import { useState } from "react";
import { LAYERS, SAMPLE_NOW, windowStart, type Layer, type SampleEvent, type WindowDays } from "./mock-data";
import { EmptyEvents, EventDetail, EventList, LayerIcon, dateLabel, focusClass } from "./shared";
import { WaterChart } from "./water-chart";
import type { PreviewState } from "./use-iseau-preview";

export function SwimlaneTimeline({ events, layers, days }: { events: SampleEvent[]; layers: Layer[]; days: WindowDays }) {
  const [selectedId, setSelectedId] = useState<string>();
  const selected = events.find((event) => event.id === selectedId) ?? events[0];
  const start = windowStart(days);
  const axisPosition = (at: number) => 52 + (at - start) / (SAMPLE_NOW - start) * 496;
  if (!layers.length) return <EmptyEvents />;
  return <section aria-label="Patient swimlane timeline" className="space-y-4">
    <div className="overflow-x-auto rounded border border-border">
      <div className="min-w-[756px]">
        <div className="grid grid-cols-[156px_600px] border-b border-border bg-muted/50"><span className="px-3 py-3 text-xs font-medium">Event layer</span><svg aria-hidden="true" viewBox="0 0 600 44" className="w-full"><g className="text-xs text-muted-foreground" fill="currentColor">{[0, 0.5, 1].map((fraction) => <text key={fraction} x={52 + fraction * 496} y={26} textAnchor={fraction === 0 ? "start" : fraction === 1 ? "end" : "middle"}>{dateLabel(start + fraction * (SAMPLE_NOW - start))}</text>)}</g></svg></div>
        {LAYERS.filter((layer) => layers.includes(layer.id)).map((layer) => <div key={layer.id} className="grid grid-cols-[156px_600px] items-center border-b border-border last:border-0">
          <div className="flex items-center gap-2 px-3 py-3 text-xs font-medium"><LayerIcon layer={layer.id} />{layer.label}</div>
          {layer.id === "water" ? <div className="py-3"><WaterChart events={events} days={days} compact highlighted={selected?.id} onSelect={setSelectedId} /></div> : <div className="relative h-16">
            <div aria-hidden="true" className="absolute left-[52px] right-[52px] top-8 border-t border-border" />
            {[0, 0.5, 1].map((fraction) => <div key={fraction} aria-hidden="true" className="absolute inset-y-0 border-l border-dashed border-border" style={{ left: 52 + fraction * 496 }} />)}
            {events.filter((event) => event.layer === layer.id).map((event) => <button key={event.id} type="button" aria-label={`${event.title}, ${dateLabel(event.at)}, ${event.severity ?? event.layer}, recorded by ${event.recordedBy}`} aria-pressed={selected?.id === event.id} title={`${event.title} / ${dateLabel(event.at)} / ${event.recordedBy}`} onMouseEnter={() => setSelectedId(event.id)} onFocus={() => setSelectedId(event.id)} onClick={() => setSelectedId(event.id)} className={`absolute top-5 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded border-2 border-background ${focusClass}`} style={{ left: axisPosition(Date.parse(event.at)), background: event.severity === "high" ? "hsl(var(--destructive))" : event.severity === "medium" ? "hsl(var(--chart-4))" : layer.color, outline: selected?.id === event.id ? "2px solid hsl(var(--ring))" : undefined }}><span aria-hidden="true" className="h-1 w-1 rounded-full bg-background" /></button>)}
          </div>}
        </div>)}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">Health: low / medium / high. Separate water series identify the system at reading time.</p>
    <div aria-live="polite" aria-atomic="true" className="border-l-2 border-primary pl-4">{selected ? <EventDetail event={selected} /> : <EmptyEvents />}</div>
    <details className="border-t border-border pt-3"><summary className={`cursor-pointer rounded text-sm font-medium ${focusClass}`}>All visible event records ({events.length})</summary><EventList events={events} /></details>
  </section>;
}
export default function Design1Swimlane({ state }: { state: PreviewState }) {
  return <SwimlaneTimeline key={state.patient?.id} events={state.events} layers={state.layers} days={state.days} />;
}