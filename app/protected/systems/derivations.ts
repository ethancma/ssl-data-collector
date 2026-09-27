import { pacificDateKey } from "@/components/daily-operations/pacific-date-time";
import type { SystemOverviewEntry } from "@/components/systems/types";

export type SystemIdentityRow = {
  id: number;
  slug: string;
  name: string;
};

export type OverviewDailyCheckRow = {
  system_id: number;
  check_type: string;
  temperature: number | null;
  checked_at: string;
};

export function deriveSystemOverview(
  systems: SystemIdentityRow[],
  dailyChecks: OverviewDailyCheckRow[],
  since36h: string,
  todayKey: string,
): SystemOverviewEntry[] {
  const latestTempBySystem = new Map<number, { checkedAt: string; temperature: number }>();
  const amDoneBySystem = new Set<number>();
  const pmDoneBySystem = new Set<number>();

  for (const row of dailyChecks) {
    if (row.checked_at < since36h) continue;

    const latest = latestTempBySystem.get(row.system_id);
    if (
      row.temperature != null &&
      (!latest || row.checked_at > latest.checkedAt)
    ) {
      latestTempBySystem.set(row.system_id, {
        checkedAt: row.checked_at,
        temperature: row.temperature,
      });
    }

    if (pacificDateKey(row.checked_at) === todayKey) {
      if (row.check_type === "AM") amDoneBySystem.add(row.system_id);
      if (row.check_type === "PM") pmDoneBySystem.add(row.system_id);
    }
  }

  return systems.map((system) => ({
    slug: system.slug,
    name: system.name,
    latestTemperature: latestTempBySystem.get(system.id)?.temperature ?? null,
    amDoneToday: amDoneBySystem.has(system.id),
    pmDoneToday: pmDoneBySystem.has(system.id),
  }));
}