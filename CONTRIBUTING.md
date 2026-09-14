# Contributing to Veriguard

Thanks for helping make scam detection better. Veriguard is a rule-based scam,
phishing and impersonation detector — people paste a dodgy link, text, email or
phone number and get an instant, plain-English verdict. Because a real person
may be acting on that verdict while they're being targeted, contributions are
held to two non-negotiable standards: **detection stays transparent and
rule-based**, and **user content stays private**. Everything below flows from
those two.

New contributors are welcome. If you're unsure whether an idea fits, open an
issue to discuss it before writing code — that's cheaper than a PR that has to
be turned away on principle.

---

## Ways to contribute

- **Detection rules and region packs** — new signals, new brands/agencies, a new
  country pack. These carry the highest bar (evidence + tests); see
  [Contributing detection changes](#contributing-detection-changes).
- **Threat Radar / Scam Calendar entries** — the educational, non-scoring
  layer; see [Educational content](#educational-content-rad--calendar).
- **App, UI and API** — components, screens, route handlers, accessibility,
  mobile fixes.
- **Translations / copy** — all user-facing strings live in
  [`messages/`](messages/); see [Copy and i18n](#copy-and-i18n).
- **Bug reports and feature ideas** — open a
  [GitHub issue](https://github.com/alekslinde/veriguard/issues). For UI bugs,
  the in-app "Report a bug" button attaches useful diagnostics.
- **Reporting a scam you received** is not a code contribution — use the in-app
  **Report a scam** form, which feeds the public database with PII stripped.

> **Security issues are different.** If you've found something that could expose
> user data, turn the inbound-email flow into a relay, or bypass an abuse
> mitigation, do **not** open a public issue or PR. Follow the private
> disclosure process in [`SECURITY.md`](SECURITY.md).

---

## Project principles

These are the rules a reviewer cannot waive. A change that breaks one will not
be merged regardless of how good it otherwise is.

1. **Detection is rule-based first.** Keyword lists, domain allow/denylists,
   regex, and weighted scoring — no models in the scoring path today, no external
   analysis API. The value here is a verdict a person can read the reasoning
   for, and detection nobody has to trust blindly. A model (ML, NLP, LLM) is
   welcome only if it keeps both properties: explainable verdicts and nothing
   sent off-device for scoring. See
   [`SECURITY.md`](SECURITY.md) for why open, rule-based detection is also the
   *safer* default.
2. **User content never leaves the device for scoring.** Analysis runs
   client-side or in-memory on the server and is discarded. The only outbound
   calls are to fixed, trusted infrastructure (the URLhaus blocklist and HEAD
   requests to a whitelist of URL-shortener hosts). This is enforced by
   [`__tests__/privacyInvariant.test.ts`](__tests__/privacyInvariant.test.ts)
   and a lint rule banning Node's network modules from the engine — don't work
   around either.
3. **Don't weaken the privacy and abuse defences.** PII is scrubbed before any
   display or storage (route new user content through
   [`lib/piiScrubber.ts`](lib/piiScrubber.ts)), and the submission guard
   (honeypot, rate limit, timing checks, dedupe) protects the report flow.
   Changes here need explicit maintainer sign-off.
4. **The engine stays framework-free.** Code in
   [`packages/engine/`](packages/engine/) imports no React and no `next/*`, and
   makes no network calls of its own. A teaching or presentation layer over a
   signal belongs in [`lib/`](lib/), not the engine.

---

## Getting set up

Requires **Node 22** (the version CI runs).

```bash
npm install
npm run dev        # http://localhost:3000
```

No database setup is needed for local dev — the app falls back to a local
SQLite file (`local.db`) automatically. See the
[README](README.md#running-locally) for a persistent (Turso) setup.

Useful commands:

```bash
npm test           # Vitest suite — run before committing
npm run lint       # ESLint (Next 16.3 + strict react-hooks rules)
npm run build      # production build
npm run seed       # seed the database with sample reports
```

The codebase layout and where each kind of logic lives is documented in
[`CLAUDE.md`](CLAUDE.md) — worth a skim before your first change.

---

## Making a change

1. **Branch** off `main`.
2. **Keep it focused.** One logical change per PR — it's easier to review and
   safer to revert.
3. **Add tests.** Detection changes *must* ship with coverage in
   [`__tests__/`](__tests__/) (see below). Other changes should be tested where
   it's reasonable to.
4. **Run `npm run lint` and `npm test`** — both must pass. CI runs exactly these
   on every PR and is the gate every merge relies on.
5. **Open a PR** and fill in the template. The checklist mirrors the principles
   above; it's there to make sure nothing load-bearing slipped.

### Commit messages

Use a scope prefix so history stays scannable (these match the scopes in
[`CLAUDE.md`](CLAUDE.md)):

| Scope | For changes in |
| --- | --- |
| `detector` | Detection logic in `packages/engine/` (scamDetector, phoneIntel, region packs, …) |
| `ui` | Components and screens |
| `api` | Route handlers under `app/api/` |
| `email` | Email parsing / inbound / distiller |
| `db` | Data layer and stores |
| `i18n` | Strings and language handling |
| `config` | Config, docs, tooling |

Example: `fix(ui): reveal the bug-report chip on scroll, icon-only on mobile`.

If a change is user-noticeable, bump the app version in `package.json` in the
same PR — see [`docs/versioning.md`](docs/versioning.md).

---

## Contributing detection changes

Detection is the heart of the project, so it carries the highest bar.

- **Bring evidence.** A new rule needs a reason a reviewer can check — a named
  regulator warning, a measurement, a documented campaign. "I've seen this
  around" isn't enough to assign a score. The research briefs in
  [`docs/threat-intel/`](docs/threat-intel/) are the provenance layer: they
  survey a tactic and *propose* detection changes, which then ship separately as
  code. Read [`docs/threat-intel/README.md`](docs/threat-intel/README.md) for
  how evidence and detection are kept apart, and why. For a substantial new
  rule, a roadmap entry (or a link to comparable evidence) should come first.
- **Ship tests.** Every detection change needs coverage in
  [`__tests__/`](__tests__/) — both a positive case (the rule fires on a real
  example) and, where a false positive is plausible, a negative case (it doesn't
  fire on a legitimate lookalike). Detection you can't demonstrate isn't
  reviewable.
- **Mind false positives.** Calling a legitimate message a scam erodes trust as
  much as missing a real one. New signals should be weighted, not absolute, and
  a plausible legitimate case should be tested.
- **Region packs are data, not logic.** A country pack in
  [`packages/engine/src/regions/`](packages/engine/src/regions/) layers national
  signals (agencies, banks, brands, number-plan semantics, allowlists) on top of
  the shared base set. Add signals to the pack; don't fork the scoring engine.
- **State coverage honestly.** Where a region's rules are incomplete, a clean
  result must read as "unknown", never a confident "safe". Don't add a rule that
  quietly implies more coverage than exists.

---

## Educational content (Radar & Calendar)

Threat Radar ([`lib/threatRadar.ts`](lib/threatRadar.ts)) and the Scam Calendar
([`lib/scamCalendar.ts`](lib/scamCalendar.ts)) are **strictly educational and
must never touch scoring** — neither is imported by the detector, and that
separation is deliberate. Seasonality raising a campaign's base rate is useful
for a *person* to know and dangerous for a *scorer* to assume: a tax scam out of
season is still a scam, and a legitimate agency email in season is still
legitimate.

Radar entries are promoted by hand from the intel sweeps in
[`docs/threat-intel/`](docs/threat-intel/), and only campaigns a person could
plausibly *receive* qualify — infrastructure research stays in `docs/`.

---

## Copy and i18n

Don't hardcode user-facing strings. They live in [`messages/`](messages/) as
`en.normal.json`, the complete base bundle. Copy is keyed on two axes —
**locale** (the language) and **tone** (the register) — so keep them separate
when adding strings. Verdict copy should read plainly for a non-technical,
possibly-worried reader.

---

## Code of conduct

Be respectful and assume good faith. This is a safety tool worked on by
volunteers; keep discussion constructive, welcome newcomers, and critique the
code rather than the person. Harassment or demeaning behaviour isn't welcome and
may result in being blocked from the project. Maintainers have the final say on
what gets merged.

---

## Licensing

By contributing, you agree that your contributions are licensed under the
project's [Apache License 2.0](LICENSE).
