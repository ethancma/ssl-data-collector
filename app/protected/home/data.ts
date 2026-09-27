import {
  addPacificCalendarDays,
  pacificDateKey,
  pacificDayBoundaryToIso,
} from "@/components/daily-operations/pacific-date-time";
import { createClient } from "@/lib/supabase/server";

export type HomeDashboardSourceData = {
  systems: Array<{ id: number; name: string }>;
  checks: Array<{ system_id: number; check_type: string; checked_at: string }>;
  feedingLogs: Array<{ fed_at: string; tanks: unknown }>;
  waterQualityReadings: Array<{
    system_id: number;
    tested_at: string;
    ph: number | null;
  }>;
  chemicalAdditions: Array<{ added_at: string }>;
  recentHealthObservations: Array<{
    id: number;
    observed_at: string;
    severity: string;
    issues: unknown;
    tanks: unknown;
  }>;
  healthObservationsToday: number;
  animals: Array<{ quantity: number }>;
  totalTanks: number;
};

export type HomeDashboardLoadResult =
  | { ok: true; data: HomeDashboardSourceData }
  | { ok: false; error: string };

export async function loadHomeDashboardData(): Promise<HomeDashboardLoadResult> {
  const supabase = await createClient();
  const now = new Date();
  const since36h = new Date(now.getTime() - 36 * 60 * 60 * 1000).toISOString();
  const since14d = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const todayKey = pacificDateKey(now);
  const todayStart = pacificDayBoundaryToIso(todayKey);
  const tomorrowStart = pacificDayBoundaryToIso(addPacificCalendarDays(todayKey, 1));

  const [
    { data: systems, error: systemsError },
    { data: checks, error: checksError },
    { data: feedingLogs, error: feedingLogsError },
    { data: waterQualityReadings, error: waterQualityError },
    { data: chemicalAdditions, error: chemicalAdditionsError },
    { data: recentHealthObservations, error: recentHealthError },
    { count: healthObservationsToday, error: healthCountError },
    { data: animals, error: animalsError },
    { count: totalTanks, error: tanksError },
  ] = await Promise.all([
    supabase
      .from("systems")
      .select("id, name")
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
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
      .select("id, observed_at, severity, issues, tanks(systems(name))")
      .order("observed_at", { ascending: false })
      .limit(5),
    supabase
      .from("health_observations")
      .select("id", { count: "exact", head: true })
      .gte("observed_at", todayStart)
      .lt("observed_at", tomorrowStart),
    supabase.from("animals").select("quantity").eq("status", "active"),
    supabase.from("tanks").select("id", { count: "exact", head: true }),
  ]);

  const loadError =
    systemsError ??
    checksError ??
    feedingLogsError ??
    waterQualityError ??
    chemicalAdditionsError ??
    recentHealthError ??
    healthCountError ??
    animalsError ??
    tanksError;

  if (loadError) return { ok: false, error: loadError.message };

  return {
    ok: true,
    data: {
      systems: systems ?? [],
      checks: checks ?? [],
      feedingLogs: feedingLogs ?? [],
      waterQualityReadings: waterQualityReadings ?? [],
      chemicalAdditions: chemicalAdditions ?? [],
      recentHealthObservations: recentHealthObservations ?? [],
      healthObservationsToday: healthObservationsToday ?? 0,
      animals: animals ?? [],
      totalTanks: totalTanks ?? 0,
    },
  };
}