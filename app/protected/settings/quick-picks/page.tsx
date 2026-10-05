import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  QUICK_PICK_CATALOGS,
  quickPickSelectColumns,
  toQuickPickCatalogRow,
} from "@/lib/daily-operations/quick-pick-catalog-config";
import {
  QuickPickCatalogManager,
  type QuickPickCatalogInitialData,
} from "@/components/quick-pick-catalog-manager";
import { getCurrentProfile } from "@/lib/supabase/current-profile";
import { createClient } from "@/lib/supabase/server";

export default async function QuickPickCatalogsPage() {
  const profile = await getCurrentProfile();
  const canManageCatalogs =
    profile?.status === "active" &&
    ["admin", "technician"].includes(profile.role);

  if (!canManageCatalogs) {
    notFound();
  }

  return (
    <div className="flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Lab settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Quick-pick catalogs</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Manage lab-wide suggestions shown in Feeding, Chemical Addition, and Star
          Treatment forms. Retire items that are no longer used; saved records keep their
          original names and units.
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
  const results = await Promise.all(
    QUICK_PICK_CATALOGS.map((config) =>
      supabase
        .from(config.table)
        .select<string, Record<string, unknown>>(quickPickSelectColumns(config))
        .order("name"),
    ),
  );

  const initialCatalogs: QuickPickCatalogInitialData = {};
  QUICK_PICK_CATALOGS.forEach((config, index) => {
    const { data, error } = results[index];
    initialCatalogs[config.key] = {
      items: (data ?? []).map((row) => toQuickPickCatalogRow(config, row)),
      loadError: error?.message ?? null,
    };
  });

  return <QuickPickCatalogManager initialCatalogs={initialCatalogs} />;
}
