# Veriguard WebExtension

Right-click a suspicious message → verdict popup. Chrome, Edge, Firefox and
Safari from one source.

| Browser | Build | Status |
|---|---|---|
| Chrome | `npm run ext:chrome` | Loads unpacked from `dist/chrome` |
| Edge | `npm run ext:chrome` | **Same build as Chrome** — Chromium, MV3, no Chrome-only APIs and no Firefox-only manifest keys. A test asserts that stays true |
| Firefox | `npm run ext:firefox` | `dist/firefox`; differs only in the background form and the gecko id |
| Safari | `npm run ext:safari` | Wraps `dist/chrome` in an Xcode project. Builds; needs a signing identity to run |

*Last reviewed: 2026-09-17.*

## What it does, and what it deliberately does not

The engine is **bundled**, so scoring happens on the user's machine. The
extension has exactly **one** network call site, and it is not about the
message: it fetches the malicious-host blocklist, with an empty body and no
query parameters. Nothing you paste, and nothing derived from it, is ever sent
anywhere.

One *call site*, not one request per install — that request repeats on a timer
as the cached list expires, and it is identical every time. What the claim rules
out is a second thing being sent, or this one carrying anything about you: the
request is a plain GET of a static path, so every client asks the same question
and the server learns only that someone asked.

That is not a promise in a privacy policy — it is a property of the artifact.
`__tests__/extensionBundle.test.ts` greps the built bundle and fails if a second
`fetch` appears, if the one call gains a query string or a body, or if any other
network primitive turns up at all. The manifest's `connect-src` names a single
origin, so the browser enforces the same bound. The test needs a build to check
anything — it skips, visibly, when `dist/` is absent, so run `npm run ext`
before trusting a green run.

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
  score, never invent one. The popup says so on an otherwise-clean verdict, and
  a copy older than the lifetime the server stated counts as *not consulted* for
  that notice: it is still used, but a host added to the feed since it was taken
  is one the check could not have caught.
- **The evidence rows add up to the score above them.** The verdict is the worst
  identifier's; the number is the sum of the rows shown, capped at 100 with a
  clamp row when the cap bites. Both come from
  `@veriguard/engine/verdictRank`, shared with the website — composing either
  half separately is what breaks the invariant, and it has broken before.
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
npm run icons        # generate the icon set (first time, and after the mark changes)
npm run ext          # chrome + firefox
npm run ext:chrome   # → extension/dist/chrome
npm run ext:firefox  # → extension/dist/firefox
npm run ext:safari   # → extension/safari (Xcode project; needs Xcode)
```

Run `npm run icons` before the first build. The icons are generated from
`app/icon.svg` rather than committed, so a fresh clone has none — Chrome and
Firefox warn and render a placeholder, but **the Safari build fails outright**,
because the generated Xcode project references an app icon it does not create.

Output is unminified, deliberately: AMO reviews source, and the extension's
claim is that you can read the bundle and confirm it makes no network call.

Load unpacked from `extension/dist/<target>`. `dist/` is generated and
gitignored.

| Variable | Default | Purpose |
|---|---|---|
| `TARGET` | `chrome` | `chrome` or `firefox` — selects the manifest variant |
| `GECKO_ID` | `veriguard@veriguard.app` | Firefox add-on id; must stay stable across uploads or the add-on becomes a different add-on |
| `API_BASE` | `https://veriguard.app` | Origin the blocklist is fetched from. Inlined into the bundle *and* into the manifest's `connect-src`, so the two cannot disagree |

## Safari

Safari runs the same source, but cannot load an unpacked directory: it needs a
native app wrapper. `npm run ext:safari` builds the Chrome target and runs
Xcode's `safari-web-extension-converter` over it, producing an Xcode project at
`extension/safari` — generated output, regenerated on demand, gitignored.

Running it locally needs three things: a signing team set on both targets, a
build, and Safari configured to load unsigned extensions — the last is a
developer setting that resets on restart, so it is re-enabled per session rather
than once. Distribution goes through the App Store and needs a paid Apple
Developer account.

Two things about Safari shaped the build for **every** target, and both fail
silently rather than loudly:

- **No `"type": "module"` on a background service worker.** Safari drops the key
  with a warning; the worker then fails to load its first import, so the context
  menu never registers and nothing appears in any log. The build therefore emits
  each entry as a self-contained classic script — two Rollup passes rather than
  one with two inputs, since Rollup hoists code shared between entries into a
  chunk they import. Tests assert both halves.
- **The bundle identifier is the app's full id, ending in the app name.** The
  converter derives the extension's id from it, and Xcode requires the
  extension's to nest inside the app's. `app.veriguard` and
  `app.veriguard.extension` both produce a non-nested pair and fail the build;
  `app.veriguard.Veriguard` is correct. `scripts/build-safari.mjs` has the
  table.

## Layout

| File | Role |
|---|---|
| `src/manifest.ts` | Both manifest variants from one definition |
| `src/browser.ts` | The whole cross-browser compatibility layer — promisified `chrome.*`/`browser.*`, with a timeout so a runtime that never answers cannot hang startup |
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
- **Verdict collapse *and* evidence composition come from
  `@veriguard/engine/verdictRank`,** shared with the website, so the two
  surfaces cannot disagree about which identifier wins or about what the rows
  under the score add up to. `check.ts` returns the composed `signals`; the
  popup renders them as given. Re-deriving them from `results` is the specific
  mistake to avoid.
- **Verdict copy is duplicated from `messages/en.normal.json`** and pinned by a
  test — the i18n bundle carries every string on every page, which is not worth
  shipping to style one panel.
- **The background script runs many times, not once.** An idle worker is torn
  down and the module re-evaluated on the next event, so everything at top level
  must be idempotent. The click listener is registered *before* the menu is
  created, deliberately: a duplicate id throws on one runtime and logs on the
  other, and a throw during module evaluation would abort the file before the
  listener binds — leaving a menu item that silently does nothing.
- **The popup must keep saying what it could not do.** The coverage, shortener
  and blocklist notices are not decoration; a quiet verdict from a less-capable
  surface reads as a clean one unless it says otherwise.

## Not built yet

OCR (client-side WASM), toolbar badging after a right-click, and icons — the
manifest references `icons/icon-{16,48,128}.png` and the build warns when they
are absent.

Before publishing, the packaged extension's origin has to go in
`CORS_ALLOWED_ORIGINS` (empty by default, no wildcards) — the id is not knowable
until the extension is signed.
