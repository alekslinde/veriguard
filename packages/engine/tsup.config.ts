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
  sourcemap: true,
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
  // Rewrite relative imports to carry `.js`.
  //
  // The source writes them extensionless, which is correct in-repo: the
  // workspace resolves this package's TypeScript directly under "bundler"
  // resolution. Node's ESM resolver does not guess extensions, so the same
  // specifier in emitted JS throws ERR_MODULE_NOT_FOUND on a consumer's
  // machine — the package imports cleanly here and fails on install.
  //
  // `outExtension` does NOT do this; it names the output file and leaves every
  // import inside it untouched. That distinction cost a build that looked
  // entirely successful and could not be loaded at all.
  //
  // Done at build time rather than by rewriting ~100 source imports, so the
  // in-repo form stays extensionless and the published form stays loadable
  // without either constraining the other. `enginePublish.test.ts` imports the
  // built barrel through Node's real resolver, which is the only check that
  // would have caught this.
  //
  // Rewritten on the emitted text rather than through an esbuild `onResolve`
  // hook, which is the natural-looking place for it and does nothing here:
  // `bundle: false` means esbuild transpiles each file without ever resolving
  // an import, so the hook simply never fires and the build still succeeds.
  async onSuccess() {
    const { readdir, readFile, writeFile } = await import("node:fs/promises");
    const path_ = await import("node:path");
    const dist = new URL("dist/", import.meta.url);
    const files = (await readdir(dist, { recursive: true, encoding: "utf8" })).filter((f) =>
      f.endsWith(".js"),
    );
    // A relative specifier in a static import/export, or a dynamic import, that
    // does not already end in a recognised extension. The quote character is
    // captured and replayed so the rewrite cannot change how the string is
    // delimited.
    const SPECIFIER =
      /(\bfrom\s*|\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']*?)(?<!\.[cm]?js|\.json|\.[cm]?ts)\2/g;
    const emitted = new Set(files.map((f) => f.split(path_.sep).join("/")));
    for (const file of files) {
      const target = new URL(file, dist);
      const before = await readFile(target, "utf8");
      const dir = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
      const after = before.replace(SPECIFIER, (_m, kw, q, spec: string) => {
        // `./regions` is a directory, not a module: Node resolves neither it
        // nor `./regions.js`, so appending an extension blindly produces a
        // specifier as broken as the one it replaced — just later, and only
        // for the one import that happens to name a folder.
        //
        // Which it is cannot be decided from the specifier's text, so it is
        // decided from what the build actually emitted: resolve the specifier
        // against this file's own directory and look for the file.
        const resolved = new URL(spec, new URL(dir, dist)).href.slice(dist.href.length);
        const suffix = emitted.has(`${resolved}.js`) ? ".js" : "/index.js";
        return `${kw}${q}${spec}${suffix}${q}`;
      });
      if (after !== before) await writeFile(target, after);
    }
  },
});
