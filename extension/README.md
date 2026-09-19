# Veriguard WebExtension

Right-click a suspicious message → verdict popup. Chrome, Edge, Firefox and
Safari from one source.

| Browser | Build | Status |
|---|---|---|
| Chrome | `npm run ext:chrome` | Loads unpacked from `dist/chrome` |
| Edge | `npm run ext:chrome` | **Same build as Chrome** — Chromium, MV3, no Chrome-only APIs and no Firefox-only manifest keys. A test asserts that stays true |
| Firefox | `npm run ext:firefox` | `dist/firefox`; differs only in the background form and the `browser_specific_settings` block (gecko id, data declaration, version floors). Desktop 140+, Android 142+ — on Android the toolbar popup is the only entry point, as that runtime has no `menus` API |
| Safari | `npm run ext:safari` | Wraps `dist/chrome` in an Xcode project. Builds; needs a signing identity to run |

*Last reviewed: 2026-09-18.*

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

The Firefox manifest states the same thing in the form AMO reads:
`data_collection_permissions: { required: ["none"] }` — no data collected or
transmitted. That value is exclusive, so it cannot quietly gain an exception:
collecting anything would mean removing it, and Firefox would prompt every
existing user for consent on update.

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
- **Reporting is a hand-off, not a submission.** On a `suspicious` or
  `likely_scam` verdict the popup offers a report button, and it opens
  `/report` on the site with the identifiers prefilled — it never POSTs. A
  submission from here would be a second network call carrying the user's
  content, which is the one thing this surface promises not to do, so the user
  reviews and sends from a page they can see, on our origin, where the honeypot,
  form token and rate limit already are. The link carries only identifiers (the
  scam link, number or address); the pasted message never travels in it, because
  that is the field most likely to hold the reporter's own details. The query is
  built with `lib/reportPrefill.ts` — the same module the form parses it with,
  imported rather than copied, so the two cannot disagree about a parameter.
  Opening a tab needs no permission; `tabs` would only be required to *read*
  tab URLs, which nothing here does.

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
npm run ext:pack     # build both, then zip for submission
npm run ext:lint     # check the Firefox build against AMO's own validator
```

`ext:lint` runs `web-ext lint`, the same validator AMO runs on upload, so a
manifest problem surfaces in seconds rather than after a submission is rejected.
It is kept out of `ext:pack` on purpose: it fetches `web-ext` on demand, and the
build otherwise needs no network at all.

## Packaging for the stores

`npm run ext:pack` writes `dist/chrome.zip` and `dist/firefox.zip`. **Use it
rather than zipping `dist/` yourself** — compressing the folder in Finder or
with plain `zip -r` produces an archive both stores reject, for two reasons at
once:

- The archive nests everything under `chrome/` or `firefox/`, so `manifest.json`
  is not at the root. AMO rejects this with *"No manifest.json was found at the
  root of the extension."*
- macOS writes AppleDouble sidecars (`__MACOSX/._*`) carrying extended
  attributes from the machine that built it. AMO flags each one as a hidden file
  that can disclose information about that machine.

The script zips from inside the target directory, from an explicit file list
that excludes dotfiles, then re-reads the finished archive and fails if a hidden
entry or a misplaced manifest survived.

The root `Icon.png` is left out of both zips — it belongs to the Safari wrapper,
which reads it from `dist/chrome/` as a directory, and no manifest references
it. **`icons/icon-{16,48,128}.png` are not in that category**: `manifest.json`
names all three, so dropping them fails upload validation. The script re-reads
the packaged manifest and fails on any path it references that the archive does
not contain.

The store-listing icon, screenshots and promo tiles are a third thing again.
They live in each store's dashboard, are never read from the package, and are
always uploaded by hand — a build change cannot affect them.

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

## Reproducing the submitted bundle

AMO requires source whenever a build step generates what ships, which Vite does
here. These are the instructions that accompany a source submission — written
for a reviewer with the repository and nothing else.

**Environment.** Node 22 or newer and the bundled npm; no other tooling, no
global installs, no network access beyond the registry. Every build tool is an
open-source dev dependency in `package-lock.json`. Any OS — nothing here is
platform-specific, though `npm run ext:safari` additionally needs macOS and
Xcode and is not part of a Firefox submission.

```bash
npm ci                  # exact versions from package-lock.json
npm run ext:firefox     # → extension/dist/firefox
```

`dist/firefox` is then byte-for-byte what was uploaded. No environment variables
need setting: the defaults in the table above are the shipped values, and they
are baked in at build time rather than read at runtime.

**The build is reproducible, and that is worth verifying rather than trusting.**
Two builds from a clean clone produce identical output:

```bash
shasum -a 256 extension/dist/firefox/*.js extension/dist/firefox/manifest.json
```

Output is deliberately unminified, so the shipped files can be read directly
and diffed against these sources without a source map.

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
| `package.json` | Three keys, one of them load-bearing: `"type": "module"` marks this directory as ESM. Not a workspace member (`workspaces` is `packages/*`) and nothing installs from it — deleting it makes the build warn and, once Vite's native config loader becomes the default, fail |
| `src/manifest.ts` | Both manifest variants from one definition |
| `src/browser.ts` | The whole cross-browser compatibility layer — promisified `chrome.*`/`browser.*`, with a timeout so a runtime that never answers cannot hang startup |
| `src/background.ts` | Context-menu registration; stashes the selection |
| `src/popup.ts` | Popup controller and rendering |
| `src/check.ts` | Engine bridge — verdict collapse, coverage, shortener honesty |
| `src/blocklist.ts` | The one network call: fetch, cache, back off, degrade |
| `src/report.ts` | Report hand-off — which verdicts offer it, what the link carries, what it deliberately does not |
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
