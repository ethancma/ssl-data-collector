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
| Staging | `ssl-data-collector-staging`, `https://ssl-data-collector-staging.ssl-lab.workers.dev` | The hosted Dev Supabase project (`hcaopgzlvuyuyjcjxuvy`, throwaway data) and its own runtime secret |
| Production | `ssl-data-collector`, `https://ssl-data-collector.ssl-lab.workers.dev` | The production Supabase project (`bqylxmsifagnztxhixyl`) and its own runtime secret |

Supabase hosts Auth, Postgres/RLS, and the private Storage bucket reserved for future
photos. No database is moved to Workers. Private R2 backups and photo processing
are separate planned work.
Do not use production credentials or data in automatic PR previews. Hosted staging
is a manual release of reviewed main, not an automatically deployed PR branch.
No automatic paid upgrade is configured. Workers Free CPU/usage must be measured
on the hosted app before accepting a production release.

## CI/CD overview and branch strategy

CI (continuous integration) validates changes. This project uses continuous delivery:
releases are available on demand, but a human starts and approves deployment.
**Pushing to `main` does not redeploy either site.** Both Workers Builds integrations
must remain disconnected; GitHub Actions is the only intended release path.

The diagram shows the intended operator sequence, not automatic promotion between
environments. Staging and production are separate services, not Git branches.

```mermaid
flowchart TD
    Work["Feature branch or worktree<br/>Local app and local Supabase"] --> PR["Push branch and open or update PR"]
    PR --> CI["PR CI: checks, both builds,<br/>selected browser tests on local Supabase"]
    CI -->|"Human merges ready changes"|     Main["main: merged release candidates"]
    Main --> MainCI["main CI: full browser suites<br/>No site deployment"]
    MainCI -->|"Manual staging release: full CI and approval"| Stage["Cloudflare staging Worker"]
    Stage <--> DevDB["Dev Supabase<br/>Test accounts and data"]
    Stage --> Accept["Human accepts and records tested commit"]
    Accept -->|"Manual production release: staging gate on same commit,<br/>full CI and approval"| Prod["Cloudflare production Worker"]
    Users["Lab users"] --> Prod
    Prod <--> ProdDB["Production Supabase<br/>Real accounts and lab data"]
    Users <-->|"Browser Auth and data requests under RLS"| ProdDB
    Migrations["Reviewed migration files"] -. "Human applies to Dev first" .-> DevDB
    Migrations -. "Human applies compatible changes separately" .-> ProdDB
    Prod --> Monitor["Monitor errors, CPU and usage;<br/>retain deployed commit and Worker version"]
    Monitor -. "Human code rollback if needed" .-> Prod
```

### What each GitHub action does

| Action | CI | Hosted deployment |
| --- | --- | --- |
| Commit locally | Nothing on GitHub | None |
| Push a feature branch without a PR | The standard CI workflow does not run | None |
| Open or update a PR | Typecheck, lint, unit tests, dead-code checks, both builds, secret scan, Worker dry run, selected E2E on local Supabase; `verify`, `e2e (next)`, and `e2e (worker)` must pass to merge | None; no hosted PR previews |
| Merge or push to `main` | Same checks with full E2E on both runtimes | None |
| Run **Release Worker**, target `staging` | Full CI, then staging environment approval | Staging Worker only, connected to Dev Supabase |
| Run **Release Worker**, target `production` | Staging gate (`staging_accepted` ticked, and staging runs this commit successfully), full CI, then production environment approval | Production Worker only, connected to production Supabase |

The trigger definitions live in [ci.yml](../.github/workflows/ci.yml) and
[release.yml](../.github/workflows/release.yml).
CI never uses the hosted databases for its browser suites. Public build configuration
and runtime secrets are environment-specific, so each release rebuilds the same source
commit for its target; it does not copy staging data, users, or secrets to production.
Hosted migrations and Supabase Auth settings are separate human-operated changes,
not part of the Worker deploy.

### Recommended branching and release batches

Keep `main` plus short-lived feature/fix branches for this small team. Develop against
local Supabase, open a PR, check CI, and have a human merge only release-ready changes.
The local app refuses Production and other unapproved Supabase targets even if they
appear in `.env.local`. Configure the local Docker stack or explicitly select Dev for
development; never run E2E against production.
The hosted staging app and any local app configured for Dev share that Dev database;
coordinate test writes and fixtures during acceptance. A Git branch does not create
an isolated database.

Batch releases by merging ready PRs, then releasing that snapshot of `main`. For example,
merge features A and B, stage and accept that commit, then release it to production;
keep unfinished feature C on its branch. Production can remain on its previous version
while more work is reviewed. A release contains every change in the selected commit,
not a selection of individual features.

Do not add a permanent `dev` branch just to control deployment: manual releases already
provide that control. A long-lived integration branch becomes useful with multiple
developers or long-running integration work, but adds merge and synchronization work.
Creating it alone would not deploy staging: the current release workflow, latest-main
guard, and environment branch policies permit releases only from `main`.

While staging a release candidate, pause merges until production approval. If `main`
advances, the current workflow requires staging and accepting the new head before
production; it does not support deploying an arbitrary older commit or tag.

### Guardrails and improvements

- **Require CI before merge.** The `main` ruleset in GitHub **Settings > Rules >
  Rulesets** requires PRs and the GitHub Actions checks `verify`, `e2e (next)`, and
  `e2e (worker)`, with the branch up to date before merging. It requires no approving
  reviews because a PR author cannot approve their own PR.
- **Single-maintainer approvals.** @ethancma is the only maintainer, reviewer, and
  release operator for now. **Prevent self-review** stays off in both environments, so
  the person who dispatches a release approves it. The approval is a deliberate pause
  to recheck the commit and evidence, not an independent two-person check. If a second
  maintainer joins, add them as a production reviewer, enable **Prevent self-review**,
  and consider requiring one PR approval.
- **Require staging acceptance for production.** A production release requires ticking
  `staging_accepted`. Its first job also fails unless the most recent `staging`
  deployment is this exact commit and reports `success`. If staging was replaced by a
  newer commit, release and accept the current commit on staging again. The checkbox
  records the operator's confirmation; it cannot prove which manual checks were run,
  so keep the written acceptance record.
- **Verify the hosted result.** CI validates local runtimes, not hosted auth settings,
  Worker CPU limits, or secret/project pairing. Keep manual acceptance and add lightweight
  post-deploy availability/cache-header checks without production test writes. The
  Workers' secrets are existence-checked by CI, but their values and Supabase project
  pairing are intentionally not readable by the workflow.
- **Observability is in deployment config.** `wrangler.jsonc` enables Workers Logs
  (`observability.enabled`), so each release keeps logs on for both Workers rather
  than depending on a dashboard toggle that a deploy could overwrite. After a release,
  confirm logs appear under the Worker's **Observability** tab. Free-plan log volume
  and retention are limited; avoid logging request bodies or personal data.
- **Automate staging only if useful later.** Successful `main` CI could eventually deploy
  staging automatically while production stays manual. This needs workflow changes and
  exact-commit promotion safeguards; it is not enabled now and does not require `dev`.

## Local verification

Use a worktree configured with local Supabase, or the designated Dev project for
hosted integration checks. Never stop/restart the human's port-3000 server. The e2e global setup
and teardown can reset/sweep their database; verify every target first.

Local requests may connect only to the designated Dev Supabase origin or the loopback
Docker API on port 54321. Other targets return an explicit error before a Supabase
client connects. This also applies to local production builds and Worker previews;
the browser, proxy, server, and privileged clients each enforce it. A deployed app can
use its hosted database when `NODE_ENV` is production and the request host matches its
configured canonical HTTPS `NEXT_PUBLIC_SITE_URL`. Noncanonical hosts are treated as
unverified and may use only Dev or Local. Restart your own server and reload browser
tabs after changing local configuration; rebuild production-mode previews because
public variables are embedded at build time.

This is an accidental-use guard, not a Supabase authorization boundary: direct requests,
forged host information, and previously loaded application code are outside its scope.
Production credentials and database permissions must still be protected separately.

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

1. Leave Cloudflare Workers Builds disconnected from the GitHub repository for both
   Workers. GitHub Actions deploys using the Cloudflare API token after checks and
   approval. In **Workers & Pages**, select each Worker and check **Settings > Build**;
   disable any connected automatic builds for this app. They do not wait for GitHub
   checks. Do not disable GitHub checks or weaken branch protection.
2. Use the hosted Dev Supabase project as staging. Confirm migrations, roles, RLS, the access
   token hook, Storage policies, and invited-account behavior separately in each
   hosted project. Do not populate production with development seed users/data.
   Hosted schema changes remain human-operated.
3. Create the two named Workers without connecting automatic builds. In each Supabase
   project's **Settings > API Keys > Secret keys**, copy a server-side secret key.
   In Cloudflare, select the matching Worker under **Workers & Pages**, then use
   **Settings > Variables and Secrets > Add**: choose **Secret**, name it
   `SUPABASE_SECRET_KEY`, paste the key, and deploy. Staging gets the Dev project's
   key; production gets the production project's key. Alternatively, use interactive
   `wrangler secret put --name <worker-name>`. Never put these keys in source,
   public variables, or chat. The workflow checks that the secret exists, not which
   project it belongs to; the human must pair and validate it.
4. In the GitHub repository's **Settings > Environments**, create `staging` and
   `production`. Require human reviewers and restrict deployment branches to `main`;
   configure protection before allowing releases. Under the single-maintainer model,
   @ethancma is the only reviewer and **Prevent self-review** stays off, so the person
   who starts a release can approve it; this is a pause, not an independent two-person
   check (see Guardrails above). GitHub does not infer
   reviewers from the YAML environment name. Confirm environment protection is
   available for the repository's visibility/plan; otherwise do not use this release path.
5. Set these GitHub environment variables in each:
   - `NEXT_PUBLIC_SUPABASE_URL`: `https://hcaopgzlvuyuyjcjxuvy.supabase.co`
     for staging, `https://bqylxmsifagnztxhixyl.supabase.co` for production.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: matching project's publishable key
     from **Supabase Settings > API Keys**, not its secret key.
   - `CLOUDFLARE_ACCOUNT_ID`: the intended Cloudflare account.
   Under **Settings > Secrets and variables > Actions > Variables**, set the repository
   variable `PRODUCTION_SUPABASE_URL` to `https://bqylxmsifagnztxhixyl.supabase.co`.
   The workflow rejects staging pointing to that project and production pointing
   anywhere else. It supplies `NEXT_PUBLIC_SITE_URL`; do not set it in GitHub.
6. In each GitHub environment, set the `CLOUDFLARE_API_TOKEN` secret to a token
   scoped to the intended account and Worker operations. Keep the Supabase server
   secret on Workers only, not in GitHub PR jobs or public variables.
7. In each Supabase project's **Authentication > URL Configuration**, set the Site
   URL to its Worker origin in the table above and add that origin plus
   `/auth/callback` to the redirect allowlist. Add exact local development callbacks
   only when needed; do not allow arbitrary wildcard preview callbacks. Configure
   Google OAuth for production as described in [auth-invitations.md](auth-invitations.md);
   Dev leaves Google disabled for the initial release. Admin copy-link invitations
   and resets do not themselves require SMTP.

## Release plan and acceptance

After a human merge:

1. Record the current Worker deployment/version and configuration for rollback.
2. In GitHub, open **Actions > Release Worker**, or go directly to the
   [Release Worker workflow](https://github.com/ethancma/ssl-data-collector/actions/workflows/release.yml).
   Select **Run workflow**, choose branch `main` and target `staging`, then run it.
   Do not connect the repository in Cloudflare to start a release.
3. Open the new run. After its checks pass, select **Review deployments**, choose
   `staging`, and **Approve and deploy**. Resolve failures rather than bypassing
   checks or approval.
4. Open `https://ssl-data-collector-staging.ssl-lab.workers.dev` and complete the
   staging acceptance checks below. Record the tested commit and results.
5. Once staging is accepted, repeat the GitHub workflow with target `production` and
   tick `staging_accepted`. The run fails unless staging's latest successful deployment
   is the same `main` commit; if `main` changed, deploy and accept staging again first.
   Review the recorded staging evidence before approving the production deployment.

The workflow checks the selected commit using the reusable CI workflow (both full
browser suites), waits for environment approval, then confirms the commit is still
current `main`. A stale run fails; dispatch again instead of silently building a
different commit.

Each release builds again from the same source commit with that environment's public
URL/key and canonical origin; staging and production are separate, configuration-specific
builds, not one artifact promoted between Workers. The build checks browser output for a
fake server-secret sentinel and performs a dry run. The real server secret is never used
during build. Wrangler deploys only `dist/server/wrangler.json`, using the selected
Worker name and preserving runtime variables/secrets. Generated preview URLs are
disabled; the named staging Worker is the preview strategy. The workflow does not alter
Supabase or purchase services.

Before approving production, explicitly approve any hosted test writes. On staging,
check password invite/reset links and replay rejection, all four roles,
refresh/removal of access, two separate browser sessions, forms, and analytics.
Check `private, no-store` on authenticated/auth responses and do not add a
Cloudflare cache-everything rule. Static hashed assets can be cached independently.
Measure cold/warm Worker CPU and realistic usage; local passing tests do not
establish Free-plan suitability. Confirm Worker logs appear after deployment. Run automated E2E only against Local or Dev, following the
[testing strategy](testing-strategy.md), never production.

The workflow verifies that staging runs the exact commit and records the operator's
`staging_accepted` confirmation, but it cannot verify which manual checks were run.
Before approving, the production reviewer must check the written acceptance record.
For the initial release, @ethancma is the sole maintainer and owns monitoring and
incident response; a second maintainer is not a launch gate.

**Initial-release decisions (2026-11-14):** health photo uploads stay disabled, and
no backups are planned (`PRODUCTION_BACKUPS_ENABLED` stays unset or false). There is
no tested recovery; data may be lost, and Supabase Free has no point-in-time recovery.
Historical imports and bulk changes still require a fresh backup under the
[testing strategy](testing-strategy.md); postpone them until that requirement is met.
Photo reliability acceptance is required before re-enabling uploads; follow the
[backup procedure](backup-recovery.md) before relying on backups.
Google sign-in is disabled in Dev, so staging checks password flows only; the Google
button remains visible but cannot sign in there. After production deployment, a human
must verify Google sign-in with an intended invited account before the broader rollout;
do not run automated E2E against production.

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

## Operating and maintaining the release

- Use the production URL for lab work and staging only for approved test data. Browser
  forms can call Supabase directly under RLS; the server-side secret stays on the Worker.
  Lab records live in Supabase, not GitHub or the Worker deployment.
- For each release, record the commit, staging acceptance, Worker versions, migration
  requirements, and operator. A release tag can label the shipped commit, but the
  current workflow still dispatches from `main`, not that tag.
- For database changes, validate locally and apply the reviewed migrations to Dev first.
  Production changes must remain compatible with the currently running app and its
  rollback version; prefer additive changes and defer removals to a later release.
  Never reset production or copy Dev data into it as part of deployment.
- Monitor Worker errors/CPU and Supabase database, Auth, and quota usage. Review dependency
  updates through feature PRs and both runtime suites, not direct production changes.
  Rotate runtime secrets on the matching Worker when keys change.
- Leave Workers Builds disconnected from both app Workers; verify **Settings > Build**
  after Cloudflare account or Worker changes. Continue to use the Actions workflow as
  the single deploy path.
- On incidents, pause releases and use the rollback procedure. With backups deferred,
  code rollback is not data recovery; historical imports and bulk/destructive changes
  retain their separate fresh-backup and human-execution requirements.

## Photo processing and recovery requirements

These are accepted implementation constraints. Photo processing remains unimplemented
while photo uploads are disabled and is a future-release gate. The backup workflow is
an initial gated implementation, not a proven restore procedure, and is off for the
initial release; verify backup and recovery, including existing attachment objects,
before relying on it.
See the [backup and recovery procedure](backup-recovery.md) for workflow setup and
restore acceptance.

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

- One weekly job plus manual dispatch; retain only the two newest verified backups
  total in private R2 Standard across both run types. Back up the full logical database
  plus encrypted, versioned new/changed photos and manifests; R2 is backup storage,
  not the primary photo store.
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

The sole maintainer (@ethancma) owns monitoring, usage reviews, and MFA/recovery
material. Because no one else can act during an absence, keep account recovery codes
current. Once backups are enabled, the maintainer also owns weekly freshness checks, failure alerts,
and quarterly restore drills. Monitor database/photo storage, source egress, R2 headroom,
and GitHub Actions allowances. Billing alerts are not hard caps; Free tiers do not
promise an SLA or point-in-time recovery.
