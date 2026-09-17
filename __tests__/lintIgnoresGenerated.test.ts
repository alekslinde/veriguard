// Generated output must not be linted.
//
// `globalIgnores` in eslint.config.mjs REPLACES eslint-config-next's defaults,
// so every generated directory has to be listed there by hand. Miss one and
// lint reports thousands of problems in minified vendor code — burying real
// findings rather than surfacing them, which is the failure mode that makes the
// script useless as a gate.
//
// The reason this needs a test rather than care: the directories are all
// gitignored, so a missing entry is invisible on CI and on a fresh clone. It
// shows up only for whoever ran the build that produced the directory, as a
// wall of noise they did not cause and cannot attribute. `.vercel/output` sat
// unlisted exactly that way.
//
// This resolves the config's real ignore list through ESLint itself rather than
// parsing the file, so it tests the behaviour that ships and not a
// transcription of it.

import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** Extensions ESLint would lint if it reached them. */
const LINTABLE = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".mts", ".cts"]);

/** Whether a tree holds anything ESLint would try to lint. Stops at the first. */
function containsLintableFile(dir: string, budget = { n: 4000 }): boolean {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (budget.n-- <= 0) return false;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      if (containsLintableFile(full, budget)) return true;
    } else if (LINTABLE.has(path.extname(entry.name))) {
      return true;
    }
  }
  return false;
}

/**
 * Gitignored directories that hold code ESLint would otherwise lint.
 *
 * Read from .gitignore rather than hardcoded, so the two lists cannot drift:
 * adding a generated directory to .gitignore is the step nobody forgets, and it
 * is what makes this test notice a new one.
 *
 * Two narrowings matter. Only whole-directory entries count — file patterns
 * (`*.db`, `audit.mjs`) are not lintable trees. And only directories that
 * actually contain JS/TS count: `.vscode/` and `coverage/` are gitignored for
 * reasons that have nothing to do with builds, and demanding an ignore entry
 * for them would be this test inventing a rule rather than enforcing one.
 * Gitignored is not the same as generated; holding code a build wrote is what
 * this is really about.
 */
function generatedCodeDirectories(): string[] {
  const lines = readFileSync(path.join(ROOT, ".gitignore"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!"));

  return lines
    .filter((l) => !l.includes("*"))
    .map((l) => l.replace(/^\/|\/$/g, ""))
    .filter((entry) => entry && entry !== "node_modules")
    .filter((entry) => {
      const full = path.join(ROOT, entry);
      return existsSync(full) && statSync(full).isDirectory() && containsLintableFile(full);
    });
}

describe("eslint ignores generated output", () => {
  it("ignores every gitignored build directory that exists", async () => {
    // Only directories actually PRESENT are checked, and there may be none:
    // which ones exist depends on what has been built here, and CI runs the
    // suite without building the extension or a deploy bundle. An earlier
    // version asserted the list was non-empty, to stop the loop passing
    // vacuously — which made the test fail on exactly the machines that had
    // nothing to check. The vacuous-pass worry is answered by the
    // known-patterns test below instead, which needs no build at all.
    const eslint = new ESLint();

    for (const dir of generatedCodeDirectories()) {
      // A path ESLint would lint if the directory were not ignored. The probe
      // file is never written — isPathIgnored is a pure path question.
      const probe = path.join(ROOT, dir, "__lint_probe__.js");
      expect(await eslint.isPathIgnored(probe), `${dir}/ is linted but is generated output`).toBe(
        true,
      );
    }
  });

  it("ignores the known generated directories whether or not they were built", async () => {
    // The half that runs everywhere. The directories above appear only once
    // something has produced them, so on CI that loop is empty and proves
    // nothing; these paths are asserted directly, so a missing ignore entry
    // fails on a fresh clone rather than waiting for someone to build locally
    // and wonder why lint got noisy.
    const eslint = new ESLint();
    for (const dir of [".next", ".vercel", "extension/dist", "extension/safari", "public/tesseract"]) {
      const probe = path.join(ROOT, dir, "__lint_probe__.js");
      expect(await eslint.isPathIgnored(probe), `${dir}/ must be ignored`).toBe(true);
    }
  });

  it("still lints the source it is supposed to lint", async () => {
    // The other half: an over-broad ignore would make the assertion above pass
    // by linting nothing at all, which is the same defect in the opposite
    // direction — and the one that would let a real problem ship silently.
    const eslint = new ESLint();
    for (const file of [
      "lib/verdictSummary.ts",
      "app/api/blocklist/route.ts",
      "packages/engine/src/verdictRank.ts",
      "extension/src/browser.ts",
      "components/CheckFlow.tsx",
    ]) {
      expect(await eslint.isPathIgnored(path.join(ROOT, file)), `${file} is not linted`).toBe(false);
    }
  });

  it("lints a file placed in a source directory it has not seen before", async () => {
    // Guards the inverse of the entry above: a future ignore entry written too
    // broadly (`extension/**` rather than `extension/dist/**`) would silently
    // drop a whole source tree. Uses a real temporary file so this exercises
    // resolution rather than a path string.
    const dir = path.join(ROOT, "extension/src");
    const probe = path.join(dir, "__lint_probe__.ts");
    mkdirSync(dir, { recursive: true });
    writeFileSync(probe, "export const probe = 1;\n");
    try {
      const eslint = new ESLint();
      expect(await eslint.isPathIgnored(probe)).toBe(false);
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
