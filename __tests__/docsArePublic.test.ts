import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// This repo is public, and `docs/threat-intel/` is a PROVENANCE archive: the
// sweeps there exist so any shipped rule can be traced to public evidence —
// why `.bond` scores +30, why "quantum ai" scores +50. Publishing them is the
// point, and it is the only thing this directory is for.
//
// Enforced rather than documented, because the failure mode is drift: a
// directory that already holds something acts as precedent for adding more of
// it, and a convention kept only in prose does not survive that. See "Where
// writing goes" in CLAUDE.md.
//
// This narrows nothing about the open-source stance: detection logic stays
// open, because obscuring keyword lists would not stop a sophisticated scammer.

const ROOT = resolve(__dirname, "..");
const DIR = resolve(ROOT, "docs/threat-intel");

describe("docs/threat-intel holds public sweeps only", () => {
  const entries = readdirSync(DIR).filter((f) => f.endsWith(".md"));

  it("has sweeps to check", () => {
    // Guards against this suite passing vacuously if the directory is emptied
    // or renamed.
    expect(entries.length).toBeGreaterThan(0);
  });

  it("names every file to the sweep convention", () => {
    // An allowlist, deliberately: `README.md` is the archive's own index and
    // everything else must be a dated sweep. Anything else is either misnamed
    // or does not belong here, and this does not need to know which.
    // threatRadar and sweepCoverage resolve these by name, so the pattern is
    // load-bearing rather than cosmetic.
    const offenders = entries.filter(
      (f) => f !== "README.md" && !/^\d{4}-\d{2}-\d{2}-threat-roadmap\.md$/.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it("points nowhere outside the repo", () => {
    // Commit messages, comments and tests should stand on their own. An
    // absolute path into someone's home directory resolves for nobody else, so
    // it is noise at best. Checked across all tracked text, since a comment is
    // the easiest place to leave one.
    //
    // Deliberately a SHAPE rather than a list of names: a checked-in list of
    // the exact strings you do not want checked in is self-defeating, and this
    // file would become the one place they all appear. A path prefix is the
    // durable tell and needs no such list.
    const tracked = execSync("git ls-files -z", { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter((f) => /\.(md|ts|tsx|yml|yaml|json)$/.test(f));

    const HOME_PATH = /(?:\/(?:Users|home)\/[A-Za-z0-9._-]+|~)\/[A-Za-z0-9._-]/;
    // `~/.claude/` is the documented location of the global agent config, not
    // a working file — it means the same thing on every machine, which is the
    // property that makes the rest of this pattern worth flagging.
    const CONVENTIONAL = /~\/\.claude\//;
    const leaks: string[] = [];
    for (const file of tracked) {
      const text = readFileSync(resolve(ROOT, file), "utf8");
      text.split("\n").forEach((line, i) => {
        if (HOME_PATH.test(line) && !CONVENTIONAL.test(line)) leaks.push(`${file}:${i + 1}`);
      });
    }
    expect(leaks).toEqual([]);
  });

  it("carries no working-notes marker", () => {
    // The roadmap and the probe logs open with a "do not commit" banner. If one
    // is ever pasted in here, catch it by its own warning rather than by name.
    for (const file of entries) {
      const head = readFileSync(resolve(DIR, file), "utf8").slice(0, 600).toLowerCase();
      expect({ file, private: head.includes("do not commit") }).toEqual({
        file,
        private: false,
      });
    }
  });
});
