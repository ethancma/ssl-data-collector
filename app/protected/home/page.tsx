import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { HealthIssueType } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/server";

import { SegmentedTabs } from "./segmented-tabs";

// Same Pacific-day rule as the old Today dashboard: look back 36h/14d, then
// bucket rows by their Pacific calendar day for "today"/weekly/trend logic.
const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ISSUE_LABELS: Record<HealthIssueType, string> = {
  arm_drop: "Arm drop",
  spine_drop: "Spine drop",
  lesion: "Lesion",
  arm_curling: "Arm curling",
  flattening: "Flattening",
  other: "Other",
};

type SystemAgendaStatus = {
  id: number;
  name: string;
  amDone: boolean;
  pmDone: boolean;
  fedToday: boolean;
  testedThisWeek: boolean;
};

function outstandingItems(s: SystemAgendaStatus) {
  const items: string[] = [];
  if (!s.amDone) items.push("AM check");
  if (!s.pmDone) items.push("PM check");
  if (!s.fedToday) items.push("Feeding");
  if (!s.testedThisWeek) items.push("Water quality");
  return items;
}

type HealthObservationEntry = {
  id: number;
  system: string;
  issue: string;
  severity: "low" | "medium" | "high";
  observedAt: string;
};

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
  const supabase = await createClient();

  const since36h = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: systems },
    { data: checks },
    { data: feedingLogs },
    { data: waterQualityReadings },
    { data: chemicalAdditions },
    { data: recentHealthObservations },
    { data: healthObservationsRecent36h },
    { data: animals },
    { count: totalTanks },
  ] = await Promise.all([
    supabase.from("systems").select("id, name").order("name"),
    supabase
      .from("daily_checks")
      .select("system_id, check_type, checked_at")
      .gte("checked_at", since36h),
    supabase
      .from("feeding_logs")
      .select("fed_at, tanks!inner(system_id)")
      .gte("fed_at", since36h),
    supabase
      .from("water_quality_readings")
      .select("system_id, tested_at, ph")
      .gte("tested_at", since14d),
    supabase
      .from("chemical_additions")
      .select("added_at")
      .gte("added_at", since36h),
    supabase
      .from("health_observations")
      .select("id, observed_at, severity, tanks(systems(name))")
      .order("observed_at", { ascending: false })
      .limit(5),
    supabase
      .from("health_observations")
      .select("observed_at")
      .gte("observed_at", since36h),
    supabase.from("animals").select("quantity").eq("status", "active"),
    supabase.from("tanks").select("id", { count: "exact", head: true }),
  ]);

  const todayKey = PACIFIC_DAY.format(new Date());
  const isToday = (iso: string) => PACIFIC_DAY.format(new Date(iso)) === todayKey;

  // Agenda: per-system AM/PM/feeding/water-quality done-today status.
  const doneChecks = new Set<string>();
  for (const c of checks ?? []) {
    if (isToday(c.checked_at)) doneChecks.add(`${c.system_id}:${c.check_type}`);
  }

  const fedTodaySystems = new Set<number>();
  for (const f of feedingLogs ?? []) {
    // `tanks!inner(...)` returns a single object at runtime, but Supabase's
    // generic-less client types it as an array. Cast to the actual shape.
    const tank = f.tanks as unknown as { system_id: number };
    if (isToday(f.fed_at)) fedTodaySystems.add(tank.system_id);
  }

  const testedThisWeekSystems = new Set<number>();
  for (const w of waterQualityReadings ?? []) {
    testedThisWeekSystems.add(w.system_id);
  }

  const systemStatuses: SystemAgendaStatus[] = (systems ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    amDone: doneChecks.has(`${s.id}:AM`),
    pmDone: doneChecks.has(`${s.id}:PM`),
    fedToday: fedTodaySystems.has(s.id),
    testedThisWeek: testedThisWeekSystems.has(s.id),
  }));

  const attentionSystems = systemStatuses
    .map((s) => ({ ...s, outstanding: outstandingItems(s) }))
    .filter((s) => s.outstanding.length > 0);
  const allClearSystems = systemStatuses
    .filter((s) => outstandingItems(s).length === 0)
    .map((s) => s.name);

  // Totals strip.
  const totalAnimals = (animals ?? []).reduce((sum, a) => sum + a.quantity, 0);
  const activeSystems = (systems ?? []).length;

  // Today's logs.
  const checksLogged = doneChecks.size;
  const checksPossible = activeSystems * 2;
  const feedingLogsToday = (feedingLogs ?? []).filter((f) => isToday(f.fed_at)).length;
  const chemicalAdditionsToday = (chemicalAdditions ?? []).filter((c) => isToday(c.added_at)).length;
  const healthObservationsToday = (healthObservationsRecent36h ?? []).filter((h) =>
    isToday(h.observed_at),
  ).length;

  // Recent health observations, with their multi-select issues joined in.
  const observationIds = (recentHealthObservations ?? []).map((h) => h.id);
  const { data: issueRows } =
    observationIds.length > 0
      ? await supabase
          .from("health_observation_issues")
          .select("health_observation_id, issue")
          .in("health_observation_id", observationIds)
      : { data: [] as { health_observation_id: number; issue: HealthIssueType }[] };

  const issuesByObservation = new Map<number, string[]>();
  for (const row of issueRows ?? []) {
    const label = ISSUE_LABELS[row.issue as HealthIssueType] ?? row.issue;
    const list = issuesByObservation.get(row.health_observation_id) ?? [];
    list.push(label);
    issuesByObservation.set(row.health_observation_id, list);
  }

  const healthObservationEntries: HealthObservationEntry[] = (recentHealthObservations ?? []).map(
    (h) => {
      // `tanks(systems(...))` returns single objects at runtime, but Supabase's
      // generic-less client types both as arrays. Cast to the actual shape.
      const tank = h.tanks as unknown as { systems: { name: string } } | null;
      return {
        id: h.id,
        system: tank?.systems?.name ?? "Unknown system",
        issue: (issuesByObservation.get(h.id) ?? []).join(", ") || "—",
        severity: h.severity,
        observedAt: h.observed_at,
      };
    },
  );

  // 2-week water quality trend: average pH per Pacific day, chronological.
  const phByDay = new Map<string, number[]>();
  for (const w of waterQualityReadings ?? []) {
    if (w.ph == null) continue;
    const key = PACIFIC_DAY.format(new Date(w.tested_at));
    const list = phByDay.get(key) ?? [];
    list.push(w.ph);
    phByDay.set(key, list);
  }
  const waterQualityTrend = Array.from(phByDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, values]) => values.reduce((sum, v) => sum + v, 0) / values.length);

  const lastReading = waterQualityTrend[waterQualityTrend.length - 1];
  const firstReading = waterQualityTrend[0];
  const delta = waterQualityTrend.length > 1 ? lastReading - firstReading : null;

  const agendaPanel = (
    <div className="flex flex-col divide-y rounded-xl border">
      {attentionSystems.map((s) => (
        <div key={s.id} className="flex flex-col gap-1 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">{s.name}</span>
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
      {waterQualityTrend.length > 0 ? (
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
          <strong className="tabular-nums">{totalTanks ?? 0}</strong>{" "}
          <span className="text-muted-foreground">total tanks</span>
        </span>
      </div>

      <SegmentedTabs agenda={agendaPanel} activity={activityPanel} trends={trendsPanel} />
    </div>
  );
}
