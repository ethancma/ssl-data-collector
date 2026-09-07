# Test Accounts

Auth is Supabase-native Google OAuth with admin approval (see
[platform-architecture.md](../../../../docs/platform-architecture.md) §5). Google OAuth
itself is awkward for an agent to drive headlessly, so use these stand-ins in non-prod
environments instead of creating throwaway Google accounts.

## Seeded accounts (dev/staging only)

Keep one pre-approved (`profiles.status = active`) test profile per role, using Supabase
email/password or magic-link auth as a local stand-in for Google OAuth:

- `test-admin@<project>.dev` — role `admin`
- `test-tech@<project>.dev` — role `technician`
- `test-viewer@<project>.dev` — role `viewer`

Seed these via a migration/seed script, not by hand, so they survive a database reset.

## Testing the onboarding/approval flow itself

Use a disposable 4th account rather than one of the seeded three:

1. Sign up, confirm it lands as `profiles.status = pending` with no role.
2. Approve it as `test-admin`, assign a role, confirm access matches that role.
3. Afterward, either delete the account or reset it to `pending`/no role — don't leave
   stray approved test accounts sitting in shared dev/staging data.

## Rules

- Never use these credentials, or any test data created with them, against the
  **production** Supabase project.
- If RLS policies change, re-verify all three roles (Admin/Technician/Viewer) can/can't do
  what they're supposed to — a broken policy is easy to miss by testing only as Admin.
