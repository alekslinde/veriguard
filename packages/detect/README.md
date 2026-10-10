# `@veriguard/detect`

Rule-based scam, phishing and impersonation detection. Runs offline: no API key,
no model, no external service — you install it and call a function.

Extracted from the Veriguard app so it can be bundled into clients that are not
the Next.js app: the WebExtension first, then anything else that needs to score
a message without sending it anywhere.

Documentation: [veriguard.app/packages](https://veriguard.app/packages).

*Last reviewed: 2026-10-11.*

```bash
npm install @veriguard/detect
```

```ts
import { checkUrl, analyzeContent } from "@veriguard/detect";

const result = checkUrl("https://commbank-secure-login.tk/verify");
// → verdict "likely_scam", score 85, flags explaining why

// Or hand it arbitrary text and get one result per identifier found:
const results = await analyzeContent("Your parcel is held: pay at auspost-redelivery.bond");
```

`checkUrl`, `checkSms`, `checkEmail`, `checkPhone` and `checkCustom` are
**synchronous** — they return a result, not a promise. `analyzeContent` is the
one async entry point, because it may expand a shortened link if you hand it a
transport.

Every check is deterministic and free of I/O unless you supply that transport
yourself — see below.

## Reading a result

`verdict` is one of `safe`, `suspicious`, `likely_scam`, `unknown`; `score` is
0–100. The part worth using is `signals`: each carries the sentence a reader
sees and the points it contributed, so a verdict can explain itself rather than
asserting a number. `flags` is the same reasons as plain strings.

**`coverage` is not optional to handle.** It reports how much of the region pack
applied, and a low score under `partial`, `minimal` or `none` means "no rules
matched", not "this is safe". Rendering a confident *safe* on a result whose
coverage is not `full` is the one misuse of this package that produces a false
reassurance, which is worse than no answer. `downgradeForCoverage` is applied
inside the engine; consumers still need to present the distinction.

## What makes it portable

Two invariants, both asserted by tests rather than left to convention:

- **No framework imports.** Nothing in the closure imports `next` or anything
  under `next/`. Guarded by `__tests__/engineDependencies.test.ts`.
- **No ambient network access.** The engine never reaches for a global `fetch`.
  Network capability is injected by the caller, so a client that supplies
  nothing gets an engine that cannot make a request. Guarded behaviourally by
  `__tests__/privacyInvariant.test.ts` and at lint level by
  `__tests__/engineNetworkImports.test.ts`.

The second is the one that matters most, and the reason is privacy rather than
tidiness. `urlExpander` issues a HEAD request to a shortener to resolve a link.
Server-side that request comes from our infrastructure. The identical code
bundled into a browser extension would issue it from the user's browser, so the
shortener would learn the home IP of someone who found a link suspicious enough
to check. Making transport an argument forces every client to decide
deliberately: the web app passes `fetch`, and a bundled client either routes
expansion through the API or ships without it.

## Two modules a bundled client must think about

| Module | Why it needs a decision |
|---|---|
| `urlExpander` | Needs a transport. A bundled client must route through the API or go without — see above. |
| `urlhausBlocklist` | **Not in this package.** It fetches a remote blocklist, so it stays app-side. `checkUrl` and friends take the blocklist as an argument; a client that has none passes an empty set and gets a verdict computed without it. |

`urlhausBlocklist` staying out is deliberate. Bundling it would put a network
call inside a package whose whole claim is that it makes none. The cost is that
a bundled verdict and a server verdict can differ, which is a real product
question — recorded in the roadmap rather than settled here.

## Layout

```
src/
  index.ts            ← the barrel: the front door for a new consumer
  scamDetector.ts     ← the scorer and the public check* / analyzeContent API
  detectType.ts       ← input classification
  engineTypes.ts      ← shared value types (breaks the scorer ↔ detectType cycle)
  urlSanitizer.ts     ← defanging, refanging, tracking-param stripping
  emailHeaders.ts     ← header parsing and SPF/DKIM/DMARC summarising
  phoneIntel.ts       ← number intelligence (the one external dep)
  urlExpander.ts      ← shortener resolution, transport injected
  publicSuffix.ts     ← registrable-domain lookup, the hinge of the typosquat rule
  publicSuffixList.ts ← generated data (`npm run psl`); never edited by hand
  keyboardAdjacency.ts ← keyboard-adjacency typosquat detection (region-free)
  languageGuess.ts    ← "does this read as English", fed to the coverage downgrade
  stemGuess.ts        ← minimal English stemmer, mentions()'s suffix-match fallback
  hostHash.ts         ← the hostname-hashing scheme the blocklist endpoint shares with its clients
  verdictRank.ts      ← verdict severity ordering, and the worst-wins collapse
  regions/            ← per-country signal packs (data, never logic)
```

Region packs are **data**: keyword lists, allowlists, copy. The scoring logic is
shared across every region and lives in `scamDetector.ts`. Anything universal
belongs in `regions/base.ts` so a new region inherits it for free.

## Dependencies

One: `libphonenumber-js`. Keeping it that way is a feature — every dependency
here ships in every client.

## Building and publishing

```bash
npm run build:engine   # from the repo root; tsup for JS, tsc for declarations
```

`exports` points at `src/*.ts`, and stays that way in the repo: the app, the
extension and the test suite all resolve this package through the workspace
symlink, so there is no build step between an edit and a test run. `prepack`
rewrites the map to `dist/*.js` for the tarball and `postpack` puts it back.

That rewrite is a script rather than a declaration because no declarative
spelling works. `publishConfig.exports` is ignored by both npm 10 and npm 11
(verified by packing with each and reading `package.json` back out of the
tarball), so the published map would still point at `src/`, which `files`
excludes — an install resolving to nothing. A `development` condition fails
differently and worse: it splits per *tool*, not per audience, so `vitest` takes
the source branch while `vite build` and `next build` take `dist/` and fail on a
fresh clone — or, with a stale `dist/` present, quietly score using detection
rules that do not match the source being edited.

The cost of resolving to source is that **a green `npm test` says nothing about
the published artifact**. `__tests__/enginePublish.test.ts` is what checks the
built form; it skips (visibly) when `dist/` is absent, and CI builds the engine
so it actually runs.

Two properties of the build are load-bearing and easy to undo:

- **Every source file is an entry.** `bundle: false` splits per entry, not per
  module, so a file reached only as an import emits a `.d.ts` and no `.js` —
  it type-checks for a consumer and has nothing behind it at runtime.
- **Relative imports are rewritten to carry `.js`, in both `.js` and `.d.ts`.**
  The source writes them extensionless, which is correct in-repo, fatal in a
  consumer's Node process, and a wall of TS2835 for a consumer on
  `moduleResolution: "nodenext"`. Declarations need the rewrite as much as
  runtime code and are easy to forget, since they are emitted by a later step
  than the one that rewrites. A directory import resolves to `/index.js`, not
  `.js`, so the rewrite consults what was actually emitted rather than guessing.

Publication runs from CI with provenance, so the tarball carries a verifiable
link back to the commit and workflow that built it.

## Licence

Apache-2.0. Copyright 2026 Aleksandr Linde. `src/publicSuffixList.ts` is generated
from the [Public Suffix List](https://publicsuffix.org/) and stays under its
MPL-2.0 licence; see [`NOTICE`](NOTICE). The rest of the Veriguard repository is
licensed differently; see the repository README.
