---
name: "Prepare SSL PR"
description: "Prepare an existing SSL branch for review: preserve other sessions' changes, verify the branch diff, select E2E coverage, run a fresh-context review, and report exact evidence. Never pushes or merges."
argument-hint: "Optional base ref (default origin/main) and session-owned files"
agent: "agent"
---

# Prepare an existing PR branch

Follow [AGENTS.md](../../AGENTS.md) and [testing-strategy.md](../../docs/testing-strategy.md).
This prompt does not authorize pushing, merging, database resets, hosted writes, or
committing another session's changes.

1. Establish worktree, branch, HEAD, base ref, and staged/unstaged/untracked files. Use the
   user-supplied base or `origin/main`; fail explicitly if it cannot resolve. Don't reset,
   switch branches, or discard untracked work to obtain a clean diff.
2. Confirm session-owned files. In a shared checkout, keep other sessions' changes out of
   staging/commits; if ownership is unclear, ask. Before worktree consolidation/removal,
   account for untracked files as well as commits.
3. Run `npm run verify`, `npm run check:dead-code`, and `git diff --check`.
   Plan committed branch coverage with `npm run test:e2e:plan -- --base <base-ref>`.
   For an owned worktree, add `--working-tree` to include pending changes; otherwise plan
   session-owned pending files separately with `--files`. `--git-diff` alone is not a PR diff.
4. Run the coverage required by the testing tier using the
   [e2e-testing skill](../skills/e2e-testing/SKILL.md). Run its preflight before writes;
   don't substitute Production or a different checkout when tests are blocked.
   Runtime changes also require the [Workers runbook](../../docs/workers-deployment.md).
5. Request one fresh-context review with the [reviewer](../agents/reviewer.agent.md), giving
   base ref, owned pending files, and exact verification evidence. Fix Blocking findings and
   rerun affected checks; do not rerun unchanged checks solely for a different agent.
6. Before drafting or editing a PR body, inspect the repository's PR templates, preserve the
   chosen template's structure, and include exact commands with passed/failed/not-run results.
   State blockers honestly. Creating/pushing a PR still needs the human's explicit approval.

Return: ownership/branch summary, blocking findings, command/result table, and remaining
human actions. Keep a compact session-state handoff; do not create a tracked planning report.
