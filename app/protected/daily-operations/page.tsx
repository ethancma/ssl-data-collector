import { Suspense } from "react";

import { DailyOperationsHub } from "@/components/daily-operations/daily-operations-hub";
import { createClient } from "@/lib/supabase/server";

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

  const [{ data: systems }, { data: animals }] = await Promise.all([
    supabase.from("systems").select("id, name").order("name"),
    supabase
      .from("animals")
      .select("id, name, tank_id")
      .eq("status", "active")
      .order("name"),
  ]);

  const animalOptions = (animals ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    tankId: a.tank_id,
  }));

  return <DailyOperationsHub systems={systems ?? []} animals={animalOptions} />;
}
