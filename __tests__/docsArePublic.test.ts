import { describe, it, expect } from "vitest";
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
// probe as its evidence. Probe logs live outside the repo, alongside the
// working roadmap — see "Where writing goes" in CLAUDE.md.
//
// Six were moved out on 2026-09-11 after living here for one to two days. They
// got here because the directory already contained some and nothing said not
// to, which is exactly the kind of drift a convention enforced only by prose
// invites. Hence this test.
//
// This is NOT a change of stance on open source: the detection logic stays
// open, because obscuring keyword lists would not stop a sophisticated
// scammer. A ranked list of *working evasions* is a different thing.

const DIR = resolve(__dirname, "../docs/threat-intel");

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
