import { createHash, randomBytes } from "node:crypto";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function buildInvitationUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/invite/${token}`;
}

export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Invitations are not configured.");
  }

  return createSupabaseClient(url, key, {
    db: { schema: "core" as const },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}