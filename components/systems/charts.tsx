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

  const allValues = allPoints.map((p) => p.value);
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const valueRange = maxV - minV || 1;

  const padY = 12;
  const x = (t: number) => ((t - minT) / timeRange) * CHART_WIDTH;
  const y = (v: number) => height - padY - ((v - minV) / valueRange) * (height - padY * 2);

  const firstLabel = new Date(minT).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const lastLabel = new Date(maxT).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${CHART_WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="w-full overflow-visible"
        style={{ height }}
      >
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
              {sorted.map((p, i) => (
                <circle
                  key={i}
                  cx={x(new Date(p.at).getTime())}
                  cy={y(p.value)}
                  r={2.5}
                  fill={s.color}
                  vectorEffect="non-scaling-stroke"
                >
                  <title>
                    {s.label}: {p.value}
                  </title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
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

