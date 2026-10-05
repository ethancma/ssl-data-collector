import type { WaterQualityParameter } from "@/lib/config/reference-data";

export type WaterQualityTargetRange = {
  id: number;
  systemId: number | null;
  parameterKey: WaterQualityParameter;
  minValue: number | null;
  maxValue: number | null;
};

export type WaterQualityValues = Partial<
  Record<WaterQualityParameter, number | null>
>;

export function resolveWaterQualityTarget(
  targets: readonly WaterQualityTargetRange[],
  systemId: number,
  parameterKey: WaterQualityParameter,
) {
  return (
    targets.find(
      (target) =>
        target.systemId === systemId && target.parameterKey === parameterKey,
    ) ??
    targets.find(
      (target) => target.systemId === null && target.parameterKey === parameterKey,
    ) ??
    null
  );
}

export function isWaterQualityValueOutOfRange(
  value: number | null,
  target: WaterQualityTargetRange | null,
) {
  if (value === null || target === null) return false;

  return (
    (target.minValue !== null && value < target.minValue) ||
    (target.maxValue !== null && value > target.maxValue)
  );
}

export function formatWaterQualityTarget(
  target: WaterQualityTargetRange | null,
  unit: string | null,
) {
  if (target === null) return "Not configured";

  const suffix = unit ? ` ${unit}` : "";
  if (target.minValue !== null && target.maxValue !== null) {
    return `${target.minValue}–${target.maxValue}${suffix}`;
  }
  if (target.minValue !== null) {
    return `at least ${target.minValue}${suffix}`;
  }
  return `at most ${target.maxValue}${suffix}`;
}

export function waterQualityValuesRequireNotes(
  values: WaterQualityValues,
  targets: readonly WaterQualityTargetRange[],
  systemId: number,
) {
  return Object.entries(values).some(([parameterKey, value]) =>
    isWaterQualityValueOutOfRange(
      value,
      resolveWaterQualityTarget(
        targets,
        systemId,
        parameterKey as WaterQualityParameter,
      ),
    ),
  );
}