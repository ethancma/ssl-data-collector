import { addPacificCalendarDays, pacificDayBoundaryToIso } from "@/lib/pacific-date-time";

import type { HistoryParams } from "./params";

const SEARCH_COLUMNS = ["notes", "system_name", "tank_name", "animal_name", "recorded_by_name"];

// Builds the quoted ilike pattern for a PostgREST `or` filter. Inside the quotes `,` `(` `)` `.` are
// safe; `\`, `"`, `%` and `_` are escaped so they match literally; `*` (PostgREST's wildcard alias) is dropped.
export function searchPattern(term: string) {
  const literal = term.replaceAll("*", "").replace(/[\\%_]/g, (character) => `\\${character}`);
  return `"%${literal.replace(/[\\"]/g, (character) => `\\${character}`)}%"`;
}

// The PostgREST builder types are too deep to constrain generically, so the helpers
// narrow to the few chainable methods they call and hand the same builder type back.
type Chain = {
  gte(column: string, value: string): Chain;
  lt(column: string, value: string): Chain;
  eq(column: string, value: string | number): Chain;
  neq(column: string, value: string): Chain;
  or(filters: string): Chain;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): Chain;
};

// Shared by the page query and the CSV export so both always see the same rows.
export function applyHistoryFilters<Q>(query: Q, params: HistoryParams): Q {
  let filtered = (query as unknown as Chain)
    .gte("occurred_at", pacificDayBoundaryToIso(params.from))
    .lt("occurred_at", pacificDayBoundaryToIso(addPacificCalendarDays(params.to, 1)));
  if (params.system !== null) filtered = filtered.eq("system_id", params.system);
  if (params.recorder !== null) filtered = filtered.eq("recorded_by", params.recorder);
  if (params.source !== null) filtered = filtered.eq("data_source", params.source);
  if (params.outOfRange) filtered = filtered.neq("out_of_range", "{}");
  if (params.q) {
    const pattern = searchPattern(params.q);
    filtered = filtered.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(","));
  }
  return filtered as unknown as Q;
}

// Time, dataset, then id break ties so paging never repeats or skips a row.
export function applyHistoryOrder<Q>(query: Q, params: HistoryParams): Q {
  let ordered = (query as unknown as Chain).order(params.sort, { ascending: params.dir === "asc", nullsFirst: false });
  if (params.sort !== "occurred_at") ordered = ordered.order("occurred_at", { ascending: false });
  return ordered.order("dataset", { ascending: true }).order("id", { ascending: false }) as unknown as Q;
}
