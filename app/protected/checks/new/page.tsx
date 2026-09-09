import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DailyCheckForm } from "@/components/daily-check-form";
import { CHECK_TYPES } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/server";

// Same Pacific-day rule as the Today dashboard: look back 36h, then keep only
// rows whose fed_at falls on today's Pacific calendar day.
const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default function NewDailyCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ system?: string; type?: string }>;
}) {
  return (
    <div className="flex-1 w-full flex flex-col items-start gap-6">
      <h1 className="font-bold text-2xl">New daily check</h1>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <NewDailyCheckContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewDailyCheckContent({
  searchParams,
}: {
  searchParams: Promise<{ system?: string; type?: string }>;
}) {
  const supabase = await createClient();
  const { data: systems, error } = await supabase
    .from("systems")
    .select("id, name")
    .order("name");

  if (error) {
    redirect("/protected/home");
  }

  const { system, type } = await searchParams;
  const defaultCheckType = CHECK_TYPES.find((t) => t === type);

  // PM check: surface today's feeding logs for this system's animals that
  // still need a consumption status, so the tech can log it in the same form.
  let pendingFeedingLogs: { id: number; animalName: string }[] = [];
  if (defaultCheckType === "PM" && system && /^\d+$/.test(system)) {
    const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
    const { data: logs } = await supabase
      .from("feeding_logs")
      .select("id, fed_at, animals(name), tanks!inner(system_id)")
      .eq("tanks.system_id", Number(system))
      .is("consumption_status", null)
      .gte("fed_at", since)
      .order("fed_at", { ascending: false });

    const todayKey = PACIFIC_DAY.format(new Date());
    pendingFeedingLogs = (logs ?? [])
      .filter((log) => PACIFIC_DAY.format(new Date(log.fed_at)) === todayKey)
      .map((log) => ({
        id: log.id,
        animalName: log.animals?.name ?? "Unknown animal",
      }));
  }

  return (
    <DailyCheckForm
      systems={systems ?? []}
      defaultSystemId={system}
      defaultCheckType={defaultCheckType}
      pendingFeedingLogs={pendingFeedingLogs}
    />
  );
}
