# Store listing copy

Text to paste into the Chrome Web Store, Firefox AMO and App Store Connect
dashboards. Kept here because a listing is the one piece of user-facing writing
with no home in the codebase, and rewriting it from memory each submission is
how two stores end up describing the same extension differently.

**Every factual claim below is enforced by a test.** If one of these sentences
stops being true, `__tests__/extensionBundle.test.ts` fails before the listing
does. Do not add a claim here that nothing checks.

Privacy policy URL, required by all three stores:
`https://veriguard.app/about#extension`

---

## Name

```
Veriguard — scam check
```

Chrome allows 75 characters, AMO 50. This fits both.

---

## Summary / short description

Chrome calls this the "short description" (132 char limit). AMO calls it the
"summary" (250). One sentence works for both:

```
Check a suspicious message, link, email or number for scam signals. Runs entirely on your device — nothing is sent anywhere.
```

124 characters. Identical to the manifest's `description`, deliberately: the
browser shows that string in the extensions list, and a listing that describes
the extension differently from the extension itself is a discrepancy a reviewer
will notice. A test pins the two together, so changing one means changing both.

It names no entry point, which is also deliberate. The right-click menu is the
desktop way in and the obvious thing to lead with, but no mobile surface has
one — Firefox for Android implements no `menus` API, and the Safari build is
macOS-only for the same reason. Copy built on "right-click" would be wrong the
moment a mobile target ships, and this string is the hardest one to change,
since it appears in the manifest, in three dashboards, and in the browser's own
extensions list.

---

## Full description

For Chrome's "Detailed description" and AMO's "About this extension".

```
Paste a suspicious text, link, email or phone number — or, on desktop, select it on any page and right-click — and get an instant verdict explaining what's wrong with it.

HOW IT'S DIFFERENT

The detection engine is built into the extension. Your message is scored on your own machine, by rules you can read, and it never travels anywhere. Turn off your internet connection and it still works.

That's unusual enough to be worth stating precisely: the extension makes exactly one network request, and it isn't about you. It downloads a list of known malicious websites on a timer so it can recognise them offline. The request carries no query and no body — every copy asks for the same list the same way. There is deliberately no "is this site dangerous?" lookup, because answering that would mean telling us which sites you're checking.

WHAT IT CHECKS

· Links — lookalike domains, suspicious top-level domains, tracking parameters, known malicious hosts
· Messages — urgency and threat patterns, payment demands, impersonation of banks and government services
· Senders — mismatched reply-to addresses, failed authentication
· Phone numbers — number ranges and formats used by scam operations

Every verdict shows its working: the rules that fired, what each one contributed, and a score that adds up to the number shown. You can check our arithmetic.

WHAT IT WON'T DO

It won't follow shortened links. Resolving one would tell the scammer's link shortener your IP address, so it says the destination is unchecked instead of quietly guessing.

It won't pretend a quiet result is a clean one. If detection for your region is limited, or a check couldn't run, the verdict says so.

It won't ask to read the pages you visit. No host permissions, no content scripts. The only text it sees is text you give it.

PERMISSIONS

Two, both minimal:
· contextMenus — adds the right-click entry (desktop; Firefox for Android has no extension context menu, so there the toolbar button is the way in)
· storage — remembers your region and caches the malicious-site list

REPORTING

On a suspicious verdict you can report the scam to the public database. The extension opens the report form on veriguard.app with the link or number filled in — it never submits anything itself. You review it and send it.

OPEN SOURCE

The detection rules are public, because obscuring a keyword list wouldn't stop a sophisticated scammer — it would only stop you checking our work. The extension ships unminified so you can read what you installed.

github.com/alekslinde/veriguard

Australian-focused, with rule packs for the UK, US, Canada, Ireland and New Zealand.
```

---

## Category

- **Chrome:** Productivity (no security/privacy category; Productivity is where
  comparable tools sit)
- **AMO:** Privacy & Security
- **Safari:** Utilities

Platforms, since two of these differ from what a store's default assumes:

- **Chrome, Edge, Firefox desktop, Safari** — the full experience, both entry
  points.
- **Firefox for Android** (142+) — popup only; that runtime implements no
  `menus` API. Declared by `gecko_android` in the manifest.
- **iOS Safari** — not shipped. The Safari build is `--macos-only`, because the
  interaction model differs and it cannot be tested from this repo. Turning it
  on is a product decision, not a build flag.

---

## Chrome Web Store: single purpose

Chrome requires one narrow purpose, and rejects a description that reads as a
bundle of features. The dashboard field sits above the permission
justifications below.

```
Veriguard checks text the user gives it — a message, link, email address or phone number — against a built-in set of scam-detection rules, and shows a verdict with the rules that matched and what each contributed to the score. That is the extension's only function. Text reaches it two ways, both user-initiated: pasted into the popup, or selected on a page and sent via the right-click menu. Scoring happens on the user's device.
```

Chrome is a desktop target, so the right-click sentence is accurate there and
worth keeping — it is the second entry point, and omitting it would make the
`contextMenus` justification below read as unexplained.

---

## Chrome Web Store: permission justifications

Chrome requires a written justification per permission, and rejects vague ones.
These are the answers to give.

**contextMenus**
```
Adds a single right-click menu item, "Check this with Veriguard", shown only when text is selected. It is the extension's primary entry point: it passes the selected text to the popup to be checked.
```

**storage**
```
Stores two things locally: the user's chosen region, so it persists between sessions, and a cached copy of a public malicious-host list so checks work offline. Neither is transmitted. No checked content, and no history of what was checked, is ever stored.
```

**Remote code**
```
No. All code is contained in the package. The single network request retrieves a JSON list of hostname hashes, which is data, never executed.
```

**Data usage disclosures** — tick nothing. The extension collects no personally
identifiable information, health, financial, authentication, personal
communications, location, web history or user activity. The single request
carries no query and no body, so nothing about the user is transmitted.

---

## AMO: data collection declaration

Firefox takes this disclosure in the **manifest** rather than a dashboard form,
and AMO rejects a new add-on that omits it:

> The "/browser_specific_settings/gecko/data_collection_permissions" property is
> required for all new Firefox extensions.

The build emits it, so there is nothing to fill in at submission time:

```json
"data_collection_permissions": { "required": ["none"] }
```

`none` means the add-on collects and transmits no data. It is exclusive by
specification — it cannot be listed alongside any other data type — so it is the
whole declaration, and it matches what the Chrome form above says by ticking
nothing.

Two consequences worth knowing before changing it. An add-on that has used these
keys must keep using them in every later version. And because `none` is
exclusive, starting to collect anything means *removing* `none`, which makes
Firefox prompt every existing user for data consent on update.

The key also sets the minimum versions: it arrived in Firefox 140 on desktop and
142 on Android, and AMO warns per key when `strict_min_version` predates the keys
declared alongside it. Hence `gecko.strict_min_version: "140.0"` and
`gecko_android.strict_min_version: "142.0"`. This costs no real users — ESR 115
went end-of-life in March 2026, so everything still receiving security updates is
past both floors.

Verify a build against AMO's own linter before submitting, which catches this
class of thing without spending a review cycle:

```bash
npm run ext:lint
```

---

## AMO: notes for reviewers

AMO reviews source, so tell them how to verify the central claim quickly.

```
The extension is unminified by design so it can be read directly.

Build: `npm run ext:firefox` (Node 22+, `npm ci` first) → extension/dist/firefox

The submitted archive is produced by `npm run ext:pack`, which zips that directory from inside it, so manifest.json is at the archive root and no editor or filesystem metadata is included. The extension is desktop-first: on Firefox for Android there is no menus API, so the toolbar popup is the only entry point and the context-menu code is skipped rather than failing.

The privacy claim is that the extension makes exactly one network request — a GET of /api/blocklist with no query string and no body — and that no checked content is ever transmitted. It is enforced by tests that grep the built bundle: see __tests__/extensionBundle.test.ts, which fails if a second fetch appears, if the one call gains a query or body, or if any other network primitive (XMLHttpRequest, sendBeacon, WebSocket, EventSource) reaches the bundle.

The manifest's content_security_policy restricts connect-src to one origin, so the browser enforces the same bound independently.

Rendering uses textContent and createElement throughout, never innerHTML. A test fails if a markup-execution sink reaches the bundle — the content rendered is a scam message the user pasted, so this is treated as hostile input.

Source: github.com/alekslinde/veriguard
```

---

## Screenshots

Chrome wants 1280×800 or 640×400; AMO accepts any size. Four, in this order —
the sequence is the argument, so keep it:

1. **A scam SMS, verdict likely_scam, evidence rows visible.** The core value,
   and the rows showing their weights are what distinguishes this from a
   black-box checker.
2. **The right-click menu on selected text.** The desktop entry point; not
   obvious from the popup alone. Shoot it on a desktop build — it does not
   exist on Firefox for Android, and a screenshot of a menu the viewer's
   browser cannot produce is worse than one fewer screenshot.
3. **A limited-coverage or unchecked-shortener notice.** Shows the extension
   admitting a gap. This is the honesty the listing claims, made visible.
4. **A clean verdict.** Demonstrates it is not a scaremonger, and that "looks
   good" still carries a caveat about new scams.

Do not screenshot a real person's message. Use the samples in the test suite.
