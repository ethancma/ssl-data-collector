"use client";

import { useState } from "react";
import { PARAMETERS, type Parameter } from "./mock-data";
import { EventDetail, EventList, selectClass } from "./shared";
import { WaterChart } from "./water-chart";
import type { PreviewState } from "./use-iseau-preview";

export default function Design2Overlay({ state }: { state: PreviewState }) {
  const [parameter, setParameter] = useState<Parameter>("ph");
  const [highlighted, setHighlighted] = useState<string>();
  const selected = state.events.find((event) => event.id === highlighted);
  return <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
    <section aria-label="Chemistry and care overlay" className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Chemistry + care</h2><label htmlFor="overlay-parameter" className="flex items-center gap-2 text-xs text-muted-foreground">Parameter<select id="overlay-parameter" className={selectClass} value={parameter} onChange={(event) => setParameter(event.target.value as Parameter)}>{Object.entries(PARAMETERS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select></label></div>
      <WaterChart events={state.events} days={state.days} parameter={parameter} markers highlighted={highlighted} onSelect={setHighlighted} />
      <p className="text-xs text-muted-foreground">Care markers share the date axis below the chemistry line. Target bands are sample values only.</p>
      <div aria-live="polite" className="border-t border-border">{selected ? <EventDetail event={selected} /> : <p className="py-4 text-sm text-muted-foreground">No event selected.</p>}</div>
    </section>
    <section aria-label="Event feed" className="min-w-0 border-t border-border pt-4 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0"><h2 className="mb-3 text-base font-semibold">Event feed</h2><div className="max-h-[620px] overflow-y-auto overscroll-contain"><EventList events={state.events} onHighlight={setHighlighted} highlighted={highlighted} /></div></section>
  </div>;
}