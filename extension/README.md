# Veriguard WebExtension

Right-click a suspicious message → verdict popup. Chrome, Edge and Firefox from
one source.

*Last reviewed: 2026-09-17.*

## What it does, and what it deliberately does not

The engine is **bundled**, so a text check runs on the user's machine and makes
no network request at all. That is not a promise in a privacy policy — it is a
property of the artifact, asserted by `__tests__/extensionBundle.test.ts`, which
greps the built bundle for every network primitive and fails if one appears.

Consequences worth understanding before changing anything here:

- **Shortened links are not followed.** `analyzeContent` takes its transport as
  an argument and this call site passes none, so expansion cannot run. The
  engine emits `UNEXPANDED_SHORTENER_NOTE` and the popup shows a notice saying
  the destination is unchecked. Following the link from the user's browser
  would disclose their IP to the scammer's shortener — the reason expansion is
  server-side everywhere else.
- **The URLhaus blocklist is not consulted.** It is fetched app-side and the
  bundled engine has no way to reach it. A client verdict can therefore be
  *lower* than the site's for the same input, never higher. Closing this gap is
  the next piece of work — a hashed, CORS-allowlisted read endpoint.
- **No host permissions, no content scripts.** Nothing reads the page. The
  context menu hands over the text the user selected, and that is the entire
  input path.

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

## Layout

| File | Role |
|---|---|
| `src/manifest.ts` | Both manifest variants from one definition |
| `src/browser.ts` | The whole cross-browser compatibility layer — promisified `chrome.*`/`browser.*` |
| `src/background.ts` | Context-menu registration; stashes the selection |
| `src/popup.ts` | Popup controller and rendering |
| `src/check.ts` | Engine bridge — verdict collapse, coverage, shortener honesty |
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

OCR (client-side WASM), the blocklist endpoint, toolbar badging after a
right-click, and icons — the manifest references `icons/icon-{16,48,128}.png`
and the build warns when they are absent.
