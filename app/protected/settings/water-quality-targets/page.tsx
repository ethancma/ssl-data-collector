import { Suspense } from "react";
import { notFound } from "next/navigation";

import { WaterQualityTargetManager } from "@/components/settings/water-quality-target-manager";
import type { WaterQualityTargetRange } from "@/lib/daily-operations/water-quality-targets";
import {
  WATER_QUALITY_PARAMETERS,
  type WaterQualityParameter,
} from "@/lib/config/reference-data";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

export default async function WaterQualityTargetsPage() {
  const profile = await getCurrentProfile();
  const canManageTargets =
    profile?.status === "active" &&
    ["admin", "technician"].includes(profile.role);

  if (!canManageTargets) {
    notFound();
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Water quality settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Target ranges</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Set optional inclusive lab-wide ranges and system overrides. Readings outside
          the effective range require Notes but remain saveable.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading target ranges…
          </div>
        }
      >
        <WaterQualityTargetsContent />
      </Suspense>
    </div>
  );
}

function isWaterQualityParameter(value: string): value is WaterQualityParameter {
  return WATER_QUALITY_PARAMETERS.includes(value as WaterQualityParameter);
}

async function WaterQualityTargetsContent() {
  const supabase = await createClient();
  const [systemsResult, targetsResult] = await Promise.all([
    supabase
      .from("systems")
      .select("id, name")
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("water_quality_target_ranges")
      .select("id, system_id, parameter_key, min_value, max_value")
      .order("parameter_key")
      .order("system_id", { nullsFirst: true }),
  ]);

  const targets = (targetsResult.data ?? []).flatMap((target) => {
    if (!isWaterQualityParameter(target.parameter_key)) return [];

    return [
      {
        id: target.id,
        systemId: target.system_id,
        parameterKey: target.parameter_key,
        minValue: target.min_value === null ? null : Number(target.min_value),
        maxValue: target.max_value === null ? null : Number(target.max_value),
      } satisfies WaterQualityTargetRange,
    ];
  });

  return (
    <WaterQualityTargetManager
      systems={(systemsResult.data ?? []).map((system) => ({
        id: system.id,
        name: system.name,
      }))}
      initialTargets={targets}
      loadError={systemsResult.error?.message ?? targetsResult.error?.message}
    />
  );
}