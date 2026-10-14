"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Tile } from "@/components/iseau/shared";
import { cn } from "@/lib/utils";
import {
  ALL_WATER_QUALITY_PARAMS,
  WATER_QUALITY_COLORS,
  WATER_QUALITY_LABELS,
  buildWaterQualitySeries,
  type WaterQualityParam,
} from "@/components/systems/chart-data";
import { DualAxisLineChart, MultiLineChart } from "@/components/systems/charts";
import { CHART_RANGE_DAYS, type ChartRangeDays, type SystemDetailData } from "@/components/systems/types";

const PILL_CLASS =
  "rounded-full border px-3 py-1 text-xs font-medium transition-colors";
const PILL_ACTIVE = "border-primary bg-accent";
const PILL_INACTIVE = "border-input hover:bg-accent/50";

const TREND_PAGE_COUNT = 2;
const DEFAULT_LEFT_PARAM: WaterQualityParam = "phosphate";
const DEFAULT_RIGHT_PARAM: WaterQualityParam = "ammonia";

// Falls back to any other available param if the preferred default isn't
// present in this system's data (or collides with the other axis).
function pickDefaultParam(
  preferred: WaterQualityParam,
  avoid: WaterQualityParam,
  available: WaterQualityParam[],
): WaterQualityParam {
  if (available.includes(preferred) && preferred !== avoid) return preferred;
  return available.find((p) => p !== avoid) ?? preferred;
}

// A native <select> styled to look like the existing pill convention, with a
// chevron affixed beside it — the "Phosphate ▾" swap control for Page 2's
// axes. The border/padding live on the wrapper so the select and chevron are
// laid out as ordinary flex siblings (with a gap) rather than stacking the
// chevron on top of the select via absolute positioning, which could overlap
// the label text once the select's intrinsic width didn't leave enough room.
function ChemicalSelectPill({
  value,
  options,
  onChange,
  align,
}: {
  value: WaterQualityParam;
  options: WaterQualityParam[];
  onChange: (param: WaterQualityParam) => void;
  align: "left" | "right";
}) {
  const color = WATER_QUALITY_COLORS[value];
  return (
    <div
      className={cn(
        PILL_CLASS,
        "inline-flex items-center gap-1 border bg-transparent",
        align === "right" && "flex-row-reverse",
      )}
      style={{ borderColor: color }}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as WaterQualityParam)}
        style={{ color }}
        className="appearance-none border-none bg-transparent p-0 pr-0 focus:outline-none"
      >
        {options.map((p) => (
          <option key={p} value={p} className="text-foreground">
            {WATER_QUALITY_LABELS[p]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none h-3 w-3 shrink-0" style={{ color }} />
    </div>
  );
}
// Water quality trend chart for one system: a carousel of an all-parameters
// (or single-parameter) line chart and a dual-axis compare chart.
export function WaterTrendsCard({
  data,
  range,
  onSelectRange,
}: {
  data: SystemDetailData;
  range: ChartRangeDays;
  onSelectRange: (range: ChartRangeDays) => void;
}) {
  // Params this system actually has any readings for, across the full
  // fetched window — stable regardless of the selected trend range so pills
  // don't flicker in/out when switching 7d/14d/30d.
  const availableParams = useMemo(
    () => ALL_WATER_QUALITY_PARAMS.filter((p) => data.waterQuality.some((w) => w[p] != null)),
    [data],
  );

  const [page, setPage] = useState(0);
  const [focusedParam, setFocusedParam] = useState<WaterQualityParam | "all">("all");
  const [leftParam, setLeftParam] = useState<WaterQualityParam>(() =>
    pickDefaultParam(DEFAULT_LEFT_PARAM, DEFAULT_RIGHT_PARAM, availableParams),
  );
  const [rightParam, setRightParam] = useState<WaterQualityParam>(() =>
    pickDefaultParam(
      DEFAULT_RIGHT_PARAM,
      pickDefaultParam(DEFAULT_LEFT_PARAM, DEFAULT_RIGHT_PARAM, availableParams),
      availableParams,
    ),
  );

  const goToPage = (next: number) => setPage(((next % TREND_PAGE_COUNT) + TREND_PAGE_COUNT) % TREND_PAGE_COUNT);

  const handleChartKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goToPage(page - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goToPage(page + 1);
    }
  };

  // Page 1 series: default "All" matches today's behavior exactly; selecting
  // a single chemical draws only that line and lets the chart's own min/max
  // scaling (rather than the shared one) take over.
  const trendSeries =
    focusedParam === "all"
      ? buildWaterQualitySeries(data, undefined, range)
      : buildWaterQualitySeries(data, [focusedParam], range);

  // Page 2 series: independent left/right picks, each its own axis.
  const [leftSeries, rightSeries] = useMemo(() => {
    const built = buildWaterQualitySeries(data, [leftParam, rightParam], range);
    return [built[0], built[1]];
  }, [data, leftParam, rightParam, range]);

  return (
    <Tile className="flex flex-col gap-4">
      <div className="flex flex-col space-y-3">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Water quality trends</h2>
          <div className="flex w-full flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-start">
            <div className="flex gap-1">
              {CHART_RANGE_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onSelectRange(d)}
                  className={cn(PILL_CLASS, d === range ? PILL_ACTIVE : PILL_INACTIVE)}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous chart page"
                onClick={() => goToPage(page - 1)}
                className={cn("rounded-full border p-1.5", PILL_INACTIVE)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-1" role="tablist" aria-label="Chart page">
                {Array.from({ length: TREND_PAGE_COUNT }).map((_, i) => (
                  <span
                    key={i}
                    aria-hidden
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-colors",
                      i === page ? "bg-primary" : "bg-muted-foreground/30",
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                aria-label="Next chart page"
                onClick={() => goToPage(page + 1)}
                className={cn("rounded-full border p-1.5", PILL_INACTIVE)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        {page === 0 && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setFocusedParam("all")}
              className={cn(PILL_CLASS, focusedParam === "all" ? PILL_ACTIVE : PILL_INACTIVE)}
            >
              All
            </button>
            {availableParams.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setFocusedParam((current) => (current === p ? "all" : p))}
                className={cn(PILL_CLASS, focusedParam === p ? PILL_ACTIVE : PILL_INACTIVE)}
              >
                {WATER_QUALITY_LABELS[p]}
              </button>
            ))}
          </div>
        )}
      </div>
      <div
        tabIndex={0}
        role="group"
        aria-label={`Water quality trend chart, page ${page + 1} of ${TREND_PAGE_COUNT}. Use arrow keys to switch pages.`}
        onKeyDown={handleChartKeyDown}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {page === 0 ? (
          <MultiLineChart series={trendSeries} />
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <ChemicalSelectPill
                value={leftParam}
                options={availableParams.filter((p) => p !== rightParam)}
                onChange={setLeftParam}
                align="left"
              />
              <ChemicalSelectPill
                value={rightParam}
                options={availableParams.filter((p) => p !== leftParam)}
                onChange={setRightParam}
                align="right"
              />
            </div>
            <DualAxisLineChart left={leftSeries} right={rightSeries} />
          </div>
        )}
      </div>
    </Tile>
  );
}

