# Veriguard — Claude Config

> Inherits global values from ~/.claude/CLAUDE.md

---

## Project Context

Australian scam / phishing / impersonation detector. Users paste a dodgy link,
SMS, phishing email, or phone number and get an instant rule-based verdict.
Detection is **hardcoded pattern/heuristic logic, not an LLM** — no ML, no
external analysis APIs, nothing sent off-device for scoring.

**Stack:** Next.js 16.3 (App Router) + React 19, Tailwind CSS v4
**Package manager:** npm (npm workspaces — `packages/*`)
**Primary language:** TypeScript (strict)
**Tests:** Vitest
**DB:** libSQL / Turso in prod; falls back to local SQLite (`local.db`) in dev

---

## Project Structure

```
app/            ← Routes (App Router): page.tsx, about/, learn/, radar/,
                  calendar/, report/, share/, submissions/
  api/          ← Route handlers: check, report, reports, ocr, inbound, bug,
                  stats, feed-stats
components/     ← UI components (check here first) — CheckFlow, ReportForm,
                  VerdictBadge, SubmissionsBrowser, etc.
packages/engine ← The detection engine, as its own workspace package
                  (@veriguard/engine). src/: scamDetector.ts,
                  phoneIntel.ts, urlSanitizer.ts, urlExpander.ts,
                  detectType.ts, emailHeaders.ts, engineTypes.ts,
                  regions/ (au, gb, us, ca, ie, nz, rest-of-world).
                  No framework imports, no ambient network access.
lib/            ← App-side logic — everything that is NOT scoring.
                  Teaching/presentation: signalTactics.ts, verdictSummary.ts,
                  threatRadar.ts, scamCalendar.ts, richText.tsx, formatters.ts.
                  Email: emailDistiller.ts, forwardedEmail.ts, emailSource.ts,
                  emailTracking.ts, trackingPixel.ts. Data: db.ts,
                  reportStore.ts, bugStore.ts. Safety: piiScrubber.ts,
                  submissionGuard.ts. Region/i18n: regionResolver.ts, geo.ts,
                  i18n.ts, lang.tsx. Blocklist: urlhausBlocklist.ts.
messages/       ← i18n string bundles (en.normal.json)
__tests__/      ← Vitest tests (engine + lib)
scripts/        ← seed-db.ts, generate-icons.mjs
workers/        ← inbound-email worker
docs/           ← threat-intel/ — PUBLIC sweep research only, one file per
                  sweep as `YYYY-MM-DD-threat-roadmap.md`. Nothing else goes
                  here — see *Where writing goes*
```

**Import detection from the package, not `lib/`:**
`import { analyzeContent } from "@veriguard/engine/scamDetector"`.
Top-level entry points are `checkUrl`, `checkSms`, `checkEmail`, `checkPhone`,
`checkCustom` and `analyzeContent` — the last returns an **array**, one result
per identifier found in the input.

---

## Component & Code Reuse

- Check `components/` before building anything new; extend before creating
- Scoring logic lives in `packages/engine/src/` — check there before writing
  any detection or URL/phone parsing helper
- App-side logic lives in `lib/` — check there before writing presentation,
  email, data or safety helpers
- New components → `components/ComponentName.tsx`
- Extract logic used in 2+ places into `lib/` (or the engine, if it scores)
- Keep the engine framework-free: no React, no `next/*`, no network calls.
  A teaching layer over detection (like `lib/signalTactics.ts`) belongs in
  `lib/`, so the engine can reword a signal without a taxonomy following it.

---

## Stack Conventions

- **Detection is rule-based only** — keyword lists, domain allow/denylists,
  regex, weighted scoring. Never introduce an LLM or external analysis API.
- Styling via **Tailwind CSS v4** (utility classes; `app/globals.css`)
- App Router route handlers under `app/api/*/route.ts`
- i18n strings go in `messages/` — don't hardcode user-facing copy
- PII is scrubbed before display/storage — route new user content through
  `piiScrubber.ts`
- **Detection changes must ship with test coverage in `__tests__/`**

---

## Git Scopes

Use these scopes in commit messages:

- `(detector)` — Detection logic in `packages/engine/` (scamDetector,
  phoneIntel, region packs, etc.)
- `(ui)` — Components and screens
- `(api)` — Route handlers under `app/api/`
- `(email)` — Email parsing / inbound / distiller
- `(db)` — Data layer and stores
- `(i18n)` — Strings and language handling
- `(config)` — Config and environment

---

## Off Limits

- Don't weaken PII scrubbing or the submission guard (honeypot, rate limit,
  timing, dedupe) without explicit sign-off — they're abuse defences
- Don't commit `local.db` or `.env.local`
- **`docs/` takes dated sweep research and nothing else** — see *Where writing
  goes*, below

---

## Where writing goes

**This repo is public. Write for that audience.**

`docs/` holds exactly one thing: `threat-intel/YYYY-MM-DD-threat-roadmap.md`,
the dated sweep research. Sweeps are outward-looking, cite public sources, and
exist as **provenance for shipped rules** — why `.bond` scores +30, why
`"quantum ai"` scores +50. Showing that working is the point.

**Nothing else belongs in `docs/`.** Not notes, not analysis, not findings —
if it is not a dated sweep, it does not go there. Other documentation has its
place (this file, `README.md`, `AGENTS.md`); when something fits none of them,
ask rather than inventing a home for it.

The naming is load-bearing: `threatRadar.test.ts` and `sweepCoverage.test.ts`
resolve sweeps by filename, and `docsArePublic.test.ts` enforces this section.

**Keep commit messages, PR titles and descriptions, code comments and tests
self-contained.** Cite public sources freely; reference anything not in this
repo by its content, never by its name or location:

```ts
// Probed 2026-08-29 (share path): 9 of 11 innocent phrasings raised a scam card.
```

That tells a future reader what they need and points nowhere.

**None of this narrows what is open.** Detection logic stays open source (see
*Notes*) — obscuring keyword lists wouldn't stop a sophisticated scammer.

---

## Commands to Know

```bash
npm run dev      ← Start dev server (http://localhost:3000)
npm test         ← Run Vitest tests (run before committing)
npm run lint     ← ESLint (Next 16.3 + strict react-hooks rules)
npm run seed     ← Seed the database
npm run build    ← Production build
```

---

## Notes

- No DB setup needed for local dev — SQLite fallback is automatic.
- Detection logic is intentionally open source: transparency lets the
  community improve it, and obscuring keyword lists wouldn't stop
  sophisticated scammers.
- Next.js 16.3 / React 19 / Tailwind v4 are newer than most training data —
  check the official docs rather than assuming older behaviour.

---

## Next.js agent rules

`next dev` maintains a managed block of Next-specific agent rules. It lives in
`AGENTS.md` — Next rewrites that file on version bumps, so treat it as
generated and don't hand-edit it. The import below pulls it into this file so
the rules still load; keep the line so the block stays out of CLAUDE.md.

@AGENTS.md
