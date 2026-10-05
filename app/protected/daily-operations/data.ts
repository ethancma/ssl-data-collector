import type { SharedFormData } from "@/components/daily-operations/log-types";
import { pacificDateKey } from "@/lib/pacific-date-time";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

import {
  deriveDailyOperationsOptions,
  derivePendingFeedingLogs,
  deriveStarTreatmentScope,
  type StarTreatmentScope,
} from "./derivations";

export async function loadDailyOperationsData(): Promise<SharedFormData> {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canManageStarTreatments =
    profile?.status === "active" &&
    ["admin", "technician", "volunteer"].includes(profile.role);

  const [
    { data: systems, error: systemsError },
    { data: tanks, error: tanksError },
    { data: animals, error: animalsError },
    { data: waterQualityTargets, error: waterQualityTargetsError },
    { data: chemicalCatalog, error: chemicalCatalogError },
    { data: foodCatalog, error: foodCatalogError },
    { data: starTreatmentCatalog, error: starTreatmentCatalogError },
  ] = await Promise.all([
    supabase
      .from("systems")
      .select("id, name")
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("tanks").select("id, name, system_id").order("name").order("id"),
    supabase
      .from("animals")
      .select("id, name, tank_id, species_id, tracking_type, status")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("water_quality_target_ranges")
      .select("id, system_id, parameter_key, min_value, max_value"),
    supabase
      .from("chemical_addition_catalog")
      .select("id, name, default_unit")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("food_catalog")
      .select("id, name, default_unit")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("star_treatment_catalog")
      .select("id, name, default_amount_unit, default_concentration_unit")
      .eq("is_active", true)
      .order("name"),
  ]);
  const { tanks: tankOptions, ...options } = deriveDailyOperationsOptions({
    systems: systems ?? [],
    tanks: tanks ?? [],
    animals: animals ?? [],
    waterQualityTargets: waterQualityTargets ?? [],
    chemicalCatalog: chemicalCatalog ?? [],
    foodCatalog: foodCatalog ?? [],
    starTreatmentCatalog: starTreatmentCatalog ?? [],
  });
  const referenceDataLoadError =
    systemsError?.message ??
    tanksError?.message ??
    animalsError?.message ??
    (options.systems.length === 0 ? "No systems are configured." : undefined);

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  let pendingFeedingQuery = supabase
    .from("feeding_logs")
    .select("id, fed_at, animals(name), tanks!inner(system_id)")
    .is("consumption_status", null)
    .gte("fed_at", since)
    .order("fed_at", { ascending: false });

  if (profile?.role === "volunteer") {
    pendingFeedingQuery = pendingFeedingQuery.eq("recorded_by", profile.id);
  }

  const { data: logs } = await pendingFeedingQuery;
  const todayKey = pacificDateKey(new Date());
  const pendingFeedingLogs = derivePendingFeedingLogs(logs ?? [], todayKey);

  let starScope: StarTreatmentScope = { starSystems: [], starTanks: [], stars: [] };
  let starTreatmentLoadError: string | undefined;

  if (canManageStarTreatments) {
    const speciesResult = await supabase
      .from("species")
      .select("id, common_name, category")
      .eq("category", "star")
      .order("common_name")
      .order("id");
    starScope = deriveStarTreatmentScope(
      options.systems,
      tankOptions,
      animals ?? [],
      speciesResult.data ?? [],
    );
    starTreatmentLoadError =
      systemsError?.message ??
      animalsError?.message ??
      tanksError?.message ??
      speciesResult.error?.message ??
      ((speciesResult.data ?? []).length === 0
        ? "No star species are configured."
        : undefined);
  }

  return {
    ...options,
    canManageStarTreatments,
    ...starScope,
    pendingFeedingLogs,
    chemicalCatalogLoadError: chemicalCatalogError?.message,
    foodCatalogLoadError: foodCatalogError?.message,
    starTreatmentCatalogLoadError: starTreatmentCatalogError?.message,
    waterQualityTargetLoadError: waterQualityTargetsError?.message,
    referenceDataLoadError,
    starTreatmentLoadError,
  };
}