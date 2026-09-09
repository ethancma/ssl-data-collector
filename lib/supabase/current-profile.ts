import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

// Wraps the profile lookup used by ApprovalGate/AdminGate so it's only
// queried once per request even when multiple components need it.
export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const uid = claimsData?.claims?.sub;

  if (!uid) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role, status, email, display_name")
    .eq("auth_user_id", uid)
    .maybeSingle();

  return profile ?? null;
});
