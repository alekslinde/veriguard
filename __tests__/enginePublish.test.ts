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

const PKG_DIR = path.join(process.cwd(), "packages/engine");
const DIST = path.join(PKG_DIR, "dist");

type Exports = Record<string, { development: string; types: string; default: string }>;
const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf8")) as {
  name: string;
  files: string[];
  exports: Exports;
};

const built = existsSync(DIST);

// Skips visibly rather than silently, on the same terms as the extension's
// bundle test: a suite that quietly passes when it checked nothing is worse
// than one that is absent, because it reads as coverage on a release checklist.
const whenBuilt = built ? describe : describe.skip;

if (!built) {
  console.warn(
    "[enginePublish] packages/engine/dist is absent — skipping. " +
      "Run `npm run build:engine` before trusting a green run on a publish change.",
  );
}

describe("engine publish surface (no build required)", () => {
  it("advertises a development and a default target for every subpath", () => {
    // The two-condition shape is what lets the workspace stay on source while
    // consumers get dist/. A subpath added with only one of them silently
    // resolves the wrong way for somebody.
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      expect(target.development, `${subpath} has no development target`).toMatch(/^\.\/src\//);
      expect(target.default, `${subpath} has no default target`).toMatch(/^\.\/dist\//);
      expect(target.types, `${subpath} has no types target`).toMatch(/^\.\/dist\//);
    }
  });

  it("orders types before default, so TypeScript sees the declarations", () => {
    // Condition order is significant: the resolver takes the first match. With
    // `default` first, `types` is unreachable and every consumer silently gets
    // `any` for the whole package while the build still succeeds.
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      const keys = Object.keys(target);
      expect(
        keys.indexOf("types"),
        `${subpath} lists default before types, so the declarations are unreachable`,
      ).toBeLessThan(keys.indexOf("default"));
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
  /** Every emitted `.js`, as a path relative to dist/ with POSIX separators. */
  function emitted(): string[] {
    return readdirSync(DIST, { recursive: true, encoding: "utf8" })
      .map((f) => f.split(path.sep).join("/"))
      .filter((f) => f.endsWith(".js"));
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

  it("leaves no relative import that Node cannot resolve", () => {
    // Static and dynamic relative specifiers in the emitted JS, checked against
    // what was actually emitted rather than against a naming rule — a directory
    // import and a module import are both legal and resolve differently.
    const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g;
    const js = new Set(emitted());
    const broken: string[] = [];

    for (const file of emitted()) {
      const src = readFileSync(path.join(DIST, file), "utf8");
      const dir = path.posix.dirname(file);
      for (const [, spec] of src.matchAll(SPECIFIER)) {
        const resolved = path.posix.normalize(path.posix.join(dir, spec));
        if (!js.has(resolved)) broken.push(`${file} → ${spec}`);
      }
    }

    expect(broken, "relative imports pointing at files that were not emitted").toEqual([]);
  });

  it("resolves and loads every advertised subpath through Node", async () => {
    // The end-to-end check: what a consumer's runtime actually does. Import the
    // built file behind each subpath's `default` target and require it to
    // evaluate — a module that loads its own broken import throws here.
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (subpath.includes("*")) continue; // covered below
      const file = path.join(PKG_DIR, target.default);
      expect(existsSync(file), `${subpath} advertises ${target.default}, which does not exist`).toBe(
        true,
      );
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
