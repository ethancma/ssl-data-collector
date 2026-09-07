import Link from "next/link";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

// Group a system's checks into today's Pacific-day AM/PM completion status.
const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function TodayPage() {
  const supabase = await createClient();

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
  const [{ data: systems }, { data: checks }] = await Promise.all([
    supabase.from("systems").select("id, name").order("name"),
    supabase
      .from("daily_checks")
      .select("system_id, check_type, checked_at")
      .gte("checked_at", since),
  ]);

  const todayKey = PACIFIC_DAY.format(new Date());
  const done = new Set<string>();
  for (const c of checks ?? []) {
    if (PACIFIC_DAY.format(new Date(c.checked_at)) === todayKey) {
      done.add(`${c.system_id}:${c.check_type}`);
    }
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-6">
      <h1 className="font-bold text-2xl">Today</h1>
      <div className="flex flex-col divide-y rounded-md border">
        {(systems ?? []).map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-4 p-3 px-4"
          >
            <span className="font-medium">{s.name}</span>
            <div className="flex gap-2">
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
