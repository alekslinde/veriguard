// The MCP package's published form, checked against the built artifact.
//
// __tests__/mcpServer.test.ts covers behaviour by importing source. That tells
// us nothing about what a stranger installs, and the engine's own publish
// history is the argument for a separate suite: three ways its build shipped
// broken while reporting success — extensionless imports that threw on first
// require, region packs that emitted declarations with no JavaScript behind
// them, a specifier rewrite that ran before the declarations existed. None was
// visible from inside the workspace and none was caught by tsc.
//
// This package's exposure is narrower, because it bundles. What remains is
// worth asserting:
//
//   · the bin entry is executable and has its shebang, or `npx @veriguard/mcp`
//     fails on the user's first command;
//   · the three runtime dependencies stay external, so a consumer's installed
//     engine is the one that scores — a bundled copy would freeze detection
//     rules at our build time and no lockfile or audit could see it;
//   · lib/signalTactics.ts really is inlined, since a published package cannot
//     carry a path that climbs out of its own root;
//   · the privacy claim the README and --help make is in the shipped text.
//
// Requires a build. `npm run build:mcp` produces it; this suite skips rather
// than fails when dist/ is absent, so a fresh clone running `npm test` is not
// blocked on a build step — the same contract as extensionBundle.test.ts. The
// skip is visible in the output, which is the honest failure mode: a silent
// pass would make this test evidence of something it never checked.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

const PKG_DIR = path.join(process.cwd(), "packages/mcp");
const DIST = path.join(PKG_DIR, "dist");
const CLI = path.join(DIST, "cli.js");
const built = existsSync(CLI);

const pkg = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf8"));

/** Every emitted .js, concatenated — the whole runtime surface a consumer gets. */
function bundledSource(): string {
  const files = ["cli.js", "server.js"];
  // The chunk name carries a content hash, so it is discovered rather than
  // hardcoded: pinning it would make this suite fail on every rebuild.
  const chunk = readFileSync(CLI, "utf8").match(/from\s*"\.\/(chunk-[A-Z0-9]+\.js)"/i)?.[1];
  if (chunk) files.push(chunk);
  return files
    .filter((f) => existsSync(path.join(DIST, f)))
    .map((f) => readFileSync(path.join(DIST, f), "utf8"))
    .join("\n");
}

describe.skipIf(!built)("MCP package — published artifact", () => {
  it("ships an executable bin entry with a shebang", () => {
    // tsup does both on its own. Asserted anyway, because the failure mode is
    // `npx @veriguard/mcp` dying on the user's very first command, and nothing
    // in the build would report it.
    expect(readFileSync(CLI, "utf8").startsWith("#!/usr/bin/env node")).toBe(true);
    // Owner-executable at minimum; npm sets 0o755 on a bin at install time.
    expect(statSync(CLI).mode & 0o100, "cli.js is not executable").toBeTruthy();
  });

  it("points its bin at a file that exists", () => {
    for (const target of Object.values(pkg.bin as Record<string, string>)) {
      expect(existsSync(path.join(PKG_DIR, target)), `bin target missing: ${target}`).toBe(true);
    }
  });

  it("resolves every exports subpath to a real file", () => {
    for (const [subpath, entry] of Object.entries(pkg.exports as Record<string, unknown>)) {
      const targets = typeof entry === "string" ? [entry] : Object.values(entry as Record<string, string>);
      for (const target of targets) {
        expect(existsSync(path.join(PKG_DIR, target)), `exports["${subpath}"] → ${target} missing`)
          .toBe(true);
      }
    }
  });

  it("keeps every runtime dependency external", () => {
    const source = bundledSource();
    for (const dep of Object.keys(pkg.dependencies as Record<string, string>)) {
      // Each must appear as a bare import specifier, meaning it is resolved
      // from the consumer's node_modules rather than copied into our bundle.
      expect(source, `${dep} is not imported as an external`).toMatch(
        new RegExp(`from\\s*"${dep.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}(/[^"]*)?"`),
      );
    }
  });

  it("does not inline the engine's detection rules", () => {
    // The sharpest version of the assertion above. If the engine were bundled,
    // a consumer would score against rules frozen at our build time while
    // their lockfile claimed a different version — and region pack text is the
    // cheapest proof of whether that happened.
    const source = bundledSource();
    expect(source).not.toMatch(/Scamwatch/);
    expect(source).not.toMatch(/suspiciousTlds/);
  });

  it("inlines the teaching taxonomy, which lives outside the package root", () => {
    // lib/signalTactics.ts is app-side on purpose and cannot ship as a path
    // that climbs out of this package, so the bundler has to inline it. If it
    // were left external, the published package would import a path that does
    // not exist in the tarball and fail at runtime for every consumer.
    const source = bundledSource();

    // Not a bare mention of the name: tsup writes the source path as a
    // provenance comment above each inlined module ("// ../../lib/
    // signalTactics.ts"), which is exactly what successful inlining looks
    // like. The property is that no *import* resolves to a path outside the
    // package, so match an import specifier rather than the filename.
    expect(source, "a relative import climbs out of the package root")
      .not.toMatch(/from\s*"\.\.\/\.\.\//);

    expect(source, "tactic titles are missing — the taxonomy was not inlined")
      .toMatch(/Manufactured urgency|Borrowed authority/);
  });

  it("states the network and privacy claim in the shipped --help text", () => {
    // This is the claim the README makes in public. It belongs in the binary
    // too, because that is what someone running the server actually reads.
    const cli = readFileSync(CLI, "utf8");
    expect(cli).toMatch(/never sent anywhere/i);
    expect(cli).toMatch(/urlhaus\.abuse\.ch/);
    expect(cli).toMatch(/never visited|read as text/i);
  });

  it("emits type declarations for the public entry", () => {
    const types = (pkg.exports["."] as Record<string, string>).types;
    const declared = readFileSync(path.join(PKG_DIR, types), "utf8");
    // The three symbols that make up the public surface. A declaration file
    // that resolves but exports nothing useful is the failure worth catching —
    // it type-checks for a consumer and gives them `any`.
    for (const symbol of ["ServerOptions", "createServer", "main"]) {
      expect(declared, `${types} does not export ${symbol}`).toMatch(symbol);
    }
  });
});

// Runs with or without a build: these are claims about package.json itself.
describe("MCP package — manifest", () => {
  it("is publishable under the @veriguard scope with provenance", () => {
    expect(pkg.name).toBe("@veriguard/mcp");
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig?.access).toBe("public");
    // Provenance ties the tarball to the commit that built it, which is the
    // check a consumer can make without trusting us.
    expect(pkg.publishConfig?.provenance).toBe(true);
  });

  it("declares the engine as a real dependency, not a workspace link", () => {
    // A "*" or "workspace:*" range publishes a package nobody can install.
    const range = (pkg.dependencies as Record<string, string>)["@veriguard/scam-detect"];
    expect(range).toBeTruthy();
    expect(range).toMatch(/^\^?\d+\.\d+\.\d+/);
  });

  it("ships only dist and the documents, never source", () => {
    expect(pkg.files).toContain("dist");
    expect(pkg.files).not.toContain("src");
  });

  it("describes itself without overclaiming", () => {
    // The description is the first thing a registry browser reads. It must not
    // promise more than the server does — the content being checked is not
    // sent anywhere, which is true, rather than "no network", which is not.
    expect(pkg.description).toMatch(/never sent anywhere|runs locally/i);
  });
});
