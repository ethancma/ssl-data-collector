# Workers deployment

## Architecture and boundaries

The app retains `npm run dev`, `npm run build`, and `npm start` for standard Next.js.
The separate, pinned vinext 1.3.0 / Vite 8.3.5 build reimplements Next.js APIs on
Workers; it is not a verified Next.js adapter or a guarantee of compatibility.
React, React DOM, and React Server DOM Webpack are pinned together at 19.3.1.
Keep ESM package mode and the `tsx` Playwright entrypoint: both are required by
the tested Worker setup. Upgrade these packages only with both runtime suites.
The Vite config removes Cloudflare's generated `.dev.vars` snapshot from build
output, so build credentials cannot silently override local runtime bindings.

| Environment | Runtime and origin | Data and credentials |
| --- | --- | --- |
| PR CI | Standard Next.js and compiled local Worker, `http://localhost:3000` | Local Supabase, seeded test users, no deployment token or production data |
| Staging | `ssl-data-collector-staging`, `https://ssl-data-collector-staging.ssl-lab.workers.dev` | A separate Supabase staging project and its own runtime secret |
| Production | `ssl-data-collector`, `https://ssl-data-collector.ssl-lab.workers.dev` | The designated production Supabase project and runtime secret |

Supabase hosts Auth, Postgres/RLS, and primary photo Storage. No database is moved
to Workers. Private R2 backups and photo processing are separate planned work.
Do not use production credentials or data in automatic PR previews. Hosted staging
is a manual release of reviewed main, not an automatically deployed PR branch.
No automatic paid upgrade is configured. Workers Free CPU/usage must be measured
on the hosted app before accepting a production release.

## Local verification

Use a worktree configured with local Supabase, not the main checkout's hosted
`.env.local`. Never stop/restart the human's port-3000 server. The e2e global setup
and teardown can reset/sweep their database; verify every target first.

1. Set the shell's `NEXT_PUBLIC_SITE_URL` to the exact local server origin,
   e.g. `http://localhost:3102`. Supply local Supabase variables using the existing
   worktree setup. These shell overrides must also be present when starting servers
   and tests. Do not print or commit credential values.
2. Run `npm ci`, `npm run verify`, and `npm run check:dead-code`.
3. Build with `npm run build`, start with `npm start -- -p 3102`, verify readiness,
   then run `npm run test:e2e:full`. Stop only that test server.
4. Run `npm run build:vinext`, then
   `npm run check:client-secrets -- dist/client` with the same local
   `SUPABASE_SECRET_KEY` in the shell. This checks the exact supplied secret's value,
   not all possible secret leakage.
5. Run `npm run check:cloudflare` (offline deploy dry run). Start the compiled Worker
   using `npm run preview:cloudflare -- --port 3102`, check readiness, and run
   `npm run test:e2e:full` against the same local Supabase. Wrangler's required-secret
   declaration allows the local shell's `SUPABASE_SECRET_KEY` to reach the local
   Worker without storing it in source/config.

`E2E_BASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`,
and `E2E_DB_URL` must agree on the intended app and database. Preserve designated
local account password overrides and set `E2E_RESET_DB=1` only for the local stack.
The smoke selector escalates Vite/Wrangler configuration to the full suite.
CI performs both builds, a server-secret sentinel scan, an offline dry run, and
selected browser coverage on both runtimes (full coverage on main/manual release).
Its Worker browser job builds with a fake server secret and runs with the real
local secret, so Auth Admin tests also check that the binding is runtime-only.

## Human setup before the first hosted release

1. Disable the connected Workers Builds automatic production/branch deployments
   for this app. They do not wait for GitHub checks and are not the release path.
   Do not disable GitHub checks or weaken branch protection. No hosted setting
   changes happen merely by merging these files.
2. Create the staging Supabase project. Confirm migrations, roles, RLS, the access
   token hook, Storage policies, and invited-account behavior separately in each
   hosted project. Do not populate production with development seed users/data.
   Hosted schema changes remain human-operated.
3. Create the two named Workers without connecting automatic builds. Set each
   Worker's runtime `SUPABASE_SECRET_KEY` from its matching project through the
   Cloudflare dashboard or interactive `wrangler secret put --name <worker-name>`.
   The release workflow refuses a missing secret. It cannot verify which project
   an opaque secret belongs to; the human must pair and validate it.
4. Create GitHub environments named `staging` and `production`. Require human
   reviewers and restrict deployment branches to `main`; configure protection
   before allowing anyone to dispatch releases. GitHub does not infer reviewers
   from the YAML environment name. Confirm environment protection is available
   for the repository's visibility/plan; otherwise do not use this release path.
5. Set these GitHub environment variables in each:
   - `NEXT_PUBLIC_SUPABASE_URL`: that environment's HTTPS Supabase origin.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: matching public key.
   - `CLOUDFLARE_ACCOUNT_ID`: the intended Cloudflare account.
   Set repository variable `PRODUCTION_SUPABASE_URL` to the designated production
   Supabase origin. The workflow rejects staging pointing to that project and
   production pointing anywhere else.
6. Set a narrowly scoped `CLOUDFLARE_API_TOKEN` environment secret for releases,
   limited to the intended account and Worker operations. Keep the Supabase
   server secret on Workers only, not in GitHub PR jobs or public variables.
7. Configure each Supabase project's Site URL and exact callback/reset redirect
   allowlists for its app origin. Configure Google OAuth's Supabase callback and
   consent/ownership settings. Do not allow arbitrary wildcard preview callbacks.
   Determine SMTP needs separately; admin copy-link invitations/resets do not
   themselves require SMTP.

## Release and acceptance

After a human merge, dispatch **Release Worker** from `main`, initially targeting
`staging`. The workflow checks that exact commit using the reusable CI workflow
(both full browser suites), waits for the selected environment's approval, then
confirms the commit is still current main. A stale run fails; dispatch again
instead of silently building a different commit.

The release builds again with that environment's public URL/key and canonical
origin, checks browser output for a fake server-secret sentinel, and performs a
dry run. The real server secret is never used during this build. Wrangler deploys
only `dist/server/wrangler.json`, using the selected Worker name, preserving runtime
variables/secrets. Generated preview URLs are disabled; the named staging Worker
is the preview strategy. The workflow does not alter Supabase or purchase services.

Before approving production, record the tested staging commit and approve hosted
test writes explicitly. Check OAuth, invite/reset links and replay rejection,
all four roles, refresh/removal of access, two separate browser sessions, forms,
photo ownership, and analytics. Check `private, no-store` on authenticated/auth
responses and do not add a Cloudflare cache-everything rule. Static hashed assets
can be cached independently. Measure cold/warm Worker CPU and realistic usage;
local passing tests do not establish Free-plan suitability.

Use the same main commit for staging and production. If main changes, stage the
new commit first. The workflow reruns tests but does not attest to manual staging
acceptance; the production environment reviewer must check it. Production launch
also requires a fresh recoverable backup, photo reliability acceptance, an owner
for monitoring/recovery, and a named second maintainer.

## Rollback

Before each release, record the active deployment/version ID, tested commit, and
matching public configuration; retain the known-good deployed version. A human
uses Cloudflare's dashboard rollback (or interactive `wrangler rollback` against
the exact Worker name) to restore the previous known-good version. Confirm that
version's runtime bindings/secrets and canonical origin still match its Supabase
project, then recheck auth and a read-only protected page.

Code rollback does not roll back database changes or restore deleted photos.
Never reverse migrations or restore production unattended. If a rollback requires
data recovery, stop and use the separate reviewed backup/restore procedure.
Validate rollback on staging before production launch. During an incident freeze
new releases and disable any stray automatic Workers Builds integration first.

## Photo processing and recovery requirements

These are accepted implementation constraints, not shipped capabilities or an executable
backup/restore procedure. They must be implemented and verified before production launch.

### Health photos

- Accept JPEG/PNG/WebP inputs up to 10 MB. Resize to a longest edge of 2048 pixels,
  without upscaling; encode JPEG at 85% quality with correct orientation and metadata
  removed. Do not retain originals.
- Output-byte ceiling, transparency handling, and actual HEIC/device workflow still need
  decisions and representative-image/device acceptance.
- Enforce stored MIME/size limits; client resizing alone is not a security boundary.
- Define retry/reconciliation for partial uploads without duplicate observations.
  Test failure paths and Storage ownership, not just successful uploads.

### Backup and recovery

- One weekly job plus manual dispatch; retain four weekly recovery points in private
  R2 Standard. Back up the full logical database plus encrypted, versioned new/changed
  photos and manifests; R2 is backup storage, not the primary photo store.
- Include app data, Auth, custom roles/grants, managed-schema customizations, migration
  history, photo ownership, and bucket metadata. A default schema dump is insufficient.
- Keep the private decryption key in a password manager plus a separate recovery copy;
  only the public encryption recipient belongs in CI.
- Never prune a good backup on failure or delete photo versions referenced by retained
  snapshots. Specify database/photo consistency reconciliation, incomplete-run cleanup,
  retention behavior, and failure notifications.
- The accepted recovery target is about seven days of potential loss and restoration
  within one working day. Missed jobs increase loss. CSV snapshots are out of scope.
- No retention lock is planned; the human accepted deletion risk from compromised
  backup credentials. This is not protection against all account-compromise scenarios.
- Prove decrypt/restore in isolated Supabase, including Auth/RLS, row counts, photo
  hashes/ownership, and measured recovery time, before relying on backups.

The primary maintainer owns weekly backup-freshness checks, failure alerts, usage reviews,
MFA/recovery material, and quarterly restore drills; name a second maintainer. Monitor
database/photo storage, source egress, R2 headroom, and GitHub Actions allowances. Billing
alerts are not hard caps; Free tiers do not promise an SLA or point-in-time recovery.
