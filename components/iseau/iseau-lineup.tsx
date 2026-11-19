"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Columns3, Download } from "lucide-react";
import { useState } from "react";
import type { IseauData } from "@/lib/iseau/data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { lastHealth, type Star } from "@/lib/iseau/data";
import { RangeSwitch, StarCard, StatusSwitch, SystemSwitch, relativeDay, starSentence } from "./shared";
import { EmptyNote, PageHeader, Tile, focusClass } from "@/components/ui/app-layout";
import { compareHref, useIseau, type IseauState } from "./use-iseau";
import { SectionBoxes, SectionSheet, type SectionId } from "./widgets";

export default function IseauLineup({ data }: { data: IseauData }) {
  const router = useRouter();
  const pathname = usePathname();
  const state = useIseau(useSearchParams().get("star"), data);
  const { star } = state;
  // Changing a slicer on a star's page returns to the lineup with that filter applied.
  const sliced: IseauState = {
    ...state,
    setStatus: (value) => { state.setStatus(value); if (star) router.push(pathname); },
    setSystem: (value) => { state.setSystem(value); if (star) router.push(pathname); },
  };
  const systemLabel = state.system === "all"
    ? "any system"
    : data.systems.find((system) => system.id === state.system)!.name;
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-6">
    {!star && <PageHeader title="Which star needs a look?" description="Pick a system, then open a star. Past patients are one tap away." />}
    <div className="filter-toolbar"><div className="filter-grid">
      <SystemSwitch state={sliced} />
      <StatusSwitch state={sliced} />
      <Button asChild variant="outline" className="filter-grid__action touch-target h-9 rounded-full"><Link prefetch={false} href={compareHref(star ? [star, ...state.stars] : state.stars, data)}><Columns3 aria-hidden="true" />Compare stars</Link></Button>
    </div></div>
    {star ? <LineupDetail key={star.id} star={star} state={state} /> : state.stars.length
      ? <ul className="grid auto-rows-fr gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 16rem), 1fr))" }}>{state.stars.map((candidate) => <li key={candidate.id} className="min-w-0"><StarCard star={candidate} data={data} href={`${pathname}?star=${candidate.id}`} /></li>)}</ul>
      : <EmptyNote>No {state.status} patients in {systemLabel}. Try the other tab or another system.</EmptyNote>}
  </div>;
}

function LineupDetail({ star, state }: { star: Star; state: IseauState }) {
  const [open, setOpen] = useState<SectionId | null>(null);
  const place = star.location;
  return <div className="space-y-6">
    <Link href="/protected/iseau" prefetch={false} className={cn("inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground", focusClass)}><ArrowLeft aria-hidden="true" className="h-4 w-4" />All stars</Link>
    <Tile className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="space-y-3"><h1 className="break-words text-3xl font-semibold tracking-tight md:text-4xl">{star.name}</h1><p className="max-w-xl text-lg leading-snug">{starSentence(star, state.data.now)}</p></div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div><dt className="text-muted-foreground">Tank</dt><dd className="font-medium">{place.tank} in {place.system}</dd></div>
        <div><dt className="text-muted-foreground">Last observed</dt><dd className="font-medium">{relativeDay(lastHealth(star).at, state.data.now)}</dd></div>
      </dl>
    </Tile>
    <div className="filter-toolbar"><div className="filter-grid">
      <RangeSwitch state={state} />
      <Button variant="outline" onClick={state.exportCsv} className="filter-grid__action touch-target h-9 min-w-0 rounded-full"><Download aria-hidden="true" /><span className="truncate">Export {star.name} as CSV</span></Button>
    </div></div>
    <SectionBoxes data={state.data} star={star} range={state.range} onOpen={setOpen} />
    {open && <SectionSheet data={state.data} id={open} star={star} range={state.range} onClose={() => setOpen(null)} />}
  </div>;
}
