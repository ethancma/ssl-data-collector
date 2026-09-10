import { SYSTEMS } from "@/lib/config/systems";
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

  const dataBySlug = await fetchAllSystemsDetailData();

  // `?system=` may be stale/mistyped (no dynamic route segment to 404 on
  // anymore) — fall back to the first configured system rather than crashing.
  const initialSlug = systemParam && systemParam in dataBySlug ? systemParam : SYSTEMS[0].slug;

  return (
    <SystemsPageClient dataBySlug={dataBySlug} initialSlug={initialSlug} initialRange={range} />
  );
}

