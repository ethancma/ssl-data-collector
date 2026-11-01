# SSL Data Collection

A web tool for **Sunflower Star Laboratory (SSL)** — a nonprofit sea star conservation
aquaculture lab — so lab techs and volunteers can log daily husbandry and
water-quality data across all 8 systems in one place, replacing paper logs and Google
Sheets. The payoff: correlating water chemistry, feeding, and maintenance events with
sea star health/SSWD symptom onset over time, plus clean exports for research.

## Current Functionality
- Daily AM/PM checks, individual feeding plus same-day consumption follow-up, weekly
  water quality, System chemical additions, health observations/photos, ad-hoc
  maintenance, and individual Star treatments.
- Invite-only password/Google access for Admin, Technician, Volunteer, and Viewer.
  An Admin chooses the invited role; hosted Google OAuth requires provider configuration.
- A Home dashboard for daily completion/activity and a Systems dashboard for chemistry
  trends, comparisons, and operational highlights.
- URL-backed Daily Operations forms and a filtered Star treatment correction surface.
- A reviewed one-time Graham CSV import bundle kept separate from repeatable migrations.

Unresolved requirements and staff decisions that constrain implementation are recorded in
[docs/implementation-checklist.md](docs/implementation-checklist.md).

## Stack
Next.js + TypeScript + Supabase (Postgres, Auth, Storage, RLS). Standard Next.js
remains supported; a pinned vinext/Vite build targets Cloudflare Workers.
See [the Workers deployment runbook](docs/workers-deployment.md) for local
verification, isolated staging, manual releases, and rollback. Production launch
still requires hosted validation and human approval.

## File map

Start with the row matching the task. Read the route or component first, then its
validation/config and database dependencies as needed. This is the canonical map for agents.
Use [feature-data-wiring](.github/skills/feature-data-wiring/SKILL.md) for mock-to-real data
or shared domain-value changes, [e2e-testing](.github/skills/e2e-testing/SKILL.md) for browser
verification, and the migration/Postgres skills for SQL. Smoke section IDs below are hints;
`npm run test:e2e:plan -- --files <touched-files>` is authoritative for combined changes.

| Task | Start here | Related files |
| --- | --- | --- |
| Public entry and sign-in | [`app/page.tsx`](app/page.tsx), [`app/auth/`](app/auth/), [`components/auth/login-form.tsx`](components/auth/login-form.tsx) | [`app/auth/callback/`](app/auth/callback/), [`app/auth/confirm/`](app/auth/confirm/); `app/auth/sign-up/` only redirects to login (invite-only) |
| Invitations and password reset | [`app/invite/`](app/invite/), [`app/auth/reset/`](app/auth/reset/), [`lib/invitations.ts`](lib/invitations.ts) | [`components/auth/invitation-acceptance-form.tsx`](components/auth/invitation-acceptance-form.tsx), [`components/auth/reset-password-form.tsx`](components/auth/reset-password-form.tsx), [`docs/auth-invitations.md`](docs/auth-invitations.md) |
| Session protection, profiles, roles | [`proxy.ts`](proxy.ts), [`app/protected/layout.tsx`](app/protected/layout.tsx), [`lib/supabase/`](lib/supabase/) | [`components/layout/protected-shell.tsx`](components/layout/protected-shell.tsx), [`components/layout/protected-sidebar.tsx`](components/layout/protected-sidebar.tsx) |
| Admin user approval, invites, and access | [`app/protected/admin/`](app/protected/admin/), [`app/api/admin/`](app/api/admin/) | [`components/admin/admin-users-table.tsx`](components/admin/admin-users-table.tsx), [`components/admin/admin-invitation-panel.tsx`](components/admin/admin-invitation-panel.tsx) |
| Daily Operations routing and shared workflow | [`app/protected/daily-operations/data.ts`](app/protected/daily-operations/data.ts), [`components/daily-operations/daily-operations-hub.tsx`](components/daily-operations/daily-operations-hub.tsx) | Six forms in [`components/daily-operations/`](components/daily-operations/), [`lib/validation/`](lib/validation/), [`lib/daily-operations/`](lib/daily-operations/); [`batch-selection.test.ts`](tests/unit/batch-selection.test.ts), [`common-fields.test.ts`](tests/unit/common-fields.test.ts); smoke `daily-operations`, `batch-logging` |
| AM/PM checks | [`components/daily-operations/daily-check-form.tsx`](components/daily-operations/daily-check-form.tsx) | [`lib/validation/daily-check.ts`](lib/validation/daily-check.ts) |
| Feeding and consumption | [`components/daily-operations/feeding-log-form.tsx`](components/daily-operations/feeding-log-form.tsx) | [`lib/validation/feeding-log.ts`](lib/validation/feeding-log.ts) |
| Water quality and targets | [`components/daily-operations/water-quality-form.tsx`](components/daily-operations/water-quality-form.tsx), [`components/settings/water-quality-target-manager.tsx`](components/settings/water-quality-target-manager.tsx) | [`lib/validation/water-quality.ts`](lib/validation/water-quality.ts), [`lib/daily-operations/water-quality-targets.ts`](lib/daily-operations/water-quality-targets.ts) |
| Health observations | [`components/daily-operations/health-observation-form.tsx`](components/daily-operations/health-observation-form.tsx) | [`lib/validation/health-observation.ts`](lib/validation/health-observation.ts) |
| Chemical additions | [`components/daily-operations/chemical-addition-form.tsx`](components/daily-operations/chemical-addition-form.tsx) | [`lib/validation/chemical-addition.ts`](lib/validation/chemical-addition.ts) |
| Maintenance logs | [`components/daily-operations/maintenance-log-form.tsx`](components/daily-operations/maintenance-log-form.tsx) | [`lib/validation/maintenance-log.ts`](lib/validation/maintenance-log.ts) |
| Star treatments | [`app/protected/star-treatments/`](app/protected/star-treatments/), [`components/star-treatments/star-treatment-form.tsx`](components/star-treatments/star-treatment-form.tsx) | [`components/star-treatments/star-treatment-record.tsx`](components/star-treatments/star-treatment-record.tsx), [`lib/validation/star-treatment.ts`](lib/validation/star-treatment.ts) |
| Home dashboard | [`app/protected/home/data.ts`](app/protected/home/data.ts), [`app/protected/home/derivations.ts`](app/protected/home/derivations.ts) | [`home-derivations.test.ts`](tests/unit/home-derivations.test.ts); smoke `daily-operations`, `feeding-schedules` |
| Systems dashboard | [`app/protected/systems/data.ts`](app/protected/systems/data.ts), [`lib/systems/snapshot.ts`](lib/systems/snapshot.ts) | [`components/systems/`](components/systems/), [`lib/systems/`](lib/systems/), [`system-snapshot.test.ts`](tests/unit/system-snapshot.test.ts), [`route-derivations.test.ts`](tests/unit/route-derivations.test.ts); smoke `systems-trends`, `feeding-schedules` |
| ISeaU patients and comparison | [`app/protected/iseau/data.ts`](app/protected/iseau/data.ts) (Supabase reads), [`lib/iseau/data.ts`](lib/iseau/data.ts) (patient/time/location rules) | [`components/iseau/`](components/iseau/), [`iseau-data.test.ts`](tests/unit/iseau-data.test.ts); smoke `daily-operations` includes ISeaU visibility |
| History and export | [`app/protected/history/data.ts`](app/protected/history/data.ts), [`components/history/use-history.ts`](components/history/use-history.ts) | [`lib/history/query.ts`](lib/history/query.ts), [`lib/history/params.ts`](lib/history/params.ts), [`lib/history/csv.ts`](lib/history/csv.ts), [`history-params.test.ts`](tests/unit/history-params.test.ts), [`history-csv.test.ts`](tests/unit/history-csv.test.ts); smoke `history` |
| Animal setup and placement | [`app/protected/settings/animal-setup/page.tsx`](app/protected/settings/animal-setup/page.tsx), [`components/settings/animal-setup-manager.tsx`](components/settings/animal-setup-manager.tsx) | [`lib/validation/animal-setup.ts`](lib/validation/animal-setup.ts), [`animal-setup.test.ts`](tests/unit/animal-setup.test.ts); smoke `animal-setup` |
| Feeding schedules | [`app/protected/settings/feeding-schedules/page.tsx`](app/protected/settings/feeding-schedules/page.tsx), [`components/settings/feeding-schedule-manager.tsx`](components/settings/feeding-schedule-manager.tsx) | [`lib/systems/feeding-schedule.ts`](lib/systems/feeding-schedule.ts), [`feeding-schedule.test.ts`](tests/unit/feeding-schedule.test.ts); smoke `feeding-schedules` |
| Account settings and password changes | [`app/protected/settings/`](app/protected/settings/) (`page.tsx`, `password-form.tsx`, `profile-form.tsx`) | [`lib/supabase/current-profile.ts`](lib/supabase/current-profile.ts) |
| Global styling and reusable controls | [`app/globals.css`](app/globals.css), [`components/ui/`](components/ui/) | [`docs/style-guide.md`](docs/style-guide.md), [`tailwind.config.ts`](tailwind.config.ts) |
| Shared form pieces | [`components/forms/`](components/forms/) (`date-time-fields.tsx`, `field-error.tsx`, `unit-select.tsx`, `form-classes.ts`), [`components/ui/textarea.tsx`](components/ui/textarea.tsx) | Used by the daily forms, Star treatments, and settings managers; ids follow `{form}-{field}` |
| Reference data and configurable quick picks | [`lib/config/reference-data.ts`](lib/config/reference-data.ts), [`lib/daily-operations/quick-pick-catalog-config.ts`](lib/daily-operations/quick-pick-catalog-config.ts) | [`components/settings/quick-pick-catalog-manager.tsx`](components/settings/quick-pick-catalog-manager.tsx), [`components/settings/quick-pick-catalog-item.tsx`](components/settings/quick-pick-catalog-item.tsx), [`lib/daily-operations/quick-pick-catalog-manager.ts`](lib/daily-operations/quick-pick-catalog-manager.ts), [`lib/daily-operations/quick-pick-catalogs.ts`](lib/daily-operations/quick-pick-catalogs.ts) |
| Database schema, RLS, and seed data | [`supabase/migrations/`](supabase/migrations/), [`supabase/seeds/`](supabase/seeds/) | [`supabase/config.toml`](supabase/config.toml), [`supabase/seed.sql`](supabase/seed.sql), [`supabase/snippets/`](supabase/snippets/) |
| Unit and end-to-end tests | [`tests/unit/`](tests/unit/), [`.github/skills/e2e-testing/`](.github/skills/e2e-testing/) | [`playwright.config.ts`](playwright.config.ts), [`docs/testing-strategy.md`](docs/testing-strategy.md) |
| Agent harness and test routing | [`AGENTS.md`](AGENTS.md), [`select-smoke-sections.ts`](.github/skills/e2e-testing/scripts/select-smoke-sections.ts), [`preflight.mjs`](.github/skills/e2e-testing/scripts/preflight.mjs) | [`select-smoke-sections.test.ts`](tests/unit/select-smoke-sections.test.ts), [`e2e-preflight.test.ts`](tests/unit/e2e-preflight.test.ts), [`prepare-pr`](.github/prompts/prepare-pr.prompt.md) |
| Workers runtime and release | [`docs/workers-deployment.md`](docs/workers-deployment.md), [`vite.config.mts`](vite.config.mts), [`wrangler.jsonc`](wrangler.jsonc) | [CI](.github/workflows/ci.yml), [release](.github/workflows/release.yml); both runtime suites, not only `npm run verify` |
| Production backup and recovery | [`docs/backup-recovery.md`](docs/backup-recovery.md), [`scripts/production-backup.mjs`](scripts/production-backup.mjs) | [Backup workflow](.github/workflows/production-backup.yml), [`production-backup.test.ts`](tests/unit/production-backup.test.ts); production operations remain human-gated |
| Requirements and architecture | [`docs/implementation-checklist.md`](docs/implementation-checklist.md), [`docs/platform-architecture.md`](docs/platform-architecture.md) | [`docs/lab-operations-plan.md`](docs/lab-operations-plan.md), [`docs/style-guide.md`](docs/style-guide.md) |

Top-level structure:

```
.
├── README.md                    # you are here
├── AGENTS.md                    # rules for coding agents working in this repo
├── app/                         # Next.js routes, layouts, and server route handlers
│   ├── api/                     # admin invitation and reset-link server endpoints
│   ├── auth/                    # login, signup, callback, confirmation, and reset routes
│   ├── invite/                  # public invitation acceptance routes
│   └── protected/               # authenticated admin, operations, and dashboard routes
├── components/                  # forms, dashboard features, navigation, and UI primitives
│   ├── daily-operations/        # shared workflow state, selection, time, and form helpers
│   ├── systems/                 # Systems dashboard charts, summaries, and data types
│   └── ui/                      # reusable low-level controls
├── lib/
│   ├── config/                  # shared reference data
│   ├── supabase/                # browser/server clients and current-profile lookup
│   ├── validation/              # form schemas and domain validation
│   └── invitations.ts           # invite token and link helpers
├── supabase/                    # local config, migrations, repeatable seeds, and SQL snippets
├── tests/unit/                  # focused unit tests
├── proxy.ts                    # session refresh and route protection
├── docs/
│   ├── platform-architecture.md   # stack, data model, roles
│   ├── lab-operations-plan.md     # lab requirements: systems and cadence
│   ├── implementation-checklist.md # unresolved requirements and BLOCKED decisions
│   ├── auth-invitations.md        # invitation/reset flows and provider setup
│   ├── star-treatments-design.md  # treatment feature contract
│   ├── style-guide.md            # shared UI conventions
│   ├── testing-strategy.md       # test-by-blast-radius tiers
│   └── workers-deployment.md     # hosting, verification, release, rollback
└── .github/
    ├── PULL_REQUEST_TEMPLATE.md
    └── skills/e2e-testing/          # Playwright end-to-end testing skill
```

For details on any of the above, see the linked file in [docs/](docs/) rather than this
README — this file stays a high-level map.

## Getting started
1. Copy `.env.example` to `.env.local` and fill in your Supabase project URL/publishable key.
2. `npm install` (if not already installed), then `npm run dev` — runs on port 3000.
