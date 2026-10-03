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
- Role-gated email/password access for Admin, Technician, Volunteer, and Viewer, with
  Admin approval before a new account can enter the application.
- A Home dashboard for daily completion/activity and a Systems dashboard for chemistry
  trends, comparisons, and operational highlights.
- URL-backed Daily Operations forms and a filtered Star treatment correction surface.
- A reviewed one-time Graham CSV import bundle kept separate from repeatable migrations.

The authoritative list of delivered work, integrity fixes, remaining features, and staff
decisions is [docs/implementation-checklist.md](docs/implementation-checklist.md).

## Stack
Next.js + TypeScript + Supabase (Postgres, Auth, Storage, RLS), deployed to Vercel.

## File map

Start with the row matching the task. Read the route or component first, then its
validation/config and database dependencies as needed.

| Task | Start here | Related files |
| --- | --- | --- |
| Public entry and sign-in | [`app/page.tsx`](app/page.tsx), [`app/auth/`](app/auth/), [`components/login-form.tsx`](components/login-form.tsx) | [`app/auth/callback/`](app/auth/callback/), [`app/auth/confirm/`](app/auth/confirm/); `app/auth/sign-up/` only redirects to login (invite-only) |
| Invitations and password reset | [`app/invite/`](app/invite/), [`app/auth/reset/`](app/auth/reset/), [`lib/invitations.ts`](lib/invitations.ts) | [`components/invitation-acceptance-form.tsx`](components/invitation-acceptance-form.tsx), [`components/reset-password-form.tsx`](components/reset-password-form.tsx), [`docs/auth-invitations.md`](docs/auth-invitations.md) |
| Session protection, profiles, roles | [`proxy.ts`](proxy.ts), [`app/protected/layout.tsx`](app/protected/layout.tsx), [`lib/supabase/`](lib/supabase/) | [`components/protected-shell.tsx`](components/protected-shell.tsx), [`components/protected-sidebar.tsx`](components/protected-sidebar.tsx) |
| Admin user approval, invites, and access | [`app/protected/admin/`](app/protected/admin/), [`app/api/admin/`](app/api/admin/) | [`components/admin-users-table.tsx`](components/admin-users-table.tsx), [`components/admin-invitation-panel.tsx`](components/admin-invitation-panel.tsx) |
| Daily Operations routing and shared workflow | [`app/protected/daily-operations/`](app/protected/daily-operations/), [`components/daily-operations/`](components/daily-operations/) | Individual form components in [`components/`](components/), validators in [`lib/validation/`](lib/validation/) |
| AM/PM checks | [`components/daily-check-form.tsx`](components/daily-check-form.tsx) | [`lib/validation/daily-check.ts`](lib/validation/daily-check.ts) |
| Feeding and consumption | [`components/feeding-log-form.tsx`](components/feeding-log-form.tsx) | [`lib/validation/feeding-log.ts`](lib/validation/feeding-log.ts) |
| Water quality and targets | [`components/water-quality-form.tsx`](components/water-quality-form.tsx), [`components/water-quality-target-manager.tsx`](components/water-quality-target-manager.tsx) | [`lib/validation/water-quality.ts`](lib/validation/water-quality.ts), [`components/daily-operations/water-quality-targets.ts`](components/daily-operations/water-quality-targets.ts) |
| Health observations | [`components/health-observation-form.tsx`](components/health-observation-form.tsx) | [`lib/validation/health-observation.ts`](lib/validation/health-observation.ts) |
| Chemical additions | [`components/chemical-addition-form.tsx`](components/chemical-addition-form.tsx) | [`lib/validation/chemical-addition.ts`](lib/validation/chemical-addition.ts) |
| Maintenance logs | [`components/maintenance-log-form.tsx`](components/maintenance-log-form.tsx) | [`lib/validation/maintenance-log.ts`](lib/validation/maintenance-log.ts) |
| Star treatments | [`app/protected/star-treatments/`](app/protected/star-treatments/), [`components/star-treatment-form.tsx`](components/star-treatment-form.tsx) | [`components/star-treatment-record.tsx`](components/star-treatment-record.tsx) |
| Home and Systems dashboards | [`app/protected/home/`](app/protected/home/), [`app/protected/systems/`](app/protected/systems/) | [`components/systems/`](components/systems/) |
| History and export | [`app/protected/history/`](app/protected/history/) | Relevant log forms and Supabase queries for the record type |
| Account settings and password changes | [`app/protected/settings/`](app/protected/settings/) (`page.tsx`, `password-form.tsx`, `profile-form.tsx`) | [`lib/supabase/current-profile.ts`](lib/supabase/current-profile.ts) |
| Global styling and reusable controls | [`app/globals.css`](app/globals.css), [`components/ui/`](components/ui/) | [`docs/style-guide.md`](docs/style-guide.md), [`tailwind.config.ts`](tailwind.config.ts) |
| Reference data and configurable quick picks | [`lib/config/reference-data.ts`](lib/config/reference-data.ts), [`components/quick-pick-catalog-config.ts`](components/quick-pick-catalog-config.ts) | [`components/quick-pick-catalog-manager.tsx`](components/quick-pick-catalog-manager.tsx), [`components/daily-operations/quick-pick-catalogs.ts`](components/daily-operations/quick-pick-catalogs.ts) |
| Database schema, RLS, and seed data | [`supabase/migrations/`](supabase/migrations/), [`supabase/seeds/`](supabase/seeds/) | [`supabase/config.toml`](supabase/config.toml), [`supabase/seed.sql`](supabase/seed.sql), [`supabase/snippets/`](supabase/snippets/) |
| Unit and end-to-end tests | [`tests/unit/`](tests/unit/), [`.github/skills/e2e-testing/`](.github/skills/e2e-testing/) | [`playwright.config.ts`](playwright.config.ts), [`docs/testing-strategy.md`](docs/testing-strategy.md) |
| Requirements, status, and architecture | [`docs/implementation-checklist.md`](docs/implementation-checklist.md), [`docs/platform-architecture.md`](docs/platform-architecture.md) | [`docs/lab-operations-plan.md`](docs/lab-operations-plan.md), [`docs/style-guide.md`](docs/style-guide.md) |

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
│   ├── platform-architecture.md   # stack, data model, roles, roadmap, cost
│   ├── lab-operations-plan.md     # the lab: systems, cadence, rollout
│   ├── implementation-checklist.md # current delivery status and remaining backlog
│   ├── testing-strategy.md        # test-by-blast-radius tiers
│   └── agent-dev-tools.md         # dev tool access checklist for the agent
└── .github/
    ├── PULL_REQUEST_TEMPLATE.md
    └── skills/e2e-testing/          # Playwright end-to-end testing skill
```

For details on any of the above, see the linked file in [docs/](docs/) rather than this
README — this file stays a high-level map.

## Getting started
1. Copy `.env.example` to `.env.local` and fill in your Supabase project URL/publishable key.
2. `npm install` (if not already installed), then `npm run dev` — runs on port 3000.

## Status
The core live-entry workflow and first dashboards are implemented. The highest-priority
remaining work is access-control/provenance hardening, complete reference data, staff-led
cadence and validation decisions, scheduled maintenance, historical import/backfill tools,
full History/export, Google OAuth, and rollout at lab stations. See the
[implementation status](docs/implementation-checklist.md) for the current breakdown.
