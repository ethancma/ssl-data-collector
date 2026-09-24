import { Suspense } from "react";

import { DailyOperationsHub } from "@/components/daily-operations/daily-operations-hub";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default function DailyOperationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Sunflower Star Laboratory</p>
        <h1 className="text-3xl font-semibold tracking-tight">Daily Operations</h1>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <DailyOperationsContent />
      </Suspense>
    </div>
  );
}

async function DailyOperationsContent() {
  const supabase = await createClient();
  const profile = await getCurrentProfile();
  const canManageStarTreatments =
    profile?.status === "active" &&
    ["admin", "technician", "volunteer"].includes(profile.role);

  const [
    { data: systems, error: systemsError },
    { data: animals, error: animalsError },
  ] = await Promise.all([
    supabase.from("systems").select("id, name").order("name"),
    supabase
      .from("animals")
      .select("id, name, tank_id, species_id, tracking_type, status")
      .eq("status", "active")
      .order("name"),
  ]);

  const animalOptions = (animals ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    tankId: a.tank_id,
  }));

  let pendingFeedingLogs: {
    id: number;
    animalName: string;
    systemId: number;
  }[] = [];
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const { data: logs } = await supabase
    .from("feeding_logs")
    .select("id, fed_at, animals(name), tanks!inner(system_id)")
    .is("consumption_status", null)
    .gte("fed_at", since)
    .order("fed_at", { ascending: false });

  const todayKey = PACIFIC_DAY.format(new Date());
  pendingFeedingLogs = (logs ?? [])
    .filter((log) => PACIFIC_DAY.format(new Date(log.fed_at)) === todayKey)
    .flatMap((log) => {
      const animal = log.animals as unknown as { name: string } | null;
      const tank = log.tanks as unknown as { system_id: number } | null;
      if (!tank) return [];
      return [{
        id: log.id,
        animalName: animal?.name ?? "Unknown animal",
        systemId: tank.system_id,
      }];
    });

  let starSystems: { id: number; name: string }[] = [];
  let starTanks: { id: number; name: string; systemId: number }[] = [];
  let stars: { id: number; name: string; tankId: number; speciesName: string }[] = [];
  let starTreatmentLoadError: string | undefined;

  if (canManageStarTreatments) {
    const [tankResult, speciesResult] = await Promise.all([
      supabase.from("tanks").select("id, name, system_id").order("name"),
      supabase.from("species").select("id, common_name, category").eq("category", "star"),
    ]);
    const starSpeciesById = new Map(
      (speciesResult.data ?? []).map((species) => [species.id, species.common_name]),
    );
    stars = (animals ?? [])
      .filter(
        (animal) =>
          animal.tracking_type === "individual" && starSpeciesById.has(animal.species_id),
      )
      .map((animal) => ({
        id: animal.id,
        name: animal.name,
        tankId: animal.tank_id,
        speciesName: starSpeciesById.get(animal.species_id) ?? "Star",
      }));
    const eligibleTankIds = new Set(stars.map((star) => star.tankId));
    starTanks = (tankResult.data ?? [])
      .filter((tank) => eligibleTankIds.has(tank.id))
      .map((tank) => ({ id: tank.id, name: tank.name, systemId: tank.system_id }));
    const eligibleSystemIds = new Set(starTanks.map((tank) => tank.systemId));
    starSystems = (systems ?? []).filter((system) => eligibleSystemIds.has(system.id));
    starTreatmentLoadError =
      systemsError?.message ??
      animalsError?.message ??
      tankResult.error?.message ??
      speciesResult.error?.message;
  }

  return (
    <DailyOperationsHub
      systems={systems ?? []}
      animals={animalOptions}
      canManageStarTreatments={canManageStarTreatments}
      starSystems={starSystems}
      starTanks={starTanks}
      stars={stars}
      pendingFeedingLogs={pendingFeedingLogs}
      starTreatmentLoadError={starTreatmentLoadError}
    />
  );
}
