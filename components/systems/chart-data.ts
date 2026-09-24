import type { ChartSeries } from "@/components/systems/charts";
import {
  WATER_QUALITY_PARAMETERS,
  WATER_QUALITY_PARAMS,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import type { SystemDetailData, WaterQualityPoint } from "@/components/systems/types";

export type WaterQualityParam = WaterQualityParameter;

// Canonical order for pill/segmented-control lists (chart isolate + compare views).
export const ALL_WATER_QUALITY_PARAMS: WaterQualityParam[] = WATER_QUALITY_PARAMETERS;

export const WATER_QUALITY_COLORS: Record<WaterQualityParam, string> = Object.fromEntries(
  WATER_QUALITY_PARAMS.map((p) => [p.key, p.color]),
) as Record<WaterQualityParam, string>;

export const WATER_QUALITY_LABELS: Record<WaterQualityParam, string> = Object.fromEntries(
  WATER_QUALITY_PARAMS.map((p) => [p.key, p.label]),
) as Record<WaterQualityParam, string>;

// Builds one series per water-quality parameter, keeping only the readings
// where that parameter was actually recorded — cadence is weekly-ish and
// sparse, so most series will only have a handful of points in a 14d window.
// `data.waterQuality` is a 60-day superset; pass `days` to slice it down to
// the selected trend chart range without re-fetching.
export function buildWaterQualitySeries(
  data: SystemDetailData,
  parameters: WaterQualityParam[] = ALL_WATER_QUALITY_PARAMS,
  days?: number,
): ChartSeries[] {
  // Anchor the cutoff to the latest reading already present in `data` rather
  // than wall-clock `Date.now()`. `data` is a fixed snapshot fetched once on
  // the server and passed down as a prop, so this keeps the slice identical
  // between the server-rendered HTML and the client's first render — using
  // `Date.now()` here caused a hydration mismatch whenever a reading's
  // timestamp fell near the day-range boundary and the two renders happened
  // even a moment apart.
  const latestTestedAt = data.waterQuality.reduce(
    (latest, w) => Math.max(latest, new Date(w.testedAt).getTime()),
    0,
  );
  const cutoff = days != null && latestTestedAt > 0 ? latestTestedAt - days * 24 * 60 * 60 * 1000 : null;
  const waterQuality =
    cutoff != null ? data.waterQuality.filter((w) => new Date(w.testedAt).getTime() >= cutoff) : data.waterQuality;

  return parameters.map((param) => ({
    key: param,
    label: WATER_QUALITY_LABELS[param],
    color: WATER_QUALITY_COLORS[param],
    points: waterQuality
      .filter((w): w is WaterQualityPoint & Record<WaterQualityParam, number> => w[param] != null)
      .map((w) => ({ at: w.testedAt, value: w[param] })),
  }));
}


