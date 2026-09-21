"use client";

// Lightweight dependency-free SVG charts (same technique as the existing
// Sparkline on the Home page). Handles sparse, irregularly-spaced points
// gracefully: each series only draws through the points it actually has, no
// interpolated/assumed values for missing days.

import { useRef, useState, type PointerEvent } from "react";

export type ChartSeries = {
  key: string;
  label: string;
  color: string;
  points: { at: string; value: number }[];
};

const CHART_WIDTH = 600;
const chartDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

// Shared formatting for numeric axis tick labels (also used by DualAxisLineChart).
function formatTick(v: number) {
  const rounded = Math.round(v * 100) / 100;
  return rounded.toString();
}

// Rough average glyph width for the default sans-serif font at a given size.
// Used to size the left/right axis margins so labels never get clipped by
// the chart bounds, regardless of digit/decimal count.
function estimateTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.6;
}

// Widens the fixed axis margin to fit the widest tick label, with a small
// buffer for the gap between the label and the axis plus the chart edge.
function computeAxisPadding(labels: string[], fontSize: number, minPad = 34) {
  const widest = labels.reduce((max, label) => Math.max(max, estimateTextWidth(label, fontSize)), 0);
  return Math.max(minPad, Math.ceil(widest) + 16);
}

// Shared hover state for both chart types below: a ref to the svg element
// (for hit-testing pointer coordinates) plus the currently hovered
// timestamp. Kept as a standalone hook (only primitive hooks, called
// unconditionally at the top of each component) so the actual nearest-point
// lookup, which depends on chart-specific scales, can be computed later in
// the render without violating the rules of hooks.
function useHoverState() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  return { svgRef, hoverTime, setHoverTime };
}

// Builds the pointer-move handler for a chart's overlay rect: converts the
// event's screen position into the chart's own coordinate space and snaps
// to the nearest data timestamp, so hovering anywhere along the chart shows
// the date for the closest point rather than requiring a precise hit on it.
function createPointerMoveHandler(
  svgRef: { current: SVGSVGElement | null },
  setHoverTime: (t: number | null) => void,
  times: number[],
  minT: number,
  maxT: number,
  padX: number,
  plotWidth: number,
) {
  const timeRange = maxT - minT || 1;
  return (event: PointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg || times.length === 0) return;
    const bounds = svg.getBoundingClientRect();
    if (bounds.width === 0) return;
    const relX = ((event.clientX - bounds.left) / bounds.width) * CHART_WIDTH;
    const clampedX = Math.min(Math.max(relX, padX), CHART_WIDTH - padX);
    const targetT = minT + ((clampedX - padX) / plotWidth) * timeRange;
    const nearest = times.reduce(
      (closest, t) => (Math.abs(t - targetT) < Math.abs(closest - targetT) ? t : closest),
      times[0],
    );
    setHoverTime(nearest);
  };
}

// Vertical guideline + date label shown at the hovered x-position. Rendered
// last (and with pointerEvents="none") so it sits above other elements
// without stealing hover events from the overlay rect.
function HoverIndicator({
  hoverTime,
  x,
  height,
  padY,
}: {
  hoverTime: number | null;
  x: (t: number) => number;
  height: number;
  padY: number;
}) {
  if (hoverTime == null) return null;
  const hx = x(hoverTime);
  const label = chartDateFormatter.format(hoverTime);
  const labelWidth = Math.ceil(estimateTextWidth(label, 12)) + 12;
  const boxHeight = 16;
  const boxY = Math.max(2, padY - boxHeight / 2);
  const boxX = Math.min(Math.max(hx - labelWidth / 2, 2), CHART_WIDTH - labelWidth - 2);

  // Presentation attributes like `fill`/`stroke` don't reliably pick up
  // Tailwind's `fill-*`/`stroke-*` utilities on raw SVG shapes, so — same as
  // the axis-label text above — theme color is set via a `text-*` class on
  // an ancestor and read back with the `currentColor` keyword instead.
  return (
    <g pointerEvents="none">
      <line
        x1={hx}
        x2={hx}
        y1={padY}
        y2={height - padY}
        stroke="currentColor"
        className="text-border"
        strokeDasharray="2,3"
      />
      <rect
        x={boxX}
        y={boxY}
        width={labelWidth}
        height={boxHeight}
        rx={4}
        fill="currentColor"
        className="text-popover"
      />
      <rect
        x={boxX}
        y={boxY}
        width={labelWidth}
        height={boxHeight}
        rx={4}
        fill="none"
        stroke="currentColor"
        className="text-border"
      />
      <text
        x={boxX + labelWidth / 2}
        y={boxY + boxHeight / 2 + 3}
        textAnchor="middle"
        fill="currentColor"
        className="text-xs text-popover-foreground"
      >
        {label}
      </text>
    </g>
  );
}

export function MultiLineChart({
  series,
  height = 220,
  emptyMessage = "No data in this window.",
}: {
  series: ChartSeries[];
  height?: number;
  emptyMessage?: string;
}) {
  const withPoints = series.filter((s) => s.points.length > 0);
  const allPoints = withPoints.flatMap((s) => s.points);
  const { svgRef, hoverTime, setHoverTime } = useHoverState();
  if (allPoints.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const allTimes = allPoints.map((p) => new Date(p.at).getTime());
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);
  const timeRange = maxT - minT || 1;

  // Isolating a single series (focusedParam !== "all") rescales the axis to
  // that series' own min/max instead of the multi-series shared range.
  const allValues = allPoints.map((p) => p.value);
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const valueRange = maxV - minV || 1;

  const padY = 12;
  const tickValues = minV === maxV ? [minV] : [maxV, (minV + maxV) / 2, minV];
  const padX = computeAxisPadding(tickValues.map(formatTick), 12); // room for the numeric y-axis tick labels
  const plotWidth = CHART_WIDTH - padX * 2;
  const x = (t: number) => padX + ((t - minT) / timeRange) * plotWidth;
  const y = (v: number) => height - padY - ((v - minV) / valueRange) * (height - padY * 2);

  const firstLabel = chartDateFormatter.format(minT);
  const lastLabel = chartDateFormatter.format(maxT);

  const handlePointerMove = createPointerMoveHandler(
    svgRef,
    setHoverTime,
    Array.from(new Set(allTimes)),
    minT,
    maxT,
    padX,
    plotWidth,
  );
  const handlePointerLeave = () => setHoverTime(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${height}`}
          preserveAspectRatio="none"
          className="w-full min-w-[600px] overflow-visible"
          style={{ height }}
        >
        <g className="text-xs text-muted-foreground">
          {tickValues.map((v, i) => (
            <text
              key={i}
              x={padX - 6}
              y={y(v)}
              dy={tickValues.length === 1 ? 3 : i === 0 ? 8 : i === tickValues.length - 1 ? -2 : 3}
              textAnchor="end"
              fill="currentColor"
            >
              {formatTick(v)}
            </text>
          ))}
        </g>
        {withPoints.map((s) => {
          const sorted = [...s.points].sort(
            (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
          );
          const pts = sorted.map((p) => `${x(new Date(p.at).getTime())},${y(p.value)}`).join(" ");
          return (
            <g key={s.key}>
              {sorted.length > 1 && (
                <polyline
                  points={pts}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {sorted.map((p, i) => {
                const tooltip = `${s.label}: ${p.value}`;
                return (
                  <circle
                    key={i}
                    cx={x(new Date(p.at).getTime())}
                    cy={y(p.value)}
                    r={2.5}
                    fill={s.color}
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{tooltip}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
        <rect
          x={0}
          y={0}
          width={CHART_WIDTH}
          height={height}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        />
        <HoverIndicator hoverTime={hoverTime} x={x} height={height} padY={padY} />
        </svg>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {withPoints.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
                aria-hidden
              />
              {s.label}
            </span>
          ))}
        </div>
        <span>
          {firstLabel} – {lastLabel}
        </span>
      </div>
    </div>
  );
}

// Two independent y-axes (left/right), each scaled to its own series' min/max
// so two chemicals on very different scales (e.g. Phosphate vs. Salinity) can
// be compared side by side without either being flattened. Tick labels are
// colored to match their series so it's clear which axis belongs to which line.
export function DualAxisLineChart({
  left,
  right,
  height = 220,
  emptyMessage = "No data in this window.",
}: {
  left: ChartSeries;
  right: ChartSeries;
  height?: number;
  emptyMessage?: string;
}) {
  const allPoints = [...left.points, ...right.points];
  const { svgRef, hoverTime, setHoverTime } = useHoverState();
  if (allPoints.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const allTimes = allPoints.map((p) => new Date(p.at).getTime());
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);
  const timeRange = maxT - minT || 1;

  const padY = 12;

  const scaleFor = (points: { value: number }[]) => {
    const values = points.map((p) => p.value);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const valueRange = maxV - minV || 1;
    return {
      minV,
      maxV,
      y: (v: number) => height - padY - ((v - minV) / valueRange) * (height - padY * 2),
    };
  };
  type Scale = ReturnType<typeof scaleFor>;

  const leftScale = left.points.length > 0 ? scaleFor(left.points) : null;
  const rightScale = right.points.length > 0 ? scaleFor(right.points) : null;

  const tickValuesFor = (scale: Scale | null) =>
    !scale ? [] : scale.minV === scale.maxV ? [scale.minV] : [scale.maxV, (scale.minV + scale.maxV) / 2, scale.minV];

  const padX = computeAxisPadding(
    [...tickValuesFor(leftScale), ...tickValuesFor(rightScale)].map(formatTick),
    12,
  ); // room for the tick labels on each side
  const plotWidth = CHART_WIDTH - padX * 2;
  const x = (t: number) => padX + ((t - minT) / timeRange) * plotWidth;

  const renderLine = (series: ChartSeries, scale: Scale | null) => {
    if (!scale || series.points.length === 0) return null;
    const sorted = [...series.points].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
    );
    const pts = sorted.map((p) => `${x(new Date(p.at).getTime())},${scale.y(p.value)}`).join(" ");
    return (
      <g key={series.key}>
        {sorted.length > 1 && (
          <polyline
            points={pts}
            fill="none"
            stroke={series.color}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {sorted.map((p, i) => {
          const tooltip = `${series.label}: ${p.value}`;
          return (
            <circle
              key={i}
              cx={x(new Date(p.at).getTime())}
              cy={scale.y(p.value)}
              r={2.5}
              fill={series.color}
              vectorEffect="non-scaling-stroke"
            >
              <title>{tooltip}</title>
            </circle>
          );
        })}
      </g>
    );
  };

  const renderTicks = (scale: Scale | null, series: ChartSeries, side: "left" | "right") => {
    if (!scale) return null;
    const anchor = side === "left" ? "end" : "start";
    const tx = side === "left" ? padX - 6 : CHART_WIDTH - padX + 6;
    const values = tickValuesFor(scale);
    return values.map((v, i) => (
      <text
        key={i}
        x={tx}
        y={scale.y(v)}
        dy={values.length === 1 ? 3 : i === 0 ? 8 : i === values.length - 1 ? -2 : 3}
        textAnchor={anchor}
        className="text-xs"
        fill={series.color}
      >
        {formatTick(v)}
      </text>
    ));
  };

  const firstLabel = chartDateFormatter.format(minT);
  const lastLabel = chartDateFormatter.format(maxT);

  const handlePointerMove = createPointerMoveHandler(
    svgRef,
    setHoverTime,
    Array.from(new Set(allTimes)),
    minT,
    maxT,
    padX,
    plotWidth,
  );
  const handlePointerLeave = () => setHoverTime(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${CHART_WIDTH} ${height}`}
          preserveAspectRatio="none"
          className="w-full min-w-[600px] overflow-visible"
          style={{ height }}
        >
          {renderTicks(leftScale, left, "left")}
          {renderTicks(rightScale, right, "right")}
          {renderLine(left, leftScale)}
          {renderLine(right, rightScale)}
          <rect
            x={0}
            y={0}
            width={CHART_WIDTH}
            height={height}
            fill="transparent"
            onPointerMove={handlePointerMove}
            onPointerLeave={handlePointerLeave}
          />
          <HoverIndicator hoverTime={hoverTime} x={x} height={height} padY={padY} />
        </svg>
      </div>
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <span>
          {firstLabel} – {lastLabel}
        </span>
      </div>
    </div>
  );
}

