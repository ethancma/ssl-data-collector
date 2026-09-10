import type { ChartSeries } from "@/components/systems/charts";
import type { SystemDetailData, WaterQualityPoint } from "@/components/systems/types";

type WaterQualityParam = "ph" | "alkalinity" | "ammonia" | "calcium" | "phosphate" | "magnesium" | "salinity";

const WATER_QUALITY_COLORS: Record<WaterQualityParam, string> = {
  ph: "#6366f1",
  alkalinity: "#10b981",
  ammonia: "#ef4444",
  calcium: "#3b82f6",
  phosphate: "#a855f7",
  magnesium: "#f59e0b",
  salinity: "#14b8a6",
};

const WATER_QUALITY_LABELS: Record<WaterQualityParam, string> = {
  ph: "pH",
  alkalinity: "Alkalinity",
  ammonia: "Ammonia",
  calcium: "Calcium",
  phosphate: "Phosphate",
  magnesium: "Magnesium",
  salinity: "Salinity",
};

// Builds one series per water-quality parameter, keeping only the readings
// where that parameter was actually recorded — cadence is weekly-ish and
// sparse, so most series will only have a handful of points in a 14d window.
// `data.waterQuality` is a 60-day superset; pass `days` to slice it down to
// the selected trend chart range without re-fetching.
export function buildWaterQualitySeries(
  data: SystemDetailData,
  parameters: WaterQualityParam[] = [
    "ph",
    "alkalinity",
    "ammonia",
    "calcium",
    "phosphate",
    "magnesium",
  ],
  days?: number,
): ChartSeries[] {
  const cutoff = days != null ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
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


