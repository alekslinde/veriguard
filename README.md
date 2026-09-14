# Veriguard

A no-nonsense scam detector. Paste a suspicious link, text message, phishing email, or scam phone number and get an instant verdict — no account required, check content kept nowhere, no data sold.

Detection is region-aware: local government domains, banks, phone number formats, and the scams actually in circulation, with full coverage for Australia, the UK, US, New Zealand and Ireland.

---

## What it does

### Scam Checker
Paste in anything that looks off — a link, a text, a whole email, a phone number, or a screenshot — and get back a verdict (safe / suspicious / likely scam — or unknown where there is no local coverage to give a clean bill of health) with a plain-English breakdown of every red flag found.

There's no input-type picker to fuss with. **The app works out what you gave it** and runs the right checks, tagging each thing it finds as a link 🔗, email 📧, phone 📞, or message 💬. Paste a blob with several of these in it and it'll analyse each one.

Under the hood it runs:

- **Links** — checks URLs against a live malware/phishing blocklist ([URLhaus](https://urlhaus.abuse.ch), from abuse.ch), URL-shortener expansion, suspicious TLDs, IP-address hosting, typosquatted brand domains, and phishing keywords. Defanged links (`hxxp://evil[.]tk`) and schemeless ones (`evil.tk/login`) are recognised too, so sharing a link safely doesn't cost you the check.
- **Text messages** — urgency language, reward bait, requests for sensitive info, embedded suspicious links, and government-agency impersonation.
- **Emails** — all the message checks plus sender-domain analysis, generic greetings, and **email authentication** (SPF / DKIM / DMARC) parsed straight from the raw headers. Forwarded emails are unwrapped back to the original scam, and **tracking pixels** are detected and flagged — both in the app pipeline around the scorer.
- **Phone numbers** — line-type detection (mobile / fixed / VoIP / premium / free-call), region-specific premium-rate ranges, wangiri (one-ring) and premium-rate country risk, and spoofing-risk notes.

**Screenshots and QR codes:** drop or upload an image and it'll try to decode a QR code first (client-side via jsQR), then fall back to OCR (Tesseract.js) to pull out the text — then run all the checks above on whatever it finds. **Both run on your own device** — the image never leaves it. A server-side OCR fallback exists for browsers that can't run the WASM engine — or when on-device processing fails or times out.

**Forward it in:** on your phone? Forward a suspicious email to the app's inbox and it emails you back a plain verdict — including *why*, signal by signal, so you know what to look for next time. It's read on arrival and no copy is kept. (Available where inbound mail is enabled.)

### Region-aware detection

Detection is country-aware. A **region pack** ([`packages/engine/src/regions/`](packages/engine/src/regions/)) layers national signals — agencies, banks and brands, number-plan semantics, legitimate-domain allowlists, local campaigns — on top of a universal base set (generic urgency, "Hi Mum" voice-clone lures, URL shorteners, abused TLDs, phishing hosting).

| Region | Coverage |
| --- | --- |
| 🇦🇺 Australia, 🇬🇧 United Kingdom, 🇺🇸 United States, 🇳🇿 New Zealand, 🇮🇪 Ireland | `full` |
| 🇨🇦 Canada | `partial` |
| 21 further packs (see [`packages/engine/src/regions/`](packages/engine/src/regions/)) | `minimal` — agencies + reporting body |
| Everywhere else | `none` — base signals only |

The region comes from an explicit choice first, then a coarse country code from the edge, then a default; the IP itself is never read for region resolution. **Coverage is stated honestly:** where a pack is `partial`, `minimal` or `none`, a clean result is downgraded from "safe" to "unknown" and a notice explains that nothing matched *because no local rule exists* — plus the patterns to judge it yourself. If the geo guess is wrong (roaming, VPN), you can correct the region right there and re-run.

A region pack is **data, not logic** — the scoring engine is shared, only the signals change.

### Threat Radar

[`/radar`](app/radar/page.tsx) — campaigns actually circulating in the last few weeks: what the message looks like, what the tell is, and **whether we catch it yet** (`covered` / `partial` / `none` / `n/a`). Entries are promoted by hand from the weekly intel sweeps in [`docs/threat-intel/`](docs/), not auto-polled from vendor feeds, and only campaigns a person could plausibly *receive* qualify — infrastructure research stays in `docs/`. (Currently AU-authored; other regions fall back to empty.)

### Scam Calendar

[`/calendar`](app/calendar/page.tsx) — which scams spike and when: tax season from July 1, the Black Friday rush, Christmas parcel lures running into January. Each window is labelled `fixed`, `floating` or `elevated` so a soft seasonal trend never reads as a hard deadline.

Both the radar and the calendar are **strictly educational — neither touches scoring**. Seasonality raises a campaign's base rate, which is useful for a person to know and dangerous for a scorer to assume: a tax scam in March is still a scam, and a legitimate ATO email in July is still legitimate.

### Report a Scam
Seen something suspicious? Lodge a report so others can be warned. Submissions are protected against bots with rate limiting, a honeypot field, timing checks, and duplicate detection. Reports that score too low on our own detector (i.e. the content looks legit) are flagged for review rather than published.

### Learn
A [`/learn`](app/learn/page.tsx) guide covering how to spot scams, how email authentication (SPF/DKIM/DMARC) works, common tactics, what to do if you've been caught, and where to report.

### Interface language
The interface ships one neutral English voice. Internally the copy is keyed on two independent axes — **locale** (the language, `en` today) and **tone** (the register, one value today) — so language and regional voice stay separate concerns. Strings live in [`messages/`](messages/) as `en.normal.json`, the complete base bundle.

---

## Latest submissions

The [/submissions](app/submissions/page.tsx) page shows a live feed of the most recent community-reported scams. Contact emails, IP addresses, and any other structured PII are automatically stripped from descriptions before display.

The same data is available as same-origin JSON at `GET /api/reports?limit=25` (max 100).

---

## Running locally

```bash
npm install
npm run dev
```

No database setup needed for local dev — the app falls back to a local SQLite file (`local.db`) automatically.

For a persistent database (staging or production), create a free database at [turso.tech](https://turso.tech), then:

```bash
cp .env.local.example .env.local
# fill in TURSO_DATABASE_URL and TURSO_AUTH_TOKEN
```

The schema is created automatically on first run — no migration runner (small inline `ALTER`s handle older dev databases).

Open [http://localhost:3000](http://localhost:3000).

### Cross-origin access (`CORS_ALLOWED_ORIGINS`)

`/api/check` is the only route that answers cross-origin requests, and only from
origins named in `CORS_ALLOWED_ORIGINS` (comma-separated). The site's own origin
is always allowed and does not need listing.

**Leave it unset unless a non-web client exists.** Empty is the safe default and
matches the behaviour before CORS existed. The variable is where a browser
extension's origin goes once the extension is published — the id is assigned at
packaging time, so it cannot be committed ahead of time.

```bash
CORS_ALLOWED_ORIGINS=chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef
```

Two things it deliberately will not do, both in [`lib/cors.ts`](lib/cors.ts):
there is **no wildcard and no scheme-only matching** — allowing "any
`chrome-extension://`" would let every extension on a user's machine call the
API with that user's IP and rate budget — and **credentials are never allowed**,
since the API is unauthenticated and should not imply otherwise.

The write paths (`/api/report`, `/api/bug`, `/api/ocr`) stay same-origin.

### Versioning

The app version in `package.json` is bumped in the PR that makes the change.
See [`docs/versioning.md`](docs/versioning.md) — the rule is framed around what
a *user* would notice, not what would break a build, since the consumers here
are people relying on a verdict.

### Handy commands

```bash
npm test         # run the Vitest suite
npm run lint     # ESLint (Next core-web-vitals + TypeScript)
npm run seed     # seed the database with sample reports
npm run build    # production build
```

---

## Tech stack

- [Next.js 16](https://nextjs.org) (App Router) + [React 19](https://react.dev)
- TypeScript (strict) + [Tailwind CSS v4](https://tailwindcss.com)
- [Vitest](https://vitest.dev) for tests
- [libSQL / Turso](https://turso.tech) in prod, local SQLite fallback in dev
- [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js) — number parsing and line-type lookup (a static table, not a model)
- [jsQR](https://github.com/cozmo/jsQR) — client-side QR code decoding
- [Tesseract.js](https://tesseract.projectnaptha.com) — client-side OCR for screenshot uploads
- [URLhaus](https://urlhaus.abuse.ch) (abuse.ch) — live malware/phishing URL blocklist

---

## Detection logic

All scam detection is **rule-based** and runs in [`packages/engine/`](packages/engine/) — chiefly [`scamDetector.ts`](packages/engine/src/scamDetector.ts), with [`phoneIntel.ts`](packages/engine/src/phoneIntel.ts), [`emailHeaders.ts`](packages/engine/src/emailHeaders.ts), [`urlSanitizer.ts`](packages/engine/src/urlSanitizer.ts), and the per-country signal data in [`packages/engine/src/regions/`](packages/engine/src/regions/). It uses keyword lists, domain allowlists/denylists, regex patterns, and a weighted scoring system. **No models in the scoring path today** — and no user content sent anywhere for scoring. ML, NLP or LLM help is on the table wherever it can meet that same privacy bar.

The educational modules — [`threatRadar.ts`](lib/threatRadar.ts) and [`scamCalendar.ts`](lib/scamCalendar.ts) — are deliberately kept out of that path. Neither is imported by the scorer.

The only outbound calls are to fixed, trusted infrastructure — the URLhaus blocklist (abuse.ch) and HEAD requests to a whitelist of known URL-shortener hosts to expand short links. Neither involves sending the content you paste off-device for analysis.

**That promise is enforced, not just stated.** [`__tests__/privacyInvariant.test.ts`](__tests__/privacyInvariant.test.ts) runs the real engine over real scam inputs with the network intercepted and fails the build if any host from the submitted content is contacted; a lint rule bans Node's network modules from the detector entirely, covering the DNS and socket paths the test can't see. The engine takes its network transport as an argument, so with none supplied it cannot reach the network at all.

Because the logic is heuristic and transparent, it's intentionally open source — obscuring the keyword lists wouldn't stop sophisticated scammers (who already know what triggers spam filters), but it would make it harder for the community to contribute improvements.

---

## Disclaimer

This tool gives a best-effort check — it does not guarantee 100% detection of every scam, and scammers constantly change their tactics. **Never rely solely on this tool.** When in doubt: don't click, don't call back, don't share.

For authoritative reporting:
- [Scamwatch (ACCC)](https://www.scamwatch.gov.au)
- [ReportCyber (ASD)](https://www.cyber.gov.au/report)
- [IDCARE (identity theft)](https://www.idcare.org)
