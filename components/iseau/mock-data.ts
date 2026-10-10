export const DAY = 86_400_000;
export const SAMPLE_NOW = Date.parse("2026-10-05T23:59:59-07:00");
export type WindowDays = 7 | 14 | 30;
export type Severity = "low" | "medium" | "high";
export type Layer = "health" | "treatment" | "feeding" | "water" | "chemical" | "check" | "move";
type Issue = "arm_drop" | "spine_drop" | "lesion" | "arm_curling" | "flattening" | "other";
export const LAYERS: { id: Layer; label: string; color: string }[] = [
  { id: "health", label: "Health observations", color: "hsl(var(--chart-1))" },
  { id: "treatment", label: "Star treatments", color: "hsl(var(--chart-3))" },
  { id: "feeding", label: "Feeding", color: "hsl(var(--chart-2))" },
  { id: "water", label: "Water quality", color: "hsl(var(--chart-2))" },
  { id: "chemical", label: "System chemical additions", color: "hsl(var(--chart-4))" },
  { id: "check", label: "Daily check flags", color: "hsl(var(--chart-5))" },
  { id: "move", label: "Tank moves", color: "hsl(var(--foreground))" },
];
export const PARAMETERS = {
  ph: { label: "pH", unit: "", sampleBand: [7.9, 8.3] },
  salinity: { label: "Salinity", unit: "ppt", sampleBand: [32, 35] },
  magnesium: { label: "Magnesium", unit: "ppm", sampleBand: [1250, 1400] },
  ammonia: { label: "Ammonia", unit: "ppm", sampleBand: [0, 0.1] },
  alkalinity: { label: "Alkalinity", unit: "dKH", sampleBand: [7, 9] },
  calcium: { label: "Calcium", unit: "ppm", sampleBand: [400, 450] },
  phosphate: { label: "Phosphate", unit: "ppm", sampleBand: [0.02, 0.1] },
  nitrate: { label: "Nitrate", unit: "ppm", sampleBand: [0, 10] },
  nitrite: { label: "Nitrite", unit: "ppb", sampleBand: [0, 20] },
} as const;
export type Parameter = keyof typeof PARAMETERS;
export type Location = { system: string; tank: string };
export type Patient = {
  id: string;
  name: string;
  locations: (Location & { since: string })[];
};
export type SampleEvent = {
  id: string;
  at: string;
  layer: Layer;
  starId?: string;
  system: string;
  tank?: string;
  recordedBy: string;
  title: string;
  notes: string;
  severity?: Severity;
  issues?: [Issue, ...Issue[]];
  photo?: boolean;
  amount?: number;
  amountUnit?: string;
  concentration?: number;
  concentrationUnit?: string;
  eaten?: boolean;
  followUpBy?: string;
  followUpAt?: string;
  readings?: Record<Parameter, number>;
};
export const PATIENTS: Patient[] = [
  { id: "sol", name: "Sol", locations: [
    { since: "2026-01-01T00:00:00-08:00", system: "Graham", tank: "G-04" },
    { since: "2026-09-28T10:00:00-07:00", system: "Nursery", tank: "N-02" },
  ] },
  { id: "juniper", name: "Juniper", locations: [{ since: "2026-01-01T00:00:00-08:00", system: "Graham", tank: "G-02" }] },
  { id: "poppy", name: "Poppy", locations: [{ since: "2026-01-01T00:00:00-08:00", system: "Nursery", tank: "N-01" }] },
  { id: "atlas", name: "Atlas", locations: [{ since: "2026-01-01T00:00:00-08:00", system: "Snack Shack", tank: "S-03" }] },
  { id: "moss", name: "Moss", locations: [{ since: "2026-01-01T00:00:00-08:00", system: "Graham", tank: "G-01" }] },
];
export function locationAt(patient: Patient, at: number): Location {
  return [...patient.locations].reverse().find((location) => Date.parse(location.since) <= at) ?? patient.locations[0];
}
function timestamp(daysAgo: number, hour = 9) {
  const date = new Date(Date.UTC(2026, 9, 5 - daysAgo));
  return `${date.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00:00-07:00`;
}
function starEvent(patient: Patient, daysAgo: number, layer: Layer, details: Partial<SampleEvent>): SampleEvent {
  const at = timestamp(daysAgo);
  return {
    id: `${patient.id}-${layer}-${daysAgo}`, at, layer, starId: patient.id,
    ...locationAt(patient, Date.parse(at)), recordedBy: "Maya Chen", title: "", notes: "", ...details,
  };
}
const healthDays = [[0, 5, 11, 22], [2, 9, 20], [8, 12, 26], [18, 24, 40], [38, 45, 52]];
const issueSets: [Issue, ...Issue[]][] = [["lesion", "arm_curling"], ["spine_drop"], ["flattening", "other"], ["arm_drop"]];
const severities: Severity[] = ["low", "medium", "high"];
const EVENTS: SampleEvent[] = [
  ...PATIENTS.flatMap((patient, patientIndex) => [
    ...healthDays[patientIndex].map((daysAgo, index) => starEvent(patient, daysAgo, "health", {
      title: "Health observation", issues: issueSets[(patientIndex + index) % issueSets.length],
      severity: severities[Math.min(index, 2)], photo: index % 2 === 0,
      notes: index === 0 ? "Margins unchanged; photographed for comparison." : "Reduced extension observed during morning check.",
      recordedBy: index % 2 ? "Alex Rivera" : "Maya Chen",
    })),
    ...[1, 6, 13, 21].map((daysAgo, index) => starEvent(patient, daysAgo, "treatment", {
      title: index % 2 ? "Reef dip" : "Probiotics", amount: index % 2 ? 2 : 0.5, amountUnit: "mL",
      concentration: index % 2 ? 1 : 0.2, concentrationUnit: "mL/L", notes: "Sample treatment record; no dosing recommendation.", recordedBy: "Alex Rivera",
    })),
    ...[0, 3, 7, 10, 17, 25].map((daysAgo, index) => starEvent(patient, daysAgo, "feeding", {
      title: index % 2 ? "Clam" : "Mussel", amount: index % 2 ? 4 : 6, amountUnit: "g", eaten: index % 3 !== 1,
      followUpBy: "Sam Taylor", followUpAt: timestamp(daysAgo, 17), notes: "PM consumption follow-up recorded.", recordedBy: "Maya Chen",
    })),
  ]),
  ...["Graham", "Nursery", "Snack Shack"].flatMap((system, systemIndex) => [
    ...[4, 11, 18, 25].map((daysAgo, index): SampleEvent => ({
      id: `${system}-water-${daysAgo}`, at: timestamp(daysAgo), layer: "water", system,
      recordedBy: "Sam Taylor", title: "Weekly manual water reading", notes: "Manual sample; no Apex probe data.",
      readings: { ph: 8.05 + systemIndex * 0.08 - index * 0.03, salinity: 33 + systemIndex * 0.5,
        magnesium: 1280 + index * 25 + systemIndex * 15, ammonia: 0.02 + index * 0.01,
        alkalinity: 7.8 + index * 0.1, calcium: 415 + index * 5, phosphate: 0.04 + index * 0.01,
        nitrate: 3 + index * 0.8, nitrite: 5 + index * 2 },
    })),
    ...[2, 9, 16, 23].map((daysAgo, index): SampleEvent => ({
      id: `${system}-chemical-${daysAgo}`, at: timestamp(daysAgo, 11), layer: "chemical", system,
      recordedBy: "Alex Rivera", title: ["C-Balance", "Mg", "DI Trace"][index % 3], amount: 10 + systemIndex * 2, amountUnit: "mL",
      notes: "Sample system addition record.",
    })),
    ...[1, 8, 19].map((daysAgo): SampleEvent => ({
      id: `${system}-check-${daysAgo}`, at: timestamp(daysAgo, 8), layer: "check", system,
      recordedBy: "Maya Chen", title: "AM check: reduced activity", notes: "Flagged for observation; circulation checked.",
    })),
  ]),
  { id: "sol-move", at: "2026-09-28T10:00:00-07:00", layer: "move", starId: "sol", system: "Nursery", tank: "N-02",
    recordedBy: "Alex Rivera", title: "Graham / G-04 to Nursery / N-02", notes: "Moved for closer observation. Subsequent water readings use Nursery." },
];
export function windowStart(days: WindowDays) {
  const date = new Date(Date.UTC(2026, 9, 6 - days)).toISOString().slice(0, 10);
  return Date.parse(`${date}T00:00:00-07:00`);
}
export function patientEvents(patient: Patient) {
  return EVENTS.filter((event) => event.starId ? event.starId === patient.id : locationAt(patient, Date.parse(event.at)).system === event.system)
    .sort((first, second) => Date.parse(second.at) - Date.parse(first.at));
}
export function visibleEvents(patient: Patient, days: WindowDays, layers: Layer[]) {
  return patientEvents(patient).filter((event) => Date.parse(event.at) >= windowStart(days) && Date.parse(event.at) <= SAMPLE_NOW && layers.includes(event.layer));
}
export function lastObservation(patient: Patient) {
  return patientEvents(patient).find((event) => event.layer === "health")!;
}
export function isCurrentPatient(patient: Patient, days: WindowDays) {
  return Date.parse(lastObservation(patient).at) >= windowStart(days);
}
export function worstSeverity(patient: Patient, days: WindowDays): Severity {
  const health = visibleEvents(patient, days, ["health"]);
  return [...health, lastObservation(patient)].reduce<Severity>((worst, event) =>
    severities.indexOf(event.severity ?? "low") > severities.indexOf(worst) ? event.severity! : worst, "low");
}
export function eventDetails(event: SampleEvent) {
  return [event.issues?.map((issue) => issue.replaceAll("_", " ")).join(", "), event.severity,
    event.amount !== undefined ? `${event.amount} ${event.amountUnit}` : undefined,
    event.concentration !== undefined ? `${event.concentration} ${event.concentrationUnit}` : undefined,
    event.eaten !== undefined ? `Eaten: ${event.eaten ? "yes" : "no"}; follow-up by ${event.followUpBy} at ${event.followUpAt}` : undefined,
    event.readings ? Object.entries(event.readings).map(([parameter, value]) => `${PARAMETERS[parameter as Parameter].label}: ${Number(value.toFixed(2))} ${PARAMETERS[parameter as Parameter].unit}`).join("; ") : undefined,
    event.notes].filter(Boolean).join(" | ");
}
export const DESIGNS = [
  { id: 1, title: "Swimlane timeline", description: "Compare seven event layers along a shared date axis." },
  { id: 2, title: "Overlay chart + event feed", description: "Connect weekly chemistry readings with individual care events." },
  { id: 3, title: "Day-by-day grid", description: "Scan daily event counts and expand a day's records." },
  { id: 4, title: "Patient chart", description: "Review a patient summary, chemistry sparklines, and chronological notes." },
  { id: 5, title: "Ward board + detail", description: "Compare monitored patients, then open one patient's timeline." },
];