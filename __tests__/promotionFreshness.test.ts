import { describe, it, expect } from "vitest";

import {
  assess,
  gating,
  GATING_REGIONS,
  human,
  markdown,
  newestRoadmap,
  type Report,
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
    //
    // Built from a synthetic report rather than from the real surfaces. Two
    // earlier versions of this test read live data and both broke on a
    // promotion rather than on a regression: a hardcoded sweep date assumed
    // some non-gating region would always sit behind it, and deriving the date
    // instead only moved the assumption, because once every region is current
    // the scenario stops existing at all. What is being tested is how `human`
    // reports a clean gate alongside a behind non-gating region, which is a
    // property of the formatter and should not depend on how stale the calendar
    // happens to be today.
    const report: Report = {
      newest: "2026-09-27",
      behind: [
        {
          surface: {
            name: "Scam calendar",
            region: "GB",
            file: "lib/scamCalendar.ts",
            asAt: "2026-09-11",
            derivedFrom: "newest reviewed date",
          },
          gapDays: 16,
        },
      ],
      inSync: [],
    };

    expect(gating(report)).toEqual([]);
    const out = human(report);
    expect(out).toContain("not gating");
    // The row itself must be present, not just the heading.
    expect(out).toContain("GB");
  });
});
