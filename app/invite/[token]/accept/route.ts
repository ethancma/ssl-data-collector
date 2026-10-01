import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";
import { canResumeUser, findAuthUserByEmail, getInvitationByToken, isOpenInvitation, isValidInvitationToken } from "@/app/invite/invitation-server";

export const runtime = "nodejs";

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return errorResponse("Invalid request origin.", 403);
  const { token } = await params;
  let body: { password?: unknown };
  try { body = await request.json(); } catch { return errorResponse("Invalid request."); }
  if (!isValidInvitationToken(token) || typeof body.password !== "string") return errorResponse("Invalid invitation request.");
  if (body.password.length < 12 || body.password.length > 128 || !/[A-Z]/.test(body.password)
    || !/[a-z]/.test(body.password) || !/[0-9]/.test(body.password) || !/[^A-Za-z0-9]/.test(body.password)) {
    return errorResponse("Password does not meet the required policy.");
  }

  const sessionClient = await createClient();
  const { data: { user: signedIn } } = await sessionClient.auth.getUser();
  if (signedIn) return errorResponse("Sign out before accepting an invitation.", 409);
  const { data: invitation } = await getInvitationByToken(token);
  if (!isOpenInvitation(invitation)) return errorResponse("This invitation is invalid, expired, revoked, or already accepted.", 410);

  try {
    const admin = createServiceRoleClient().auth.admin;
    const existing = await findAuthUserByEmail(invitation.email);
    let userId: string;
    if (existing) {
      if (!canResumeUser(existing)) return errorResponse("An account for this email already exists. Sign in or ask an Admin for help.", 409);
      const { data, error } = await admin.updateUserById(existing.id, { password: body.password, email_confirm: true });
      if (error || !data.user) return errorResponse("Could not prepare the invited account. Retry later.", 503);
      userId = data.user.id;
    } else {
      const { data, error } = await admin.createUser({ email: invitation.email, password: body.password, email_confirm: true });
      if (error || !data.user) return errorResponse("Could not create the invited account. Retry later.", 503);
      userId = data.user.id;
    }
    const { error: acceptError } = await createServiceRoleClient().rpc("accept_invitation", {
      p_token_hash: invitation.token_hash, p_auth_user_id: userId,
    });
    if (acceptError) return errorResponse("The invitation could not be completed. Your account is ready to retry; contact an Admin if this persists.", 409);
    const { error: signInError } = await sessionClient.auth.signInWithPassword({ email: invitation.email, password: body.password });
    if (signInError) return errorResponse("Account created, but sign-in could not be completed. Sign in from the login page.", 503);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse("Invitation service is unavailable. Retry later.", 503);
  }
}
