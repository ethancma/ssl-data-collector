import { DATASET_VIEWS, type HistoryRow } from "@/lib/history/datasets";
import { HISTORY_PAGE_SIZE, type HistoryParams } from "@/lib/history/params";
import { applyHistoryFilters, applyHistoryOrder } from "@/lib/history/query";
import { createClient } from "@/lib/supabase/server";

type Option = { id: number; name: string };

export type HistoryLoadResult =
  | { error: string }
  | { pageOutOfRange: true }
  | { rows: HistoryRow[]; total: number; outOfRange: number | null; systems: Option[]; recorders: Option[] };

// PostgREST answers PGRST103 when the requested page starts past the last row.
const RANGE_NOT_SATISFIABLE = "PGRST103";

export async function loadHistory(params: HistoryParams): Promise<HistoryLoadResult> {
  const supabase = await createClient();
  const from = (params.page - 1) * HISTORY_PAGE_SIZE;

  const rowsQuery = applyHistoryOrder(
    applyHistoryFilters(supabase.from(DATASET_VIEWS[params.dataset]).select("*", { count: "exact" }), params),
    params,
  ).range(from, from + HISTORY_PAGE_SIZE - 1);
  // Only water quality can be out of range, so other datasets show no such count.
  const outOfRangeQuery =
    params.dataset === "all" || params.dataset === "water_quality"
      ? applyHistoryFilters(supabase.from(DATASET_VIEWS.water_quality).select("id", { count: "exact", head: true }), { ...params, outOfRange: true })
      : null;

  const [rowsResult, outOfRangeResult, systemsResult, recordersResult] = await Promise.all([
    rowsQuery,
    outOfRangeQuery ?? Promise.resolve(null),
    supabase.from("systems").select("id, name").order("name"),
    supabase.from("v_profile_names").select("id, display_name").order("display_name"),
  ]);

  if (rowsResult.error?.code === RANGE_NOT_SATISFIABLE) return { pageOutOfRange: true };
  const failure = rowsResult.error ?? outOfRangeResult?.error ?? systemsResult.error ?? recordersResult.error;
  if (failure) return { error: failure.message };

  return {
    rows: (rowsResult.data ?? []) as HistoryRow[],
    total: rowsResult.count ?? 0,
    outOfRange: outOfRangeResult ? (outOfRangeResult.count ?? 0) : null,
    systems: (systemsResult.data ?? []).map((system) => ({ id: system.id as number, name: system.name as string })),
    recorders: (recordersResult.data ?? []).map((profile) => ({ id: profile.id as number, name: (profile.display_name as string | null) ?? "Unknown" })),
  };
}
