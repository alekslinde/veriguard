import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { roadmapDates, coverage, human, markdown } from "../scripts/sweep-coverage";
import { radarForRegion, authoredRadarRegions } from "@/lib/threatRadar";

describe("roadmapDates", () => {
  it("finds the sweeps on disk, oldest first", async () => {
    const dates = await roadmapDates();
    expect(dates.length).toBeGreaterThan(0);
    expect([...dates].sort()).toEqual(dates);
  });

  it("returns dates that resolve to real roadmap files", async () => {
    // The report's whole premise is that filenames are the stable interface
    // (unlike the prose inside them). If a date here doesn't round-trip back to
    // a file, the convention has drifted and the report is reading nothing.
    for (const date of await roadmapDates()) {
      const path = resolve(__dirname, `../docs/threat-intel/${date}-threat-roadmap.md`);
      expect(existsSync(path), `${date} does not resolve to a roadmap`).toBe(true);
    }
  });
});

describe("coverage", () => {
  it("attributes every radar entry to the sweep it cites", async () => {
    const rows = coverage(await roadmapDates());
    const counted = rows.reduce((n, r) => n + r.total, 0);
    const authored = authoredRadarRegions().reduce((n, r) => n + radarForRegion(r).length, 0);

    // Every entry cites a roadmap that exists (asserted in threatRadar.test.ts),
    // so the per-sweep totals must account for all of them. A shortfall means an
    // entry cites a sweep this report never saw — the two checks disagreeing
    // about the archive.
    expect(counted).toBe(authored);
  });

  it("reports a sweep with no citing entries rather than omitting it", async () => {
    // The point of the report. A skipped cycle stops being flagged by the
    // freshness check the moment a newer sweep is promoted, so an unpromoted
    // sweep must stay visible here or it is invisible everywhere.
    const dates = await roadmapDates();
    const rows = coverage(dates);
    expect(rows.map((r) => r.date)).toEqual(dates);
  });

  it("counts only entries citing that exact sweep", () => {
    const rows = coverage(["2026-06-21"]);
    expect(rows).toHaveLength(1);
    for (const { region, ids } of rows[0].promoted) {
      for (const id of ids) {
        const entry = radarForRegion(region).find((t) => t.id === id);
        expect(entry?.roadmap).toBe("2026-06-21");
      }
    }
  });

  it("handles a sweep nothing cites", () => {
    const rows = coverage(["1999-01-01"]);
    expect(rows[0].total).toBe(0);
    expect(rows[0].promoted).toEqual([]);
  });
});

describe("reporting", () => {
  it("renders both formats without throwing", async () => {
    const rows = coverage(await roadmapDates());
    expect(human(rows)).toContain("Radar promotion by sweep");
    expect(markdown(rows)).toContain("| Sweep | Radar entries | Regions |");
  });

  it("marks unpromoted sweeps in the markdown table", () => {
    const out = markdown([{ date: "2026-01-01", promoted: [], total: 0 }]);
    // Bolded zero — the row a reader should stop on.
    expect(out).toContain("**0**");
    expect(out).toContain("no radar entry citing them");
  });

  it("does not call an unpromoted sweep a failure", () => {
    // Tone is load-bearing here. A cycle with only infrastructure findings
    // correctly promotes nothing; wording that reads as a build break would
    // train people to ignore the report, which is worse than not having it.
    const out = markdown([{ date: "2026-01-01", promoted: [], total: 0 }]);
    expect(out).toContain("prompt, not a failure");
  });
});
