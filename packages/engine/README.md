# `@veriguard/scam-detect`

Rule-based scam, phishing and impersonation detection. Runs offline: no API key,
no model, no external service — you install it and call a function.

Extracted from the Veriguard app so it can be bundled into clients that are not
the Next.js app: the WebExtension first, then anything else that needs to score
a message without sending it anywhere.

*Last reviewed: 2026-09-26.*

```bash
npm install @veriguard/scam-detect
```

```ts
import { checkUrl, analyzeContent } from "@veriguard/scam-detect";

const result = await checkUrl("https://commbank-secure-login.tk/verify");
// → verdict "likely_scam", score 85, flags explaining why

// Or hand it arbitrary text and get one result per identifier found:
const results = await analyzeContent("Your parcel is held: pay at auspost-redelivery.bond");
```

Every check is synchronous work behind an async signature, deterministic, and
free of I/O unless you hand it a transport yourself — see below.

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
  scamDetector.ts     ← the scorer and the public check* / analyzeContent API
  detectType.ts       ← input classification
  engineTypes.ts      ← shared value types (breaks the scorer ↔ detectType cycle)
  urlSanitizer.ts     ← defanging, refanging, tracking-param stripping
  emailHeaders.ts     ← header parsing and SPF/DKIM/DMARC summarising
  phoneIntel.ts       ← number intelligence (the one external dep)
  urlExpander.ts      ← shortener resolution, transport injected
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

The workspace and a consumer resolve this package differently, on purpose:

| Condition | Resolves to | Who gets it |
|---|---|---|
| `development` | `src/*.ts` | The app, the extension, vitest, tsc |
| `default` | `dist/*.js` | Anyone who installs it |

Vite and Vitest apply `development` by default in dev, so there is still no
build step between an edit and a test run. The cost is that **a green
`npm test` says nothing about the published artifact** — the suite loads source
and never touches `dist/`. `__tests__/enginePublish.test.ts` is what checks the
built form, and it skips (visibly) when `dist/` is absent, so run the build
before trusting a green run on anything under `packages/engine`.

This is deliberately not `publishConfig.exports`, which reads as the obvious
tool for the job. npm only applies that from v11; under npm 10 it is ignored
silently and the tarball ships an `exports` map pointing at `src/`, which
`files` excludes — an install that resolves to nothing. A condition map is
applied by the resolver rather than the publisher, so it does not depend on
which npm the publisher happened to run.

Two properties of the build are load-bearing and easy to undo:

- **Every source file is an entry.** `bundle: false` splits per entry, not per
  module, so a file reached only as an import emits a `.d.ts` and no `.js` —
  it type-checks for a consumer and has nothing behind it at runtime.
- **Relative imports are rewritten to carry `.js`.** The source writes them
  extensionless, which is correct in-repo and fatal in a consumer's Node
  process. A directory import resolves to `/index.js`, not `.js`, so the
  rewrite consults what was actually emitted rather than guessing.

Publication runs from CI with provenance, so the tarball carries a verifiable
link back to the commit and workflow that built it.
