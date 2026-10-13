import { WATER_QUALITY_PARAMS, type WaterQualityParameter } from "@/lib/config/reference-data";
import {
  formatWaterQualityTarget,
  isWaterQualityValueOutOfRange,
  resolveWaterQualityTarget,
  type WaterQualityTargetRange,
} from "@/lib/daily-operations/water-quality-targets";
import { addPacificCalendarDays, getPacificDateTimeParts, pacificDateKey } from "@/lib/pacific-date-time";

// Pacific hour after which a check that is still unlogged counts as missed.
export const AM_DUE_HOUR = 12;
export const PM_DUE_HOUR = 18;
export const HEALTH_WINDOW_DAYS = 14;

export type SnapshotStatus = "ok" | "watch" | "attention";
export type CheckState = "done" | "due" | "missed";
export type Severity = "low" | "medium" | "high";

export type Concern = {
  kind: "check_missed" | "water_off" | "health" | "out_of_range" | "yesterday_missed";
  status: Exclude<SnapshotStatus, "ok">;
  text: string;
};

export type SystemSnapshotInput = {
  systemId: number;
  now: Date;
  checks: { type: "AM" | "PM"; checkedAt: string; waterRunning: boolean; temperature: number | null }[];
  healthObservations: { observedAt: string; severity: Severity }[];
  latestWater: { testedAt: string; values: Partial<Record<WaterQualityParameter, number | null>> } | null;
  lastFedAt: string | null;
  targets: readonly WaterQualityTargetRange[];
};

export type WaterReadingSummary = {
  key: WaterQualityParameter;
  label: string;
  unit: string;
  value: number | null;
  target: { min: number | null; max: number | null } | null;
  targetText: string | null;
  outOfRange: boolean;
};

export type SystemSnapshot = {
  status: SnapshotStatus;
  concerns: Concern[];
  headline: string;
  am: CheckState;
  pm: CheckState;
  latestTemperature: number | null;
  water: { testedAt: string | null; testedAgo: string | null; readings: WaterReadingSummary[] };
  lastFedAt: string | null;
  fedAgo: string | null;
};

const STATUS_RANK: Record<SnapshotStatus, number> = { attention: 0, watch: 1, ok: 2 };
const KIND_RANK: Record<Concern["kind"], number> = {
  check_missed: 0,
  water_off: 1,
  health: 2,
  yesterday_missed: 3,
  out_of_range: 4,
};

export function statusRank(status: SnapshotStatus) {
  return STATUS_RANK[status];
}

function dayDiff(laterKey: string, earlierKey: string) {
  return Math.round((Date.parse(`${laterKey}T00:00:00Z`) - Date.parse(`${earlierKey}T00:00:00Z`)) / 86_400_000);
}

export function relativeDays(iso: string, now: Date) {
  const days = dayDiff(pacificDateKey(now), pacificDateKey(iso));
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function formatValue(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: Math.abs(value) >= 100 ? 0 : 2 });
}

export function formatReading(reading: Pick<WaterReadingSummary, "value" | "unit">) {
  if (reading.value === null) return "—";
  return `${formatValue(reading.value)}${reading.unit ? ` ${reading.unit}` : ""}`;
}

export function deriveSystemSnapshot(input: SystemSnapshotInput): SystemSnapshot {
  const { now, systemId } = input;
  const { date: todayKey, time } = getPacificDateTimeParts(now);
  const hour = Number(time.slice(0, 2));
  const yesterdayKey = addPacificCalendarDays(todayKey, -1);

  const checkState = (type: "AM" | "PM", dueHour: number): CheckState =>
    input.checks.some((check) => check.type === type && pacificDateKey(check.checkedAt) === todayKey)
      ? "done"
      : hour >= dueHour
        ? "missed"
        : "due";
  const am = checkState("AM", AM_DUE_HOUR);
  const pm = checkState("PM", PM_DUE_HOUR);

  const concerns: Concern[] = [];

  for (const [type, state] of [["AM", am], ["PM", pm]] as const) {
    if (state === "missed") {
      concerns.push({ kind: "check_missed", status: "attention", text: `${type} check wasn't logged today` });
    }
  }

  const latestCheck = [...input.checks].sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];
  if (latestCheck && !latestCheck.waterRunning) {
    concerns.push({
      kind: "water_off",
      status: "attention",
      text: `Water wasn't running at the ${latestCheck.type} check ${relativeDays(latestCheck.checkedAt, now)}`,
    });
  }

  const missedYesterday = (["AM", "PM"] as const).filter(
    (type) => !input.checks.some((check) => check.type === type && pacificDateKey(check.checkedAt) === yesterdayKey),
  );
  if (missedYesterday.length > 0) {
    concerns.push({
      kind: "yesterday_missed",
      status: "watch",
      text: missedYesterday.length === 2
        ? "Yesterday's AM and PM checks were missed"
        : `Yesterday's ${missedYesterday[0]} check was missed`,
    });
  }

  const cutoffKey = addPacificCalendarDays(todayKey, -HEALTH_WINDOW_DAYS);
  const serious = input.healthObservations
    .filter((entry) => entry.severity !== "low" && pacificDateKey(entry.observedAt) >= cutoffKey)
    .sort((a, b) => (a.severity === b.severity ? b.observedAt.localeCompare(a.observedAt) : a.severity === "high" ? -1 : 1))[0];
  if (serious) {
    concerns.push({
      kind: "health",
      status: serious.severity === "high" ? "attention" : "watch",
      text: `${serious.severity === "high" ? "High" : "Medium"}-severity health observation ${relativeDays(serious.observedAt, now)}`,
    });
  }

  const readings: WaterReadingSummary[] = WATER_QUALITY_PARAMS.map((param) => {
    const value = input.latestWater?.values[param.key] ?? null;
    const target = resolveWaterQualityTarget(input.targets, systemId, param.key);
    const unit = param.unit ?? "";
    return {
      key: param.key,
      label: param.label,
      unit,
      value,
      target: target ? { min: target.minValue, max: target.maxValue } : null,
      targetText: target ? formatWaterQualityTarget(target, unit || null) : null,
      outOfRange: isWaterQualityValueOutOfRange(value, target),
    };
  });
  for (const reading of readings) {
    if (reading.outOfRange) {
      concerns.push({
        kind: "out_of_range",
        status: "watch",
        text: `${reading.label} ${formatReading(reading)} is outside ${reading.targetText}`,
      });
    }
  }

  concerns.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || KIND_RANK[a.kind] - KIND_RANK[b.kind]);

  const latestTemperature = [...input.checks]
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
    .find((check) => check.temperature !== null)?.temperature ?? null;

  return {
    status: concerns[0]?.status ?? "ok",
    concerns,
    headline: concerns[0]?.text ?? "All clear",
    am,
    pm,
    latestTemperature,
    water: {
      testedAt: input.latestWater?.testedAt ?? null,
      testedAgo: input.latestWater ? relativeDays(input.latestWater.testedAt, now) : null,
      readings,
    },
    lastFedAt: input.lastFedAt,
    fedAgo: input.lastFedAt ? relativeDays(input.lastFedAt, now) : null,
  };
}
