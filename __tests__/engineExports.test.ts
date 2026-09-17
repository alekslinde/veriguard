import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { createRequire } from "module";

// The engine package's `exports` map is the boundary between it and every
// consumer — including the WebExtension client it was extracted for. A map that
// nothing consults is documentation, not encapsulation.
//
// The extraction originally shipped that way: a tsconfig `paths` entry and a
// vitest alias both resolved @veriguard/engine by file path, so an
// unexported subpath imported cleanly under test and under tsc while failing
// for anyone importing the package for real. Both overrides are gone; the
// package now resolves through the workspace symlink like any dependency.

const PKG_DIR = path.join(process.cwd(), "packages/engine");
const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf8")) as {
  name: string;
  exports: Record<string, string>;
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
    expect(vitestConfig).not.toContain("packages/engine/src");

    const tsconfig = readFileSync(path.join(process.cwd(), "tsconfig.json"), "utf8");
    expect(tsconfig).not.toContain("packages/engine/src");
  });

  it("resolves every subpath it advertises", () => {
    // Node's own resolver, which honours `exports` strictly — if this passes,
    // a real consumer can import each of these.
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
    const engine = await import("@veriguard/engine");
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
