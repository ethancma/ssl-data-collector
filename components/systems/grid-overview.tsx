"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ALL_WATER_QUALITY_PARAMS,
  WATER_QUALITY_COLORS,
  WATER_QUALITY_LABELS,
  buildWaterQualitySeries,
  type WaterQualityParam,
} from "@/components/systems/chart-data";
import { DualAxisLineChart, MultiLineChart } from "@/components/systems/charts";
import { HighlightsFeed } from "@/components/systems/highlights-feed";
import { HeroStatTiles } from "@/components/systems/stat-tiles";
import { CHART_RANGE_DAYS, type ChartRangeDays, type SystemDetailData } from "@/components/systems/types";

const PILL_CLASS =
  "rounded-md border px-2 py-1 text-xs font-medium transition-colors";
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
// Grid Overview + Drill-in: a left rail of every system as a mini status
// card (acting as the selector) and a main panel for the selected one.
export function GridOverview({
  data,
  range,
  onSelectSystem,
  onSelectRange,
}: {
  data: SystemDetailData;
  range: ChartRangeDays;
  onSelectSystem: (slug: string) => void;
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
    pickDefaultParam(DEFAULT_RIGHT_PARAM, DEFAULT_LEFT_PARAM, availableParams),
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
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="flex min-w-0 gap-2 overflow-x-auto pb-1 lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0">
        {data.overview.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => onSelectSystem(s.slug)}
            className={cn(
              "w-56 shrink-0 rounded-lg border p-3 text-left transition-colors lg:w-auto",
              s.slug === data.slug
                ? "border-primary bg-accent"
                : "border-input hover:bg-accent/50",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{s.name}</span>
              <span className="text-sm tabular-nums text-muted-foreground">
                {s.latestTemperature != null ? `${s.latestTemperature.toFixed(1)}°C` : "—"}
              </span>
            </div>
            <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
              <span>AM {s.amDoneToday ? "✓" : "·"}</span>
              <span>PM {s.pmDoneToday ? "✓" : "·"}</span>
            </div>
          </button>
        ))}
      </aside>

      <div className="flex flex-1 flex-col gap-4">
        <HeroStatTiles data={data} />
        <Card>
          <CardHeader className="flex flex-col space-y-3 p-4 sm:p-6">
            <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-2">
              <CardTitle className="text-base">Water quality trends</CardTitle>
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
                    className={cn("rounded-md border p-1", PILL_INACTIVE)}
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
                    className={cn("rounded-md border p-1", PILL_INACTIVE)}
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
          </CardHeader>
          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key highlights</CardTitle>
          </CardHeader>
          <CardContent>
            <HighlightsFeed items={data.highlights} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

