"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Tile, focusClass } from "@/components/ui/app-layout";
import { CompactSelect } from "@/components/ui/app-primitives";
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

const PAGER_BUTTON_CLASS = "border-input [@media(hover:hover)]:hover:bg-accent/50";

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

// The compare axis picker: a shared filter dropdown whose dot matches its chart line.
function ChemicalSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: WaterQualityParam;
  options: WaterQualityParam[];
  onChange: (param: WaterQualityParam) => void;
}) {
  return (
    <CompactSelect
      label={label}
      value={value}
      onChange={onChange}
      icon={<span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: WATER_QUALITY_COLORS[value] }} />}
      options={options.map((param) => ({ value: param, label: WATER_QUALITY_LABELS[param] }))}
    />
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">Water quality trends</h2>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            aria-label="Previous chart page"
            onClick={() => goToPage(page - 1)}
            className={cn("touch-target rounded-full border p-1.5", PAGER_BUTTON_CLASS, focusClass)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div className="flex items-center gap-1" aria-hidden="true">
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
            className={cn("touch-target rounded-full border p-1.5", PAGER_BUTTON_CLASS, focusClass)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="filter-toolbar">
        <div className="filter-grid">
          <CompactSelect
            className={page === 1 ? "filter-grid__lead" : undefined}
            label="Chart time range"
            value={String(range)}
            onChange={(value) => {
              const days = CHART_RANGE_DAYS.find((option) => String(option) === value);
              if (days) onSelectRange(days);
            }}
            options={CHART_RANGE_DAYS.map((days) => ({ value: String(days), label: `Last ${days} days` }))}
          />
          {page === 0 && (
            <CompactSelect
              label="Water quality parameter"
              value={focusedParam}
              onChange={setFocusedParam}
              options={[
                { value: "all", label: "All parameters" },
                ...availableParams.map((param) => ({ value: param, label: WATER_QUALITY_LABELS[param] })),
              ]}
            />
          )}
          {page === 1 && (
            <>
              <ChemicalSelect
                label="Left axis parameter"
                value={leftParam}
                options={availableParams.filter((p) => p !== rightParam)}
                onChange={setLeftParam}
              />
              <ChemicalSelect
                label="Right axis parameter"
                value={rightParam}
                options={availableParams.filter((p) => p !== leftParam)}
                onChange={setRightParam}
              />
            </>
          )}
        </div>
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
          <DualAxisLineChart left={leftSeries} right={rightSeries} />
        )}
      </div>
    </Tile>
  );
}
