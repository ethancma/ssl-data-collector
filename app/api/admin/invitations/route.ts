import { NextResponse, type NextRequest } from "next/server";

import {
  buildInvitationUrl,
  createServiceRoleClient,
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/invitations";
import { PROFILE_ROLES, type ProfileRole } from "@/lib/config/reference-data";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function successResponse(message?: string) {
  return NextResponse.json({ ok: true, message }, { headers: { "Cache-Control": "no-store" } });
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  const message = error.message ?? "Invitation request failed.";
  if (error.code === "42501" || message.includes("active Admin")) return errorResponse(message, 403);
  if (error.code === "P0002") return errorResponse(message, 404);
  if (error.code === "23505") return errorResponse(message, 409);
  if (error.code === "23514" || error.code === "23503") return errorResponse(message, 400);
  return errorResponse("Invitation service is unavailable. Retry later.", 503);
}

async function getAdmin() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return { response: errorResponse("Sign in as an Admin.", 401) };

  const { data: admin, error: adminError } = await supabase
    .from("profiles")
    .select("id, role, status")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (adminError || admin?.role !== "admin" || admin.status !== "active") {
    return { response: errorResponse("Not authorized.", 403) };
  }
  return { supabase, user, admin };
}

function validateInviteInput(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as { email?: unknown; role?: unknown };
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const role = input.role as ProfileRole;
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !PROFILE_ROLES.includes(role)) return null;
  return { email, role };
}

async function createInvitation(origin: string, adminAuthUserId: string, email: string, role: ProfileRole) {
  const token = generateInvitationToken();
  const privileged = createServiceRoleClient();
  const { data: invitationId, error } = await privileged.rpc("create_invitation", {
    p_admin_auth_user_id: adminAuthUserId,
    p_email: email,
    p_role: role,
    p_token_hash: hashInvitationToken(token),
  });
  if (error) return { error };
  return { invitationId, link: buildInvitationUrl(origin, token) };
}

export async function GET() {
  const admin = await getAdmin();
  if ("response" in admin) return admin.response;

  try {
    const privileged = createServiceRoleClient();
    const { data, error } = await privileged
      .from("invitations")
      .select("id, email, role, expires_at, created_at")
      .is("revoked_at", null)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("expires_at");
    if (error) return errorResponse("Open invitations could not be loaded. Retry later.", 503);
    return NextResponse.json({ invitations: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("Invitations are not configured. Contact the site administrator.", 503);
  }
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return errorResponse("Invalid request origin.", 403);
  }

  const admin = await getAdmin();
  if ("response" in admin) return admin.response;

  let body: { action?: string; email?: string; id?: number; role?: string; confirmAdmin?: boolean };
  try {
    body = await request.json();
  } catch {
    return errorResponse("Invalid request.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return errorResponse("Invalid request.");

  if (body.action === "deny" || body.action === "role" || body.action === "remove") {
    if (!Number.isSafeInteger(body.id) || !body.id) return errorResponse("Invalid user.");
    const { data: target, error: lookupError } = await admin.supabase
      .from("profiles")
      .select("id, auth_user_id, status, role")
      .eq("id", body.id)
      .maybeSingle();
    if (lookupError || !target) return errorResponse("User not available.");
    if (target.auth_user_id === admin.user.id) return errorResponse("You cannot change your own access.");

    if (body.action === "role") {
      if (target.status !== "active" || !PROFILE_ROLES.includes(body.role as ProfileRole)) {
        return errorResponse("Only active users can have their role changed.");
      }
      if (body.role === "admin" && !body.confirmAdmin) return errorResponse("Confirm Admin access.");
      let update = admin.supabase.from("profiles")
        .update({ role: body.role }).eq("id", target.id).eq("status", "active");
      update = target.role === null ? update.is("role", null) : update.eq("role", target.role);
      const { data, error } = await update.select("id").maybeSingle();
      return error || !data ? errorResponse("Access changed. Refresh and retry.", 409) : successResponse();
    }

    if (body.action === "remove" && target.status !== "active") {
      return errorResponse("Only active users can have access removed.");
    }
    if (body.action === "deny" && target.status === "active") {
      return errorResponse("Use Remove access for active users.");
    }
    const { data, error } = await admin.supabase.from("profiles")
      .update({ status: "denied" }).eq("id", target.id).eq("status", target.status)
      .select("id").maybeSingle();
    return error || !data ? errorResponse("Access changed. Refresh and retry.", 409) : successResponse();
  }

  if (body.action === "create") {
    const input = validateInviteInput(body);
    if (!input) return errorResponse("Enter a valid email and role.");
    if (input.role === "admin" && !body.confirmAdmin) return errorResponse("Confirm Admin access.");
    try {
      const result = await createInvitation(request.nextUrl.origin, admin.user.id, input.email, input.role);
      if (result.error) return rpcErrorResponse(result.error);
      return NextResponse.json({ invitation: { id: result.invitationId, email: input.email, role: input.role }, link: result.link }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return errorResponse("Invitations are not configured. Contact the site administrator.", 503);
    }
  }

  if (body.action === "regenerate") {
    if (!Number.isSafeInteger(body.id) || !body.id) return errorResponse("Invalid invitation.");
    try {
      const privileged = createServiceRoleClient();
      const { error: revokeError } = await privileged.rpc("revoke_invitation", {
        p_admin_auth_user_id: admin.user.id, p_invitation_id: body.id,
      });
      if (revokeError) return rpcErrorResponse(revokeError);
      const { data: oldInvite, error: lookupError } = await privileged
        .from("invitations").select("email, role").eq("id", body.id).maybeSingle();
      if (lookupError || !oldInvite) return errorResponse("Invitation could not be regenerated.", 404);
      const result = await createInvitation(request.nextUrl.origin, admin.user.id, oldInvite.email, oldInvite.role as ProfileRole);
      if (result.error) return rpcErrorResponse(result.error);
      return NextResponse.json({ invitation: { id: result.invitationId, email: oldInvite.email, role: oldInvite.role }, link: result.link }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return errorResponse("Invitations are not configured. Contact the site administrator.", 503);
    }
  }

  return errorResponse("Invalid action.");
}

export async function DELETE(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return errorResponse("Invalid request origin.", 403);
  const admin = await getAdmin();
  if ("response" in admin) return admin.response;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || !id) return errorResponse("Invalid invitation.");
  try {
    const { error } = await createServiceRoleClient().rpc("revoke_invitation", {
      p_admin_auth_user_id: admin.user.id, p_invitation_id: id,
    });
    if (error) return rpcErrorResponse(error);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("Invitations are not configured. Contact the site administrator.", 503);
  }
}