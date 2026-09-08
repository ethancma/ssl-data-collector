# Agent Instructions

Project context: [docs/platform-architecture.md](docs/platform-architecture.md) (stack,
schema, roles) and [docs/lab-operations-plan.md](docs/lab-operations-plan.md) (the lab,
cadence, rollout). Start with [README.md](README.md) for the overview.

## Rules

1. **Never push without my explicit permission.** Do whatever's needed locally — commit if
   useful — but stop and ask before `git push`.
2. **Never kill the dev server.** It runs on port 3000. Reuse it across changes; don't stop
   and restart it just to test one thing.
3. **Run the [e2e-testing skill](.github/skills/e2e-testing/SKILL.md) after any real feature or
   DB/schema change**, before opening a PR.

## Also

- Match testing effort to risk — see [docs/testing-strategy.md](docs/testing-strategy.md).
- A human reviews and merges every PR. Never merge your own PR.
- Dev tool access (Supabase, hosting, etc.) is tracked in
  [docs/agent-dev-tools.md](docs/agent-dev-tools.md) — keep it current as tools get wired up.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
