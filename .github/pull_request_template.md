## Summary
<!-- What changed and why, in a sentence or two. -->

## Scope
<!-- detector / ui / api / email / db / i18n / config (matches the commit scopes in CLAUDE.md) -->

## Checklist
- [ ] `npm run lint` and `npm test` pass locally
- [ ] Detection stays rule-based — no LLM or external analysis API
- [ ] Detection changes ship with tests in `__tests__/`
- [ ] User-facing copy lives in `messages/`, not hardcoded
- [ ] PII scrubbing and the submission guard (honeypot, rate limit, timing, dedupe) are not weakened
- [ ] Commits are signed off (`git commit -s`); new source files carry an SPDX header
- [ ] No `local.db` / `.env.local` / secrets committed

## Notes for reviewers
<!-- Screenshots for UI changes, edge cases, follow-ups, anything deliberately out of scope. -->
