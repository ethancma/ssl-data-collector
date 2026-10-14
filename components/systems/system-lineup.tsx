import { Columns3 } from "lucide-react";

import { PageHeader, focusClass } from "@/components/iseau/shared";
import { Button } from "@/components/ui/button";
import type { SystemDetailData } from "@/components/systems/types";
import { cn } from "@/lib/utils";

import { CheckChip, StatusLabel, fedText, onPlainClick, readingValue, temperatureText, waterTestedText } from "./snapshot-ui";

function summary(systems: SystemDetailData[]) {
  const count = (status: string) => systems.filter((system) => system.snapshot.status === status).length;
  const attention = count("attention");
  const watch = count("watch");
  if (attention + watch === 0) return { title: "Every system is on track.", description: "Open a system for trends and recent activity." };
  const parts = [attention && `${attention} need${attention === 1 ? "s" : ""} attention`, watch && `${watch} worth a look`].filter(Boolean);
  return { title: "Which system needs a look?", description: `${parts.join(", ")}. Concerns come first. Open a system for trends and recent activity.` };
}

// `systems` arrives sorted concerns-first.
export function SystemLineup({ systems, onOpen, onCompare }: {
  systems: SystemDetailData[]; onOpen: (slug: string) => void; onCompare: () => void;
}) {
  const { title, description } = summary(systems);
  return <div className="space-y-8">
    <PageHeader title={title} description={description} />
    <div className="flex justify-end">
      <Button asChild variant="outline">
        <a href="?compare=1" onClick={onPlainClick(onCompare)}><Columns3 aria-hidden="true" />Compare systems</a>
      </Button>
    </div>
    <ul className="grid auto-rows-fr gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(18rem, 1fr))" }}>
      {systems.map(({ slug, name, category, hasAnimals, snapshot }) => {
        const ph = snapshot.water.readings.find((reading) => reading.key === "ph");
        const ammonia = snapshot.water.readings.find((reading) => reading.key === "ammonia");
        return <li key={slug} className="min-w-0">
          <a href={`?system=${slug}`} onClick={onPlainClick(() => onOpen(slug))}
            className={cn("flex h-full flex-col gap-4 rounded-3xl bg-muted p-6 transition-colors hover:bg-accent", focusClass)}>
            <div className="space-y-1">
              <span className="block truncate text-3xl font-semibold tracking-tight">{name}</span>
              <span className="block text-sm capitalize text-muted-foreground">{category.replace(/_/g, " ")}</span>
            </div>
            <div className="space-y-1">
              <StatusLabel status={snapshot.status} />
              <p className="min-h-12 text-lg leading-snug">
                {snapshot.headline}
                {snapshot.concerns.length > 1 && <span className="text-muted-foreground"> and {snapshot.concerns.length - 1} more</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2"><CheckChip type="AM" state={snapshot.am} /><CheckChip type="PM" state={snapshot.pm} /></div>
            <dl className="mt-auto grid grid-cols-3 gap-2 text-sm">
              <div><dt className="text-muted-foreground">Temp</dt><dd className="font-medium tabular-nums">{temperatureText(snapshot)}</dd></div>
              <div><dt className="text-muted-foreground">pH</dt><dd className="font-medium">{ph ? readingValue(ph) : "\u2014"}</dd></div>
              <div><dt className="text-muted-foreground">Ammonia</dt><dd className="font-medium">{ammonia ? readingValue(ammonia) : "\u2014"}</dd></div>
            </dl>
            <p className="text-sm text-muted-foreground">{waterTestedText(snapshot)}. {fedText(snapshot, hasAnimals)}.</p>
          </a>
        </li>;
      })}
    </ul>
  </div>;
}
