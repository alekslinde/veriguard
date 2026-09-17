// The extension build has to survive Vite's native config loader.
//
// Vite currently bundles a config file before running it, which hides two
// things: an import specifier with no extension, and ESM syntax in a file Node
// would treat as CommonJS. The native loader — announced as a future default —
// runs the config as real ESM through Node's own resolver, where both are hard
// errors rather than conveniences.
//
// Both were warnings on every `npm run ext`, which is the shape of problem that
// gets scrolled past until the day the default flips and the build stops
// working. These assertions are cheap and fail with the reason attached.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

describe("extension build config is native-loader safe", () => {
  it("marks the extension directory as ESM", () => {
    // manifest.ts is loaded by the Vite config, which the native loader reads as
    // ESM. Without this the closest package.json is the repo root, which has no
    // "type" and therefore means CommonJS — so an ESM file gets parsed as CJS.
    const pkg = JSON.parse(read("extension/package.json")) as { type?: string };
    expect(pkg.type, 'extension/package.json must set "type": "module"').toBe("module");
  });

  it("keeps the extension out of the npm workspaces", () => {
    // Adding a package.json to a directory is how a workspace member is
    // declared, and this one is deliberately not one: it exists only to set the
    // module type. `packages/*` does not match `extension/`, and widening it
    // would make npm try to install a package with no dependencies and no name
    // anything depends on.
    const root = JSON.parse(read("package.json")) as { workspaces?: string[] };
    for (const pattern of root.workspaces ?? []) {
      expect(pattern.startsWith("extension"), `workspaces pattern ${pattern} captures the extension`).toBe(
        false,
      );
    }
  });

  it("imports the manifest with its file extension", () => {
    // Node's ESM resolver does not guess extensions. Vite's current loader
    // bundles the config first and so resolves it anyway; the native loader
    // will not.
    const config = read("extension/vite.config.mts");
    expect(config).toMatch(/from\s+"\.\/src\/manifest\.ts"/);
    expect(config, "extensionless specifier would fail under the native loader").not.toMatch(
      /from\s+"\.\/src\/manifest"/,
    );
  });

  it("disables code splitting by its current name", () => {
    // Self-contained entries are a Safari requirement, not a preference: a
    // background script carrying a bare import is an ES module, which needs
    // `"type": "module"` in the manifest, which Safari drops with a warning —
    // after which the worker fails on its first import and the context menu
    // never registers, silently.
    //
    // `inlineDynamicImports` still works and still produces byte-identical
    // output, so this is not about behaviour today. It is deprecated, and the
    // build that goes quiet when it is finally removed is one whose entries
    // start importing a shared chunk — the exact silent Safari break above.
    // extensionBundle.test.ts catches that on the built files; this catches the
    // config change that causes it, without needing a build.
    const config = read("extension/vite.config.mts");
    expect(config).toMatch(/codeSplitting:\s*false/);
    // Matched as a setting rather than as a word: the comment above that line
    // names the deprecated option to explain what it replaced, and a bare
    // substring search would flag the explanation as the thing it warns about.
    expect(config, "inlineDynamicImports is deprecated — use codeSplitting: false").not.toMatch(
      /^\s*inlineDynamicImports\s*:/m,
    );
  });

  it("allows the .ts extension in tsconfig, and can still do so", async () => {
    // The extension above is only accepted by tsc with this flag, and the flag
    // is only legal while the repo type-checks without emitting. If noEmit ever
    // goes, this pairing breaks and the import has to be reconsidered — so
    // assert both halves together rather than leaving the dependency implicit.
    // Imported rather than parsed by hand: tsconfig.json permits comments and
    // trailing commas, and a regex stripper for those is its own source of
    // false failures. The bundler reads it the way the toolchain does.
    const { compilerOptions } = (await import("../tsconfig.json")).default as {
      compilerOptions: Record<string, unknown>;
    };
    expect(compilerOptions.allowImportingTsExtensions).toBe(true);
    expect(compilerOptions.noEmit, "allowImportingTsExtensions requires noEmit").toBe(true);
  });
});
