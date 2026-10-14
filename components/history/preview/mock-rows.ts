import { HEALTH_ISSUE_TYPES, WATER_QUALITY_PARAMS, type WaterQualityParameter } from "@/lib/config/reference-data";
import { addPacificCalendarDays, pacificWallTimeToIso } from "@/lib/pacific-date-time";

// Mock only. Rows mirror the columns of the planned core.v_history_* views.
export const SAMPLE_TODAY = "2026-10-14";

export const DATASETS = ["daily_check", "feeding", "water_quality", "chemical_addition", "health_observation", "maintenance", "star_treatment"] as const;
export type Dataset = (typeof DATASETS)[number];
export const DATASET_LABELS: Record<Dataset, string> = {
  daily_check: "AM/PM checks", feeding: "Feeding", water_quality: "Water quality", chemical_addition: "Chemical additions",
  health_observation: "Health observations", maintenance: "Maintenance", star_treatment: "Star treatments",
};

export const DATA_SOURCES = ["live", "import", "paper_backfill"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];
export const SOURCE_LABELS: Record<DataSource, string> = { live: "Live", import: "Import", paper_backfill: "Paper backfill" };

export const ISSUE_LABELS: Record<(typeof HEALTH_ISSUE_TYPES)[number], string> = {
  arm_drop: "Arm drop", spine_drop: "Spine drop", lesion: "Lesion", arm_curling: "Arm curling", flattening: "Flattening", other: "Other",
};
export const TASK_LABELS = { filter_change: "Filter change", sump_flush: "Sump flush", other: "Other" } as const;

export type HistoryRow = {
  dataset: Dataset; id: string; occurred_at: string; occurred_on: string;
  system_id: number | null; system_name: string | null; tank_id: number | null; tank_name: string | null;
  animal_id: number | null; animal_name: string | null;
  recorded_by: string | null; recorded_by_name: string | null;
  data_source: DataSource; entered_at: string; notes: string | null; summary: string;
  check_type?: "AM" | "PM"; water_running?: boolean; temperature?: number;
  food_name?: string; amount_value?: number; amount_unit?: string; consumption_status?: string; consumption_checked_at?: string;
  ph_source?: string; out_of_range?: string[];
  chemical_name?: string; amount?: number; unit?: string; reason?: string;
  severity?: "low" | "medium" | "high"; issues?: string[]; has_photo?: boolean;
  task_type?: string;
  treatment_type?: string; concentration?: number; concentration_unit?: string;
} & Partial<Record<WaterQualityParameter, number>>;

const SYSTEMS = [{ id: 1, name: "Graham" }, { id: 2, name: "Nursery" }, { id: 3, name: "Snack Shack" }];
const TANKS = [
  { id: 1, system: 1, name: "Graham A" }, { id: 2, system: 1, name: "Graham B" },
  { id: 3, system: 2, name: "Nursery 1" }, { id: 4, system: 3, name: "Snack Shack 1" },
];
const ANIMALS = [
  { id: 1, name: "Biscuit", tank: 1 }, { id: 2, name: "Pebble", tank: 1 }, { id: 3, name: "Juniper", tank: 2 },
  { id: 4, name: "Marlowe", tank: 3 }, { id: 5, name: "Olive", tank: 4 },
];
const STAFF = [{ id: "u1", name: "Maya Chen" }, { id: "u2", name: "Alex Rivera" }, { id: "u3", name: "Sam Taylor" }, { id: "u4", name: "Jordan Lee" }];

export const SYSTEM_NAMES = SYSTEMS.map((system) => system.name);
export const RECORDER_NAMES = STAFF.map((person) => person.name);

// Placeholder bands; real target ranges live in core.water_quality_target_ranges.
const BANDS: Record<WaterQualityParameter, readonly [number, number, number]> = {
  ph: [7.9, 8.3, 2], salinity: [32, 35, 1], magnesium: [1250, 1400, 0], ammonia: [0, 0.1, 2], alkalinity: [7, 9, 1],
  calcium: [400, 450, 0], phosphate: [0.02, 0.1, 2], nitrate: [0, 10, 0], nitrite: [0, 20, 0],
};

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261014);
const pick = <T>(items: readonly T[]) => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number, digits = 1) => Number((min + rand() * (max - min)).toFixed(digits));
const pad = (value: number) => String(value).padStart(2, "0");

const LONG_NOTES = [
  "Lesion margin has spread about two millimetres since yesterday's check. Photographed from above and the side, moved to the quiet corner of the tank, and flagged for the Friday review with the vet.",
  "Replaced the cartridge and rinsed the housing. Flow was noticeably weaker before the change and the pre-filter sponge was heavily fouled; cleaned that too and noted the date on the tank card.",
  "Two arms curling inward during the morning check and reduced grip on the glass. Fed half the usual amount and will recheck this afternoon. Water parameters from Tuesday were normal.",
];
const SHORT_NOTES = ["Skimmer cup emptied.", "Slightly cloudy water, cleared by afternoon.", "Backfilled from the paper log.", "Normal.", "Top-off reservoir refilled."];

type Place = { system?: (typeof SYSTEMS)[number]; tank?: (typeof TANKS)[number]; animal?: (typeof ANIMALS)[number] };

let sequence = 0;
function make(dataset: Dataset, daysAgo: number, hour: number, place: Place, summary: string, extra: Partial<HistoryRow> = {}, notes: string | null = null): HistoryRow {
  const occurred_on = addPacificCalendarDays(SAMPLE_TODAY, -daysAgo);
  const occurred_at = pacificWallTimeToIso(occurred_on, `${pad(hour)}:${pad(Math.floor(rand() * 60))}`);
  const tank = place.tank ?? (place.animal ? TANKS.find((candidate) => candidate.id === place.animal?.tank) : undefined);
  const system = place.system ?? SYSTEMS.find((candidate) => candidate.id === tank?.system);
  const person = rand() < 0.04 ? undefined : pick(STAFF);
  const data_source: DataSource = daysAgo > 100 ? "import" : rand() < 0.06 ? "paper_backfill" : "live";
  const delay = data_source === "live" ? (2 + rand() * 18) * 60_000 : data_source === "paper_backfill" ? (2 + rand() * 4) * 86_400_000 : 0;
  const entered_at = data_source === "import" ? "2026-08-12T17:30:00.000Z" : new Date(Date.parse(occurred_at) + delay).toISOString();
  sequence += 1;
  return {
    dataset, id: `${dataset}-${sequence}`, occurred_at, occurred_on,
    system_id: system?.id ?? null, system_name: system?.name ?? null, tank_id: tank?.id ?? null, tank_name: tank?.name ?? null,
    animal_id: place.animal?.id ?? null, animal_name: place.animal?.name ?? null,
    recorded_by: person?.id ?? null, recorded_by_name: person?.name ?? null,
    data_source, entered_at, notes: notes ?? (rand() < 0.12 ? pick(SHORT_NOTES) : null), summary, ...extra,
  };
}

function dailyCheck(system: (typeof SYSTEMS)[number], daysAgo: number, type: "AM" | "PM") {
  const temperature = between(11.8, 14.6);
  const water_running = rand() > 0.04;
  return make("daily_check", daysAgo, type === "AM" ? 8 : 16, { system }, `${type} · ${temperature} °C · ${water_running ? "water running" : "water off"}`,
    { check_type: type, water_running, temperature });
}

function waterReading(system: (typeof SYSTEMS)[number], daysAgo: number, spike: boolean) {
  const values = {} as Record<WaterQualityParameter, number>;
  for (const param of WATER_QUALITY_PARAMS) {
    const [low, high, digits] = BANDS[param.key];
    values[param.key] = between(low, high, digits);
  }
  if (spike) {
    const key = pick(["ammonia", "ph", "nitrate", "alkalinity"] as const);
    const [low, high, digits] = BANDS[key];
    values[key] = Number((rand() < 0.5 ? high + (high - low) * 0.4 : Math.max(0, low - (high - low) * 0.4)).toFixed(digits));
  }
  const out_of_range = WATER_QUALITY_PARAMS.filter((param) => values[param.key] < BANDS[param.key][0] || values[param.key] > BANDS[param.key][1]).map((param) => param.key);
  const shown = out_of_range.length ? WATER_QUALITY_PARAMS.filter((param) => out_of_range.includes(param.key)) : WATER_QUALITY_PARAMS.slice(0, 3);
  return make("water_quality", daysAgo, 10, { system }, shown.map((param) => `${param.label} ${values[param.key]}`).join(" · "),
    { ph_source: rand() < 0.7 ? "manual" : "apex_probe", out_of_range, ...values });
}

const rows: HistoryRow[] = [];

for (const system of SYSTEMS) {
  for (let day = 0; day < 21; day += 1) rows.push(dailyCheck(system, day, "AM"));
  for (let day = 0; day < 10; day += 1) rows.push(dailyCheck(system, day, "PM"));
  for (let week = 0; week < 14; week += 1) rows.push(waterReading(system, 2 + week * 7 + system.id, [1, 5, 8, 11].includes(week + system.id)));
  for (let index = 0; index < 8; index += 1) rows.push(dailyCheck(system, 120 + Math.floor(rand() * 220), rand() < 0.5 ? "AM" : "PM"));
}
for (let index = 0; index < 8; index += 1) rows.push(waterReading(pick(SYSTEMS), 110 + Math.floor(rand() * 220), false));

for (let index = 0; index < 30; index += 1) {
  const animal = pick(ANIMALS);
  const food_name = pick(["Mussel", "Clam", "Shrimp", "Urchin roe"]);
  const amount_value = Math.ceil(rand() * 4);
  const consumption_status = pick(["full", "full", "partial", "none"]);
  const row = make("feeding", Math.floor(rand() * 30), 11, { animal }, `${food_name} · ${amount_value} pieces · ${consumption_status}`,
    { food_name, amount_value, amount_unit: "pieces", consumption_status });
  rows.push({ ...row, consumption_checked_at: new Date(Date.parse(row.occurred_at) + 86_400_000).toISOString() });
}

for (let index = 0; index < 16; index += 1) {
  const chemical_name = pick(["Alkalinity buffer", "Calcium chloride", "Dechlorinator", "Magnesium supplement"]);
  const amount = between(5, 60, 0);
  const unit = pick(["mL", "g"]);
  rows.push(make("chemical_addition", Math.floor(rand() * 45), 13, { system: pick(SYSTEMS) }, `${chemical_name} · ${amount} ${unit}`,
    { chemical_name, amount, unit, reason: pick(["Low alkalinity", "Weekly dosing", "Low calcium", "Water change"]) }));
}

for (let index = 0; index < 18; index += 1) {
  const severity = pick(["low", "low", "medium", "medium", "high"] as const);
  const issues = [pick(HEALTH_ISSUE_TYPES), ...(rand() < 0.35 ? [pick(HEALTH_ISSUE_TYPES)] : [])].filter((issue, position, all) => all.indexOf(issue) === position);
  rows.push(make("health_observation", Math.floor(rand() * 40), 9, { animal: pick(ANIMALS) }, `${severity} · ${issues.map((issue) => ISSUE_LABELS[issue]).join(", ")}`,
    { severity, issues, has_photo: severity !== "low" }, index % 6 === 0 ? LONG_NOTES[index / 6] : null));
}

for (let index = 0; index < 14; index += 1) {
  const task_type = pick(["filter_change", "sump_flush", "other"] as const);
  rows.push(make("maintenance", Math.floor(rand() * 50), 14, { tank: pick(TANKS) }, TASK_LABELS[task_type], { task_type }, index === 3 ? LONG_NOTES[1] : null));
}

for (let index = 0; index < 10; index += 1) {
  const treatment_type = pick(["Antibiotic bath", "Isolation", "Freshwater dip", "Probiotic feed"]);
  const amount = between(5, 40, 0);
  const concentration = between(1, 10, 0);
  rows.push(make("star_treatment", Math.floor(rand() * 30), 15, { animal: pick(ANIMALS) }, `${treatment_type} · ${amount} mL`,
    { treatment_type, amount, unit: "mL", concentration, concentration_unit: "mg/L" }));
}

export const MOCK_ROWS = rows.sort((first, second) => second.occurred_at.localeCompare(first.occurred_at));
