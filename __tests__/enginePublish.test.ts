import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";

// What the published package does, as opposed to what the workspace does.
//
// Every other suite in this repo exercises the engine's TypeScript source,
// because the `development` condition in the exports map resolves there. That
// is the right default — it keeps the edit/test loop free of a build step — but
// it means the whole suite can be green while the artifact npm installs is
// unloadable. Nothing here consults dist/ except this file.
//
// The failures below are not hypothetical. Each one was produced by a build
// that reported success:
//
//   · Emitted JS kept extensionless relative imports. Node's ESM resolver does
//     not guess extensions, so importing the package threw ERR_MODULE_NOT_FOUND
//     on the first specifier. In-repo, identical source resolved fine.
//   · `./regions` was rewritten to `./regions.js`, a file that does not exist —
//     it is a directory needing `/index.js`.
//   · The region packs emitted 30 `.d.ts` files and one `.js`: `bundle: false`
//     splits per entry, not per module, so a file reached only as an import of
//     an entry is declared and never compiled. `/regions/au` type-checked for a
//     consumer and had no runtime file behind it.
//   · The public-suffix data module vanished the same way, with no export
//     naming it to make its absence visible.
//
// All four are invisible from inside the workspace and none is caught by tsc.

const PKG_DIR = path.join(process.cwd(), "packages/detect");
const DIST = path.join(PKG_DIR, "dist");

const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf8")) as {
  name: string;
  files: string[];
  scripts: Record<string, string>;
  exports: Record<string, string>;
};

/**
 * The published `exports` map, derived exactly as `prepack` derives it.
 *
 * In-repo the map points at `src/*.ts`, because the app, the extension and
 * vitest all resolve this package through the workspace symlink — a map
 * pointing at dist/ makes a fresh clone fail to build and, worse, makes a stale
 * dist/ silently score with rules that do not match the source being edited.
 * The swap to dist/ happens at pack time, so the assertions below have to
 * perform it too rather than reading it off the file.
 */
function published(target: string): { types: string; default: string } {
  const js = target.replace(/^\.\/src\//, "./dist/").replace(/\.ts$/, ".js");
  return { types: js.replace(/\.js$/, ".d.ts"), default: js };
}

const built = existsSync(DIST);

// Skips visibly rather than silently, on the same terms as the extension's
// bundle test: a suite that quietly passes when it checked nothing is worse
// than one that is absent, because it reads as coverage on a release checklist.
const whenBuilt = built ? describe : describe.skip;

if (!built) {
  console.warn(
    "[enginePublish] packages/detect/dist is absent — skipping. " +
      "Run `npm run build:engine` before trusting a green run on a publish change.",
  );
}

describe("engine publish surface (no build required)", () => {
  it("resolves to source in the repo, so no build stands between an edit and a test", () => {
    // The property that keeps `npm test` and `npm run ext` working on a fresh
    // clone. Pointing `exports` at dist/ breaks both until someone builds, and
    // then does something worse than breaking: a stale dist/ scores with
    // detection rules that do not match the source being edited, and nothing
    // says so.
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      expect(target, `${subpath} does not resolve to source`).toMatch(/^\.\/src\/.*\.ts$/);
    }
  });

  it("swaps that map to dist/ at pack time, and puts it back", () => {
    // Because `exports` points at source, something has to rewrite it for the
    // tarball — otherwise the published package resolves to files `files` does
    // not ship. npm runs `prepack` before building the tarball and `postpack`
    // after, for both `npm pack` and `npm publish`.
    //
    // publishConfig.exports is the declarative spelling of this and does not
    // work: neither npm 10 nor npm 11 applies it to the tarball, verified by
    // packing with both and reading package.json back out.
    expect(pkg.scripts.prepack, "nothing rewrites exports for the tarball").toBeTruthy();
    expect(pkg.scripts.postpack, "nothing restores exports after packing").toBeTruthy();
  });

  it("derives a types target that precedes default for every subpath", () => {
    // Condition order is significant: the resolver takes the first match, so a
    // `types` listed after `default` is unreachable and every consumer silently
    // gets `any` for the whole package.
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      const entry = published(target);
      expect(Object.keys(entry), `${subpath} lists default before types`).toEqual([
        "types",
        "default",
      ]);
      expect(entry.default, `${subpath} does not publish to dist/`).toMatch(/^\.\/dist\//);
    }
  });

  it("ships dist, and never src, in the tarball", () => {
    // `files` is what npm packs. Shipping src alongside dist would double the
    // install size and make it ambiguous which copy a bundler resolves.
    expect(pkg.files).toContain("dist");
    expect(pkg.files).not.toContain("src");
  });

  it("carries the licence text it claims", () => {
    // The package declares Apache-2.0 and is published from a public repo; the
    // text has to travel with the tarball rather than being a field.
    expect(pkg.files).toContain("LICENSE");
    expect(existsSync(path.join(PKG_DIR, "LICENSE"))).toBe(true);
  });
});

whenBuilt("engine publish surface (built)", () => {
  /** Everything in dist/, as paths relative to it with POSIX separators. */
  function allEmitted(): string[] {
    return readdirSync(DIST, { recursive: true, encoding: "utf8" }).map((f) =>
      f.split(path.sep).join("/"),
    );
  }

  /** Every emitted `.js`. What a relative specifier has to resolve to. */
  function emitted(): string[] {
    return allEmitted().filter((f) => f.endsWith(".js"));
  }

  it("emits a JavaScript file for every TypeScript source file", () => {
    // The check that would have caught both missing-file failures at once. A
    // `.d.ts` without a `.js` is the specific shape of that bug: the type
    // resolves, the import does not.
    const sources = readdirSync(path.join(PKG_DIR, "src"), { recursive: true, encoding: "utf8" })
      .map((f) => f.split(path.sep).join("/"))
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"));

    expect(sources.length).toBeGreaterThan(10); // guard against a silent empty glob

    const js = new Set(emitted());
    const missing = sources.filter((f) => !js.has(f.replace(/\.ts$/, ".js")));
    expect(missing, "source files with no compiled output").toEqual([]);
  });

  it.each([".js", ".d.ts"])("leaves no relative import %s cannot resolve", (ext) => {
    // Static and dynamic relative specifiers, checked against what was actually
    // emitted rather than against a naming rule — a directory import and a
    // module import are both legal and resolve differently.
    //
    // Declarations are checked on the same terms as runtime code, and were not
    // at first: this filtered to `.js`, so 51 extensionless specifiers shipped
    // in `.d.ts` files while the test that claimed to cover them passed. A
    // consumer on `moduleResolution: "nodenext"` got TS2835 on every one, nine
    // from the barrel alone. Declarations point at the `.js` path too —
    // TypeScript resolves the runtime specifier and finds the declaration
    // beside it — so both are checked against the same set.
    const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
    const modules = new Set(emitted());
    const files = allEmitted().filter((f) => f.endsWith(ext));

    expect(files.length, `no ${ext} files were emitted`).toBeGreaterThan(10);

    const broken: string[] = [];
    for (const file of files) {
      const src = readFileSync(path.join(DIST, file), "utf8");
      const dir = path.posix.dirname(file);
      for (const [, spec] of src.matchAll(SPECIFIER)) {
        const resolved = path.posix.normalize(path.posix.join(dir, spec));
        if (!modules.has(resolved)) broken.push(`${file} → ${spec}`);
      }
    }

    expect(broken, `relative imports in ${ext} pointing at files that were not emitted`).toEqual([]);
  });

  it("resolves and loads every advertised subpath through Node", async () => {
    // The end-to-end check: what a consumer's runtime actually does. Import the
    // built file behind each subpath's `default` target and require it to
    // evaluate — a module that loads its own broken import throws here.
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (subpath.includes("*")) continue; // covered below
      const { default: js, types } = published(target);
      const file = path.join(PKG_DIR, js);
      expect(existsSync(file), `${subpath} publishes ${js}, which does not exist`).toBe(true);
      // The declaration beside it, which is what a consumer type-checks
      // against. A subpath shipping JS with no types is usable and untyped,
      // which for a package whose result shape is the product is a defect.
      expect(
        existsSync(path.join(PKG_DIR, types)),
        `${subpath} publishes ${types}, which does not exist`,
      ).toBe(true);
      await expect(
        import(pathToFileURL(file).href),
        `${subpath} does not load`,
      ).resolves.toBeDefined();
    }
  });

  it("resolves a wildcard subpath to a real emitted file", async () => {
    // `./regions/*` promises a file per region. The wildcard cannot be checked
    // by listing the map, so it is checked against the source tree it mirrors.
    const packs = readdirSync(path.join(PKG_DIR, "src/regions"))
      .filter((f) => f.endsWith(".ts"))
      .map((f) => f.replace(/\.ts$/, ""));

    expect(packs.length).toBeGreaterThan(5);

    const js = new Set(emitted());
    const missing = packs.filter((p) => !js.has(`regions/${p}.js`));
    expect(missing, "region packs with no compiled output").toEqual([]);

    await expect(import(pathToFileURL(path.join(DIST, "regions/au.js")).href)).resolves.toBeDefined();
  });

  it("scores through the built artifact, not just the source", async () => {
    // Loading is not working. A build that emitted every file and resolved
    // every import could still have dropped a region pack's data or broken the
    // scorer; this asserts the package does its job in the form people install.
    const engine = await import(pathToFileURL(path.join(DIST, "index.js")).href);

    const scam = await engine.checkUrl("https://commbank-secure-login.tk/verify");
    expect(scam.verdict).toBe("likely_scam");
    expect(scam.flags.length).toBeGreaterThan(0);

    const safe = await engine.checkUrl("https://www.commbank.com.au/");
    expect(safe.verdict).toBe("safe");
  });

  it("keeps the engine's no-network guarantee in the built output", async () => {
    // The property the whole package is sold on, asserted against the artifact
    // rather than the source. `analyzeContent` is given no transport, so a
    // reachable fetch would be a defect regardless of whether it is called.
    const engine = await import(pathToFileURL(path.join(DIST, "index.js")).href);

    const fetchCalls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: unknown) => {
      fetchCalls.push(String(input));
      throw new Error("the engine must not reach the network");
    }) as typeof fetch;

    try {
      await engine.analyzeContent("Your parcel is held: https://bit.ly/3xYzAbc pay $2.99");
    } finally {
      globalThis.fetch = realFetch;
    }

    expect(fetchCalls, "the built engine reached for the network").toEqual([]);
  });
});
