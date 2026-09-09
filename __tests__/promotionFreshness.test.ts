import { describe, it, expect } from "vitest";

import {
  assess,
  gating,
  GATING_REGIONS,
  human,
  markdown,
  newestRoadmap,
} from "../scripts/check-promotion-freshness";

describe("newestRoadmap", () => {
  it("finds a sweep on disk", async () => {
    expect(await newestRoadmap()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("gating", () => {
  it("separates what fails the check from what is merely reported", () => {
    // The distinction the digest issue depends on. Every authored region is
    // reported; only GATING_REGIONS decide pass/fail.
    const report = assess("2999-01-01");
    expect(report.behind.length).toBeGreaterThan(0);
    for (const row of gating(report)) {
      expect(GATING_REGIONS.has(row.surface.region)).toBe(true);
    }
  });

  it("can reach a clean gate while other regions are still behind", () => {
    // The regression that motivated this split: once the check looked past AU,
    // five non-AU calendars were already behind, so a gate over every region
    // could never be empty and the digest issue could never close. A
    // permanently-open flag is one nobody reads.
    const report = assess("1999-01-01");
    expect(gating(report)).toEqual([]);
  });

  it("gates on AU, the region the sweeps are written for", () => {
    expect(GATING_REGIONS.has("AU")).toBe(true);
  });
});

describe("reporting", () => {
  it("renders a behind-report in both formats", () => {
    const report = assess("2999-01-01");
    expect(human(report)).toContain("fallen behind");
    expect(markdown(report)).toContain("| Surface | Region | File | As at | Behind |");
  });

  it("still surfaces non-gating regions when the gate is clean", () => {
    // They must not simply vanish when AU is current — being invisible is the
    // state this whole change was undoing.
    const report = assess("2026-08-15");
    const out = human(report);
    expect(gating(report)).toEqual([]);
    expect(out).toContain("not gating");
  });
});
