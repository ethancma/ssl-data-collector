import { createServiceRoleClient, hashInvitationToken } from "@/lib/invitations";

export type Invitation = {
  id: number;
  email: string;
  role: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  accepted_at: string | null;
};

export function getInvitationByToken(token: string) {
  return createServiceRoleClient()
    .from("invitations")
    .select("id, email, role, token_hash, expires_at, revoked_at, accepted_at")
    .eq("token_hash", hashInvitationToken(token))
    .maybeSingle<Invitation>();
}

export function getInvitationById(id: number) {
  return createServiceRoleClient()
    .from("invitations")
    .select("id, email, role, token_hash, expires_at, revoked_at, accepted_at")
    .eq("id", id)
    .maybeSingle<Invitation>();
}

export function isOpenInvitation(invitation: Invitation | null): invitation is Invitation {
  return Boolean(
    invitation
      && !invitation.revoked_at
      && !invitation.accepted_at
      && new Date(invitation.expires_at).getTime() > Date.now(),
  );
}

export function safeNext(value: unknown) {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
    ? value
    : "/protected/home";
}

export function publicInvitationError() {
  return "This invitation is invalid, expired, revoked, or already accepted.";
}

export function isValidInvitationToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{20,256}$/.test(value);
}

export async function findAuthUserByEmail(email: string) {
  const admin = createServiceRoleClient().auth.admin;
  const { data, error } = await admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email) ?? null;
}

export function canResumeUser(user: { last_sign_in_at?: string | null } | null) {
  return Boolean(user && !user.last_sign_in_at);
}
