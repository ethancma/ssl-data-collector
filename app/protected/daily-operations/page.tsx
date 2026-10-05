import { Suspense } from "react";
import { notFound } from "next/navigation";

import { DailyOperationsHub } from "@/components/daily-operations/daily-operations-hub";
import { getCurrentProfile } from "@/lib/supabase/current-profile";

import { loadDailyOperationsData } from "./data";

export default async function DailyOperationsPage() {
  const profile = await getCurrentProfile();
  const canAccessDailyOperations =
    profile?.status === "active" &&
    ["admin", "technician", "volunteer"].includes(profile.role);

  if (!canAccessDailyOperations) {
    notFound();
  }

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
  const data = await loadDailyOperationsData();
  return <DailyOperationsHub {...data} />;
}
