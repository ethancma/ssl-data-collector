"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { GridOverview } from "@/components/systems/grid-overview";
import type { ChartRangeDays, SystemDetailData } from "@/components/systems/types";

// Owns "which system is selected" and "which trend chart range is selected"
// as client state so switching either is an instant local re-render from
// data already fetched for all 8 systems (60 days' worth), with no network
// round-trip. The URL (`?system=&range=`) is kept in sync via router.replace
// for shareable/bookmarkable links, but that sync never blocks the state
// update that drives the UI.
export function SystemsPageClient({
  dataBySlug,
  initialSlug,
  initialRange,
}: {
  dataBySlug: Record<string, SystemDetailData>;
  initialSlug: string;
  initialRange: ChartRangeDays;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState(initialSlug);
  const [range, setRange] = useState<ChartRangeDays>(initialRange);

  const data = dataBySlug[slug];

  const syncUrl = (nextSlug: string, nextRange: ChartRangeDays) => {
    router.replace(`/protected/systems?system=${nextSlug}&range=${nextRange}`, {
      scroll: false,
    });
  };

  const handleSelectSystem = (nextSlug: string) => {
    setSlug(nextSlug);
    syncUrl(nextSlug, range);
  };

  const handleSelectRange = (nextRange: ChartRangeDays) => {
    setRange(nextRange);
    syncUrl(slug, nextRange);
  };

  // Shouldn't happen — dataBySlug is built from the same SYSTEMS config the
  // page fell back to — but fail loud rather than render a blank page.
  if (!data) {
    throw new Error(`No data found for system "${slug}"`);
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Systems</p>
        <h1 className="text-3xl font-semibold tracking-tight">{data.name}</h1>
      </header>
      <GridOverview
        data={data}
        range={range}
        onSelectSystem={handleSelectSystem}
        onSelectRange={handleSelectRange}
      />
    </div>
  );
}
