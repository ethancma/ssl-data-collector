import { createBrowserClient } from "@supabase/ssr";

import { assertSafeSupabaseTarget } from "@/lib/supabase/target";

export function createClient() {
  assertSafeSupabaseTarget(process.env.NEXT_PUBLIC_SUPABASE_URL, {
    host: typeof window === "undefined" ? null : window.location.host,
    siteOrigin: process.env.NEXT_PUBLIC_SITE_URL,
    nodeEnv: process.env.NODE_ENV,
  });

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { db: { schema: "core" } },
  );
}
