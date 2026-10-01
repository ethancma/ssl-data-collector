import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";
import { canResumeUser, findAuthUserByEmail, getInvitationByToken, isOpenInvitation, isValidInvitationToken, safeNext } from "@/app/invite/invitation-server";

export const runtime = "nodejs";
const INVITE_COOKIE = "ssl_invite_acceptance";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { token } = await params;
  let body: { next?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!isValidInvitationToken(token)) return NextResponse.json({ error: "Invalid invitation request." }, { status: 400 });
  const { data: invitation } = await getInvitationByToken(token);
  if (!isOpenInvitation(invitation)) return NextResponse.json({ error: "This invitation is invalid, expired, revoked, or already accepted." }, { status: 410 });

  try {
    const admin = createServiceRoleClient().auth.admin;
    const existing = await findAuthUserByEmail(invitation.email);
    if (existing && !canResumeUser(existing)) return NextResponse.json({ error: "An account for this email already exists. Sign in or ask an Admin for help." }, { status: 409 });
    const user = existing ?? (await admin.createUser({ email: invitation.email, email_confirm: true })).data.user;
    if (!user) return NextResponse.json({ error: "Could not prepare the invited account. Retry later." }, { status: 503 });
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${request.nextUrl.origin}/auth/callback` } });
    if (error || !data.url) return NextResponse.json({ error: "Google sign-in is not available yet." }, { status: 503 });
    const response = NextResponse.json({ url: data.url }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(INVITE_COOKIE, JSON.stringify({ id: invitation.id, next: safeNext(body.next) }), {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 600, path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Invitation service is unavailable. Retry later." }, { status: 503 });
  }
}
