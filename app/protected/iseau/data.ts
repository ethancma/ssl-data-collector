import {
  WATER_QUALITY_PARAMETERS,
  type HealthIssueType,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import {
  buildIseauData,
  patientAnimalIds,
  type IseauData,
  type IseauSystem,
  type Parameter,
  type Place,
} from "@/lib/iseau/data";
import { selectAll } from "@/lib/supabase/select-all";
import { createClient } from "@/lib/supabase/server";
import { treatmentLabel } from "@/lib/systems/activity";

const CHART_WINDOW_DAYS = 60;

type QueryError = { message: string; code?: string };

type SystemRow = IseauSystem;
type AnimalRow = {
  id: number;
  name: string;
  tank_id: number;
  updated_at: string;
};
type HealthRow = {
  id: number;
  animal_id: number;
  tank_id: number;
  observed_at: string;
  severity: number;
  issues: string[];
  notes: string | null;
  has_photo: boolean;
  recorded_by: number;
};
type FoodRow = { name: string; default_unit: string | null };

type FeedingRow = {
  id: number;
  animal_id: number;
  tank_id: number;
  fed_at: string;
  amount_value: number | string | null;
  // PostgREST returns one object for this many-to-one embed; the untyped client infers an array.
  food_catalog: FoodRow | FoodRow[] | null;
  consumption_status: string | null;
  notes: string | null;
  recorded_by: number;
};
type FeedingLocationRow = {
  animal_id: number;
  tank_id: number;
  fed_at: string;
};
type TreatmentLocationRow = {
  animal_id: number;
  tank_id: number;
  administered_at: string;
};
type TreatmentRow = {
  id: number;
  animal_id: number;
  tank_id: number;
  treatment_type: string;
  amount: number | null;
  unit: string | null;
  concentration: number | null;
  concentration_unit: string | null;
  notes: string | null;
  administered_at: string;
  recorded_by: number;
};
type TankRow = { id: number; system_id: number; name: string };
type ProfileNameRow = { id: number; display_name: string | null };
type WaterRow = {
  id: number;
  system_id: number;
  tested_at: string;
  recorded_by: number;
} & Record<WaterQualityParameter, number | string | null>;
type TemperatureRow = {
  id: number;
  system_id: number;
  checked_at: string;
  temperature: number | string;
  recorded_by: number;
};
type TargetRow = {
  system_id: number | null;
  parameter_key: string;
  min_value: number | string | null;
  max_value: number | string | null;
};

function isWaterParameter(value: string): value is Parameter {
  return (WATER_QUALITY_PARAMETERS as readonly string[]).includes(value);
}

function asNumber(value: number | string | null) {
  return value === null ? null : Number(value);
}

function emptyData(now: number, systems: IseauSystem[]): IseauData {
  return buildIseauData({
    now,
    systems,
    animals: [],
    locationSnapshots: [],
    health: [],
    treatments: [],
    feedings: [],
    water: [],
    temperatures: [],
    targets: [],
    treatmentsAvailable: true,
  });
}

export async function fetchIseauData(): Promise<
  { data: IseauData } | { error: string }
> {
  const supabase = await createClient();
  const now = Date.now();
  const since60Days = new Date(
    now - CHART_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  // Two query rounds: everything that doesn't depend on which stars are patients, then the
  // patients' events with 60 days of chart readings. Tanks, profile names, and readings
  // for every system cost a few small reads but save four sequential round trips.
  const [
    systemsResult,
    tanksResult,
    animalsResult,
    qualifyingHealthResult,
    targetResult,
    profileResult,
  ] = await Promise.all([
    supabase.from("systems").select("id, name").order("name").order("id"),
    selectAll<TankRow>((from, to) =>
      supabase.from("tanks").select("id, system_id, name").order("id").range(from, to),
    ),
    selectAll<AnimalRow>((from, to) =>
      supabase
        .from("animals")
        .select("id, name, tank_id, updated_at, species!inner(category)")
        .eq("species.category", "star")
        .eq("tracking_type", "individual")
        .order("id")
        .range(from, to),
    ),
    selectAll<{ animal_id: number; severity: number }>((from, to) =>
      supabase
        .from("health_observations")
        .select("animal_id, severity, animals!inner(tracking_type, species!inner(category))")
        .eq("animals.tracking_type", "individual")
        .eq("animals.species.category", "star")
        .gte("severity", 2)
        .order("observed_at")
        .order("id")
        .range(from, to),
    ),
    selectAll<TargetRow>((from, to) =>
      supabase
        .from("water_quality_target_ranges")
        .select("system_id, parameter_key, min_value, max_value")
        .range(from, to),
    ),
    selectAll<ProfileNameRow>((from, to) =>
      supabase.from("v_profile_names").select("id, display_name").order("id").range(from, to),
    ),
  ]);
  const setupError =
    systemsResult.error ??
    tanksResult.error ??
    animalsResult.error ??
    qualifyingHealthResult.error ??
    targetResult.error ??
    profileResult.error;
  if (setupError) return { error: setupError.message };

  const systems = (systemsResult.data ?? []) as SystemRow[];
  const candidateIds = [
    ...patientAnimalIds(
      (qualifyingHealthResult.data ?? []).map((row) => ({
        animalId: row.animal_id,
        severity: row.severity,
      })),
    ),
  ];
  if (candidateIds.length === 0) return { data: emptyData(now, systems) };

  const candidateIdSet = new Set(candidateIds);
  const patientAnimals = (animalsResult.data ?? []).filter((animal) =>
    candidateIdSet.has(animal.id),
  );
  const waterColumns: string = `id, system_id, tested_at, recorded_by, ${WATER_QUALITY_PARAMETERS.join(", ")}`;
  const [
    healthResult,
    feedingLocationsResult,
    feedingResult,
    treatmentLocationsResult,
    treatmentResult,
    waterResult,
    temperatureResult,
  ] = await Promise.all([
    selectAll<HealthRow>((from, to) =>
      supabase
        .from("health_observations")
        .select(
          "id, animal_id, tank_id, observed_at, severity, issues, notes, has_photo, recorded_by",
        )
        .in("animal_id", candidateIds)
        .order("observed_at")
        .order("id")
        .range(from, to),
    ),
    selectAll<FeedingLocationRow>((from, to) =>
      supabase
        .from("feeding_logs")
        .select("animal_id, tank_id, fed_at")
        .in("animal_id", candidateIds)
        .order("fed_at")
        .order("id")
        .range(from, to),
    ),
    selectAll<FeedingRow>((from, to) =>
      supabase
        .from("feeding_logs")
        .select(
          "id, animal_id, tank_id, fed_at, amount_value, food_catalog(name, default_unit), consumption_status, notes, recorded_by",
        )
        .in("animal_id", candidateIds)
        .gte("fed_at", since60Days)
        .order("fed_at")
        .order("id")
        .range(from, to),
    ),
    selectAll<TreatmentLocationRow>((from, to) =>
      supabase
        .from("star_treatments")
        .select("animal_id, tank_id, administered_at")
        .in("animal_id", candidateIds)
        .order("administered_at")
        .order("id")
        .range(from, to),
    ),
    selectAll<TreatmentRow>((from, to) =>
      supabase
        .from("star_treatments")
        .select(
          "id, animal_id, tank_id, treatment_type, amount, unit, concentration, concentration_unit, notes, administered_at, recorded_by",
        )
        .in("animal_id", candidateIds)
        .gte("administered_at", since60Days)
        .order("administered_at")
        .order("id")
        .range(from, to),
    ),
    selectAll((from, to) =>
      supabase
        .from("water_quality_readings")
        .select(waterColumns)
        .gte("tested_at", since60Days)
        .order("tested_at")
        .order("id")
        .range(from, to),
    ),
    selectAll<TemperatureRow>((from, to) =>
      supabase
        .from("daily_checks")
        .select("id, system_id, checked_at, temperature, recorded_by")
        .eq("check_type", "AM")
        .not("temperature", "is", null)
        .gte("checked_at", since60Days)
        .order("checked_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  const treatmentErrors = [
    treatmentLocationsResult.error,
    treatmentResult.error,
  ].filter(
    (error): error is QueryError => error !== null && error.code !== "42501",
  );
  const treatmentsAvailable = treatmentErrors.length === 0;
  const eventError =
    healthResult.error ??
    feedingLocationsResult.error ??
    feedingResult.error ??
    treatmentErrors[0] ??
    waterResult.error ??
    temperatureResult.error ??
    null;
  if (eventError) return { error: eventError.message };

  const healthRows = healthResult.data ?? [];
  const feedingLocationRows = feedingLocationsResult.data ?? [];
  const feedingRows = feedingResult.data ?? [];
  const treatmentLocationRows = treatmentsAvailable
    ? (treatmentLocationsResult.data ?? [])
    : [];
  const treatmentRows = treatmentsAvailable ? (treatmentResult.data ?? []) : [];
  const tankIds = [
    ...new Set([
      ...patientAnimals.map((animal) => animal.tank_id),
      ...healthRows.map((row) => row.tank_id),
      ...feedingLocationRows.map((row) => row.tank_id),
      ...feedingRows.map((row) => row.tank_id),
      ...treatmentLocationRows.map((row) => row.tank_id),
      ...treatmentRows.map((row) => row.tank_id),
    ]),
  ];
  const tankById = new Map((tanksResult.data ?? []).map((tank) => [tank.id, tank]));
  const systemById = new Map(systems.map((system) => [system.id, system]));
  const placeFor = (tankId: number): Place | null => {
    const tank = tankById.get(tankId);
    const system = tank && systemById.get(tank.system_id);
    return tank && system
      ? {
          tankId: tank.id,
          tank: tank.name,
          systemId: system.id,
          system: system.name,
        }
      : null;
  };
  const missingPlace = tankIds.find((tankId) => !placeFor(tankId));
  if (missingPlace !== undefined)
    return { error: `Tank ${missingPlace} or its system could not be loaded.` };

  // Keep the payload to the systems these stars have lived in.
  const systemIds = new Set(tankIds.map((tankId) => tankById.get(tankId)!.system_id));
  const waterRows = ((waterResult.data ?? []) as unknown as WaterRow[]).filter((row) =>
    systemIds.has(row.system_id),
  );
  const temperatureRows = (temperatureResult.data ?? []).filter((row) =>
    systemIds.has(row.system_id),
  );
  const profileNames = new Map(
    (profileResult.data ?? []).map((profile) => [
      profile.id,
      profile.display_name ?? "Unknown",
    ]),
  );
  const recorder = (id: number) => profileNames.get(id) ?? "Unknown";
  const getPlace = (tankId: number) => placeFor(tankId)!;

  const water = waterRows.map((row) => ({
    id: row.id,
    at: Date.parse(row.tested_at),
    systemId: row.system_id,
    system: systemById.get(row.system_id)!.name,
    by: recorder(row.recorded_by),
    values: Object.fromEntries(
      WATER_QUALITY_PARAMETERS.map((parameter) => [
        parameter,
        asNumber(row[parameter]),
      ]),
    ) as Record<Parameter, number | null>,
  }));
  const temperatures = temperatureRows.map((row) => ({
    id: row.id,
    at: Date.parse(row.checked_at),
    systemId: row.system_id,
    system: systemById.get(row.system_id)!.name,
    by: recorder(row.recorded_by),
    celsius: Number(row.temperature),
  }));
  const targets = (targetResult.data ?? []).flatMap((target) =>
    isWaterParameter(target.parameter_key)
      ? [
          {
            systemId: target.system_id,
            parameter: target.parameter_key,
            min: asNumber(target.min_value),
            max: asNumber(target.max_value),
          },
        ]
      : [],
  );

  return {
    data: buildIseauData({
      now,
      systems,
      animals: patientAnimals.map((animal) => ({
        id: animal.id,
        name: animal.name,
        location: getPlace(animal.tank_id),
        updatedAt: animal.updated_at,
      })),
      locationSnapshots: [
        ...feedingLocationRows.map((row) => ({
          animalId: row.animal_id,
          at: Date.parse(row.fed_at),
          place: getPlace(row.tank_id),
        })),
        ...treatmentLocationRows.map((row) => ({
          animalId: row.animal_id,
          at: Date.parse(row.administered_at),
          place: getPlace(row.tank_id),
        })),
      ],
      health: healthRows.map((row) => ({
        id: row.id,
        animalId: row.animal_id,
        at: Date.parse(row.observed_at),
        severity: row.severity,
        issues: row.issues as HealthIssueType[],
        notes: row.notes ?? "",
        photo: row.has_photo,
        by: recorder(row.recorded_by),
        place: getPlace(row.tank_id),
      })),
      treatments: treatmentRows.map((row) => ({
        id: row.id,
        animalId: row.animal_id,
        at: Date.parse(row.administered_at),
        type: treatmentLabel(row.treatment_type),
        amount: asNumber(row.amount),
        amountUnit: row.unit,
        concentration: asNumber(row.concentration),
        concentrationUnit: row.concentration_unit,
        notes: row.notes ?? "",
        by: recorder(row.recorded_by),
        place: getPlace(row.tank_id),
      })),
      feedings: feedingRows.map((row) => {
        const food = Array.isArray(row.food_catalog)
          ? row.food_catalog[0]
          : row.food_catalog;
        return {
          id: row.id,
          animalId: row.animal_id,
          at: Date.parse(row.fed_at),
          food: food?.name ?? "Unknown food",
          amount: asNumber(row.amount_value),
          unit: food?.default_unit ?? null,
          status:
            row.consumption_status === "full" ||
            row.consumption_status === "partial" ||
            row.consumption_status === "none"
              ? row.consumption_status
              : "unknown",
          notes: row.notes ?? "",
          by: recorder(row.recorded_by),
          place: getPlace(row.tank_id),
        };
      }),
      water,
      temperatures,
      targets,
      treatmentsAvailable,
    }),
  };
}
