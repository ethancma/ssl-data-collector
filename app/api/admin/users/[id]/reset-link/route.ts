import { NextResponse, type NextRequest } from "next/server";

import { createServiceRoleClient } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function getAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { response: errorResponse("Sign in as an Admin.", 401) };

  const { data: admin, error: adminError } = await supabase
    .from("profiles")
    .select("role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (adminError || admin?.role !== "admin" || admin.status !== "active") {
    return { response: errorResponse("Not authorized.", 403) };
  }
  return { supabase };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return errorResponse("Invalid request origin.", 403);
  }

  const admin = await getAdmin();
  if ("response" in admin) return admin.response;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || !id) return errorResponse("Invalid user.");

  const { data: target, error: targetError } = await admin.supabase
    .from("profiles")
    .select("email, status")
    .eq("id", id)
    .maybeSingle();
  if (targetError || !target) return errorResponse("User not available.", 404);
  if (target.status !== "active") return errorResponse("Reset links are only available for active users.", 409);

  try {
    const { data, error } = await createServiceRoleClient().auth.admin.generateLink({
      type: "recovery",
      email: target.email,
    });
    const hashedToken = data?.properties?.hashed_token;
    if (error || !hashedToken) return errorResponse("Reset link could not be generated. Retry later.", 503);

    const link = `${request.nextUrl.origin}/auth/reset?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
    return NextResponse.json({ link }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("Reset service is unavailable. Retry later.", 503);
  }
}