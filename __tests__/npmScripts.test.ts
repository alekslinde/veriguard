import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Scripts and the docs that describe them drift apart quietly: a script is
// renamed and the README still names the old one, or a script points at a file
// that has moved. Nothing fails — the command just errors for whoever runs it,
// which is usually someone new following the docs.
//
// Reachability only, in the same spirit as the source and calendar checkers.
// Whether a script still does the RIGHT thing is a reading task; that it
// resolves at all is mechanical.

const ROOT = resolve(__dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const SCRIPTS: Record<string, string> = pkg.scripts;

const tracked = (glob: string) =>
  execFileSync("git", ["ls-files", glob], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

describe("npm scripts resolve", () => {
  it("every script points at a file that exists", () => {
    const missing: string[] = [];
    for (const [name, body] of Object.entries(SCRIPTS)) {
      for (const path of body.match(/scripts\/[A-Za-z0-9._-]+/g) ?? []) {
        if (!existsSync(resolve(ROOT, path))) missing.push(`${name} -> ${path}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every `npm run X` in the repo names a real script", () => {
    // Scoped to files that describe the ROOT package. workers/ has its own
    // package.json with its own scripts, and its README documents those — a
    // flat scan would report `npm run deploy` as broken when it is correct
    // where it is written.
    const files = [...tracked("*.md"), ...tracked("*.yml"), ...tracked("*.yaml")].filter(
      (f) => !f.startsWith("workers/") && !f.startsWith("node_modules/"),
    );

    const broken: string[] = [];
    for (const file of files) {
      const text = readFileSync(resolve(ROOT, file), "utf8");
      text.split("\n").forEach((line, i) => {
        for (const m of line.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
          if (!SCRIPTS[m[1]]) broken.push(`${file}:${i + 1} — npm run ${m[1]}`);
        }
      });
    }
    expect(broken).toEqual([]);
  });

  it("every workflow's script reference exists", () => {
    const broken: string[] = [];
    for (const file of tracked(".github/workflows/*.yml")) {
      const text = readFileSync(resolve(ROOT, file), "utf8");
      for (const path of text.match(/scripts\/[A-Za-z0-9._-]+/g) ?? []) {
        if (!existsSync(resolve(ROOT, path))) broken.push(`${file} -> ${path}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("gives every checker script an npm alias", () => {
    // The checkers are the scripts a person runs by hand, so they are the ones
    // that need a memorable name. check-sources.mjs was the odd one out for
    // months purely because it predates the others.
    const unaliased = tracked("scripts/check-*").filter(
      (f) => !Object.values(SCRIPTS).some((body) => body.includes(f.replace("scripts/", "scripts/"))),
    );
    expect(unaliased).toEqual([]);
  });
});
