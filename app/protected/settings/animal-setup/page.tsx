import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AnimalSetupManager } from "@/components/settings/animal-setup-manager";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";
import {
  ANIMAL_COLUMNS,
  TANK_COLUMNS,
  toAnimalRecord,
  toTankRecord,
} from "@/lib/validation/animal-setup";

export default async function AnimalSetupPage() {
  const profile = await getCurrentProfile();
  const canManageAnimals =
    profile?.status === "active" &&
    ["admin", "technician"].includes(profile.role);

  if (!canManageAnimals) {
    notFound();
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Lab settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Animal setup</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Add animals and place them in a tank by shelf position and size. Moving an animal
          only affects new entries; saved logs keep the tank they were recorded in.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading animals…
          </div>
        }
      >
        <AnimalSetupContent />
      </Suspense>
    </div>
  );
}

async function AnimalSetupContent() {
  const supabase = await createClient();
  const [systemsResult, tanksResult, speciesResult, animalsResult] = await Promise.all([
    supabase
      .from("systems")
      .select("id, name")
      .eq("has_animals", true)
      .order("name", { ascending: true })
      .order("id", { ascending: true }),
    supabase.from("tanks").select(TANK_COLUMNS).order("name").order("id"),
    supabase
      .from("species")
      .select("id, common_name, category")
      .order("common_name")
      .order("id"),
    supabase.from("animals").select(ANIMAL_COLUMNS).order("name").order("id"),
  ]);

  return (
    <AnimalSetupManager
      systems={(systemsResult.data ?? []).map((system) => ({ id: system.id, name: system.name }))}
      species={(speciesResult.data ?? []).map((species) => ({
        id: species.id,
        commonName: species.common_name,
        category: species.category,
      }))}
      initialTanks={(tanksResult.data ?? []).map(toTankRecord)}
      initialAnimals={(animalsResult.data ?? []).map(toAnimalRecord)}
      loadError={
        systemsResult.error?.message ??
        tanksResult.error?.message ??
        speciesResult.error?.message ??
        animalsResult.error?.message
      }
    />
  );
}
