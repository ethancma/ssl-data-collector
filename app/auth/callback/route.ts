import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/invitations";
import { createClient } from "@/lib/supabase/server";
import { getInvitationById, isOpenInvitation, safeNext } from "@/app/invite/invitation-server";

const INVITE_COOKIE = "ssl_invite_acceptance";

function redirect(request: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, request.nextUrl.origin), { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  response.cookies.delete(INVITE_COOKIE);
  return response;
}

function errorPath(message: string) {
  return `/auth/error?error=${encodeURIComponent(message)}`;
}

export async function GET(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return redirect(request, errorPath("Invalid request origin."));

  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createClient();
  if (!code) return redirect(request, errorPath("Google sign-in did not return a code."));
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return redirect(request, errorPath("Google sign-in could not be completed."));

  const cookie = request.cookies.get(INVITE_COOKIE)?.value;
  if (!cookie) return redirect(request, safeNext(request.nextUrl.searchParams.get("next")));

  let inviteData: { id: number; next?: string };
  try {
    inviteData = JSON.parse(cookie) as { id: number; next?: string };
  } catch {
    await supabase.auth.signOut({ scope: "local" });
    const response = redirect(request, errorPath("The invitation could not be verified."));
    response.cookies.delete(INVITE_COOKIE);
    return response;
  }
  const { data: invitation } = await getInvitationById(inviteData.id);
  const { data: { user } } = await supabase.auth.getUser();
  if (!isOpenInvitation(invitation) || !user?.email || user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    await supabase.auth.signOut({ scope: "local" });
    return redirect(request, errorPath("The Google account email does not match this invitation."));
  }

  const { error: acceptError } = await createServiceRoleClient().rpc("accept_invitation", {
    p_token_hash: invitation.token_hash,
    p_auth_user_id: user.id,
  });
  if (acceptError) {
    await supabase.auth.signOut({ scope: "local" });
    return redirect(request, errorPath("The invitation could not be completed."));
  }
  return redirect(request, safeNext(inviteData.next));
}
