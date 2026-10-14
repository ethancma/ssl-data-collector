import { Suspense } from "react";
import { notFound } from "next/navigation";

import { FeedingScheduleManager } from "@/components/settings/feeding-schedule-manager";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";
import type { TankPosition } from "@/lib/systems/feeding-schedule";

export default async function FeedingSchedulesPage() {
  const profile = await getCurrentProfile();
  const canManageSchedules =
    profile?.status === "active" &&
    ["admin", "technician"].includes(profile.role);

  if (!canManageSchedules) {
    notFound();
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Feeding settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Feeding schedules</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Set the weekdays each system is fed, with optional per-tank overrides. The app
          uses these to show the next feeding due and when one is overdue.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading feeding schedules…
          </div>
        }
      >
        <FeedingSchedulesContent />
      </Suspense>
    </div>
  );
}

async function FeedingSchedulesContent() {
  const supabase = await createClient();
  const [systemsResult, tanksResult, schedulesResult] = await Promise.all([
    supabase
      .from("systems")
      .select("id, name")
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
    supabase
      .from("tanks")
      .select("id, system_id, name")
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("feeding_schedules").select("id, system_id, tank_position, size_liters, weekdays"),
  ]);

  return (
    <FeedingScheduleManager
      systems={(systemsResult.data ?? []).map((system) => ({ id: system.id, name: system.name }))}
      tanks={(tanksResult.data ?? []).map((tank) => ({
        id: tank.id,
        systemId: tank.system_id,
        name: tank.name,
      }))}
      initialSchedules={(schedulesResult.data ?? []).map((schedule) => ({
        id: schedule.id,
        systemId: schedule.system_id,
        tankPosition: schedule.tank_position as TankPosition | null,
        sizeLiters: schedule.size_liters === null ? null : Number(schedule.size_liters),
        weekdays: schedule.weekdays as number[],
      }))}
      loadError={
        systemsResult.error?.message ?? tanksResult.error?.message ?? schedulesResult.error?.message
      }
    />
  );
}
