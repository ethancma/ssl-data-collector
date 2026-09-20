// Lightweight dependency-free SVG charts (same technique as the existing
// Sparkline on the Home page). Handles sparse, irregularly-spaced points
// gracefully: each series only draws through the points it actually has, no
// interpolated/assumed values for missing days.

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
  const padX = 34; // room for the numeric y-axis tick labels
  const plotWidth = CHART_WIDTH - padX * 2;
  const x = (t: number) => padX + ((t - minT) / timeRange) * plotWidth;
  const y = (v: number) => height - padY - ((v - minV) / valueRange) * (height - padY * 2);

  const isSingleSeries = withPoints.length === 1;
  const tickColor = isSingleSeries ? withPoints[0].color : undefined;
  const tickValues = minV === maxV ? [minV] : [maxV, (minV + maxV) / 2, minV];

  const firstLabel = chartDateFormatter.format(minT);
  const lastLabel = chartDateFormatter.format(maxT);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${height}`}
          preserveAspectRatio="none"
          className="w-full min-w-[600px] overflow-visible"
          style={{ height }}
        >
        <g className={isSingleSeries ? undefined : "text-muted-foreground"}>
          {tickValues.map((v, i) => (
            <text
              key={i}
              x={padX - 6}
              y={y(v)}
              dy={tickValues.length === 1 ? 3 : i === 0 ? 8 : i === tickValues.length - 1 ? -2 : 3}
              textAnchor="end"
              fontSize={9}
              fill={tickColor ?? "currentColor"}
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
  if (allPoints.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  const allTimes = allPoints.map((p) => new Date(p.at).getTime());
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);
  const timeRange = maxT - minT || 1;

  const padY = 12;
  const padX = 34; // room for the tick labels on each side
  const plotWidth = CHART_WIDTH - padX * 2;
  const x = (t: number) => padX + ((t - minT) / timeRange) * plotWidth;

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

  const formatTick = (v: number) => {
    const rounded = Math.round(v * 100) / 100;
    return rounded.toString();
  };

  const renderTicks = (scale: Scale | null, series: ChartSeries, side: "left" | "right") => {
    if (!scale) return null;
    const anchor = side === "left" ? "end" : "start";
    const tx = side === "left" ? padX - 6 : CHART_WIDTH - padX + 6;
    const values = scale.minV === scale.maxV ? [scale.minV] : [scale.maxV, (scale.minV + scale.maxV) / 2, scale.minV];
    return values.map((v, i) => (
      <text
        key={i}
        x={tx}
        y={scale.y(v)}
        dy={values.length === 1 ? 3 : i === 0 ? 8 : i === values.length - 1 ? -2 : 3}
        textAnchor={anchor}
        fontSize={9}
        fill={series.color}
      >
        {formatTick(v)}
      </text>
    ));
  };

  const firstLabel = chartDateFormatter.format(minT);
  const lastLabel = chartDateFormatter.format(maxT);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${height}`}
          preserveAspectRatio="none"
          className="w-full min-w-[600px] overflow-visible"
          style={{ height }}
        >
          {renderTicks(leftScale, left, "left")}
          {renderTicks(rightScale, right, "right")}
          {renderLine(left, leftScale)}
          {renderLine(right, rightScale)}
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

