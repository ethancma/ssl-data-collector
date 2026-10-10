"use client";

import { LAYERS, PARAMETERS, SAMPLE_NOW, windowStart, type Parameter, type SampleEvent, type WindowDays } from "./mock-data";
import { dateLabel } from "./shared";

export function WaterChart({ events, days, parameter = "ph", markers = false, highlighted, onSelect, compact = false }: {
  events: SampleEvent[]; days: WindowDays; parameter?: Parameter; markers?: boolean;
  highlighted?: string; onSelect?: (id: string) => void; compact?: boolean;
}) {
  const config = PARAMETERS[parameter];
  const points = events.filter((event) => event.layer === "water" && event.readings).sort((first, second) => Date.parse(first.at) - Date.parse(second.at));
  const values = points.map((event) => event.readings![parameter]);
  const minimum = Math.min(config.sampleBand[0], ...values);
  const maximum = Math.max(config.sampleBand[1], ...values);
  const padding = (maximum - minimum || 1) * 0.3;
  const low = minimum - padding;
  const high = maximum + padding;
  const height = compact ? 100 : 260;
  const top = compact ? 18 : 35;
  const bottom = height - (compact ? 18 : 75);
  const start = windowStart(days);
  const scaleX = (at: string | number) => 52 + ((typeof at === "number" ? at : Date.parse(at)) - start) / (SAMPLE_NOW - start) * 496;
  const scaleY = (value: number) => bottom - ((value - low) / (high - low)) * (bottom - top);
  const systems = Array.from(new Set(points.map((event) => event.system)));
  const bandColor = "hsl(var(--chart-2))";
  return <figure className="min-w-0 space-y-2">
    <figcaption className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{config.label}{config.unit ? ` (${config.unit})` : ""} / weekly manual</span><span>Sample target band: {config.sampleBand.join(" - ")}{config.unit ? ` ${config.unit}` : ""}</span></figcaption>
    <div className={compact ? "" : "overflow-x-auto"}>
      <svg role={onSelect ? "group" : "img"} aria-label={`${config.label}: ${points.length} manual readings; sample target band, not clinical guidance. ${points.map((event) => `${dateLabel(event.at)}, ${event.system}: ${Number(event.readings![parameter].toFixed(2))}, recorded by ${event.recordedBy}`).join("; ")}`} viewBox={`0 0 600 ${height}`} className={compact ? "w-full" : "w-full min-w-[480px]"}>
        <rect x={52} y={scaleY(config.sampleBand[1])} width={496} height={scaleY(config.sampleBand[0]) - scaleY(config.sampleBand[1])} fill={bandColor} opacity={0.12} />
        {!compact && [minimum, maximum].map((value) => <g key={value} className="text-xs text-muted-foreground"><line x1={52} x2={548} y1={scaleY(value)} y2={scaleY(value)} stroke="currentColor" opacity={0.2} /><text x={46} y={scaleY(value) + 4} textAnchor="end" fill="currentColor">{Number(value.toFixed(2))}</text></g>)}
        {systems.map((system, systemIndex) => {
          const series = points.filter((event) => event.system === system);
          const color = systemIndex === 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-3))";
          return <g key={system}>
            {series.length > 1 && <polyline points={series.map((event) => `${scaleX(event.at)},${scaleY(event.readings![parameter])}`).join(" ")} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />}
            {series.map((event) => <circle key={event.id} role={onSelect ? "button" : undefined} tabIndex={onSelect ? 0 : undefined} aria-label={`${dateLabel(event.at)}, ${system}: ${Number(event.readings![parameter].toFixed(2))}, recorded by ${event.recordedBy}`} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current" onMouseEnter={() => onSelect?.(event.id)} onFocus={() => onSelect?.(event.id)} onClick={() => onSelect?.(event.id)} onKeyDown={(keyEvent) => { if (keyEvent.key === "Enter" || keyEvent.key === " ") { keyEvent.preventDefault(); onSelect?.(event.id); } }} cx={scaleX(event.at)} cy={scaleY(event.readings![parameter])} r={highlighted === event.id ? 7 : 4} fill={color}><title>{system}: {Number(event.readings![parameter].toFixed(2))} / {event.recordedBy}</title></circle>)}
          </g>;
        })}
        {markers && events.filter((event) => event.layer !== "water").map((event) => {
          const markerLayers = LAYERS.filter((layer) => layer.id !== "water");
          const position = bottom + 12 + markerLayers.findIndex((layer) => layer.id === event.layer) * 10;
          const color = event.severity === "high" ? "hsl(var(--destructive))" : event.severity === "medium" ? "hsl(var(--chart-4))" : LAYERS.find((layer) => layer.id === event.layer)!.color;
          return <circle key={event.id} role="button" tabIndex={0} aria-label={`${event.title}, ${dateLabel(event.at)}, recorded by ${event.recordedBy}`} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current" cx={scaleX(event.at)} cy={position} r={highlighted === event.id ? 8 : 5} fill={color} stroke="hsl(var(--background))" strokeWidth={2} onMouseEnter={() => onSelect?.(event.id)} onFocus={() => onSelect?.(event.id)} onClick={() => onSelect?.(event.id)} onKeyDown={(eventKey) => { if (eventKey.key === "Enter" || eventKey.key === " ") { eventKey.preventDefault(); onSelect?.(event.id); } }}><title>{event.title} / {event.recordedBy}</title></circle>;
        })}
        <g className="text-xs text-muted-foreground" fill="currentColor"><text x={52} y={height - 4}>{dateLabel(start)}</text><text x={548} y={height - 4} textAnchor="end">{dateLabel(SAMPLE_NOW)}</text></g>
      </svg>
    </div>
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{systems.map((system, index) => <span key={system} className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: index === 0 ? "hsl(var(--chart-2))" : "hsl(var(--chart-3))" }} />{system}</span>)}{!points.length && <span>No manual readings in this window.</span>}</div>
    {markers && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{LAYERS.filter((layer) => layer.id !== "water" && events.some((event) => event.layer === layer.id)).map((layer) => <span key={layer.id} className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: layer.color }} />{layer.label}</span>)}</div>}
  </figure>;
}