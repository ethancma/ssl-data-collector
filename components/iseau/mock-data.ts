import { WATER_QUALITY_PARAMS, type WaterQualityParameter } from "@/lib/config/reference-data";

const DAY = 86_400_000;
const SAMPLE_NOW = Date.parse("2026-10-05T23:59:59-07:00");
// A star counts as a current patient while its last health observation is this recent.
const CURRENT_WINDOW_DAYS = 14;
export const RANGES = [7, 14, 30, 60] as const;
export type Range = (typeof RANGES)[number];
export type Severity = "low" | "medium" | "high";
export const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
export type Issue = "arm_drop" | "spine_drop" | "lesion" | "arm_curling" | "flattening" | "other";
export const ISSUE_LABELS: Record<Issue, string> = {
  arm_drop: "Arm drop", spine_drop: "Spine drop", lesion: "Lesion", arm_curling: "Arm curling", flattening: "Flattening", other: "Other",
};
// Mock only: real systems come from the database.
export const SYSTEMS = ["Graham", "Nursery", "Snack Shack"] as const;
export type SystemName = (typeof SYSTEMS)[number];
export type Parameter = WaterQualityParameter;
// Placeholder bands; real target ranges live in core.water_quality_target_ranges.
const MOCK_BANDS: Record<Parameter, readonly [number, number]> = {
  ph: [7.9, 8.3], salinity: [32, 35], magnesium: [1250, 1400], ammonia: [0, 0.1], alkalinity: [7, 9],
  calcium: [400, 450], phosphate: [0.02, 0.1], nitrate: [0, 10], nitrite: [0, 20],
};
export const PARAMETERS = Object.fromEntries(WATER_QUALITY_PARAMS.map((param) => [param.key, { label: param.label, unit: param.unit ?? "", band: MOCK_BANDS[param.key] }])) as
  Record<Parameter, { label: string; unit: string; band: readonly [number, number] }>;

type Health = { id: string; at: number; severity: Severity; issues: Issue[]; notes: string; photo: boolean; by: string; system: SystemName; tank: string };
type Treatment = { id: string; at: number; type: string; amount: number; amountUnit: string; concentration: number; concentrationUnit: string; by: string };
type Feeding = { id: string; at: number; food: string; grams: number; eaten: boolean; followUpBy: string };
type WaterReading = { id: string; at: number; system: SystemName; by: string; values: Record<Parameter, number> };
type Temperature = { at: number; system: SystemName; celsius: number };
export type Star = {
  id: string; name: string;
  moves: { since: number; system: SystemName; tank: string }[];
  health: Health[]; treatments: Treatment[]; feedings: Feeding[];
};

function at(daysAgo: number, hour = 9) {
  const date = new Date(Date.UTC(2026, 9, 5 - daysAgo));
  return Date.parse(`${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00-07:00`);
}
const STAFF = ["Maya Chen", "Alex Rivera", "Sam Taylor"];
const NOTES: Record<Severity, string[]> = {
  high: ["Lesion margin spreading; photographed and separated from tank mates.", "Two arms curling inward; reduced grip on the glass."],
  medium: ["Reduced extension during the morning check.", "Spines softer than yesterday; lesion margin unchanged."],
  low: ["Margins unchanged; photographed for comparison.", "Moving normally; one small mark remains."],
};

type Def = { id: string; name: string; moves: [number, SystemName, string][]; health: [number, Severity, Issue[]][] };
const DEFS: Def[] = [
  { id: "sol", name: "Sol", moves: [[90, "Graham", "G-04"], [7, "Nursery", "N-02"]],
    health: [[0, "low", ["lesion"]], [5, "medium", ["lesion", "arm_curling"]], [11, "high", ["lesion", "arm_curling"]], [22, "medium", ["spine_drop"]]] },
  { id: "dune", name: "Dune", moves: [[90, "Snack Shack", "S-01"]],
    health: [[1, "high", ["arm_drop", "flattening"]], [4, "medium", ["arm_drop"]]] },
  { id: "juniper", name: "Juniper", moves: [[90, "Graham", "G-02"]],
    health: [[2, "medium", ["spine_drop"]], [9, "medium", ["spine_drop", "other"]], [20, "low", ["spine_drop"]]] },
  { id: "clay", name: "Clay", moves: [[90, "Graham", "G-03"]],
    health: [[3, "medium", ["flattening"]], [6, "high", ["flattening", "lesion"]], [13, "medium", ["flattening"]]] },
  { id: "poppy", name: "Poppy", moves: [[90, "Nursery", "N-01"]],
    health: [[8, "low", ["arm_drop"]], [12, "medium", ["arm_drop"]], [26, "medium", ["arm_drop", "arm_curling"]]] },
  { id: "fern", name: "Fern", moves: [[90, "Nursery", "N-03"]],
    health: [[16, "low", ["spine_drop"]], [21, "medium", ["spine_drop"]], [29, "high", ["spine_drop", "lesion"]]] },
  { id: "atlas", name: "Atlas", moves: [[90, "Snack Shack", "S-03"]],
    health: [[18, "low", ["other"]], [24, "medium", ["flattening", "other"]], [40, "medium", ["flattening"]]] },
  { id: "moss", name: "Moss", moves: [[90, "Graham", "G-01"]],
    health: [[20, "low", ["arm_curling"]], [27, "medium", ["arm_curling"]], [34, "high", ["arm_curling", "lesion"]]] },
];

function locationAt(star: Pick<Star, "moves">, time: number) {
  return [...star.moves].reverse().find((move) => move.since <= time) ?? star.moves[0];
}
function daysAgoOf(time: number) { return Math.round((at(0) - time) / DAY); }

function buildStar(def: Def, index: number): Star {
  const moves = def.moves.map(([days, system, tank]) => ({ since: at(days, 0), system, tank }));
  const health: Health[] = def.health.map(([days, severity, issues], i) => ({
    id: `${def.id}-h${days}`, at: at(days), severity, issues, notes: NOTES[severity][(index + i) % 2], photo: i % 2 === 0,
    by: STAFF[(index + i) % 3], ...locationAt({ moves }, at(days)),
  }));
  const treatments: Treatment[] = health.flatMap((entry, i) => {
    const days = daysAgoOf(entry.at);
    if (entry.severity === "low" || days < 1) return [];
    const high = entry.severity === "high";
    return [{ id: `${def.id}-t${days}`, at: at(days - 1, 10), type: high ? "Reef dip" : "Probiotics", amount: high ? 2 : 0.5, amountUnit: "mL",
      concentration: high ? 1 : 0.2, concentrationUnit: "mL/L", by: STAFF[(i + 1) % 3] }];
  });
  const newest = daysAgoOf(health[0].at);
  const oldest = daysAgoOf(health[health.length - 1].at);
  const feedings: Feeding[] = [];
  for (let days = Math.min(oldest + 3, 89), n = 0; days >= newest; days -= 3, n++) {
    const severity = health.find((candidate) => candidate.at <= at(days, 23))?.severity ?? "low";
    feedings.push({ id: `${def.id}-f${days}`, at: at(days, 9), food: n % 2 ? "Clam" : "Mussel", grams: n % 2 ? 4 : 6,
      eaten: severity === "high" ? n % 3 === 0 : severity === "medium" ? n % 4 !== 1 : true, followUpBy: "Sam Taylor" });
  }
  return { id: def.id, name: def.name, moves, health, treatments, feedings: feedings.reverse() };
}
export const STARS: Star[] = DEFS.map(buildStar);

const WATER: WaterReading[] = SYSTEMS.flatMap((system, s) => Array.from({ length: 13 }, (_, i): WaterReading => {
  const wave = Math.sin(i * 1.7 + s);
  const spike = system === "Graham" && (i === 1 || i === 2);
  return { id: `${system}-w${i}`, at: at(3 + i * 7), system, by: STAFF[(i + s) % 3], values: {
    ph: 8.1 + s * 0.05 + wave * 0.08 - (spike ? 0.12 : 0), salinity: 33.4 + s * 0.4 + wave * 0.3, magnesium: 1310 + s * 15 + wave * 40,
    ammonia: spike ? 0.13 : 0.03 + Math.abs(wave) * 0.02, alkalinity: 8 + wave * 0.5, calcium: 425 + wave * 10,
    phosphate: 0.05 + Math.abs(wave) * 0.02, nitrate: 4 + s + Math.abs(wave) * 2, nitrite: 6 + Math.abs(wave) * 4 } };
})).sort((first, second) => first.at - second.at);

const TEMPERATURES: Temperature[] = SYSTEMS.flatMap((system, s) => Array.from({ length: 90 }, (_, days): Temperature => ({
  // One reading per system from the daily AM check.
  at: at(days, 8), system,
  // Graham ran warm about ten days ago, which lines up with its health observations.
  celsius: Math.round((12.2 + s * 0.4 + 0.5 * Math.sin(days / 4 + s) + (system === "Graham" && days >= 9 && days <= 13 ? 1.6 : 0)) * 10) / 10,
}))).sort((first, second) => first.at - second.at);

export function lastHealth(star: Star) { return star.health[0]; }
export function isCurrent(star: Star) { return lastHealth(star).at >= SAMPLE_NOW - CURRENT_WINDOW_DAYS * DAY; }
export function currentLocation(star: Star) { return locationAt(star, SAMPLE_NOW); }
export function daysSince(time: number) { return Math.floor((SAMPLE_NOW - time) / DAY); }
export function trend(star: Star): "improving" | "worsening" | "steady" | "new" {
  const [latest, previous] = star.health;
  if (!previous) return "new";
  const delta = SEVERITY_RANK[latest.severity] - SEVERITY_RANK[previous.severity];
  return delta < 0 ? "improving" : delta > 0 ? "worsening" : "steady";
}

// Past patients are shown over the weeks around their last observation, not today.
function windowFor(star: Star, range: Range) {
  const end = isCurrent(star) ? SAMPLE_NOW : lastHealth(star).at + DAY;
  return { start: end - range * DAY, end };
}
export function starData(star: Star, range: Range) {
  const { start, end } = windowFor(star, range);
  const within = (time: number) => time >= start && time <= end;
  const inSystem = (time: number, system: SystemName) => locationAt(star, time).system === system;
  return {
    start, end,
    health: star.health.filter((entry) => within(entry.at)),
    treatments: star.treatments.filter((entry) => within(entry.at)),
    feedings: star.feedings.filter((entry) => within(entry.at)),
    water: WATER.filter((entry) => within(entry.at) && inSystem(entry.at, entry.system)),
    temperatures: TEMPERATURES.filter((entry) => within(entry.at) && inSystem(entry.at, entry.system)),
  };
}
export function lastTemperature(star: Star) {
  const { end } = windowFor(star, 7);
  return [...TEMPERATURES].reverse().find((entry) => entry.at <= end && entry.system === locationAt(star, end).system)!;
}

// Weekly readings are sparse, so previews show the latest few regardless of the chosen range.
export function recentWater(star: Star, count: number) {
  const { end } = windowFor(star, 7);
  return WATER.filter((entry) => entry.at <= end && locationAt(star, entry.at).system === entry.system).slice(-count);
}
