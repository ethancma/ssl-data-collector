import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { cache } from "react";

import { createQueryStats, formatQueryStats, instrumentFetch } from "@/lib/supabase/query-stats";
import { assertSafeSupabaseTarget } from "@/lib/supabase/target";

// One stats object per render; after() emits a single log line once the response is sent.
// Route handlers and server actions get one line per client.
const getRequestQueryStats = cache(() => {
  const stats = createQueryStats();
  try {
    after(() => {
      if (stats.queries > 0) console.log(formatQueryStats(stats));
    });
  } catch {
    // Outside a request scope (scripts, tests): skip logging rather than fail the client.
  }
  return stats;
});

export async function assertSafeServerSupabaseTarget() {
  const requestHeaders = await headers();
  assertSafeSupabaseTarget(process.env.NEXT_PUBLIC_SUPABASE_URL, {
    host: requestHeaders.get("host"),
    siteOrigin: process.env.NEXT_PUBLIC_SITE_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}

/**
 * Especially important if using Fluid compute: Don't put this client in a
 * global variable. Always create a new client within each function when using
 * it.
 */
export async function createClient() {
  await assertSafeServerSupabaseTarget();
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "core" },
      global: { fetch: instrumentFetch(getRequestQueryStats()) },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have proxy refreshing
            // user sessions.
          }
        },
      },
    },
  );
}
