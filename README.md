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

## File structure
```
.
├── README.md                    # you are here
├── AGENTS.md                    # rules for coding agents working in this repo
├── app/                          # Next.js App Router (auth, dashboards, admin, settings, operations)
├── components/                   # forms, dashboards, navigation, and UI primitives
├── lib/supabase/                 # Supabase browser/server clients (@supabase/ssr)
├── proxy.ts                       # session refresh + route protection (Next.js middleware)
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
1. Copy `.env.example` to `.env.local` and fill in your Supabase project URL/anon key.
2. `npm install` (if not already installed), then `npm run dev` — runs on port 3000.

## Status
The core live-entry workflow and first dashboards are implemented. The highest-priority
remaining work is access-control/provenance hardening, complete reference data, staff-led
cadence and validation decisions, scheduled maintenance, historical import/backfill tools,
full History/export, Google OAuth, and rollout at lab stations. See the
[implementation status](docs/implementation-checklist.md) for the current breakdown.
