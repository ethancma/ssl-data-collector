import { WATER_QUALITY_PARAMETERS, type WaterQualityParameter } from "@/lib/config/reference-data";
import {
  isWaterQualityValueOutOfRange,
  resolveWaterQualityTarget,
  type WaterQualityTargetRange,
} from "@/lib/daily-operations/water-quality-targets";
import { ACTIVITY_WINDOW_DAYS } from "@/lib/systems/activity";

export type SystemKpis = {
  // `judged` counts tests that had at least one value with a target range.
  testsInRange: { inRange: number; judged: number };
  temperature: { min: number; max: number } | null;
};

export function deriveSystemKpis(input: {
  now: Date;
  systemId: number;
  waterReadings: { testedAt: string; values: Partial<Record<WaterQualityParameter, number | null>> }[];
  checks: { checkedAt: string; temperature: number | null }[];
  targets: readonly WaterQualityTargetRange[];
}): SystemKpis {
  const since = input.now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000;

  let inRange = 0;
  let judged = 0;
  for (const reading of input.waterReadings) {
    if (Date.parse(reading.testedAt) < since) continue;
    let hasTarget = false;
    let outOfRange = false;
    for (const key of WATER_QUALITY_PARAMETERS) {
      const target = resolveWaterQualityTarget(input.targets, input.systemId, key);
      const value = reading.values[key] ?? null;
      if (!target || value === null) continue;
      hasTarget = true;
      if (isWaterQualityValueOutOfRange(value, target)) outOfRange = true;
    }
    if (!hasTarget) continue;
    judged += 1;
    if (!outOfRange) inRange += 1;
  }

  const temperatures = input.checks
    .filter((check) => check.temperature !== null && Date.parse(check.checkedAt) >= since)
    .map((check) => check.temperature as number);

  return {
    testsInRange: { inRange, judged },
    temperature: temperatures.length ? { min: Math.min(...temperatures), max: Math.max(...temperatures) } : null,
  };
}
