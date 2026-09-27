import { SystemsPageClient } from "@/components/systems/systems-page-client";
import { CHART_RANGE_DAYS, type ChartRangeDays } from "@/components/systems/types";

import { fetchAllSystemsDetailData } from "./data";

export default async function SystemsPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string; range?: string }>;
}) {
  const { system: systemParam, range: rangeParam } = await searchParams;

  const parsedRange = Number(rangeParam);
  const range: ChartRangeDays = (CHART_RANGE_DAYS as readonly number[]).includes(parsedRange)
    ? (parsedRange as ChartRangeDays)
    : 14;

  const { dataBySlug, error } = await fetchAllSystemsDetailData();
  if (error) {
    return (
      <p className="text-sm text-red-500" role="alert">
        Systems could not be loaded: {error}
      </p>
    );
  }

  const systemSlugs = Object.keys(dataBySlug);
  if (systemSlugs.length === 0) {
    return (
      <p className="rounded-md border p-6 text-sm text-muted-foreground">
        No systems are configured.
      </p>
    );
  }

  // `?system=` may be stale/mistyped (no dynamic route segment to 404 on
  // anymore) — fall back to the first database-ordered system rather than crashing.
  const initialSlug = systemParam && systemParam in dataBySlug ? systemParam : systemSlugs[0];

  return (
    <SystemsPageClient dataBySlug={dataBySlug} initialSlug={initialSlug} initialRange={range} />
  );
}

