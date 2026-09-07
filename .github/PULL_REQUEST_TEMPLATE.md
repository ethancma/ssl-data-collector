<!-- A human reviews and merges every PR. Never approve/merge your own PR, agent or not. -->

## What changed and why

## Testing tier
See [docs/testing-strategy.md](../docs/testing-strategy.md).

- [ ] Tier 1 — copy/UI polish (spot check only)
- [ ] Tier 2 — standard feature/bug fix ([e2e-testing skill](skills/e2e-testing/SKILL.md) run)
- [ ] Tier 3 — schema/RLS/auth/import tooling (verified in Supabase dashboard + preview deploy)
- [ ] Tier 4 — real/historical data (backup confirmed, sample rows spot-checked)

## Verification notes
<!-- Summarize what the e2e-testing skill (or manual testing) actually covered. -->

## Checklist
- [ ] Dev server was reused, not restarted, while testing
- [ ] No `git push` happened without explicit sign-off earlier in this session
- [ ] Ready for human review — not self-merged
