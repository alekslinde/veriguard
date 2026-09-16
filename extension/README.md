# Veriguard WebExtension

Right-click a suspicious message → verdict popup. Chrome, Edge and Firefox from
one source.

*Last reviewed: 2026-09-17.*

## What it does, and what it deliberately does not

The engine is **bundled**, so scoring happens on the user's machine. The
extension makes exactly **one** network request, and it is not about the
message: it fetches the malicious-host blocklist, on a timer, with an empty body
and no query parameters. Nothing you paste, and nothing derived from it, is ever
sent anywhere.

That is not a promise in a privacy policy — it is a property of the artifact.
`__tests__/extensionBundle.test.ts` greps the built bundle and fails if a second
`fetch` appears, if the one call gains a query string or a body, or if any other
network primitive turns up at all. The manifest's `connect-src` names a single
origin, so the browser enforces the same bound.

Consequences worth understanding before changing anything here:

- **Shortened links are not followed.** `analyzeContent` takes its transport as
  an argument and this call site passes none, so expansion cannot run. The
  engine emits `UNEXPANDED_SHORTENER_NOTE` and the popup shows a notice saying
  the destination is unchecked. Following the link from the user's browser
  would disclose their IP to the scammer's shortener — the reason expansion is
  server-side everywhere else.
- **The blocklist is fetched as a whole list, never queried per host.**
  `/api/blocklist` has no `?host=` parameter by design: answering "is this host
  malicious" would turn a cached static payload into an oracle that records
  which hosts a user is checking, which is exactly what running the engine
  locally avoids producing.
- **A check never waits on that fetch.** Whatever is cached is used
  immediately; a refresh runs in the background for the *next* check. A cold
  start, or an offline client, scores without the list — which can only lower a
  score, never invent one. The popup says so on an otherwise-clean verdict.
- **No host permissions, no content scripts.** Nothing reads the page. The
  context menu hands over the text the user selected, and that is the entire
  input path.

### About the hashing

The blocklist is served as truncated SHA-256 rather than hostnames. **This is
obfuscation, not confidentiality, and nothing in the system may assume
otherwise.** Hostnames are low-entropy and enumerable: anyone with a domain
wordlist can hash candidates offline and recover most of the list, and abuse.ch
publishes the same data openly anyway. What it buys is narrower — the response
is not a turnkey list of live malware hosts served under our name — and both
`hostHash.ts` and the route carry the same note so neither reads as a stronger
claim than it is.

## Build

```bash
npm run ext          # both targets
npm run ext:chrome   # → extension/dist/chrome
npm run ext:firefox  # → extension/dist/firefox
```

Output is unminified, deliberately: AMO reviews source, and the extension's
claim is that you can read the bundle and confirm it makes no network call.

Load unpacked from `extension/dist/<target>`. `dist/` is generated and
gitignored.

| Variable | Default | Purpose |
|---|---|---|
| `TARGET` | `chrome` | `chrome` or `firefox` — selects the manifest variant |
| `GECKO_ID` | `veriguard@veriguard.app` | Firefox add-on id; must stay stable across uploads or the add-on becomes a different add-on |
| `API_BASE` | `https://veriguard.app` | Origin the blocklist is fetched from. Inlined into the bundle *and* into the manifest's `connect-src`, so the two cannot disagree |

## Layout

| File | Role |
|---|---|
| `src/manifest.ts` | Both manifest variants from one definition |
| `src/browser.ts` | The whole cross-browser compatibility layer — promisified `chrome.*`/`browser.*` |
| `src/background.ts` | Context-menu registration; stashes the selection |
| `src/popup.ts` | Popup controller and rendering |
| `src/check.ts` | Engine bridge — verdict collapse, coverage, shortener honesty |
| `src/blocklist.ts` | The one network call: fetch, cache, back off, degrade |
| `src/copy.ts` | Reader-facing strings, kept in sync with `messages/` by test |

## Things to know before editing

- **Rendering uses `textContent` and `createElement`, never `innerHTML`.** The
  content being rendered is a scam message the user pasted, and engine signal
  text that quotes it. A test fails if a markup-execution sink reaches the
  bundle.
- **Verdict collapse comes from `@veriguard/engine/verdictRank`,** shared with
  the website, so the two surfaces cannot disagree about which identifier wins.
- **Verdict copy is duplicated from `messages/en.normal.json`** and pinned by a
  test — the i18n bundle carries every string on every page, which is not worth
  shipping to style one panel.
- **The popup must keep saying what it could not do.** The coverage and
  shortener notices are not decoration; a quiet verdict from a less-capable
  surface reads as a clean one unless it says otherwise.

## Not built yet

OCR (client-side WASM), toolbar badging after a right-click, and icons — the
manifest references `icons/icon-{16,48,128}.png` and the build warns when they
are absent.

Before publishing, the packaged extension's origin has to go in
`CORS_ALLOWED_ORIGINS` (empty by default, no wildcards) — the id is not knowable
until the extension is signed.
