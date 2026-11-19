export type QueryStats = {
  queries: number;
  errors: number;
  supabaseMs: number;
  slowest: { label: string; ms: number } | null;
};

export function createQueryStats(): QueryStats {
  return { queries: 0, errors: 0, supabaseMs: 0, slowest: null };
}

// Labels carry only the resource name (table, RPC, auth or storage endpoint);
// never query strings, filters, cookies, or row data.
export function supabaseQueryLabel(input: string | URL | Request): string {
  let pathname: string;
  try {
    pathname = new URL(input instanceof Request ? input.url : String(input)).pathname;
  } catch {
    return "other";
  }
  const [service, , kind, name] = pathname.split("/").filter(Boolean);
  if (service === "rest") return kind === "rpc" ? `rpc/${name ?? "?"}` : `rest/${kind ?? "?"}`;
  if (service === "auth") return `auth/${kind ?? "?"}`;
  if (service === "storage") return "storage";
  return "other";
}

export function recordQuery(stats: QueryStats, label: string, ms: number, failed: boolean) {
  const rounded = Math.round(ms);
  stats.queries += 1;
  stats.supabaseMs += rounded;
  if (failed) stats.errors += 1;
  if (!stats.slowest || rounded > stats.slowest.ms) stats.slowest = { label, ms: rounded };
}

export function instrumentFetch(stats: QueryStats, now: () => number = () => performance.now()): typeof fetch {
  return async (input, init) => {
    const started = now();
    let failed = true;
    try {
      const response = await fetch(input, init);
      failed = !response.ok;
      return response;
    } finally {
      recordQuery(stats, supabaseQueryLabel(input), now() - started, failed);
    }
  };
}

export function formatQueryStats(stats: QueryStats): string {
  return JSON.stringify({ evt: "supabase_queries", ...stats });
}
