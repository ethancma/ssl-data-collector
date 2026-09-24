import { SYSTEMS } from "@/lib/config/systems";
import {
  WATER_QUALITY_PARAMETERS,
  type HealthIssueType,
  type MaintenanceTaskType,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/server";
import type {
  ChemicalAdditionPoint,
  DailyCheckPoint,
  HealthObservationPoint,
  HighlightItem,
  MaintenanceLogPoint,
  SystemDetailData,
  SystemOverviewEntry,
  WaterQualityPoint,
} from "@/components/systems/types";

// Explicit shape for the water_quality_readings row, since its select string
// is built dynamically (see waterQualityColumns below) and can't be inferred.
type WaterQualityRow = {
  id: number;
  system_id: number;
  tested_at: string;
  ph_source: string | null;
} & Record<WaterQualityParameter, number | null>;

// Same Pacific-day rule used across the app (home page, checks/new) so "today"
// means the lab's local calendar day, not the server's UTC day.
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

const TASK_LABELS: Record<MaintenanceTaskType, string> = {
  filter_change: "Filter change",
  sump_flush: "Sump flush",
  other: "Other",
};

// Fetches everything the systems page needs for ALL 8 systems in one page
// load: daily checks / water quality readings over a 60-day superset (so the
// client-side 14d/30d/60d trend chart range toggle can slice locally with no
// re-fetch), plus the last 14 days of chemical additions / health
// observations / maintenance logs (which feed the fixed 14-day Key
// Highlights panel), scoped with a single `system_id IN (...)` query per
// table (instead of one round trip per system), plus a lightweight
// all-systems overview (used by the grid rail). Returns a map keyed by
// system slug so the client can switch the selected system instantly
// without re-fetching.
export async function fetchAllSystemsDetailData(): Promise<Record<string, SystemDetailData>> {
  const supabase = await createClient();
  const now = Date.now();
  const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const since60d = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
  const since36h = new Date(now - 36 * 60 * 60 * 1000).toISOString();

  const { data: systemRows } = await supabase.from("systems").select("id, slug, name").order("id");
  const systemIds = (systemRows ?? []).map((s) => s.id);

  // Widened to `string` (not a literal) so postgrest-js's select-string
  // parser doesn't try (and fail) to statically parse this runtime-built list.
  const waterQualityColumns: string = `id, system_id, tested_at, ph_source, ${WATER_QUALITY_PARAMETERS.join(", ")}`;

  const [
    { data: recentChecksAll },
    { data: dailyChecksRaw },
    { data: waterQualityRaw },
    { data: chemicalAdditionsRaw },
    { data: healthObsRaw },
    { data: maintenanceRaw },
  ] = await Promise.all([
    supabase
      .from("daily_checks")
      .select("system_id, check_type, temperature, checked_at")
      .gte("checked_at", since36h)
      .order("checked_at", { ascending: false }),
    supabase
      .from("daily_checks")
      .select("id, system_id, check_type, water_running, temperature, checked_at")
      .in("system_id", systemIds)
      .gte("checked_at", since60d)
      .order("checked_at", { ascending: true }),
    supabase
      .from("water_quality_readings")
      .select(waterQualityColumns)
      .in("system_id", systemIds)
      .gte("tested_at", since60d)
      .order("tested_at", { ascending: true }),
    supabase
      .from("chemical_additions")
      .select("id, system_id, chemical_name, amount, unit, added_at, reason")
      .in("system_id", systemIds)
      .gte("added_at", since14d)
      .order("added_at", { ascending: false }),
    supabase
      .from("health_observations")
      .select("id, observed_at, severity, issues, notes, has_photo, tanks!inner(system_id, name)")
      .in("tanks.system_id", systemIds)
      .gte("observed_at", since14d)
      .order("observed_at", { ascending: false }),
    supabase
      .from("maintenance_logs")
      .select("id, system_id, performed_at, task_type, notes")
      .in("system_id", systemIds)
      .gte("performed_at", since14d)
      .order("performed_at", { ascending: false }),
  ]);

  const todayKey = PACIFIC_DAY.format(new Date());
  const isToday = (iso: string) => PACIFIC_DAY.format(new Date(iso)) === todayKey;

  const latestTempBySystem = new Map<number, number>();
  const amDoneBySystem = new Set<number>();
  const pmDoneBySystem = new Set<number>();
  for (const row of recentChecksAll ?? []) {
    if (row.temperature != null && !latestTempBySystem.has(row.system_id)) {
      latestTempBySystem.set(row.system_id, row.temperature);
    }
    if (isToday(row.checked_at)) {
      if (row.check_type === "AM") amDoneBySystem.add(row.system_id);
      if (row.check_type === "PM") pmDoneBySystem.add(row.system_id);
    }
  }

  const overview: SystemOverviewEntry[] = SYSTEMS.map((s) => {
    const row = systemRows?.find((r) => r.slug === s.slug);
    return {
      slug: s.slug,
      name: s.name,
      latestTemperature: row ? (latestTempBySystem.get(row.id) ?? null) : null,
      amDoneToday: row ? amDoneBySystem.has(row.id) : false,
      pmDoneToday: row ? pmDoneBySystem.has(row.id) : false,
    };
  });

  const result: Record<string, SystemDetailData> = {};

  for (const s of SYSTEMS) {
    const row = systemRows?.find((r) => r.slug === s.slug);
    const systemId = row?.id;

    if (!systemId) {
      // System exists in config but has no matching DB row yet — render an
      // empty-but-real entry instead of crashing.
      result[s.slug] = {
        slug: s.slug,
        name: s.name,
        category: s.category,
        layoutNotes: s.layoutNotes,
        overview,
        dailyChecks: [],
        waterQuality: [],
        chemicalAdditions: [],
        healthObservations: [],
        maintenanceLogs: [],
        highlights: [],
      };
      continue;
    }

    const dailyChecks: DailyCheckPoint[] = (dailyChecksRaw ?? [])
      .filter((r) => r.system_id === systemId)
      .map((r) => ({
        id: r.id,
        checkType: r.check_type as "AM" | "PM",
        waterRunning: r.water_running,
        temperature: r.temperature,
        checkedAt: r.checked_at,
      }));

    const waterQuality: WaterQualityPoint[] = ((waterQualityRaw ?? []) as unknown as WaterQualityRow[])
      .filter((r) => r.system_id === systemId)
      .map((r) => ({
        id: r.id,
        testedAt: r.tested_at,
        phSource: r.ph_source,
        ...(Object.fromEntries(
          WATER_QUALITY_PARAMETERS.map((key) => [key, r[key] ?? null]),
        ) as Record<WaterQualityParameter, number | null>),
      }));

    const chemicalAdditions: ChemicalAdditionPoint[] = (chemicalAdditionsRaw ?? [])
      .filter((r) => r.system_id === systemId)
      .map((r) => ({
        id: r.id,
        chemicalName: r.chemical_name,
        amount: r.amount,
        unit: r.unit,
        addedAt: r.added_at,
        reason: r.reason,
      }));

    const healthObservations: HealthObservationPoint[] = (healthObsRaw ?? [])
      .filter((r) => {
        // `tanks!inner(...)` returns a single object at runtime, but
        // Supabase's generic-less client types it as an array.
        const tank = r.tanks as unknown as { system_id: number; name: string } | null;
        return tank?.system_id === systemId;
      })
      .map((r) => {
        const tank = r.tanks as unknown as { name: string } | null;
        return {
          id: r.id,
          observedAt: r.observed_at,
          severity: r.severity as "low" | "medium" | "high",
          notes: r.notes,
          hasPhoto: r.has_photo,
          tankName: tank?.name ?? "Unknown tank",
          issues: (r.issues as HealthIssueType[]).map(
            (issue) => ISSUE_LABELS[issue] ?? issue,
          ),
        };
      });

    const maintenanceLogs: MaintenanceLogPoint[] = (maintenanceRaw ?? [])
      .filter((r) => r.system_id === systemId)
      .map((r) => ({
        id: r.id,
        performedAt: r.performed_at,
        notes: r.notes,
        taskType:
          TASK_LABELS[r.task_type as MaintenanceTaskType] ?? r.task_type,
      }));

    const highlights = buildHighlights({
      dailyChecks,
      chemicalAdditions,
      healthObservations,
      maintenanceLogs,
      since14d,
      todayKey,
    });

    result[s.slug] = {
      slug: s.slug,
      name: row?.name ?? s.name,
      category: s.category,
      layoutNotes: s.layoutNotes,
      overview,
      dailyChecks,
      waterQuality,
      chemicalAdditions,
      healthObservations,
      maintenanceLogs,
      highlights,
    };
  }

  return result;
}

// Merges chemical additions, health observations, maintenance logs, and any
// missed AM/PM checks into one reverse-chronological feed.
function buildHighlights({
  dailyChecks,
  chemicalAdditions,
  healthObservations,
  maintenanceLogs,
  since14d,
  todayKey,
}: {
  dailyChecks: DailyCheckPoint[];
  chemicalAdditions: ChemicalAdditionPoint[];
  healthObservations: HealthObservationPoint[];
  maintenanceLogs: MaintenanceLogPoint[];
  since14d: string;
  todayKey: string;
}): HighlightItem[] {
  const items: HighlightItem[] = [];

  for (const c of chemicalAdditions) {
    items.push({
      id: `chemical-${c.id}`,
      kind: "chemical_addition",
      at: c.addedAt,
      title: `${c.chemicalName} added`,
      detail: `${c.amount} ${c.unit}${c.reason ? ` — ${c.reason}` : ""}`,
    });
  }

  for (const h of healthObservations) {
    items.push({
      id: `health-${h.id}`,
      kind: "health_observation",
      at: h.observedAt,
      title: h.issues.length > 0 ? h.issues.join(", ") : "Health observation",
      detail: `${h.tankName}${h.notes ? ` — ${h.notes}` : ""}`,
      severity: h.severity,
    });
  }

  for (const m of maintenanceLogs) {
    items.push({
      id: `maintenance-${m.id}`,
      kind: "maintenance_log",
      at: m.performedAt,
      title: m.taskType,
      detail: m.notes,
    });
  }

  const doneByDay = new Map<string, Set<"AM" | "PM">>();
  for (const c of dailyChecks) {
    const key = PACIFIC_DAY.format(new Date(c.checkedAt));
    const set = doneByDay.get(key) ?? new Set<"AM" | "PM">();
    set.add(c.checkType);
    doneByDay.set(key, set);
  }

  // Walk each calendar day in the window (excluding today, which isn't over
  // yet) and flag any AM/PM check that never landed. Capped at 20 iterations
  // as a safety net against timezone edge cases.
  let cursor = new Date(since14d);
  for (let i = 0; i < 20 && PACIFIC_DAY.format(cursor) !== todayKey; i++) {
    const key = PACIFIC_DAY.format(cursor);
    const done = doneByDay.get(key);
    for (const type of ["AM", "PM"] as const) {
      if (!done?.has(type)) {
        items.push({
          id: `missed-${key}-${type}`,
          kind: "missed_check",
          at: cursor.toISOString(),
          title: `Missed ${type} check`,
          detail: key,
        });
      }
    }
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
