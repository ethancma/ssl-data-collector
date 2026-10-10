# Invite-Only Access — Proposed Architecture

Status: **proposal, core decisions made** (see [Decisions](#decisions)). Replaces the
earlier Supabase-native email invite draft.

## Goal

- Only an active **Admin** can invite someone, choosing their role up front.
- The invited person **creates their own account** (their own password, or Google).
- **Public sign-up stays disabled**, including through Google.
- Admins can revoke an open invite and remove access for an active user; historical
  records stay attributed to the person.
- The 4 existing active users are unaffected.

## Options considered

| | A. Supabase native invite email | B. App invite link (copy & share) | C. App invite link + app-sent email | D. Allowlist + self sign-up hook |
|---|---|---|---|---|
| How | Server calls `auth.admin.inviteUserByEmail`; Supabase emails a one-use link | App stores a hashed token; Admin copies a link and sends it however they like | Same as B, and the app emails the link through a provider API (e.g. Resend) | Admin adds an email to an allowlist; person uses a sign-up page; a Before User Created hook rejects non-listed emails |
| Link lifetime | Email OTP expiry (default **1 hour**) | We choose (e.g. 7 days) | We choose | n/a |
| Email provider | **Required** (custom SMTP) | Not required | Required (API key) | Required for password confirmations |
| Google sign-in | Awkward: user is pre-created before acceptance | Clean: pre-create at acceptance, Google auto-links | Clean | Native, but sign-up must be enabled |
| Re-invite a former user | Blocked for confirmed accounts | Works | Works | Works |
| Proves mailbox ownership | Yes | Only via Google path, or trust in who the Admin shared it with | Yes | Yes (with confirmation) |
| Service/secret key | Required | Required (account creation at acceptance) | Required | Not for creation |
| Main risk | Short expiry, email scanners consuming links | Link forwarded to the wrong person | Extra secret and provider setup | Sign-up endpoint is open; the hook is the only gate |

**Recommendation: B now, C when a sending domain is ready.** Both use the same
invitation model, so email delivery is an additive feature later. Option A was
the previous draft; it is dropped because of the short link lifetime, the blocked
re-invite for former users, and the mandatory SMTP setup before any invite works.
Option D reopens sign-up and relies on a single hook to keep it closed.

## Proposed design (B, with C as an add-on)

### Data model

New table `core.invitations` (RLS on, no direct client writes):

| Column | Notes |
|---|---|
| `id` | PK |
| `email` | lower-cased; one **open** invite per email (partial unique index) |
| `role` | admin, technician, volunteer, viewer |
| `token_hash` | SHA-256 of a 32-byte random token; the raw token is never stored |
| `created_by` | inviting Admin's profile |
| `created_at`, `expires_at` | `expires_at` defaults to 7 days after creation |
| `revoked_at`, `accepted_at`, `accepted_auth_user_id` | terminal states |
| `emailed_at` | set only when option C sends the link |

Profiles keep `pending | active | denied`. A profile is created by the existing
Auth trigger at acceptance and immediately activated by the acceptance RPC, so the
`invited` status and the invite columns on `core.profiles` are no longer needed.

Server-only RPCs (executable by `service_role` only, re-checking the Admin's live
role inside the function):

- `create_invitation(admin_uid, email, role, token_hash, expires_at)`: rejects emails
  with an active profile or an open invite.
- `revoke_invitation(admin_uid, invitation_id)`.
- `accept_invitation(token_hash, auth_user_id)`: locks the row; checks it is open,
  unexpired, and matches the Auth user's email; sets the profile to `active` with
  the invited role; marks the invite accepted. All in one transaction.

Keep from the current work: the live-role restrictive RLS policies, the JWT role-claim
fix, and the rule that clients cannot change their own `role` or `status`.

### Flows

**Admin invites**
1. The Admin enters an email and role on `/protected/admin`.
2. The server checks the Admin's active profile, generates the token, and stores its hash.
3. The UI shows the link once with **Copy link**. With option C it also shows
   **Email invite**, which sends the link through the provider.
4. Open invites are listed with their expiry, plus **Revoke** and **Regenerate**
   (regenerate revokes the old link and issues a new one).

**Invitee accepts: `/invite/[token]`** (public route; the token is only read, never
consumed on GET)
- The page shows the invited email, role, and expiry, or a clear expired/revoked
  message.
- **Continue with Google**: the server pre-creates a confirmed, passwordless Auth user
  for the invited email, stores the invite id in a short-lived httpOnly cookie, and
  starts Google OAuth. `/auth/callback` exchanges the code, checks that the Google
  email matches the invite, calls `accept_invitation`, and refreshes the session.
  If the Google email doesn't match, it signs the user out and shows an error.
- **Create a password**: the server creates the Auth user with the chosen password
  and `email_confirm: true`, calls `accept_invitation`, and signs the user in.
- If account creation succeeds but acceptance fails, the invite stays open and a
  retry resumes against the same Auth user instead of creating a duplicate.

**Signing in**: `/auth/login` offers email/password and **Continue with Google**.
Because sign-up is disabled, Google cannot create an account for someone uninvited;
Supabase links Google to an existing account with the same verified email. Existing
users can therefore start using Google with no migration.

**Removing access**: **Remove access** sets the profile to `denied`. Stale tokens are
already blocked by the live-role policies. To re-invite that person, create a new
invite; acceptance reactivates the same identity, so their history stays attributed.

**Forgot password** (password accounts only; Google accounts recover through Google)
- **Before email exists**: the person asks an Admin, who clicks **Copy reset link** on
  their row and shares it the same way as an invite. The server generates a one-time
  Supabase recovery link without sending email; the person opens it, sets a new
  password, and is signed in. The Admin never sees or chooses the password. People
  with a Gmail/Workspace address can also just use **Continue with Google**.
- **After email is added**: **Forgot password?** on `/auth/login` emails the recovery
  link directly. **Copy reset link** stays as a backup.
- Reset links go only to active users, and the recovery landing page accepts the
  token only on an explicit button press (not on page load), like invites.

## External setup

### Google sign-in (free)
1. In Google Cloud (Google Auth Platform), create a **Web application** OAuth client.
   Authorized JavaScript origins: the app URLs (production, preview/staging,
   `http://localhost:3000`). Authorized redirect URI:
   `https://<project-ref>.supabase.co/auth/v1/callback`.
2. On the consent screen, use app name *Sunflower Star Laboratory*, basic scopes only
   (email, profile, openid), and a privacy-policy link.
3. In Supabase > Authentication > Providers > Google, paste the client ID and secret.
   Keep **Allow new users to sign up** disabled at the project level.
4. In Supabase URL configuration, allowlist `https://<app-host>/auth/callback` for
   each environment.

### Email provider (only for option C and password resets)

| Provider | Fit | Notes |
|---|---|---|
| **Resend** (recommended) | Simple HTTP API and SMTP; supports both invite emails and Supabase SMTP | Free tier covers a 10–20 person lab; confirm current limits |
| Brevo | Free daily allowance, SMTP | More marketing-oriented dashboard |
| Amazon SES | Cheapest at scale | Sandbox approval and more AWS setup; overkill here |
| Gmail/Workspace SMTP | Uses an existing mailbox | App passwords, sending caps, weaker deliverability; not recommended |

Setup (Resend):
1. Verify a domain the lab controls and add the SPF/DKIM DNS records it provides.
   Use a From address like `no-reply@<lab-domain>`.
2. Put the API key in server-only env `RESEND_API_KEY` (never `NEXT_PUBLIC_`).
3. Optionally, point Supabase custom SMTP at Resend (`smtp.resend.com`, port 465,
   user `resend`, API key as the password) so password resets also send.
4. Turn off click tracking so links aren't rewritten.

### Secrets
- `SUPABASE_SECRET_KEY`: server only; needed to create Auth users at acceptance.
- `RESEND_API_KEY`: server only; option C only.
- Google client secret: stored in Supabase only, not in the app.

## Implementation plan

1. **Schema**
   - Replace the unpushed `20260929010106_native_auth_invitation_acceptance.sql` with
     `core.invitations` and the three RPCs (`20260929010106_app_invitations.sql`).
   - Overwrite the invite pieces in the already-pushed
     `20260928222050_invited_profile_activation_guard.sql` instead of adding a cleanup
     migration: no `invite_password_fingerprint`, `invited_by`/`invited_at`/
     `credential_changed_at`, `invited` status, register/activate functions, or invite
     clauses in the guard trigger. Versions and filenames stay the same, so no
     `migration repair` is needed.
   - Hosted already has the old pieces, so a human first runs
     `supabase/snippets/20260930_01_drop_invite_temp_password_pieces.sql` in the SQL
     Editor (drop-only; hosted holds no invite data, and operational data is untouched).
     Then `supabase db push` applies only the two unpushed migrations, after human
     approval.
   - Keep the live-role policies and the JWT claim fix.
2. **App**
   - Admin invite panel: copy link, open invites list, revoke/regenerate.
   - `/invite/[token]` page; password and Google acceptance routes; `/auth/callback`.
   - Google button on login.
   - **Copy reset link** on active user rows, and a recovery page to set a new password.
     First confirm Supabase's `generateLink` (type `recovery`) returns the link without
     sending email.
   - Delete the native-invite pieces (already removed): the accept route, the onboarding
     activate API, the old invitation password form, the
     `invited` branch in `app/protected/layout.tsx`, and the invite guard in
     `app/auth/confirm/route.ts`.
3. **External config** (human): Google OAuth client and Supabase provider, redirect
   allowlist, server secret in the host environment, hosted sign-up disabled.
4. **Email** (later): Resend domain, the **Email invite** action,
   Supabase SMTP, and **Forgot password?** on the login page.
5. **Verification** (`e2e-verifier`, Tier 3): on staging, cover the password and Google
   acceptance paths; expired, revoked, and reused links; a Google email mismatch;
   uninvited Google sign-in being rejected; remove and re-invite; Admin reset link
   (single use, active users only); stale-token API
   denial; all four roles; existing users unaffected. Then the full suite and a
   preview deploy.

## Decisions

1. **Invite lifetime**: 7 days.
2. **Sign-in methods**: password and Google, both offered on the invite and login pages.
3. **Email delivery**: later (option C). Copy-link ships first.
4. **Password resets before email exists**: Admin **Copy reset link**, or the person
   uses Google. **Forgot password?** is added with email.

Still open:

- **Lab sending domain** for Resend, when email is added.
