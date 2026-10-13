"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Columns3, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { currentLocation, lastHealth, type Star } from "./mock-data";
import { EmptyNote, PageHeader, RangeSwitch, SampleNote, StarCard, StatusSwitch, SystemSwitch, Tile, focusClass, relativeDay, starSentence } from "./shared";
import { compareHref, useIseau, type IseauState } from "./use-iseau";
import { SectionBoxes, SectionSheet, type SectionId } from "./widgets";

export default function IseauLineup() {
  const router = useRouter();
  const pathname = usePathname();
  const state = useIseau(useSearchParams().get("star"));
  const { star } = state;
  // Changing a slicer on a star's page returns to the lineup with that filter applied.
  const sliced: IseauState = {
    ...state,
    setStatus: (value) => { state.setStatus(value); if (star) router.push(pathname); },
    setSystem: (value) => { state.setSystem(value); if (star) router.push(pathname); },
  };
  return <div className="mx-auto w-full min-w-0 max-w-7xl space-y-8 p-4 sm:p-8">
    {!star && <PageHeader title="Which star needs a look?" description="Pick a system, then open a star. Past patients are one tap away." />}
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-4"><SystemSwitch state={sliced} /><StatusSwitch state={sliced} /></div>
      <Button asChild variant="outline"><Link href={compareHref(star ? [star, ...state.stars] : state.stars)}><Columns3 aria-hidden="true" />Compare stars</Link></Button>
    </div>
    {star ? <LineupDetail key={star.id} star={star} state={state} /> : state.stars.length
      ? <ul className="grid auto-rows-fr gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))" }}>{state.stars.map((candidate) => <li key={candidate.id} className="min-w-0"><StarCard star={candidate} href={`${pathname}?star=${candidate.id}`} /></li>)}</ul>
      : <EmptyNote>No {state.status} patients in {state.system === "all" ? "any system" : state.system}. Try the other tab or another system.</EmptyNote>}
    <SampleNote />
  </div>;
}

function LineupDetail({ star, state }: { star: Star; state: IseauState }) {
  const [open, setOpen] = useState<SectionId | null>(null);
  const place = currentLocation(star);
  return <div className="space-y-6">
    <Link href="/protected/iseau" className={cn("inline-flex items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground", focusClass)}><ArrowLeft aria-hidden="true" className="h-4 w-4" />All stars</Link>
    <Tile className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
      <div className="space-y-3"><h1 className="text-5xl font-semibold tracking-tight sm:text-7xl">{star.name}</h1><p className="max-w-xl text-xl leading-snug">{starSentence(star)}</p></div>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <div><dt className="text-muted-foreground">Tank</dt><dd className="font-medium">{place.tank} in {place.system}</dd></div>
        <div><dt className="text-muted-foreground">Last observed</dt><dd className="font-medium">{relativeDay(lastHealth(star).at)}</dd></div>
      </dl>
    </Tile>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <RangeSwitch state={state} />
      <Button variant="outline" onClick={state.exportCsv}><Download aria-hidden="true" />Export {star.name} as CSV</Button>
    </div>
    <SectionBoxes star={star} range={state.range} onOpen={setOpen} />
    {open && <SectionSheet id={open} star={star} range={state.range} onClose={() => setOpen(null)} />}
  </div>;
}
