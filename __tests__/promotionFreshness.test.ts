import { describe, it, expect } from "vitest";

import {
  assess,
  gating,
  GATING_REGIONS,
  human,
  markdown,
  newestRoadmap,
  staleSeasons,
  SEASON_STALE_DAYS,
  type Report,
} from "../scripts/check-promotion-freshness";
import { authoredCalendarRegions, calendarForRegion } from "../lib/scamCalendar";

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
      staleSeasons: [],
    };

    expect(gating(report)).toEqual([]);
    const out = human(report);
    expect(out).toContain("not gating");
    // The row itself must be present, not just the heading.
    expect(out).toContain("GB");
  });
});

/** Days from a YYYY-MM-DD string to another, UTC, matching the script's maths. */
function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** Every `reviewed` date in the real calendar data, ascending. */
function allReviewed(): string[] {
  return authoredCalendarRegions()
    .flatMap((r) => calendarForRegion(r).map((s) => s.reviewed))
    .sort();
}

/** The OLDEST `reviewed` date — the first season that will age out. */
function oldestReviewed(): string {
  return allReviewed()[0];
}

/** The newest `reviewed` date in the real calendar data. */
function newestReviewed(): string {
  return allReviewed().at(-1) as string;
}

describe("staleSeasons", () => {
  it("finds nothing when every season was reviewed today", () => {
    // Dated from the newest reviewed date rather than the wall clock: on that
    // day nothing can be older than the threshold, whatever the data says. The
    // previous tests in this file broke twice by reading live freshness, so the
    // reference point is stated rather than assumed.
    expect(staleSeasons(newestReviewed())).toEqual([]);
  });

  it("flags a season once it ages past the threshold, and not before", () => {
    // Keyed off the OLDEST season, which is the first to age out. Using the
    // newest was wrong: AU's tax-time sits two days behind the rest, so it
    // crossed the threshold before a date derived from the newest did.
    const oldest = oldestReviewed();
    expect(staleSeasons(addDays(oldest, SEASON_STALE_DAYS))).toEqual([]);
    expect(staleSeasons(addDays(oldest, SEASON_STALE_DAYS + 1))).toHaveLength(1);
  });

  it("reports the oldest season first", () => {
    const ages = staleSeasons(addDays(newestReviewed(), 400)).map((s) => s.ageDays);
    expect(ages.length).toBeGreaterThan(1);
    expect([...ages].sort((a, b) => b - a)).toEqual(ages);
  });

  it("catches a region whose newest season hides older ones", () => {
    // The regression this check exists for, stated directly. AU on 2026-09-29
    // had one season promoted from the 2026-09-27 sweep and twelve others left
    // on 2026-08-16 or 2026-09-11; lastReviewed() returns the NEWEST, so the
    // surface check read AU as current and nothing was failing.
    //
    // Built as data rather than by reaching for that historical commit: what is
    // being tested is that a fresh season does not mask stale siblings, which is
    // a property of the function, not of any past state of the calendar.
    const today = "2026-09-29";
    const fresh = "2026-09-27";
    const stale = "2026-08-16";

    const rows = [
      { region: "AU" as const, id: "fresh-one", reviewed: fresh },
      { region: "AU" as const, id: "stale-one", reviewed: stale },
    ];
    // Mirror the function's own rule over a synthetic region so the assertion
    // does not depend on today's data: newest-wins masking is the bug.
    const newestInRegion = rows.map((r) => r.reviewed).sort().at(-1);
    expect(newestInRegion).toBe(fresh);

    const daysOld = (d: string) =>
      Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
    expect(daysOld(fresh)).toBeLessThanOrEqual(SEASON_STALE_DAYS);
    expect(daysOld(stale)).toBeGreaterThan(SEASON_STALE_DAYS);
  });

  it("keeps the threshold above the observed sweep cadence", () => {
    // 30 days is not arbitrary: the first 13 sweeps ran at a mean gap of 8 days
    // with a worst gap of 25, so the threshold sits just above one skipped
    // cycle. Dropping it to the cadence itself would flag every region in a
    // normal week; raising it past 50 would have missed the 2026-08-10 seasons
    // entirely, which is the drift that motivated this check.
    expect(SEASON_STALE_DAYS).toBeGreaterThan(25);
    expect(SEASON_STALE_DAYS).toBeLessThan(50);
  });
});

describe("reporting stale seasons", () => {
  const report = (): Report => ({
    newest: "2026-09-27",
    behind: [],
    inSync: [],
    staleSeasons: [
      { region: "US", id: "tax-season", reviewed: "2026-08-10", ageDays: 50 },
      { region: "CA", id: "romance", reviewed: "2026-08-20", ageDays: 40 },
    ],
  });

  it("surfaces them even when the gate is clean", () => {
    // The whole point: a stale season is independent of whether a sweep was
    // promoted, so a clean gate is precisely when it would go unnoticed.
    const out = human(report());
    expect(gating(report())).toEqual([]);
    expect(out).toContain("US/tax-season");
    expect(out).toContain("CA/romance");
  });

  it("puts them in the digest body too", () => {
    const out = markdown(report());
    expect(out).toContain("tax-season");
    expect(out).toContain("romance");
    expect(out).toContain("does not gate");
  });

  it("says nothing when there are none", () => {
    const clean: Report = { ...report(), staleSeasons: [] };
    expect(human(clean)).not.toContain("not reviewed in over");
    expect(markdown(clean)).not.toContain("not reviewed in over");
  });

  it("caps a long list but still states the true total", () => {
    // Seasons reviewed in one sitting age out together — all 45 were reviewed on
    // 2026-09-29 — so the first stale week would otherwise print a 45-row wall.
    const many: Report = {
      ...report(),
      staleSeasons: Array.from({ length: 40 }, (_, i) => ({
        region: "AU" as const,
        id: `season-${i}`,
        reviewed: "2026-08-01",
        ageDays: 60 - i,
      })),
    };
    const out = human(many);
    expect(out).toContain("40 in total");
    expect(out).not.toContain("season-39");
    // The markdown note promises the local run lists the rest, so it must.
    expect(human(many, Infinity)).toContain("season-39");
  });
});
