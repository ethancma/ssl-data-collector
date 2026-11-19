---
name: workers-release-ops
description: 'Use when preparing or operating the SSL Data Collection Cloudflare Workers release, staging acceptance, production rollout, rollback, secrets, or deployment troubleshooting. Start with the Workers deployment runbook; never bypass human approvals.'
---

# Workers Release Operations

Use the [Workers deployment runbook](../../../docs/workers-deployment.md) as the source of
truth. This skill is a routing checklist, not a replacement for its environment-specific
steps.

## Use for
- Cloudflare Worker staging or production release preparation and acceptance
- Release workflow failures, deployed-version checks, rollback, or post-deploy monitoring
- Worker secrets and environment configuration

Do not use for ordinary application feature work or local Next.js/Vite debugging.

## Procedure
1. Identify the target (Local, staging/Dev, or production) and the requester's intended
   operation. Never infer that deployment, a hosted write, or secret rotation is authorized.
2. Read the relevant runbook sections: architecture and boundaries, local verification,
   release plan and acceptance, rollback, or operating and maintaining the release.
3. For code changes, inspect the current branch and exact diff; follow the documented CI,
   environment approval, current-main, and staging-acceptance gates.
4. Keep production credentials and secret values out of source, logs, commands, and chat.
   Never substitute Production for local or Dev verification.
5. Do not launch or approve a hosted release on the user's behalf. A human must start the
   release workflow and approve its environment deployment. Report the exact evidence and
   any human action still required.

## Output

State the target, verified status/evidence, blockers, and next operator action. Link the
specific runbook section rather than repeating its full procedures.
