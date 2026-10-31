import {
  HEALTH_ISSUE_LABELS,
  WATER_QUALITY_PARAMS,
  type HealthIssueType,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";

const DAY = 24 * 60 * 60 * 1000;
export const RANGES = [7, 14, 30, 60] as const;
export type Range = (typeof RANGES)[number];
export type Parameter = WaterQualityParameter;
type Issue = HealthIssueType;
export type Severity = number;
export type Status = "current" | "past";
export type SystemFilter = "all" | number;
export type TargetRange = { min: number | null; max: number | null };
export type IseauSystem = { id: number; name: string };
export type Place = { tankId: number; tank: string; systemId: number; system: string };

export type HealthRecord = {
  id: number;
  animalId: number;
  at: number;
  severity: number;
  issues: Issue[];
  notes: string;
  photo: boolean;
  by: string;
  place: Place;
};
type TreatmentRecord = {
  id: number;
  animalId: number;
  at: number;
  type: string;
  amount: number | null;
  amountUnit: string | null;
  concentration: number | null;
  concentrationUnit: string | null;
  notes: string;
  by: string;
  place: Place;
};
type FeedingStatus = "full" | "partial" | "none" | "unknown";
type FeedingRecord = {
  id: number;
  animalId: number;
  at: number;
  food: string;
  amount: number | null;
  unit: string | null;
  status: FeedingStatus;
  notes: string;
  by: string;
  place: Place;
};
export type WaterRecord = {
  id: number;
  at: number;
  systemId: number;
  system: string;
  by: string;
  values: Record<Parameter, number | null>;
};
export type TemperatureRecord = {
  id: number;
  at: number;
  systemId: number;
  system: string;
  by: string;
  celsius: number;
};
export type Star = {
  id: number;
  name: string;
  location: Place;
  moves: { since: number; place: Place }[];
  health: HealthRecord[];
  treatments: TreatmentRecord[];
  feedings: FeedingRecord[];
};
export type IseauData = {
  now: number;
  systems: IseauSystem[];
  stars: Star[];
  water: WaterRecord[];
  temperatures: TemperatureRecord[];
  targetsBySystem: Record<number, Record<Parameter, TargetRange | null>>;
  treatmentsAvailable: boolean;
};

export type IseauSources = {
  now: number;
  systems: IseauSystem[];
  animals: { id: number; name: string; location: Place; updatedAt: string }[];
  locationSnapshots: { animalId: number; at: number; place: Place }[];
  health: HealthRecord[];
  treatments: TreatmentRecord[];
  feedings: FeedingRecord[];
  water: WaterRecord[];
  temperatures: TemperatureRecord[];
  targets: { systemId: number | null; parameter: Parameter; min: number | null; max: number | null }[];
  treatmentsAvailable: boolean;
};

export const ISSUE_LABELS = HEALTH_ISSUE_LABELS;

export function patientAnimalIds(observations: { animalId: number; severity: number }[]) {
  return new Set(observations.filter((row) => row.severity >= 2).map((row) => row.animalId));
}

export function buildIseauData(sources: IseauSources): IseauData {
  const patientIds = patientAnimalIds(sources.health);
  const healthByAnimal = new Map<number, HealthRecord[]>();
  const treatmentsByAnimal = new Map<number, TreatmentRecord[]>();
  const feedingsByAnimal = new Map<number, FeedingRecord[]>();
  const add = <T extends { animalId: number }>(map: Map<number, T[]>, row: T) => {
    const records = map.get(row.animalId) ?? [];
    records.push(row);
    map.set(row.animalId, records);
  };
  for (const row of sources.health) add(healthByAnimal, row);
  for (const row of sources.treatments) add(treatmentsByAnimal, row);
  for (const row of sources.feedings) add(feedingsByAnimal, row);
  const locationsByAnimal = new Map<number, { since: number; place: Place }[]>();
  const addLocation = (animalId: number, at: number, place: Place) => {
    const snapshots = locationsByAnimal.get(animalId) ?? [];
    snapshots.push({ since: at, place });
    locationsByAnimal.set(animalId, snapshots);
  };
  for (const row of sources.health) addLocation(row.animalId, row.at, row.place);
  for (const row of sources.locationSnapshots) addLocation(row.animalId, row.at, row.place);

  const stars = sources.animals
    .filter((animal) => patientIds.has(animal.id))
    .map((animal): Star => {
      const health = (healthByAnimal.get(animal.id) ?? []).sort((a, b) => b.at - a.at || b.id - a.id);
      const treatments = (treatmentsByAnimal.get(animal.id) ?? []).sort((a, b) => b.at - a.at || b.id - a.id);
      const feedings = (feedingsByAnimal.get(animal.id) ?? []).sort((a, b) => b.at - a.at || b.id - a.id);
      const snapshots = (locationsByAnimal.get(animal.id) ?? [])
        .sort((a, b) => a.since - b.since || a.place.tankId - b.place.tankId);
      const moves: Star["moves"] = [];
      for (const snapshot of snapshots) {
        if (moves.at(-1)?.place.tankId !== snapshot.place.tankId) moves.push(snapshot);
      }
      const updatedAt = Date.parse(animal.updatedAt);
      if (moves.at(-1)?.place.tankId !== animal.location.tankId) {
        moves.push({
          since: Math.min(sources.now, Math.max(Number.isFinite(updatedAt) ? updatedAt : sources.now, (moves.at(-1)?.since ?? 0) + 1)),
          place: animal.location,
        });
      }
      return { id: animal.id, name: animal.name, location: animal.location, moves, health, treatments, feedings };
    })
    .filter((star) => star.health.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);

  const targetsBySystem: IseauData["targetsBySystem"] = {};
  const globalTargets = new Map<Parameter, TargetRange>();
  const systemTargets = new Map<number, Map<Parameter, TargetRange>>();
  for (const target of sources.targets) {
    const value = { min: target.min, max: target.max };
    if (target.systemId === null) {
      globalTargets.set(target.parameter, value);
      continue;
    }
    const targets = systemTargets.get(target.systemId) ?? new Map<Parameter, TargetRange>();
    targets.set(target.parameter, value);
    systemTargets.set(target.systemId, targets);
  }
  for (const system of sources.systems) {
    const values = {} as Record<Parameter, TargetRange | null>;
    for (const { key } of WATER_QUALITY_PARAMS) {
      values[key] = systemTargets.get(system.id)?.get(key) ?? globalTargets.get(key) ?? null;
    }
    targetsBySystem[system.id] = values;
  }

  return {
    now: sources.now,
    systems: sources.systems,
    stars,
    water: sources.water.sort((a, b) => a.at - b.at || a.id - b.id),
    temperatures: sources.temperatures.sort((a, b) => a.at - b.at || a.id - b.id),
    targetsBySystem,
    treatmentsAvailable: sources.treatmentsAvailable,
  };
}

function locationAt(star: Star, time: number): Place {
  return [...star.moves].reverse().find((move) => move.since <= time)?.place ?? star.moves[0]?.place ?? star.location;
}

export function lastHealth(star: Star) {
  return star.health[0];
}

export function isCurrent(star: Star, now: number) {
  return star.health.some((entry) =>
    entry.severity >= 2 && entry.at >= now - 14 * DAY && entry.at <= now);
}

export function starsFor(data: IseauData, status: Status, system: SystemFilter) {
  return data.stars
    .filter((star) => isCurrent(star, data.now) === (status === "current")
      && (system === "all" || star.location.systemId === system))
    .sort((first, second) => lastHealth(second).severity - lastHealth(first).severity || lastHealth(second).at - lastHealth(first).at);
}

export function compareIds(param: string | null, data: IseauData) {
  const validIds = new Set(data.stars.map((star) => String(star.id)));
  const ids = (param?.split(",") ?? []).filter((id, index, all) => validIds.has(id) && all.indexOf(id) === index);
  const filler = [...starsFor(data, "current", "all"), ...starsFor(data, "past", "all")]
    .map((star) => String(star.id))
    .filter((id) => !ids.includes(id));
  return [...ids, ...filler].slice(0, 3);
}

export function daysSince(time: number, now: number) {
  return Math.floor((now - time) / DAY);
}

export function trend(star: Star): "improving" | "worsening" | "steady" | "new" {
  const [latest, previous] = star.health;
  if (!previous) return "new";
  const delta = latest.severity - previous.severity;
  return delta < 0 ? "improving" : delta > 0 ? "worsening" : "steady";
}

export function starData(star: Star, range: Range, data: IseauData) {
  const end = isCurrent(star, data.now) ? data.now : lastHealth(star).at + DAY;
  const start = end - range * DAY;
  const within = (time: number) => time >= start && time <= end;
  const inLocation = (time: number, systemId: number) => locationAt(star, time).systemId === systemId;
  return {
    start,
    end,
    health: star.health.filter((entry) => within(entry.at)),
    treatments: star.treatments.filter((entry) => within(entry.at)),
    feedings: star.feedings.filter((entry) => within(entry.at)),
    water: data.water.filter((entry) => within(entry.at) && inLocation(entry.at, entry.systemId)),
    temperatures: data.temperatures.filter((entry) => within(entry.at) && inLocation(entry.at, entry.systemId)),
  };
}

export function lastTemperature(star: Star, data: IseauData) {
  const end = isCurrent(star, data.now) ? data.now : lastHealth(star).at + DAY;
  const systemId = locationAt(star, end).systemId;
  return [...data.temperatures].reverse().find((entry) => entry.at <= end && entry.systemId === systemId);
}

export function recentWater(star: Star, count: number, data: IseauData) {
  const end = isCurrent(star, data.now) ? data.now : lastHealth(star).at + DAY;
  return data.water.filter((entry) => entry.at <= end && locationAt(star, entry.at).systemId === entry.systemId).slice(-count);
}

export function targetFor(systemId: number, parameter: Parameter, data: IseauData) {
  return data.targetsBySystem[systemId]?.[parameter] ?? null;
}
