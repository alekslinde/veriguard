// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// Build for publication.
//
// The workspace consumes this package as raw TypeScript — the app, the
// extension and the test suite resolve `./src/*.ts` through the `development`
// condition in the exports map, with no build step between an edit and a test
// run. That stays true; this config exists solely for what strangers install,
// which the `default` condition points at.
//
// Consequence worth knowing: `npm test` green does NOT mean the published
// artifact works, because the tests load source, never dist/.
// `__tests__/enginePublish.test.ts` is the one that checks the built form, and
// it needs a build to check anything.

import { defineConfig } from "tsup";
import { readdirSync } from "node:fs";
import { sep } from "node:path";

/**
 * Every source file is an entry.
 *
 * `bundle: false` splits per *entry*, not per module in the graph — a file
 * reached only as an import of an entry is type-checked, emits a `.d.ts`, and
 * produces no JavaScript at all. The build still reports success.
 *
 * Listing only the exported subpaths hit that twice: the region packs emitted
 * 30 declarations and one `.js`, so every `/regions/au` import would have
 * resolved to a type that existed and a runtime file that did not; and the
 * public-suffix data module, which no subpath exports but `publicSuffix.ts`
 * imports, vanished the same way.
 *
 * Globbing the tree removes the category rather than the two instances. It also
 * keeps the emitted layout a mirror of `src/`, which is what lets the relative
 * specifiers rewritten in `onSuccess` resolve at all.
 */
const entry = readdirSync(new URL("src", import.meta.url), {
  recursive: true,
  encoding: "utf8",
})
  .map((f) => f.split(sep).join("/"))
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
  .map((f) => `src/${f}`);

// A silent empty glob would publish an empty package that passes every check
// here, so the build refuses rather than emitting nothing.
if (entry.length < 10) {
  throw new Error(`expected the engine source tree, found ${entry.length} files`);
}

export default defineConfig({
  entry,
  format: ["esm"],
  outDir: "dist",
  // File-per-module rather than a bundle. Three reasons, in order of weight:
  //
  //  1. The wildcard export above only resolves if `dist/regions/au.js` exists
  //     as a real path. A bundle has no such file.
  //  2. A consumer bundling for a browser can tree-shake a region pack away.
  //     Rolling 30 region packs into one module defeats that, and the packs are
  //     a third of the source by volume.
  //  3. The extension ships this to four store reviewers who read the source.
  //     A flat file tree reads like the repo; a bundle does not.
  bundle: false,
  // Emitted by tsc via the build:types script instead. tsup's rollup-based
  // dts generation flattens declarations, which breaks the per-file layout the
  // wildcard export depends on — the same reason `bundle: false` is set above.
  dts: false,
  // No sourcemaps. tsup inlines the full source into `sourcesContent`, so the
  // maps were 1.2MB of a 1.9MB build — a second copy of every detection rule,
  // shipped to every consumer, of source that is public on GitHub anyway. A
  // debugger stepping into this package shows readable ES2022 either way,
  // because the build is file-per-module and unminified.
  sourcemap: false,
  // The published tarball is the source of truth for what a consumer gets, so
  // a stale file from a previous build must never survive into it.
  clean: true,
  target: "es2022",
  platform: "neutral",
  // Never inline the one dependency. It is declared in `dependencies`, so the
  // consumer's package manager installs it; bundling it would ship a second
  // copy that no lockfile, audit or dedupe pass can see.
  external: ["libphonenumber-js"],
  outExtension: () => ({ js: ".js" }),
  // The `.js`/`.d.ts` specifier rewrite does NOT run here.
  //
  // `onSuccess` fires when tsup finishes, which is before `build:types` has
  // emitted a single declaration — so a rewrite hooked here covered the `.js`
  // output and silently missed every `.d.ts`. It runs as its own step after
  // both, in scripts/rewrite-specifiers.mjs.
  //
  // `outExtension` above names the output file and leaves the imports inside it
  // untouched; an esbuild `onResolve` hook does nothing either, because
  // `bundle: false` means imports are never resolved. Both look like the right
  // place and neither is.
});
