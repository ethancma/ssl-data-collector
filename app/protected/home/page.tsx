import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

import { loadHomeDashboardData } from "./data";
import { deriveHomeDashboard, type HealthObservationEntry } from "./derivations";
import { SegmentedTabs } from "./segmented-tabs";

function severityBadgeVariant(severity: HealthObservationEntry["severity"]) {
  if (severity === "high") return "destructive" as const;
  if (severity === "medium") return "default" as const;
  return "secondary" as const;
}

function formatRelativeTime(isoDate: string) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.round(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

function Sparkline({ data, height = 80 }: { data: number[]; height?: number }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const width = 100;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${i * stepX},${height - ((v - min) / range) * height}`)
    .join(" ");
  const lastX = (data.length - 1) * stepX;
  const lastY = height - ((data[data.length - 1] - min) / range) * height;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-20 w-full overflow-visible"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={1.5} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatTile({ value, label }: { value: string | number; label: string }) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </Card>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Sunflower Star Laboratory</p>
        <h1 className="text-3xl font-semibold tracking-tight">Home</h1>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <HomeContent />
      </Suspense>
    </div>
  );
}

async function HomeContent() {
  const result = await loadHomeDashboardData();
  if (!result.ok) {
    return (
      <p className="text-sm text-red-500" role="alert">
        Dashboard data could not be loaded: {result.error}
      </p>
    );
  }
  if (result.data.systems.length === 0) {
    return (
      <p className="rounded-md border p-6 text-sm text-muted-foreground">
        No systems are configured.
      </p>
    );
  }

  const dashboard = deriveHomeDashboard(result.data);
  const {
    activeSystems,
    allClearSystems,
    attentionSystems,
    chemicalAdditionsToday,
    checksLogged,
    delta,
    feedingLogsToday,
    healthObservationEntries,
    healthObservationsToday,
    lastReading,
    totalAnimals,
    totalTanks,
    waterQualityTrend,
  } = dashboard;
  const checksPossible = activeSystems * 2;

  const agendaPanel = (
    <div className="flex flex-col divide-y rounded-xl border">
      {attentionSystems.map((s) => (
        <div key={s.id} className="flex flex-col gap-1 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{s.name}</span>
            <Badge variant="secondary">{s.outstanding.length} open</Badge>
          </div>
          <span className="text-sm text-muted-foreground">{s.outstanding.join(", ")}</span>
        </div>
      ))}
      {allClearSystems.length > 0 && (
        <div className="p-4 text-sm text-muted-foreground">
          All clear: {allClearSystems.join(", ")}
        </div>
      )}
      {attentionSystems.length === 0 && allClearSystems.length === 0 && (
        <div className="p-4 text-sm text-muted-foreground">No systems found.</div>
      )}
    </div>
  );

  const activityPanel = (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile value={`${checksLogged}/${checksPossible}`} label="Checks logged" />
        <StatTile value={feedingLogsToday} label="Feeding logs" />
        <StatTile value={chemicalAdditionsToday} label="Chemical additions" />
        <StatTile value={healthObservationsToday} label="Health observations" />
      </div>
      <Card className="p-5">
        <h3 className="mb-3 text-base font-semibold">Recent health observations</h3>
        {healthObservationEntries.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {healthObservationEntries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">{entry.system}</span>
                  <span className="text-muted-foreground">{entry.issue}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant={severityBadgeVariant(entry.severity)}>{entry.severity}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(entry.observedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No health observations logged yet.</p>
        )}
      </Card>
    </div>
  );

  const trendsPanel = (
    <Card className="p-5">
      <h3 className="mb-1 text-base font-semibold">Water quality trend</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Average pH across tested systems, last 14 days
      </p>
      {lastReading !== undefined ? (
        <>
          <div className="text-indigo-600 dark:text-indigo-400">
            <Sparkline data={waterQualityTrend} />
          </div>
          <p className="mt-3 text-sm tabular-nums">
            {lastReading.toFixed(2)}
            {delta !== null && (
              <span className="ml-2 text-muted-foreground">
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(2)} vs. earliest reading
              </span>
            )}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No water quality readings in the last 14 days.</p>
      )}
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <span>
          <strong className="tabular-nums">{totalAnimals}</strong>{" "}
          <span className="text-muted-foreground">total animals</span>
        </span>
        <span>
          <strong className="tabular-nums">{activeSystems}</strong>{" "}
          <span className="text-muted-foreground">active systems</span>
        </span>
        <span>
          <strong className="tabular-nums">{totalTanks}</strong>{" "}
          <span className="text-muted-foreground">total tanks</span>
        </span>
      </div>

      <SegmentedTabs agenda={agendaPanel} activity={activityPanel} trends={trendsPanel} />
    </div>
  );
}
