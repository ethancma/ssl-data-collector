"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DAY, LAYERS, windowStart } from "./mock-data";
import { EventList, LayerIcon, dateLabel, focusClass } from "./shared";
import type { PreviewState } from "./use-iseau-preview";

export default function Design3DayGrid({ state }: { state: PreviewState }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const days = Array.from({ length: state.days }, (_, index) => windowStart(state.days) + (state.days - index - 1) * DAY);
  const layers = LAYERS.filter((layer) => state.layers.includes(layer.id));
  const columns = `minmax(130px,1.4fr) repeat(${Math.max(layers.length, 1)}, minmax(72px,1fr))`;
  return <section aria-label="Day-by-day event grid">
    <h2 className="mb-3 text-base font-semibold">Daily record</h2>
    <div className="hidden border-b border-border bg-muted/50 xl:grid" style={{ gridTemplateColumns: columns }}><span className="p-3 text-xs font-medium">Date / events</span>{layers.map((layer) => <span key={layer.id} className="flex flex-col items-center gap-1 p-2 text-center text-xs"><LayerIcon layer={layer.id} />{layer.label}</span>)}</div>
    <div className="space-y-2 xl:space-y-0">{days.map((at) => {
      const key = new Date(at).toISOString().slice(0, 10);
      const events = state.events.filter((event) => Date.parse(event.at) >= at && Date.parse(event.at) < at + DAY);
      const isOpen = expanded.includes(key);
      const Chevron = isOpen ? ChevronDown : ChevronRight;
      return <div key={key} className="rounded border border-border xl:rounded-none xl:border-x-0 xl:border-t-0">
        <button type="button" aria-expanded={isOpen} aria-controls={`day-${key}`} onClick={() => setExpanded(isOpen ? expanded.filter((day) => day !== key) : [...expanded, key])} className={`w-full p-3 text-left hover:bg-accent xl:grid xl:items-center ${focusClass}`} style={{ gridTemplateColumns: columns }}>
          <span className="flex items-center gap-2"><Chevron aria-hidden="true" className="h-4 w-4" /><span className="text-sm font-medium">{dateLabel(at)}<span className="ml-2 text-xs font-normal text-muted-foreground">{events.length}</span></span></span>
          <span className="mt-3 flex flex-wrap gap-3 xl:contents">{layers.map((layer) => { const count = events.filter((event) => event.layer === layer.id).length; return <span key={layer.id} className="inline-flex items-center justify-center gap-1 text-xs xl:py-0"><span className="xl:hidden"><LayerIcon layer={layer.id} /></span><span className={count ? "inline-flex h-6 min-w-6 items-center justify-center rounded bg-secondary px-1 font-medium tabular-nums" : "text-muted-foreground"}>{count || "-"}</span><span className="sr-only">{layer.label}: {count} events</span></span>; })}</span>
        </button>
        <div id={`day-${key}`} hidden={!isOpen} className="border-t border-border px-3 sm:px-6"><EventList events={events} /></div>
      </div>;
    })}</div>
  </section>;
}