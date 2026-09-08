import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// Group a system's checks into today's Pacific-day AM/PM completion status.
const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default function TodayPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <h1 className="font-bold text-2xl">Today</h1>
      <Suspense
        fallback={
          <div className="flex flex-col rounded-md border p-4 text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <TodayContent />
      </Suspense>
    </div>
  );
}

async function TodayContent() {
  const supabase = await createClient();

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    { data: systems },
    { data: checks },
    { data: feedingLogs },
    { data: waterQualityReadings },
  ] = await Promise.all([
    supabase.from("systems").select("id, name").order("name"),
    supabase
      .from("daily_checks")
      .select("system_id, check_type, checked_at")
      .gte("checked_at", since),
    supabase
      .from("feeding_logs")
      .select("fed_at, tanks!inner(system_id)")
      .gte("fed_at", since),
    supabase
      .from("water_quality_readings")
      .select("system_id, tested_at")
      .gte("tested_at", weekAgo),
  ]);

  const todayKey = PACIFIC_DAY.format(new Date());
  const done = new Set<string>();
  for (const c of checks ?? []) {
    if (PACIFIC_DAY.format(new Date(c.checked_at)) === todayKey) {
      done.add(`${c.system_id}:${c.check_type}`);
    }
  }

  const fedToday = new Set<number>();
  for (const f of feedingLogs ?? []) {
    if (PACIFIC_DAY.format(new Date(f.fed_at)) === todayKey) {
      fedToday.add(f.tanks.system_id);
    }
  }

  const testedThisWeek = new Set<number>();
  for (const w of waterQualityReadings ?? []) {
    testedThisWeek.add(w.system_id);
  }

  return (
    <div className="flex flex-col divide-y rounded-md border">
      {(systems ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-4 p-3 px-4"
          >
            <span className="font-medium">{s.name}</span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {(["AM", "PM"] as const).map((type) => {
                const complete = done.has(`${s.id}:${type}`);
                return complete ? (
                  <span
                    key={type}
                    className="inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300"
                  >
                    {type} done
                  </span>
                ) : (
                  <Button key={type} asChild size="sm" variant="outline">
                    <Link href={`/protected/checks/new?system=${s.id}&type=${type}`}>
                      Log {type}
                    </Link>
                  </Button>
                );
              })}
              {fedToday.has(s.id) ? (
                <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  Fed
                </span>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href="/protected/feeding/new">Log feeding</Link>
                </Button>
              )}
              {testedThisWeek.has(s.id) ? (
                <span className="inline-flex items-center rounded-md bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-300">
                  Tested this week
                </span>
              ) : (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/protected/water-quality/new?system=${s.id}`}>
                    Water quality due
                  </Link>
                </Button>
              )}
              <Button asChild size="sm" variant="outline">
                <Link href={`/protected/chemical-additions/new?system=${s.id}`}>
                  Log chemical addition
                </Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/protected/health-observations/new">
                  Log health observation
                </Link>
              </Button>
            </div>
          </div>
        ))}
    </div>
  );
}
