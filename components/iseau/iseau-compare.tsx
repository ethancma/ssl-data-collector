"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { STARS, currentLocation, isCurrent, lastHealth, starData } from "./mock-data";
import { PageHeader, RangeSwitch, SampleNote, SeverityLabel, dateLabel, focusClass, relativeDay, starSentence } from "./shared";
import { compareIds, useIseau } from "./use-iseau";
import { SECTIONS, SectionBox, SectionSheet, type SectionId } from "./widgets";

export default function IseauCompare() {
  const router = useRouter();
  const pathname = usePathname();
  const ids = compareIds(useSearchParams().get("stars"));
  const state = useIseau(null);
  const [open, setOpen] = useState<{ starId: string; id: SectionId } | null>(null);
  const openStar = STARS.find((candidate) => candidate.id === open?.starId);
  function pick(column: number, id: string) {
    const next = [...ids];
    next[column] = id;
    router.replace(`${pathname}?stars=${next.join(",")}`, { scroll: false });
  }
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8 p-4 sm:p-8">
    <Link href="/protected/iseau" className={cn("inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground", focusClass)}><ArrowLeft aria-hidden="true" className="h-4 w-4" />Back to lineup</Link>
    <PageHeader title="Compare stars side by side." description="Pick a star in each column, then open any box for its full history." />
    <RangeSwitch state={state} />
    {/* Always three columns; narrow screens scroll sideways instead of stacking so rows stay comparable. */}
    <div className="overflow-x-auto pb-2"><div className="grid gap-x-4" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", minWidth: "46rem" }}>
      {ids.map((id, column) => {
        const star = STARS.find((candidate) => candidate.id === id)!;
        const span = starData(star, state.range);
        return <div key={column} className="min-w-0" style={{ display: "grid", gridRow: "span 6", gridTemplateRows: "subgrid", rowGap: "1rem" }}>
          <div className="space-y-4">
            <div className="relative">
              <label htmlFor={`iseau-compare-${column}`} className="sr-only">Star {column + 1}</label>
              <select id={`iseau-compare-${column}`} value={star.id} onChange={(event) => pick(column, event.target.value)}
                className={cn("h-16 w-full appearance-none rounded-xl border border-border bg-background pl-4 pr-12 text-xl font-semibold", focusClass)}>
                {([true, false] as const).map((current) => <optgroup key={String(current)} label={current ? "Current patients" : "Past patients"}>
                  {STARS.filter((candidate) => isCurrent(candidate) === current).map((candidate) =>
                    <option key={candidate.id} value={candidate.id} disabled={candidate.id !== star.id && ids.includes(candidate.id)}>{candidate.name}</option>)}
                </optgroup>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <div className="space-y-1 px-1">
              <p className="text-sm"><SeverityLabel severity={lastHealth(star).severity} /></p>
              <p className="text-sm text-muted-foreground">{currentLocation(star).tank} in {currentLocation(star).system}. Last observed {relativeDay(lastHealth(star).at)}.</p>
              <p className="text-base font-medium leading-snug">{starSentence(star)}</p>
              <p className="text-xs text-muted-foreground">Showing {dateLabel(span.start)} to {dateLabel(span.end)}</p>
            </div>
          </div>
          {SECTIONS.map(({ id: sectionId }) => <SectionBox key={sectionId} id={sectionId} star={star} range={state.range} onOpen={() => setOpen({ starId: star.id, id: sectionId })} />)}
        </div>;
      })}
    </div></div>
    {open && openStar && <SectionSheet id={open.id} star={openStar} range={state.range} onClose={() => setOpen(null)} />}
    <SampleNote />
  </div>;
}
