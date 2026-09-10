import { Card } from "@/components/ui/card";
import type { SystemDetailData } from "@/components/systems/types";

function StatTile({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Card>
  );
}

// Hero stat row: current temp, last pH, AM/PM status.
// No safe/target ranges are known yet, so this shows raw values only.
export function HeroStatTiles({ data }: { data: SystemDetailData }) {
  const latestTemp = [...data.dailyChecks].reverse().find((c) => c.temperature != null)
    ?.temperature;
  const latestPh = [...data.waterQuality].reverse().find((w) => w.ph != null)?.ph;
  const today = data.overview.find((o) => o.slug === data.slug);

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatTile value={latestTemp != null ? `${latestTemp.toFixed(1)}°C` : "—"} label="Current temp" />
      <StatTile value={latestPh != null ? latestPh.toFixed(2) : "—"} label="Last pH" />
      <StatTile value={today?.amDoneToday ? "Done" : "Open"} label="AM check" />
      <StatTile value={today?.pmDoneToday ? "Done" : "Open"} label="PM check" />
    </div>
  );
}
