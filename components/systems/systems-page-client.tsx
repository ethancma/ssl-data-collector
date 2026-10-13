"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SystemCompare } from "@/components/systems/system-compare";
import { SystemDetail } from "@/components/systems/system-detail";
import { SystemLineup } from "@/components/systems/system-lineup";
import { CHART_RANGE_DAYS, type ChartRangeDays, type SystemDetailData } from "@/components/systems/types";
import { statusRank } from "@/lib/systems/snapshot";

function parseRange(value: string | null): ChartRangeDays {
  const parsed = Number(value);
  return (CHART_RANGE_DAYS as readonly number[]).includes(parsed) ? (parsed as ChartRangeDays) : 14;
}

// Snapshot statuses ("AM due by noon") and ages go stale; refetch when a tab returns after this long.
const STALE_AFTER_MS = 10 * 60 * 1000;

// The URL is the source of truth for the view (`?system=` for a system,
// `?compare=1` for compare, nothing for the lineup). Moving between views uses
// the History API, which Next syncs into useSearchParams, so switching is an
// instant local render of the data already fetched for every system, and Back
// still works. The chart range is local state (seeded from and kept in sync
// with `?range=`) so its pills respond immediately.
export function SystemsPageClient({ dataBySlug }: { dataBySlug: Record<string, SystemDetailData> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const top = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);

  const systems = useMemo(
    () => Object.values(dataBySlug).sort((a, b) =>
      statusRank(a.snapshot.status) - statusRank(b.snapshot.status) || a.name.localeCompare(b.name)),
    [dataBySlug],
  );

  const slug = params.get("system");
  const selected = slug && Object.hasOwn(dataBySlug, slug) ? dataBySlug[slug] : undefined;
  const view = params.get("compare") === "1" ? "compare" : selected ? "detail" : "lineup";
  const [range, setRange] = useState<ChartRangeDays>(() => parseRange(params.get("range")));
  const urlRange = params.get("range");
  useEffect(() => {
    if (urlRange) setRange(parseRange(urlRange));
  }, [urlRange]);

  const generatedAt = systems[0].generatedAt;
  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState === "visible" && Date.now() - Date.parse(generatedAt) > STALE_AFTER_MS) router.refresh();
    };
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => document.removeEventListener("visibilitychange", refreshIfStale);
  }, [generatedAt, router]);

  const go = (next: { system?: string; compare?: boolean; range?: ChartRangeDays }, mode: "push" | "replace" = "push") => {
    const query = new URLSearchParams();
    if (next.compare) query.set("compare", "1");
    else if (next.system) {
      query.set("system", next.system);
      query.set("range", String(next.range ?? range));
    }
    const url = query.size ? `${pathname}?${query}` : pathname;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };

  // The shell scrolls inside <main>, so a view change resets that element and moves focus
  // to the new heading (the clicked link is gone).
  useEffect(() => {
    top.current?.closest("main")?.scrollTo({ top: 0 });
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const heading = top.current?.querySelector("h1");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus({ preventScroll: true });
  }, [view, selected?.slug]);

  return (
    <div ref={top} className="mx-auto w-full min-w-0 max-w-7xl">
      {view === "compare" ? (
        <SystemCompare systems={systems} onOpen={(next) => go({ system: next })} onBack={() => go({})} />
      ) : view === "detail" && selected ? (
        <SystemDetail
          key={selected.slug}
          data={selected}
          systems={systems}
          range={range}
          onSelectRange={(next) => {
            setRange(next);
            go({ system: selected.slug, range: next }, "replace");
          }}
          onOpen={(next) => go({ system: next })}
          onBack={() => go({})}
        />
      ) : (
        <SystemLineup systems={systems} onOpen={(next) => go({ system: next })} onCompare={() => go({ compare: true })} />
      )}
    </div>
  );
}
