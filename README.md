# SSL Data Collection

A web tool for **Sunflower Star Laboratory (SSL)** — a nonprofit sea star conservation
aquaculture lab — so lab techs and volunteers can log daily husbandry and
water-quality data across all 8 systems in one place, replacing paper logs and Google
Sheets. The payoff: correlating water chemistry, feeding, and maintenance events with
sea star health/SSWD symptom onset over time, plus clean exports for research.

## Functionality (planned)
- Daily AM/PM checks, feeding logs + same-day consumption follow-up, weekly water
  quality readings, chemical additions, health observations (with required photos),
  and maintenance scheduling — one guided form per event type.
- Role-gated access (Admin / Technician / Viewer) with admin-approval on sign-up.
- A "Today" dashboard showing what's done/outstanding per system.
- One-time historical import (Google Sheets CSV + paper backfill), kept distinguishable
  from live entries.
- Trend charts and raw data export for conservation research/reporting.

## Stack
Next.js + TypeScript + Supabase (Postgres, Auth, Storage, RLS), deployed to Vercel.

## File structure
```
.
├── README.md                    # you are here
├── AGENTS.md                    # rules for coding agents working in this repo
├── app/                          # Next.js App Router (auth flow scaffolded; feature routes not yet added)
├── components/                   # UI components (auth forms, shadcn/ui primitives)
├── lib/supabase/                 # Supabase browser/server clients (@supabase/ssr)
├── proxy.ts                       # session refresh + route protection (Next.js middleware)
├── docs/
│   ├── platform-architecture.md   # stack, data model, roles, roadmap, cost
│   ├── lab-operations-plan.md     # the lab: systems, cadence, rollout
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
Auth scaffolding is in place (sign-up/sign-in/password-reset via Supabase). The
domain-specific dashboard (systems, feeding, water quality, etc. — see
[docs/platform-architecture.md](docs/platform-architecture.md) §6) hasn't been built yet.
