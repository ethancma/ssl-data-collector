export type ActivityKind = "feeding" | "probiotic" | "treatment" | "chemical" | "maintenance";

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  detail: string | null;
};

type Inputs = {
  feedings: { fedAt: string }[];
  treatments: { administeredAt: string; treatmentType: string; amount: number | null; unit: string | null }[];
  chemicals: { id: number; chemicalName: string; amount: number; unit: string; addedAt: string; reason: string | null }[];
  maintenance: { id: number; performedAt: string; taskType: string; notes: string | null }[];
};

const TREATMENT_LABELS: Record<string, string> = { probiotics: "Probiotics", reef_dip: "Reef dip" };

function treatmentLabel(type: string) {
  const known = TREATMENT_LABELS[type];
  if (known) return known;
  const text = type.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
// Feeding and treatment logs are one row per animal; rows from one batch share a minute.
const minuteKey = (iso: string) => iso.slice(0, 16);

// Merges one system's feedings, star treatments, chemical additions and maintenance into one newest-first list.
export function buildActivityEvents({ feedings, treatments, chemicals, maintenance }: Inputs): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  const feedingBatches = new Map<string, { at: string; count: number }>();
  for (const { fedAt } of feedings) {
    const batch = feedingBatches.get(minuteKey(fedAt));
    if (batch) batch.count += 1;
    else feedingBatches.set(minuteKey(fedAt), { at: fedAt, count: 1 });
  }
  for (const [key, { at, count }] of feedingBatches) {
    events.push({ id: `feeding-${key}`, kind: "feeding", at, title: "Feeding", detail: `${plural(count, "animal")} fed` });
  }

  const treatmentBatches = new Map<string, { at: string; type: string; count: number; amount: number | null; unit: string | null }>();
  for (const row of treatments) {
    const key = `${row.treatmentType}|${minuteKey(row.administeredAt)}`;
    const batch = treatmentBatches.get(key);
    if (batch) batch.count += 1;
    else treatmentBatches.set(key, { at: row.administeredAt, type: row.treatmentType, count: 1, amount: row.amount, unit: row.unit });
  }
  for (const [key, batch] of treatmentBatches) {
    events.push({
      id: `treatment-${key}`,
      kind: batch.type === "probiotics" ? "probiotic" : "treatment",
      at: batch.at,
      title: treatmentLabel(batch.type),
      detail: `${plural(batch.count, "star")}${batch.amount !== null ? `, ${batch.amount} ${batch.unit} each` : ""}`,
    });
  }

  for (const c of chemicals) {
    events.push({
      id: `chemical-${c.id}`, kind: "chemical", at: c.addedAt, title: c.chemicalName,
      detail: `${c.amount} ${c.unit}${c.reason ? `, ${c.reason}` : ""}`,
    });
  }

  for (const m of maintenance) {
    events.push({ id: `maintenance-${m.id}`, kind: "maintenance", at: m.performedAt, title: m.taskType, detail: m.notes });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
