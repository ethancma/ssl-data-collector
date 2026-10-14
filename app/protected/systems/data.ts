import {
  WATER_QUALITY_PARAMETERS,
  type HealthIssueType,
  type MaintenanceTaskType,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/server";
import type { WaterQualityTargetRange } from "@/lib/daily-operations/water-quality-targets";
import { ACTIVITY_WINDOW_DAYS, buildActivityEvents } from "@/lib/systems/activity";
import { deriveSystemKpis } from "@/lib/systems/kpis";
import { deriveSystemFeeding, summarizeFeeding, toFeedingScheduleRow } from "@/lib/systems/feeding-schedule";
import { deriveSystemSnapshot } from "@/lib/systems/snapshot";
import {
  addPacificCalendarDays,
  pacificDateKey,
  pacificDayBoundaryToIso,
} from "@/lib/pacific-date-time";
import type {
  ChemicalAdditionPoint,
  DailyCheckPoint,
  HealthObservationPoint,
  HighlightItem,
  MaintenanceLogPoint,
  SystemDetailData,
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

// PostgREST caps each response (max_rows, 1000), so tables that grow by a row
// per animal or per check are read in pages instead of one truncated query.
const PAGE_SIZE = 1000;
async function selectAll<Row>(
  page: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string; code?: string } | null }>,
) {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: rows, error: null };
  }
}

// Fetches everything the systems page needs for all configured systems in one page
// load: daily checks / water quality readings over a 60-day superset (so the
// client-side 14d/30d/60d trend chart range toggle can slice locally with no
// re-fetch), 30 days of chemical additions / maintenance logs / feedings /
// star treatments (the Water and activity chart; the Key Highlights panel
// uses the last 14 days), the last 14 days of health observations, the lab's
// water-quality target ranges, and a status snapshot per system for the
// lineup and compare views. Scoped with a single `system_id IN (...)` query
// per table (instead of one round trip per system). Returns a map keyed by
// system slug so the client can switch the selected system instantly
// without re-fetching.
export async function fetchAllSystemsDetailData(): Promise<{
  dataBySlug: Record<string, SystemDetailData>;
  error?: string;
}> {
  const supabase = await createClient();
  const nowDate = new Date();
  const now = nowDate.getTime();
  const since14dMs = now - 14 * 24 * 60 * 60 * 1000;
  const since14d = new Date(since14dMs).toISOString();
  const since30d = new Date(now - ACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const since60d = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();

  const { data: systemRows, error: systemsError } = await supabase
    .from("systems")
    .select("id, slug, name, category, layout_notes, has_animals")
    .order("name", { ascending: true })
    .order("id", { ascending: true });
  if (systemsError) {
    return { dataBySlug: {}, error: systemsError.message };
  }
  if (!systemRows || systemRows.length === 0) {
    return { dataBySlug: {} };
  }

  const systemIds = systemRows.map((s) => s.id);

  // Widened to `string` (not a literal) so postgrest-js's select-string
  // parser doesn't try (and fail) to statically parse this runtime-built list.
  const waterQualityColumns: string = `id, system_id, tested_at, ph_source, ${WATER_QUALITY_PARAMETERS.join(", ")}`;

  const [
    { data: dailyChecksRaw, error: dailyChecksError },
    { data: waterQualityRaw, error: waterQualityError },
    { data: chemicalAdditionsRaw, error: chemicalAdditionsError },
    { data: healthObsRaw, error: healthObservationsError },
    { data: maintenanceRaw, error: maintenanceError },
    { data: targetsRaw, error: targetsError },
    { data: feedingRaw, error: feedingError },
    { data: treatmentsRaw, error: treatmentsError },
    { data: scheduleRaw, error: scheduleError },
    { data: tankRaw, error: tankError },
  ] = await Promise.all([    selectAll((from, to) =>
      supabase
        .from("daily_checks")
        .select("id, system_id, check_type, water_running, temperature, checked_at")
        .in("system_id", systemIds)
        .gte("checked_at", since60d)
        .order("checked_at", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
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
      .gte("added_at", since30d)
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
      .gte("performed_at", since30d)
      .order("performed_at", { ascending: false }),
    supabase
      .from("water_quality_target_ranges")
      .select("id, system_id, parameter_key, min_value, max_value"),
    selectAll((from, to) =>
      supabase
        .from("feeding_logs")
        .select("fed_at, tank_id, tanks!inner(system_id)")
        .in("tanks.system_id", systemIds)
        .gte("fed_at", since30d)
        .order("fed_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    // Viewers have no read access to star treatments (42501); that one error is tolerated below.
    selectAll((from, to) =>
      supabase
        .from("star_treatments")
        .select("administered_at, treatment_type, amount, unit, tanks!inner(system_id)")
        .in("tanks.system_id", systemIds)
        .gte("administered_at", since30d)
        .order("administered_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to),
    ),
    supabase.from("feeding_schedules").select("system_id, tank_position, size_liters, weekdays, updated_at"),
    supabase.from("tanks").select("id, system_id, name").in("system_id", systemIds),
  ]);

  const loadError =
    dailyChecksError ??
    waterQualityError ??
    chemicalAdditionsError ??
    healthObservationsError ??
    maintenanceError ??
    targetsError ??
    feedingError ??
    scheduleError ??
    tankError ??
    (treatmentsError?.code === "42501" ? null : treatmentsError);
  if (loadError) {
    return { dataBySlug: {}, error: loadError.message };
  }

  const todayKey = pacificDateKey(nowDate);
  const targets: WaterQualityTargetRange[] = (targetsRaw ?? []).flatMap((target) =>
    (WATER_QUALITY_PARAMETERS as readonly string[]).includes(target.parameter_key)
      ? [
          {
            id: target.id,
            systemId: target.system_id,
            parameterKey: target.parameter_key as WaterQualityParameter,
            minValue: target.min_value === null ? null : Number(target.min_value),
            maxValue: target.max_value === null ? null : Number(target.max_value),
          },
        ]
      : [],
  );

  const result: Record<string, SystemDetailData> = {};

  for (const system of systemRows) {
    const systemId = system.id;

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
      chemicalAdditions: chemicalAdditions.filter((c) => Date.parse(c.addedAt) >= since14dMs),
      healthObservations,
      maintenanceLogs: maintenanceLogs.filter((m) => Date.parse(m.performedAt) >= since14dMs),
      since14d,
      todayKey,
    });

    const feedingRows = (feedingRaw ?? []).filter((r) => {
      const tank = r.tanks as unknown as { system_id: number } | null;
      return tank?.system_id === systemId;
    });
    const activity = buildActivityEvents({
      feedings: feedingRows.map((r) => ({ fedAt: r.fed_at })),
      treatments: (treatmentsRaw ?? [])
        .filter((r) => (r.tanks as unknown as { system_id: number } | null)?.system_id === systemId)
        .map((r) => ({
          administeredAt: r.administered_at,
          treatmentType: r.treatment_type,
          amount: r.amount === null ? null : Number(r.amount),
          unit: r.unit,
        })),
      chemicals: chemicalAdditions,
      maintenance: maintenanceLogs,
    });

    // A partial test shouldn't blank the other parameters, but only back-fill from the same week.
    const latestTestMs = waterQuality.length ? Date.parse(waterQuality[waterQuality.length - 1].testedAt) : 0;
    const sameWeek = waterQuality.filter((r) => Date.parse(r.testedAt) >= latestTestMs - 7 * 24 * 60 * 60 * 1000);
    const latestWaterValues = {} as Record<WaterQualityParameter, number | null>;
    for (const key of WATER_QUALITY_PARAMETERS) {
      latestWaterValues[key] = [...sameWeek].reverse().find((r) => r[key] != null)?.[key] ?? null;
    }
    const lastFedAt = feedingRows[0]?.fed_at ?? null;
    const feeding = summarizeFeeding(
      deriveSystemFeeding({
        schedules: (scheduleRaw ?? [])
          .filter((r) => r.system_id === systemId)
          .map((r) => toFeedingScheduleRow({ ...r, weekdays: r.weekdays as number[] })),
        tanks: (tankRaw ?? []).filter((t) => t.system_id === systemId),
        feedings: feedingRows.map((r) => ({ tankId: r.tank_id, fedAt: r.fed_at })),
        now: nowDate,
      }),
    );

    const snapshot = deriveSystemSnapshot({
      systemId,
      now: nowDate,
      checks: dailyChecks.map((c) => ({
        type: c.checkType,
        checkedAt: c.checkedAt,
        waterRunning: c.waterRunning,
        temperature: c.temperature,
      })),
      healthObservations: healthObservations.map((h) => ({
        observedAt: h.observedAt,
        severity: h.severity,
      })),
      latestWater: waterQuality.length
        ? { testedAt: waterQuality[waterQuality.length - 1].testedAt, values: latestWaterValues }
        : null,
      lastFedAt,
      feeding,
      targets,
    });

    result[system.slug] = {
      slug: system.slug,
      name: system.name,
      category: system.category,
      layoutNotes: system.layout_notes ?? "",
      hasAnimals: system.has_animals,
      snapshot,
      kpis: deriveSystemKpis({
        now: nowDate,
        systemId,
        waterReadings: waterQuality.map((w) => ({ testedAt: w.testedAt, values: w })),
        checks: dailyChecks,
        targets,
      }),
      generatedAt: nowDate.toISOString(),
      activity,
      dailyChecks,
      waterQuality,
      chemicalAdditions,
      healthObservations,
      maintenanceLogs,
      highlights,
    };
  }

  return { dataBySlug: result };
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
    const key = pacificDateKey(c.checkedAt);
    const set = doneByDay.get(key) ?? new Set<"AM" | "PM">();
    set.add(c.checkType);
    doneByDay.set(key, set);
  }

  // Walk each calendar day in the window (excluding today, which isn't over
  // yet) and flag any AM/PM check that never landed. Capped at 20 iterations
  // as a safety net against timezone edge cases.
  let cursorKey = pacificDateKey(since14d);
  for (let i = 0; i < 20 && cursorKey !== todayKey; i++) {
    const key = cursorKey;
    const done = doneByDay.get(key);
    for (const type of ["AM", "PM"] as const) {
      if (!done?.has(type)) {
        items.push({
          id: `missed-${key}-${type}`,
          kind: "missed_check",
          at: pacificDayBoundaryToIso(key),
          title: `Missed ${type} check`,
          detail: key,
        });
      }
    }
    cursorKey = addPacificCalendarDays(cursorKey, 1);
  }

  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
