import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { Tile, focusClass } from "@/components/iseau/shared";
import { HighlightsFeed } from "@/components/systems/highlights-feed";
import { WaterActivityCard } from "@/components/systems/water-activity-card";
import { WaterTrendsCard } from "@/components/systems/water-trends-card";
import type { ChartRangeDays, SystemDetailData } from "@/components/systems/types";
import { cn } from "@/lib/utils";

import { CheckChip, Gauge, StatusLabel, fedText, onPlainClick, readingValue, temperatureText, waterTestedText } from "./snapshot-ui";

// `systems` is the lineup order, used for the previous/next switcher.
export function SystemDetail({ data, systems, range, onSelectRange, onOpen, onBack }: {
  data: SystemDetailData; systems: SystemDetailData[]; range: ChartRangeDays;
  onSelectRange: (range: ChartRangeDays) => void; onOpen: (slug: string) => void; onBack: () => void;
}) {
  const { snapshot } = data;
  const index = systems.findIndex((system) => system.slug === data.slug);
  const neighbours = [
    { label: "Previous system", system: systems[index - 1], Icon: ChevronLeft },
    { label: "Next system", system: systems[index + 1], Icon: ChevronRight },
  ];
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-4">
      <a href="?" onClick={onPlainClick(onBack)} className={cn("inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground", focusClass)}>
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />All systems
      </a>
      <div className="flex gap-2">
        {neighbours.map(({ label, system, Icon }) => system
          ? <a key={label} href={`?system=${system.slug}`} aria-label={`${label}: ${system.name}`} onClick={onPlainClick(() => onOpen(system.slug))}
            className={cn("rounded-full bg-muted p-2.5 transition-colors hover:bg-accent", focusClass)}><Icon aria-hidden="true" className="h-4 w-4" /></a>
          : <span key={label} aria-hidden="true" className="rounded-full bg-muted p-2.5 opacity-40"><Icon className="h-4 w-4" /></span>)}
      </div>
    </div>

    <Tile className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="space-y-4">
        <StatusLabel status={snapshot.status} />
        <h1 className="break-words text-5xl font-semibold tracking-tight sm:text-7xl">{data.name}</h1>
        <p className="max-w-xl text-xl leading-snug">{snapshot.headline}</p>
        {snapshot.concerns.length > 1 && <ul className="space-y-1 text-muted-foreground">{snapshot.concerns.slice(1).map((concern) => <li key={concern.text}>{concern.text}</li>)}</ul>}
        <div className="flex flex-wrap gap-2"><CheckChip type="AM" state={snapshot.am} /><CheckChip type="PM" state={snapshot.pm} /></div>
      </div>
      <div className="space-y-1">
        <p className="text-5xl font-semibold tracking-tight tabular-nums">{temperatureText(snapshot)}</p>
        <p className="text-sm text-muted-foreground">{waterTestedText(snapshot)}. {fedText(snapshot, data.hasAnimals)}.</p>
      </div>
    </Tile>

    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Tile>
        <div className="mb-6 space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Latest readings</h2>
          <p className="text-sm text-muted-foreground">{waterTestedText(snapshot)}. The shaded band is the target range.</p>
        </div>
        <dl className="grid gap-y-6">
          {snapshot.water.readings.map((reading) => <div key={reading.key} className="space-y-2">
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <dt className="text-muted-foreground">{reading.label}</dt>
              <dd className="font-medium">{readingValue(reading)}</dd>
            </div>
            <Gauge reading={reading} />
            <p className="text-xs text-muted-foreground">{reading.targetText ? `Target ${reading.targetText}` : "No target set"}</p>
          </div>)}
        </dl>
      </Tile>
      <WaterActivityCard data={data} />
    </div>

    <WaterTrendsCard data={data} range={range} onSelectRange={onSelectRange} />

    <Tile>
      <h2 className="mb-4 text-2xl font-semibold tracking-tight">Key highlights</h2>
      <HighlightsFeed items={data.highlights} />
    </Tile>
  </div>;
}
