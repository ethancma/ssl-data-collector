---
name: "Handoff to Fresh Session"
description: "Create a compact, evidence-based handoff before continuing work in a new chat."
argument-hint: "Optional focus or constraints to include"
agent: "agent"
tools: [read, search, execute]
---

Prepare a concise handoff for a fresh coding session using only the current conversation and
verified repository state. Check `git status --short --branch`, the branch name, and `HEAD`.
Do not edit files, stage changes, commit, or push.

Include only relevant facts:
- task and acceptance criteria
- worktree, branch, HEAD, and task-owned files
- app/database target and server PID, if relevant and known
- decisions, blockers, and unresolved questions
- exact checks run and their results
- remaining work and the next useful action

Never include secrets or copy sensitive source data. Do not create a tracked handoff file.
Return a compact Markdown block suitable for pasting into a new session; mark unknown details
as unknown rather than guessing. Keep it under 250 words.
