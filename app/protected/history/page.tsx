import { notFound, redirect } from "next/navigation";

import HistoryView from "@/components/history/history-view";
import { parseHistoryParams, type RawSearchParams } from "@/lib/history/params";
import { getPacificDateString } from "@/lib/pacific-date-time";
import { getCurrentProfile } from "@/lib/supabase/current-profile";

import { loadHistory } from "./data";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const profile = await getCurrentProfile();
  if (profile?.status !== "active") notFound();

  const canViewStar = ["admin", "technician", "volunteer"].includes(profile.role);
  const raw = await searchParams;
  const params = parseHistoryParams(raw, getPacificDateString(), canViewStar);
  const result = await loadHistory(params);

  if ("pageOutOfRange" in result) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(raw)) {
      if (key !== "page" && typeof value === "string") query.set(key, value);
    }
    redirect(query.size ? `/protected/history?${query}` : "/protected/history");
  }

  if ("error" in result) {
    return (
      <p className="text-sm text-red-500" role="alert">
        History could not be loaded: {result.error}
      </p>
    );
  }

  return <HistoryView data={{ ...result, params, canViewStar }} />;
}
