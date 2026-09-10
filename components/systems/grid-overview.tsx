import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { buildWaterQualitySeries } from "@/components/systems/chart-data";
import { MultiLineChart } from "@/components/systems/charts";
import { HighlightsFeed } from "@/components/systems/highlights-feed";
import { HeroStatTiles } from "@/components/systems/stat-tiles";
import { CHART_RANGE_DAYS, type ChartRangeDays, type SystemDetailData } from "@/components/systems/types";

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
  const waterQualitySeries = buildWaterQualitySeries(data, undefined, range);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside className="flex shrink-0 flex-col gap-2 lg:w-64">
        {data.overview.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => onSelectSystem(s.slug)}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors",
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
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Water quality trends</CardTitle>
            <div className="flex gap-1">
              {CHART_RANGE_DAYS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => onSelectRange(d)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                    d === range
                      ? "border-primary bg-accent"
                      : "border-input hover:bg-accent/50",
                  )}
                >
                  {d}d
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <MultiLineChart series={waterQualitySeries} />
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
