# Agent Dev Tool Access

"Whatever you need to debug, your agent needs too." Track what's wired up here as the
platform gets built (see [platform-architecture.md](./platform-architecture.md) for the
chosen stack) — keep this list current, don't let it drift from reality.

No Stripe/payments in this project — there's nothing to bill, so skip that category entirely.

| Tool | Purpose | Status | Notes |
|---|---|---|---|
| Supabase (CLI) | Inspect schema, RLS policies, run/check migrations, query tables directly to confirm a write landed | Wired | CLI logged in + linked to project ref `bqylxmsifagnztxhixyl`. Workflow/commands documented in the [supabase-migrations skill](../.github/skills/supabase-migrations/SKILL.md) — notably, any destructive op against remote (drops/truncates) is human-run only, never agent-run. |
| GitHub (CLI or MCP) | Open PRs, read CI status, read past PR discussion | Not yet wired | Agent may open PRs; a human still merges (see [AGENTS.md](../AGENTS.md)) |
| Hosting logs (Vercel) | Read prod/preview runtime logs and build failures | Not yet wired | Wire up once the Vercel project exists |
| Resend | Confirm maintenance-reminder emails actually send/render in dev | Not yet wired | Low priority until §6 roadmap item 6 (maintenance scheduling) starts |
| Sentry | Alert-driven root-cause investigation ("we got errors last night, find why") | Deferred (optional, later phase per [platform-architecture.md](./platform-architecture.md) §3) | Add when adopted |
| Google OAuth test accounts | End-to-end sign-in/onboarding testing | Not yet wired | See [test-accounts.md](../.github/skills/e2e-testing/references/test-accounts.md) — use Supabase email/password stand-ins in dev instead of real Google accounts |

## Adding a tool
1. Add the credential/access the same way you'd give yourself access (dev-scoped, never
   production write access without a human in the loop for Tier 3/4 changes).
2. Update the row above: status + how the agent authenticates (CLI config, MCP server, env var).
3. If it changes what the [e2e-testing skill](../.github/skills/e2e-testing/SKILL.md) can
   verify, update that skill too.
