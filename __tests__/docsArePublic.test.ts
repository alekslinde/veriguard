import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// This repo is public, and `docs/threat-intel/` is a PROVENANCE archive: the
// sweeps there exist so any shipped rule can be traced to public evidence —
// why `.bond` scores +30, why "quantum ai" scores +50. Publishing them is the
// point.
//
// An adversarial probe log is the opposite artifact. It is a worked list of
// inputs that EVADE the detector, each with the score before and after, plus a
// watchlist of weaknesses not yet fixed. That is a map for an evader, and it
// buys none of the traceability the sweeps provide: no shipped rule cites a
// probe as its evidence. Such notes are kept privately and are not part of this
// repository — see "Where writing goes" in CLAUDE.md.
//
// This is enforced rather than documented because the failure mode is drift: a
// directory that already contains something acts as precedent for adding more
// of it, and a convention kept only in prose does not survive that.
//
// This is NOT a change of stance on open source: the detection logic stays
// open, because obscuring keyword lists would not stop a sophisticated
// scammer. A ranked list of *working evasions* is a different thing.

const ROOT = resolve(__dirname, "..");
const DIR = resolve(ROOT, "docs/threat-intel");

describe("docs/threat-intel holds public sweeps only", () => {
  const entries = readdirSync(DIR).filter((f) => f.endsWith(".md"));

  it("has sweeps to check", () => {
    // Guards against this suite passing vacuously if the directory is emptied
    // or renamed.
    expect(entries.length).toBeGreaterThan(0);
  });

  it("contains no probe write-ups", () => {
    // Filename check. Probes were named `YYYY-MM-DD-<target>-probe.md`, so the
    // suffix is the reliable tell.
    const probes = entries.filter((f) => /-probe\.md$/.test(f));
    expect(probes).toEqual([]);
  });

  it("names every file to the sweep convention", () => {
    // `README.md` is the archive's own index; everything else is a dated sweep.
    // Two other tests (threatRadar, sweepCoverage) resolve these by name, so
    // the pattern is load-bearing rather than cosmetic — a file that does not
    // match is either misnamed or does not belong here at all.
    const offenders = entries.filter(
      (f) => f !== "README.md" && !/^\d{4}-\d{2}-\d{2}-threat-roadmap\.md$/.test(f),
    );
    expect(offenders).toEqual([]);
  });

  it("points nowhere outside the repo", () => {
    // A pointer to a private file is a pointer whether or not the file is
    // reachable: naming the directory, the filename or the machine path tells
    // a reader where the working notes live, which is the half worth keeping
    // quiet. Checked across the whole repo's tracked text, not just this
    // directory, because the leak is easiest to commit in a comment or a test.
    // This file is excluded because it necessarily contains the patterns it
    // searches for. That is the one legitimate exception; if a second file
    // ever needs adding here, that is a reason to look hard at why.
    const SELF = "__tests__/docsArePublic.test.ts";
    const tracked = execSync("git ls-files -z", { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter((f) => f !== SELF && /\.(md|ts|tsx|yml|yaml|json)$/.test(f));

    const leaks: string[] = [];
    for (const file of tracked) {
      const text = readFileSync(resolve(ROOT, file), "utf8");
      text.split("\n").forEach((line, i) => {
        // The private notes' own naming, and any absolute path into a home
        // directory. Both are things only a private location would need.
        if (/veriguard-probes|veriguard-roadmap|\/Users\/[a-z]+\/Desktop/i.test(line)) {
          leaks.push(`${file}:${i + 1}`);
        }
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
