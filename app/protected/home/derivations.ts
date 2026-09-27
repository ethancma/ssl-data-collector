import { pacificDateKey } from "@/components/daily-operations/pacific-date-time";
import type { HealthIssueType } from "@/lib/config/reference-data";

import type { HomeDashboardSourceData } from "./data";

const ISSUE_LABELS: Record<HealthIssueType, string> = {
  arm_drop: "Arm drop",
  spine_drop: "Spine drop",
  lesion: "Lesion",
  arm_curling: "Arm curling",
  flattening: "Flattening",
  other: "Other",
};

export type SystemAgendaStatus = {
  id: number;
  name: string;
  amDone: boolean;
  pmDone: boolean;
  fedToday: boolean;
  testedThisWeek: boolean;
};

export type HealthObservationEntry = {
  id: number;
  system: string;
  issue: string;
  severity: "low" | "medium" | "high";
  observedAt: string;
};

function outstandingItems(status: SystemAgendaStatus) {
  const items: string[] = [];
  if (!status.amDone) items.push("AM check");
  if (!status.pmDone) items.push("PM check");
  if (!status.fedToday) items.push("Feeding");
  if (!status.testedThisWeek) items.push("Water quality");
  return items;
}

export function deriveHomeDashboard(
  source: HomeDashboardSourceData,
  now: Date = new Date(),
) {
  const todayKey = pacificDateKey(now);
  const isToday = (iso: string) => pacificDateKey(iso) === todayKey;

  const doneChecks = new Set<string>();
  for (const check of source.checks) {
    if (isToday(check.checked_at)) {
      doneChecks.add(`${check.system_id}:${check.check_type}`);
    }
  }

  const fedTodaySystems = new Set<number>();
  for (const feedingLog of source.feedingLogs) {
    const tank = feedingLog.tanks as { system_id: number };
    if (isToday(feedingLog.fed_at)) fedTodaySystems.add(tank.system_id);
  }

  const testedThisWeekSystems = new Set(
    source.waterQualityReadings.map((reading) => reading.system_id),
  );
  const systemStatuses: SystemAgendaStatus[] = source.systems.map((system) => ({
    id: system.id,
    name: system.name,
    amDone: doneChecks.has(`${system.id}:AM`),
    pmDone: doneChecks.has(`${system.id}:PM`),
    fedToday: fedTodaySystems.has(system.id),
    testedThisWeek: testedThisWeekSystems.has(system.id),
  }));
  const statusesWithOutstanding = systemStatuses.map((status) => ({
    ...status,
    outstanding: outstandingItems(status),
  }));

  const healthObservationEntries: HealthObservationEntry[] = source.recentHealthObservations.map(
    (observation) => {
      const tank = observation.tanks as { systems: { name: string } } | null;
      return {
        id: observation.id,
        system: tank?.systems?.name ?? "Unknown system",
        issue:
          (observation.issues as HealthIssueType[])
            .map((issue) => ISSUE_LABELS[issue] ?? issue)
            .join(", ") || "—",
        severity: observation.severity as HealthObservationEntry["severity"],
        observedAt: observation.observed_at,
      };
    },
  );

  const phByDay = new Map<string, number[]>();
  for (const reading of source.waterQualityReadings) {
    if (reading.ph == null) continue;
    const key = pacificDateKey(reading.tested_at);
    const values = phByDay.get(key) ?? [];
    values.push(reading.ph);
    phByDay.set(key, values);
  }
  const waterQualityTrend = Array.from(phByDay.entries())
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, values]) => values.reduce((sum, value) => sum + value, 0) / values.length);
  const lastReading = waterQualityTrend.at(-1);
  const firstReading = waterQualityTrend[0];

  return {
    attentionSystems: statusesWithOutstanding.filter((status) => status.outstanding.length > 0),
    allClearSystems: statusesWithOutstanding
      .filter((status) => status.outstanding.length === 0)
      .map((status) => status.name),
    totalAnimals: source.animals.reduce((sum, animal) => sum + animal.quantity, 0),
    activeSystems: source.systems.length,
    totalTanks: source.totalTanks,
    checksLogged: doneChecks.size,
    feedingLogsToday: source.feedingLogs.filter((log) => isToday(log.fed_at)).length,
    chemicalAdditionsToday: source.chemicalAdditions.filter((addition) =>
      isToday(addition.added_at),
    ).length,
    healthObservationsToday: source.healthObservationsToday,
    healthObservationEntries,
    waterQualityTrend,
    lastReading,
    delta:
      waterQualityTrend.length > 1 && lastReading != null
        ? lastReading - firstReading
        : null,
  };
}