import { ArrowLeft } from "lucide-react";

import { PageHeader, focusClass } from "@/components/iseau/shared";
import type { SystemDetailData } from "@/components/systems/types";
import { cn } from "@/lib/utils";

import { CheckChip, StatusLabel, fedText, onPlainClick, readingValue, temperatureText, waterTestedText } from "./snapshot-ui";

const ROW = "border-t border-background/70";
const HEAD = cn("sticky left-0 z-10 bg-muted py-3 pr-6 text-left text-sm font-normal text-muted-foreground", ROW);
const CELL = cn("min-w-44 py-3 pr-6 align-top text-sm", ROW);

export function SystemCompare({ systems, onOpen, onBack }: {
  systems: SystemDetailData[]; onOpen: (slug: string) => void; onBack: () => void;
}) {
  const params = systems[0].snapshot.water.readings;
  return <div className="space-y-8">
    <a href="?" onClick={onPlainClick(onBack)} className={cn("inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground", focusClass)}>
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />All systems
    </a>
    <PageHeader title="Every system, side by side." description="Read across a row to spot the odd one out. Amber values are outside their target range." />
    <div className="overflow-x-auto rounded-3xl bg-muted p-6 sm:p-8">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <td className="sticky left-0 z-10 bg-muted"><span className="sr-only">Metric</span></td>
            {systems.map(({ slug, name, category }) => <th key={slug} scope="col" className="min-w-44 pb-4 pr-6 text-left align-bottom font-normal">
              <a href={`?system=${slug}`} onClick={onPlainClick(() => onOpen(slug))} className={cn("block rounded", focusClass)}>
                <span className="block truncate text-2xl font-semibold tracking-tight">{name}</span>
                <span className="block text-sm capitalize text-muted-foreground">{category.replace(/_/g, " ")}</span>
              </a>
            </th>)}
          </tr>
        </thead>
        <tbody>
          <tr><th scope="row" className={HEAD}>Status</th>{systems.map(({ slug, snapshot }) => <td key={slug} className={CELL}><StatusLabel status={snapshot.status} /></td>)}</tr>
          <tr><th scope="row" className={HEAD}>Top concern</th>{systems.map(({ slug, snapshot }) => <td key={slug} className={CELL}>
            {snapshot.concerns.length ? <>{snapshot.headline}{snapshot.concerns.length > 1 && <span className="text-muted-foreground"> and {snapshot.concerns.length - 1} more</span>}</> : <span className="text-muted-foreground">None</span>}
          </td>)}</tr>
          <tr><th scope="row" className={HEAD}>AM check</th>{systems.map(({ slug, snapshot }) => <td key={slug} className={CELL}><CheckChip type="AM" state={snapshot.am} /></td>)}</tr>
          <tr><th scope="row" className={HEAD}>PM check</th>{systems.map(({ slug, snapshot }) => <td key={slug} className={CELL}><CheckChip type="PM" state={snapshot.pm} /></td>)}</tr>
          <tr><th scope="row" className={HEAD}>Temperature</th>{systems.map(({ slug, snapshot }) => <td key={slug} className={cn(CELL, "tabular-nums")}>{temperatureText(snapshot)}</td>)}</tr>
          {params.map((param, i) => <tr key={param.key}>
            <th scope="row" className={HEAD}>{param.label}{param.unit && <span className="ml-1 text-xs">{param.unit}</span>}</th>
            {systems.map(({ slug, snapshot }) => {
              const reading = snapshot.water.readings[i];
              return <td key={slug} className={CELL}>
                <span className="font-medium">{readingValue({ ...reading, unit: "" })}</span>
                {reading.value !== null && !reading.targetText && <span className="ml-2 text-xs text-muted-foreground">No target set</span>}
              </td>;
            })}
          </tr>)}
          <tr><th scope="row" className={HEAD}>Last water test</th>{systems.map(({ slug, snapshot }) => <td key={slug} className={CELL}>{waterTestedText(snapshot).replace("Water tested ", "")}</td>)}</tr>
          <tr><th scope="row" className={HEAD}>Last fed</th>{systems.map(({ slug, hasAnimals, snapshot }) => <td key={slug} className={CELL}>{fedText(snapshot, hasAnimals).replace("Fed ", "")}</td>)}</tr>
        </tbody>
      </table>
    </div>
  </div>;
}
