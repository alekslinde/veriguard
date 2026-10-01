import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { createRequire } from "module";

// The engine package's `exports` map is the boundary between it and every
// consumer — including the WebExtension client it was extracted for. A map that
// nothing consults is documentation, not encapsulation.
//
// The extraction originally shipped that way: a tsconfig `paths` entry and a
// vitest alias both resolved @veriguard/detect by file path, so an
// unexported subpath imported cleanly under test and under tsc while failing
// for anyone importing the package for real. Both overrides are gone; the
// package now resolves through the workspace symlink like any dependency.

const PKG_DIR = path.join(process.cwd(), "packages/detect");
const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf8")) as {
  name: string;
  // Each subpath resolves by condition: `development` to source for the
  // workspace, `default` to dist/ for a consumer. See the note in
  // packages/detect/package.json for why this is not publishConfig.exports,
  // and __tests__/enginePublish.test.ts for what checks the built half.
  exports: Record<string, { development: string; types: string; default: string }>;
};

describe("engine package exports map", () => {
  it("is the only way in — no alias resolves around it", () => {
    // A path-based alias would defeat every other assertion here.
    //
    // Resolve the config by extension rather than naming one file: reading a
    // fixed name would throw if it were renamed, and "the file we read is the
    // config vitest loads" is the premise this assertion rests on. Finding
    // none, or more than one, means that premise no longer holds.
    const configs = readdirSync(process.cwd()).filter((f) => /^vitest\.config\.[cm]?[jt]s$/.test(f));
    expect(configs, "expected exactly one vitest config at the repo root").toHaveLength(1);

    const vitestConfig = readFileSync(path.join(process.cwd(), configs[0]), "utf8");
    expect(vitestConfig).not.toContain("packages/detect/src");

    const tsconfig = readFileSync(path.join(process.cwd(), "tsconfig.json"), "utf8");
    expect(tsconfig).not.toContain("packages/detect/src");
  });

  it("resolves every subpath it advertises", () => {
    // Resolution as the WORKSPACE performs it — vitest patches createRequire,
    // so `exports` is honoured but the targets land on `src/*.ts`. That is the
    // thing worth asserting here: every subpath this package advertises is
    // reachable by the app, the extension and this suite.
    //
    // It is deliberately NOT a claim about a consumer. An earlier version of
    // this comment said "if this passes, a real consumer can import each of
    // these", which was false in a way that mattered: the same resolve throws
    // outside vitest whenever the target does not exist. What a consumer gets
    // is checked in __tests__/enginePublish.test.ts, against the built output.
    const require = createRequire(path.join(process.cwd(), "package.json"));
    for (const subpath of Object.keys(pkg.exports)) {
      if (subpath.includes("*")) continue; // wildcards checked below
      const specifier = subpath === "." ? pkg.name : `${pkg.name}/${subpath.slice(2)}`;
      expect(() => require.resolve(specifier), `${specifier} is advertised but does not resolve`).not.toThrow();
    }
  });

  it("resolves a wildcard subpath", () => {
    const require = createRequire(path.join(process.cwd(), "package.json"));
    expect(() => require.resolve(`${pkg.name}/regions/au`)).not.toThrow();
  });

  it("refuses a subpath it does not advertise", () => {
    // The assertion that makes the rest mean something: the map excludes as
    // well as includes. "index" is a real file (src/index.ts) reachable only
    // through ".", so a resolver honouring the map must reject it.
    const require = createRequire(path.join(process.cwd(), "package.json"));
    expect(() => require.resolve(`${pkg.name}/index`)).toThrow();
    expect(() => require.resolve(`${pkg.name}/scamDetector.ts`)).toThrow();
  });

  it("exposes the checking API through the barrel", async () => {
    const engine = await import("@veriguard/detect");
    for (const fn of ["checkUrl", "checkSms", "checkEmail", "checkPhone", "checkCustom", "analyzeContent"]) {
      expect(typeof engine[fn as keyof typeof engine], `${fn} missing from the barrel`).toBe("function");
    }
  });

  it("keeps the dependency surface to the one declared package", () => {
    // Every dependency here ships in every client that bundles the engine, so
    // additions should be deliberate. libphonenumber-js is the only one.
    expect(Object.keys((pkg as unknown as { dependencies: object }).dependencies)).toEqual([
      "libphonenumber-js",
    ]);
  });
});
