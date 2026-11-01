# Invite-Only Access

The app uses Admin-created copy/share links, not public registration or Supabase's
native invite-email flow. This guide describes the application contract and required
provider setup; repository configuration does not prove hosted settings are applied.

## Admin workflow

1. On `/protected/admin`, an active Admin enters an email and chooses Admin,
   Technician, Volunteer, or Viewer.
2. The app creates a seven-day invitation and shows its raw link once. Copy and share
   it privately with the intended person. The database stores only the token hash.
3. Open invitations show expiry and offer **Revoke** and **Regenerate**. Regeneration
   invalidates the previous link.
4. **Remove access** sets the profile to `denied`, preserving historical attribution.
   Re-inviting that person reactivates the same identity on acceptance.

Copy/share does not independently prove mailbox ownership on the password path: an
Admin must share the link securely. Do not publish invitation or recovery links in logs,
issues, or analytics.

## Acceptance and sign-in

`/invite/[token]` is public. GET displays invitation details but never consumes the token.
The person chooses a password or **Continue with Google**.

- Password acceptance creates the confirmed Auth user, accepts the invitation, and signs
  in. If creation succeeds but acceptance fails, retry resumes against the existing user
  rather than creating a duplicate.
- Google acceptance pre-creates the invited account, keeps invitation context in a
  short-lived httpOnly cookie, and starts OAuth. `/auth/callback` exchanges the code,
  requires the matching email, accepts the invitation, and refreshes the session.
  A mismatched Google email is rejected and signed out.
- Expired, revoked, and already accepted links cannot be reused.
- `/auth/login` offers password and Google sign-in. Hosted Supabase sign-up must remain
  disabled, including uninvited Google account creation. Existing users can use a
  matching verified Google identity.

## Password recovery

An Admin uses **Copy reset link** for an active user and shares it privately. The
server generates a Supabase recovery link without sending email; the Admin never
sees or chooses the password. The recovery page consumes the token only after an
explicit button press, not on GET. Recovery links are single-use.

Google-only users recover through Google. Self-service emailed recovery and app-sent
invitation email are not part of the copy-link workflow.

## Implementation boundaries

- `core.invitations` has RLS and no direct client writes. It stores lower-cased email,
  role, a SHA-256 hash of a 32-byte random token, creator/expiry timestamps, and terminal
  acceptance/revocation state. Only one open invitation per email is allowed.
- Server-only invitation RPCs recheck the Admin's live role. Acceptance locks the invite,
  checks expiry/state and matching Auth email, activates the profile with the invited
  role, and marks acceptance in one transaction.
- Profiles use `pending | active | denied`; clients cannot edit their own role/status.
  Live-role policies block stale-token access after removal; the proxy refreshes claims
  on the next application request.
- `SUPABASE_SECRET_KEY` is server/runtime-only. Never use it in browser configuration.
- `NEXT_PUBLIC_SITE_URL` is the exact canonical app origin, HTTPS except local loopback.
  Auth/admin mutations enforce Origin and redirects must remain internal. Preserve
  `private, no-store` responses and session cookies through refreshes and redirects.

See the routes in `app/api/admin/`, `app/invite/`, and `app/auth/`, plus
`lib/invitations.ts` and `lib/site-origin.ts`.

## Hosted Google setup

1. Create a Web application OAuth client in Google Auth Platform. Use the intended app
   origins and `https://<project-ref>.supabase.co/auth/v1/callback` as the authorized
   redirect URI.
2. Configure app name *Sunflower Star Laboratory*, basic email/profile/openid scopes,
   ownership/consent settings, and a privacy-policy link.
3. Configure the Google provider in each Supabase project. Store the Google client secret
   in Supabase, not the app. Keep **Allow new users to sign up** disabled.
4. Set Supabase Site URL and exact callback/reset allowlists for each environment.
   Do not use arbitrary wildcard preview callbacks.
5. Configure the matching app runtime secret and canonical origin using the
   [Workers runbook](workers-deployment.md). Staging and production use separate projects.

## Optional email integration requirements

Email delivery needs a lab-controlled sending domain and a separate implementation.
If using Resend, verify SPF/DKIM, use a domain-owned From address, keep `RESEND_API_KEY`
server-only, and disable click tracking so sensitive links are not rewritten.
Supabase custom SMTP can use the provider for recovery email; merely setting SMTP
does not add an application **Forgot password?** or **Email invite** action.
Copy-link flows do not require SMTP. Confirm provider limits before adoption.

## Verification

Auth changes are Tier 3 under [testing-strategy.md](testing-strategy.md). Cover password
and Google acceptance, expired/revoked/reused links, email mismatch, uninvited sign-in
rejection, removal/re-invite, single-use active-user recovery, stale tokens, all four
roles, and existing-account continuity. Verify Auth users, profiles, invitations, RLS,
redirects, cache headers, and two-session isolation directly in staging with explicit
approval for hosted test writes; local tests do not establish hosted provider correctness.
