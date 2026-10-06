// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";

import {
  parseRegionCoverage,
  freshness,
  plan,
  markdown,
  loadRoadmaps,
  loadRegions,
  WINDOW_DAYS,
  type Depth,
  type Tier,
} from "../scripts/check-research-freshness";

const table = (rows: string) => `# Roadmap\n\n## Region coverage\n\n| Region | Depth | Notes |\n|---|---|---|\n${rows}\n\n## Sources\n\n| AU | deep | not the record |\n`;

describe("parseRegionCoverage", () => {
  it("reads deep, light and skipped rows from the Region coverage section only", () => {
    const t = parseRegionCoverage(table("| AU | deep | x |\n| `de` | **light** | y |\n| ES | skipped | in rotation |"));
    expect([...t]).toEqual([["AU", "deep"], ["DE", "light"], ["ES", "skipped"]]);
  });

  it("ignores a table in another section", () => {
    const t = parseRegionCoverage(table("| GB | light | x |"));
    expect(t.get("AU")).toBeUndefined();
  });

  it("returns nothing for a roadmap without the section (pre-convention files)", () => {
    expect(parseRegionCoverage("# Roadmap\n\n## Watchlist\n\n| AU | deep |").size).toBe(0);
  });

  it("ignores unknown depth words and non-region first cells", () => {
    const t = parseRegionCoverage(table("| AU | thorough | x |\n| BASE | deep | x |\n| Region | Depth | — |"));
    expect(t.size).toBe(0);
  });
});

describe("freshness", () => {
  const regions: Array<[string, Tier]> = [["AU", "full"], ["CA", "partial"], ["DE", "minimal"], ["FR", "minimal"], ["ZZ", "none"]];
  const t = (rows: Array<[string, Depth]>) => new Map(rows);

  it("takes the newest roadmap that researched the region, skipping 'skipped'", () => {
    const rows = freshness(
      [["2026-09-01", t([["DE", "light"]])], ["2026-10-01", t([["DE", "skipped"], ["AU", "deep"]])]],
      regions,
      "2026-10-06",
    );
    const de = rows.find((r) => r.region === "DE")!;
    expect(de).toMatchObject({ lastResearched: "2026-09-01", depth: "light", ageDays: 35, stale: false });
    expect(rows.find((r) => r.region === "AU")).toMatchObject({ lastResearched: "2026-10-01", ageDays: 5, stale: false });
  });

  it("marks never-recorded regions stale and drops the rest-of-world fallback", () => {
    const rows = freshness([], regions, "2026-10-06");
    expect(rows.map((r) => r.region)).toEqual(["AU", "CA", "DE", "FR"]);
    expect(rows.every((r) => r.stale && r.lastResearched === null)).toBe(true);
  });

  it("applies the per-tier window", () => {
    const rows = freshness([["2026-09-20", t([["AU", "deep"], ["DE", "light"]])]], regions, "2026-10-06");
    expect(rows.find((r) => r.region === "AU")!.stale).toBe(16 > WINDOW_DAYS.full);
    expect(rows.find((r) => r.region === "DE")!.stale).toBe(false);
  });
});

describe("plan", () => {
  const rows = freshness(
    [
      ["2026-09-01", new Map<string, Depth>([["DE", "light"]])],
      ["2026-09-15", new Map<string, Depth>([["ES", "light"]])],
    ],
    [["AU", "full"], ["CA", "partial"], ["DE", "minimal"], ["ES", "minimal"], ["FR", "minimal"], ["IT", "minimal"]],
    "2026-10-06",
  );

  it("always covers full and partial regions", () => {
    expect(plan(rows, 0).weekly).toEqual(["AU", "CA"]);
  });

  it("rotates minimal regions stalest first: never-recorded (alphabetical), then oldest", () => {
    expect(plan(rows, 3).rotation).toEqual(["FR", "IT", "DE"]);
    expect(plan(rows, 10).rotation).toEqual(["FR", "IT", "DE", "ES"]);
  });

  it("renders the plan and flags stale regions in markdown", () => {
    const md = markdown(rows, plan(rows, 2));
    expect(md).toContain("rotation FR, IT");
    expect(md).toContain("| FR ⚠ | minimal | _never recorded_");
    expect(md).toContain("outside their window");
  });
});

describe("live archive", () => {
  it("reads every roadmap on disk without throwing, and every region has a tier", async () => {
    const roadmaps = await loadRoadmaps();
    expect(roadmaps.length).toBeGreaterThan(0);
    for (const [, tier] of loadRegions()) expect(["full", "partial", "minimal", "none"]).toContain(tier);
  });
});
