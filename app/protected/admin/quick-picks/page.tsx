import { notFound } from "next/navigation";
import { Suspense } from "react";

import { QuickPickCatalogManager } from "@/components/quick-pick-catalog-manager";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

export default async function QuickPickCatalogsPage() {
  const profile = await getCurrentProfile();

  if (profile?.status !== "active" || profile.role !== "admin") {
    notFound();
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Admin</p>
        <h1 className="text-3xl font-semibold tracking-tight">Quick-pick catalogs</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Manage the lab-wide suggestions shown in Chemical Addition and Star Treatment
          forms. Saved records keep their original names and units.
        </p>
      </header>

      <Suspense
        fallback={
          <div className="rounded-md border p-4 text-sm text-muted-foreground">
            Loading quick-pick catalogs…
          </div>
        }
      >
        <QuickPickCatalogContent />
      </Suspense>
    </div>
  );
}

async function QuickPickCatalogContent() {
  const supabase = await createClient();
  const [chemicalResult, starResult] = await Promise.all([
    supabase
      .from("chemical_addition_catalog")
      .select("id, name, default_unit, updated_at")
      .order("name"),
    supabase
      .from("star_treatment_catalog")
      .select("id, name, default_amount_unit, default_concentration_unit, updated_at")
      .order("name"),
  ]);

  return (
    <QuickPickCatalogManager
      initialChemicalCatalog={(chemicalResult.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        defaultUnit: item.default_unit,
        updatedAt: item.updated_at,
      }))}
      initialStarCatalog={(starResult.data ?? []).map((item) => ({
        id: item.id,
        name: item.name,
        defaultAmountUnit: item.default_amount_unit,
        defaultConcentrationUnit: item.default_concentration_unit,
        updatedAt: item.updated_at,
      }))}
      loadError={chemicalResult.error?.message ?? starResult.error?.message}
    />
  );
}