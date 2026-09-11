import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  calendarForRegion,
  isActiveOn,
  activeSeasons,
  upcomingSeasons,
  daysUntilStart,
  daysUntilEnd,
  seasonBands,
  packSeasonBands,
  yearFraction,
  formatWindow,
  regionToday,
  isWellFormedWindow,
  isWellFormedDate,
  lastReviewed,
  formatReviewedDate,
  authoredCalendarRegions,
  labelSpan,
  labelPlacement,
  type ScamSeason,
  type SeasonBand,
} from "@/lib/scamCalendar";
import { supportedRegions } from "@veriguard/engine/regions";

// Local dates throughout: isActiveOn reads getMonth/getDate, so constructing
// with new Date(y, m, d) keeps the test independent of the runner's timezone.
const on = (month: number, day: number) => new Date(2026, month - 1, day);

const season = (window: ScamSeason["window"], id = "test"): ScamSeason => ({
  id,
  title: "Test",
  window,
  confidence: "fixed",
  why: "why",
  lures: ["lure"],
  advice: "advice",
  sources: [{ label: "Test", url: "https://example.gov" }],
  reviewed: "2026-08-10",
});

describe("calendarForRegion", () => {
  it("returns authored seasons for AU", () => {
    expect(calendarForRegion("AU").length).toBeGreaterThan(0);
  });

  it("returns an empty list for regions with no authored calendar", () => {
    // Deliberate: an unauthored region must render nothing rather than
    // inheriting another country's tax dates.
    const authored = new Set<string>(authoredCalendarRegions());
    const unauthored = supportedRegions().filter((c) => !authored.has(c));
    // ZZ (rest-of-world) is the standing example; assert there is at least one
    // so this test can't silently pass by iterating nothing.
    expect(unauthored.length).toBeGreaterThan(0);
    for (const code of unauthored) {
      expect(calendarForRegion(code)).toEqual([]);
    }
  });

  it("gives every season a unique id", () => {
    const ids = calendarForRegion("AU").map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Checks against each month's real length, not a blanket 31 — a 31 April or a
  // 30 February would pass the loose bound and still be a date that never comes.
  it("authors every season as a real calendar date", () => {
    for (const s of calendarForRegion("AU")) {
      expect(isWellFormedWindow(s.window), `${s.id} has an impossible date`).toBe(true);
    }
  });

  it("gives every season non-empty teaching content", () => {
    for (const s of calendarForRegion("AU")) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(0);
      expect(s.advice.length).toBeGreaterThan(0);
      expect(s.lures.length).toBeGreaterThan(0);
    }
  });
});

// Every authored region, not just AU. Adding a region means it inherits all of
// these invariants automatically, which is what keeps a second-region calendar
// held to the same bar as the first.
describe("every authored region", () => {
  const regions = authoredCalendarRegions();

  it("authors at least one region", () => {
    expect(regions.length).toBeGreaterThan(0);
  });

  // The whole point of this task: "too few entries" should fail CI, not linger.
  // A floor rather than an exact count so seasons can be added freely; the floor
  // is what stops a region regressing to a token entry or two.
  it.each(regions)("has a substantive calendar for %s", (code) => {
    expect(calendarForRegion(code).length).toBeGreaterThanOrEqual(5);
  });

  it.each(regions)("gives %s seasons unique ids", (code) => {
    const ids = calendarForRegion(code).map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(regions)("authors every %s season as a real calendar date", (code) => {
    for (const s of calendarForRegion(code)) {
      expect(isWellFormedWindow(s.window), `${code}/${s.id} has an impossible date`).toBe(true);
    }
  });

  it.each(regions)("gives every %s season non-empty teaching content", (code) => {
    for (const s of calendarForRegion(code)) {
      expect(s.title.length, `${code}/${s.id} title`).toBeGreaterThan(0);
      expect(s.why.length, `${code}/${s.id} why`).toBeGreaterThan(0);
      expect(s.advice.length, `${code}/${s.id} advice`).toBeGreaterThan(0);
      expect(s.lures.length, `${code}/${s.id} lures`).toBeGreaterThan(0);
    }
  });

  // Provenance is the maintenance guarantee: an unsourced or badly-sourced season
  // is the magic-number decay this field exists to prevent. https-only and a
  // parseable host so a typo fails here rather than shipping a dead citation.
  it.each(regions)("backs every %s season with a well-formed source", (code) => {
    for (const s of calendarForRegion(code)) {
      expect(s.sources.length, `${code}/${s.id} has no sources`).toBeGreaterThan(0);
      for (const source of s.sources) {
        expect(source.label.length, `${code}/${s.id} source label`).toBeGreaterThan(0);
        expect(source.url, `${code}/${s.id} source url must be https`).toMatch(/^https:\/\//);
        expect(() => new URL(source.url), `${code}/${s.id} source url unparseable`).not.toThrow();
      }
    }
  });

  // The freshness signal only sorts correctly on zero-padded ISO dates; a
  // malformed one silently mis-reports the "as at" line.
  it.each(regions)("stamps every %s season with a well-formed review date", (code) => {
    for (const s of calendarForRegion(code)) {
      expect(isWellFormedDate(s.reviewed), `${code}/${s.id} reviewed=${s.reviewed}`).toBe(true);
    }
  });

  // regionToday reads REGION_TIMEZONE, which is keyed by the authored regions —
  // this is the runtime companion to the type coupling: a region added to the
  // calendar without a timezone would fall back to the server clock silently.
  it.each(regions)("resolves a civil date for %s", (code) => {
    const today = regionToday(code);
    expect(today.month).toBeGreaterThanOrEqual(1);
    expect(today.month).toBeLessThanOrEqual(12);
    expect(today.day).toBeGreaterThanOrEqual(1);
    expect(today.day).toBeLessThanOrEqual(31);
  });
});

describe("lastReviewed", () => {
  it("returns the most recent review date across a region's seasons", () => {
    const reviewed = lastReviewed("AU");
    expect(reviewed).not.toBeNull();
    expect(isWellFormedDate(reviewed as string)).toBe(true);
    // It must be the maximum, not just any season's date.
    const max = calendarForRegion("AU").reduce(
      (acc, s) => (s.reviewed > acc ? s.reviewed : acc),
      "",
    );
    expect(reviewed).toBe(max);
  });

  it("returns null for a region with no calendar", () => {
    expect(lastReviewed("ZZ")).toBeNull();
  });
});

describe("isWellFormedDate", () => {
  it("accepts a real zero-padded date", () => {
    expect(isWellFormedDate("2026-08-10")).toBe(true);
  });

  it("rejects non-padded, impossible, or malformed dates", () => {
    expect(isWellFormedDate("2026-8-9")).toBe(false);
    expect(isWellFormedDate("2026-02-30")).toBe(false);
    expect(isWellFormedDate("2026-13-01")).toBe(false);
    expect(isWellFormedDate("not-a-date")).toBe(false);
  });
});

describe("formatReviewedDate", () => {
  it("renders a human-readable date", () => {
    expect(formatReviewedDate("2026-08-10")).toBe("10 August 2026");
  });

  it("returns a malformed value unchanged rather than 'NaN undefined'", () => {
    expect(formatReviewedDate("2026-8-9")).toBe("2026-8-9");
  });
});

describe("isActiveOn", () => {
  const normal = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });

  it("is active inside a normal window", () => {
    expect(isActiveOn(normal, on(8, 15))).toBe(true);
  });

  it("is inclusive of both boundaries", () => {
    expect(isActiveOn(normal, on(7, 1))).toBe(true);
    expect(isActiveOn(normal, on(10, 31))).toBe(true);
  });

  it("is inactive outside a normal window", () => {
    expect(isActiveOn(normal, on(6, 30))).toBe(false);
    expect(isActiveOn(normal, on(11, 1))).toBe(false);
  });

  // The case a naive start<=now<=end check gets wrong: the window spans the
  // year boundary, so both December and January must be active.
  const wrapping = season({ startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 });

  it("is active in the tail of a year-wrapping window", () => {
    expect(isActiveOn(wrapping, on(12, 25))).toBe(true);
    expect(isActiveOn(wrapping, on(1, 5))).toBe(true);
  });

  it("is active on both boundaries of a year-wrapping window", () => {
    expect(isActiveOn(wrapping, on(11, 20))).toBe(true);
    expect(isActiveOn(wrapping, on(1, 15))).toBe(true);
  });

  it("is inactive in the middle of the year for a wrapping window", () => {
    expect(isActiveOn(wrapping, on(6, 1))).toBe(false);
    expect(isActiveOn(wrapping, on(1, 16))).toBe(false);
    expect(isActiveOn(wrapping, on(11, 19))).toBe(false);
  });

  it("handles a single-day window", () => {
    const oneDay = season({ startMonth: 3, startDay: 4, endMonth: 3, endDay: 4 });
    expect(isActiveOn(oneDay, on(3, 4))).toBe(true);
    expect(isActiveOn(oneDay, on(3, 5))).toBe(false);
    expect(isActiveOn(oneDay, on(3, 3))).toBe(false);
  });
});

describe("activeSeasons", () => {
  it("finds tax season in August for AU", () => {
    const ids = activeSeasons("AU", on(8, 10)).map((s) => s.id);
    expect(ids).toContain("tax-time");
  });

  it("finds christmas parcels in early January for AU", () => {
    const ids = activeSeasons("AU", on(1, 5)).map((s) => s.id);
    expect(ids).toContain("christmas-parcels");
  });

  it("returns nothing for a region with no calendar", () => {
    expect(activeSeasons("ZZ", on(8, 10))).toEqual([]);
  });

  it("never returns an inactive season", () => {
    const date = on(4, 1);
    for (const s of activeSeasons("AU", date)) {
      expect(isActiveOn(s, date)).toBe(true);
    }
  });
});

describe("daysUntilStart", () => {
  it("is zero on the start day", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilStart(s, on(7, 1))).toBe(0);
  });

  it("counts forward within the same year", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilStart(s, on(6, 29))).toBe(2);
  });

  it("wraps to next year once the start has passed", () => {
    const s = season({ startMonth: 2, startDay: 1, endMonth: 3, endDay: 1 });
    // From 2 Feb, next February start is nearly a full year away.
    expect(daysUntilStart(s, on(2, 2))).toBeGreaterThan(300);
  });
});

describe("daysUntilEnd", () => {
  it("counts inclusively to the last day", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilEnd(s, on(10, 30))).toBe(1);
  });

  it("is zero on the final day", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilEnd(s, on(10, 31))).toBe(0);
  });

  it("handles a window that wraps the year end", () => {
    const s = season({ startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 });
    // 1 December sits in the November leg; the 15 January close is 45 days on.
    expect(daysUntilEnd(s, on(12, 1))).toBe(45);
    // 1 January sits in the January leg — same window, no wrap needed.
    expect(daysUntilEnd(s, on(1, 1))).toBe(14);
  });

  // The guard that keeps an inactive season from reporting most of a year left.
  it("returns zero rather than a wrapped count when inactive", () => {
    const s = season({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 });
    expect(daysUntilEnd(s, on(11, 20))).toBe(0);
  });
});

describe("seasonBands", () => {
  it("emits one band per non-wrapping season and two for a wrapping one", () => {
    const bands = seasonBands("AU");
    const wrapping = calendarForRegion("AU").filter(
      (s) =>
        s.window.startMonth * 100 + s.window.startDay >
        s.window.endMonth * 100 + s.window.endDay,
    );
    expect(bands).toHaveLength(calendarForRegion("AU").length + wrapping.length);
  });

  it("keeps every band inside the year", () => {
    for (const band of seasonBands("AU")) {
      expect(band.start).toBeGreaterThanOrEqual(0);
      expect(band.length).toBeGreaterThan(0);
      expect(band.start + band.length).toBeLessThanOrEqual(1);
    }
  });

  // The mixed 0-based start / 1-based end in seasonBands is deliberate: the
  // difference is an inclusive day count. Swept over every window an author
  // could write, so a "tidy-up" that aligns the bases fails here.
  it("stays inside the year for every representable window", () => {
    const daysIn = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    for (let sm = 1; sm <= 12; sm++) {
      for (let em = 1; em <= 12; em++) {
        for (const [sd, ed] of [[1, 1], [daysIn[sm], daysIn[em]], [1, daysIn[em]], [daysIn[sm], 1]]) {
          const w = { startMonth: sm, startDay: sd, endMonth: em, endDay: ed };
          const bands = packSeasonBands([season(w)]);

          for (const band of bands) {
            expect(band.start).toBeGreaterThanOrEqual(0);
            expect(band.length).toBeGreaterThan(0);
            expect(band.start + band.length).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });

  it("gives overlapping seasons different lanes", () => {
    // 1–30 June sits entirely inside 1 June – 31 August.
    const bands = packSeasonBands([
      season({ startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 }, "wide"),
      season({ startMonth: 6, startDay: 1, endMonth: 6, endDay: 30 }, "narrow"),
    ]);

    expect(new Set(bands.map((b) => b.lane)).size).toBe(2);
  });

  it("reuses a lane for seasons that don't overlap", () => {
    const bands = packSeasonBands([
      season({ startMonth: 1, startDay: 1, endMonth: 2, endDay: 1 }, "early"),
      season({ startMonth: 6, startDay: 1, endMonth: 7, endDay: 1 }, "late"),
    ]);

    expect(bands.every((b) => b.lane === 0)).toBe(true);
  });

  it("never overlaps two bands within a lane", () => {
    const byLane = new Map<number, { start: number; length: number }[]>();
    for (const band of seasonBands("AU")) {
      const list = byLane.get(band.lane) ?? [];
      list.push(band);
      byLane.set(band.lane, list);
    }

    for (const list of byLane.values()) {
      const sorted = [...list].sort((a, b) => a.start - b.start);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].start).toBeGreaterThanOrEqual(
          sorted[i - 1].start + sorted[i - 1].length,
        );
      }
    }
  });

  it("uses no more lanes than the busiest overlap requires", () => {
    // Nothing in the AU set stacks more than three deep on any single day.
    const bands = seasonBands("AU");
    const used = new Set(bands.map((b) => b.lane)).size;

    let busiest = 0;
    for (let d = 0; d < 365; d++) {
      const point = d / 365;
      const covering = bands.filter(
        (b) => point >= b.start && point < b.start + b.length,
      ).length;
      busiest = Math.max(busiest, covering);
    }

    expect(used).toBe(busiest);
  });

  it("splits a wrapping season into a tail and a head segment", () => {
    const parts = seasonBands("AU").filter((b) => b.season.id === "christmas-parcels");
    expect(parts).toHaveLength(2);
    expect(parts.some((b) => b.start === 0)).toBe(true);
    expect(parts.some((b) => b.start + b.length === 1)).toBe(true);
  });

  it("returns nothing for a region with no calendar", () => {
    expect(seasonBands("ZZ")).toEqual([]);
  });
});

describe("yearFraction", () => {
  it("is zero on 1 January and near one at year end", () => {
    expect(yearFraction(on(1, 1))).toBe(0);
    expect(yearFraction(on(12, 31))).toBeCloseTo(1, 1);
    expect(yearFraction(on(12, 31))).toBeLessThan(1);
  });

  it("increases monotonically through the year", () => {
    const points = [on(1, 1), on(4, 15), on(7, 1), on(10, 31), on(12, 20)];
    const fractions = points.map(yearFraction);
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
  });
});

describe("upcomingSeasons", () => {
  it("excludes currently-active seasons", () => {
    const date = on(8, 10);
    const ids = upcomingSeasons("AU", date, 10).map((s) => s.id);
    expect(ids).not.toContain("tax-time");
  });

  it("orders by soonest start", () => {
    const date = on(8, 10);
    const list = upcomingSeasons("AU", date, 10);
    const gaps = list.map((s) => daysUntilStart(s, date));
    expect([...gaps].sort((a, b) => a - b)).toEqual(gaps);
  });

  it("respects the limit", () => {
    expect(upcomingSeasons("AU", on(8, 10), 2)).toHaveLength(2);
  });

  it("returns nothing for a region with no calendar", () => {
    expect(upcomingSeasons("ZZ", on(8, 10))).toEqual([]);
  });
});

describe("regionToday", () => {
  // The bug this exists to prevent: production servers run UTC, AEST is UTC+10,
  // so the server date lags the user's by up to ten hours. 1 July is when ATO
  // lodgement opens and tax-scam advice matters most.
  it("resolves an AU date that UTC would still call the previous day", () => {
    // 30 June 23:00 UTC === 1 July 09:00 AEST.
    const utcInstant = new Date(Date.UTC(2026, 5, 30, 23, 0));
    expect(utcInstant.getUTCMonth() + 1).toBe(6); // server sees June
    expect(regionToday("AU", utcInstant)).toEqual({ month: 7, day: 1 });
  });

  it("puts tax season live on the AU morning lodgement opens", () => {
    const utcInstant = new Date(Date.UTC(2026, 5, 30, 23, 0));
    const ids = activeSeasons("AU", regionToday("AU", utcInstant)).map((s) => s.id);
    expect(ids).toContain("tax-time");
  });

  it("keeps EOFY active through the AU end of 30 June", () => {
    // 30 June 13:00 UTC === 30 June 23:00 AEST — still EOFY for the user.
    const utcInstant = new Date(Date.UTC(2026, 5, 30, 13, 0));
    const ids = activeSeasons("AU", regionToday("AU", utcInstant)).map((s) => s.id);
    expect(ids).toContain("eofy-business");
  });

  it("falls back to the server's civil date for a region with no calendar", () => {
    const d = new Date(Date.UTC(2026, 5, 30, 23, 0));
    expect(regionToday("ZZ", d)).toEqual({ month: d.getMonth() + 1, day: d.getDate() });
  });

  // The reason regionToday returns month/day rather than a Date: the value is
  // resolved on the server and then read again inside a client component, where
  // a Date would be interpreted in the *browser's* timezone. A device set to
  // UTC+13 would shift it a day and show a season active before it starts.
  it("returns a timezone-free value that survives the client boundary", () => {
    const civil = regionToday("AU", new Date(Date.UTC(2026, 5, 30, 23, 0)));
    // Structurally cloneable and meaningful without a timezone — what crosses
    // the RSC wire is exactly what the client reads back.
    expect(JSON.parse(JSON.stringify(civil))).toEqual(civil);
    expect(civil).not.toBeInstanceOf(Date);
  });

  // The concrete defect: a Date carries an instant, so a browser in an extreme
  // offset re-reads it as a different day. Here the server resolves 30 June in
  // Sydney; a device at UTC+14 reading the same instant as a Date sees 1 July
  // and would show tax season a day early. The CivilDate does not move.
  it("does not shift a day on a device in an extreme-offset timezone", () => {
    // 30 June 13:00 UTC === 30 June 23:00 AEST — EOFY, tax season not yet open.
    const instant = new Date(Date.UTC(2026, 5, 30, 13, 0));
    const civil = regionToday("AU", instant);
    expect(civil).toEqual({ month: 6, day: 30 });

    // What a UTC+14 client would have computed from the old noon-anchored Date.
    const asSeenAtPlus14 = new Date(instant.getTime() + 14 * 60 * 60 * 1000);
    expect(asSeenAtPlus14.getUTCDate()).toBe(1); // the day it would have jumped to

    // The season set is driven by the civil date, so it stays correct regardless.
    const ids = activeSeasons("AU", civil).map((s) => s.id);
    expect(ids).toContain("eofy-business");
    expect(ids).not.toContain("tax-time");
  });

  it("applies the summer DST offset, not a fixed one", () => {
    // Sydney is UTC+11 in January (AEDT), not UTC+10, so 1 Jan 13:30 UTC is
    // already 2 Jan locally. Intl handles the transition; a hardcoded offset
    // would get this wrong for half the year.
    expect(regionToday("AU", new Date(Date.UTC(2026, 0, 1, 13, 30)))).toEqual({ month: 1, day: 2 });
  });
});

describe("dayOfYear bounds (via daysUntilStart)", () => {
  // A 0-based month is an easy authoring slip next to all the getMonth() + 1
  // calls. Unclamped it indexes past the table and yields NaN, which sorts
  // arbitrarily and renders as "Starts in about NaN months".
  it("never returns NaN for an out-of-range month", () => {
    const bad = season({ startMonth: 0, startDay: 1, endMonth: 13, endDay: 1 });
    expect(Number.isNaN(daysUntilStart(bad, on(6, 1)))).toBe(false);
  });

  it("never returns NaN for a month above the table", () => {
    const bad = season({ startMonth: 13, startDay: 1, endMonth: 13, endDay: 2 });
    expect(Number.isNaN(daysUntilStart(bad, on(6, 1)))).toBe(false);
  });

  // The day was the undefended half of the pair: an out-of-range day produces an
  // ordinal overlapping the next month, so the season sorts wrongly and counts
  // down to a date that never arrives.
  it("clamps a day beyond the end of the month", () => {
    const bad = season({ startMonth: 4, startDay: 45, endMonth: 5, endDay: 1 });
    const days = daysUntilStart(bad, on(1, 1));
    expect(Number.isNaN(days)).toBe(false);
    // 30 April is the real last day, so it can never read as further out than that.
    expect(days).toBeLessThanOrEqual(daysUntilStart(season({ startMonth: 5, startDay: 1, endMonth: 5, endDay: 2 }), on(1, 1)));
  });

  it("clamps a 31st in a 30-day month to the month's real end", () => {
    const impossible = season({ startMonth: 4, startDay: 31, endMonth: 5, endDay: 1 });
    const real = season({ startMonth: 4, startDay: 30, endMonth: 5, endDay: 1 });
    expect(daysUntilStart(impossible, on(1, 1))).toBe(daysUntilStart(real, on(1, 1)));
  });

  it("clamps a zero or negative day", () => {
    const bad = season({ startMonth: 4, startDay: 0, endMonth: 5, endDay: 1 });
    expect(daysUntilStart(bad, on(1, 1))).toBe(
      daysUntilStart(season({ startMonth: 4, startDay: 1, endMonth: 5, endDay: 1 }), on(1, 1)),
    );
  });
});

describe("isWellFormedWindow", () => {
  it("accepts a real window", () => {
    expect(isWellFormedWindow({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 })).toBe(true);
  });

  it("accepts 29 February being absent — February tops out at 28", () => {
    // Leap years are deliberately ignored throughout, so 29 Feb is not authorable.
    expect(isWellFormedWindow({ startMonth: 2, startDay: 28, endMonth: 3, endDay: 1 })).toBe(true);
    expect(isWellFormedWindow({ startMonth: 2, startDay: 29, endMonth: 3, endDay: 1 })).toBe(false);
  });

  it("rejects a day past the end of a 30-day month", () => {
    expect(isWellFormedWindow({ startMonth: 4, startDay: 31, endMonth: 5, endDay: 1 })).toBe(false);
  });

  it("rejects an out-of-range month", () => {
    expect(isWellFormedWindow({ startMonth: 0, startDay: 1, endMonth: 5, endDay: 1 })).toBe(false);
    expect(isWellFormedWindow({ startMonth: 13, startDay: 1, endMonth: 5, endDay: 1 })).toBe(false);
  });

  it("rejects a non-integer date", () => {
    expect(isWellFormedWindow({ startMonth: 4.5, startDay: 1, endMonth: 5, endDay: 1 })).toBe(false);
    expect(isWellFormedWindow({ startMonth: 4, startDay: 1.5, endMonth: 5, endDay: 1 })).toBe(false);
  });

  it("checks the end of the window too, not just the start", () => {
    expect(isWellFormedWindow({ startMonth: 4, startDay: 1, endMonth: 6, endDay: 31 })).toBe(false);
  });
});

describe("calendar/timezone coupling", () => {
  // Belt-and-braces alongside the compile-time guarantee: REGION_TIMEZONE is
  // keyed by `keyof typeof CALENDARS`, so a region with seasons but no timezone
  // fails to build. This asserts the observable consequence — that every region
  // with a calendar resolves its date through its OWN timezone rather than the
  // raw server clock.
  //
  // The check is against an independent Intl computation per region rather than
  // "differs from UTC": that shortcut only held while AU (UTC+10) was the sole
  // region and always ran ahead of the server clock. With regions behind UTC
  // (US/CA) and near it (GB/IE) now authored, no single instant makes them all
  // differ from UTC — so we verify the zone is applied correctly instead, which
  // is the property that actually matters and holds at any offset.
  it("resolves a region-local date through each region's own timezone", () => {
    // Mirror of the internal REGION_TIMEZONE. Duplicated on purpose: the test's
    // job is to pin the mapping, so reading it from the module under test would
    // let a wrong zone pass by agreeing with itself.
    const ZONES: Partial<Record<ReturnType<typeof authoredCalendarRegions>[number], string>> = {
      AU: "Australia/Sydney",
      GB: "Europe/London",
      US: "America/New_York",
      CA: "America/Toronto",
      IE: "Europe/Dublin",
      NZ: "Pacific/Auckland",
    };

    // 30 June 23:00 UTC: a boundary instant that lands AU/NZ on 1 July and
    // GB/IE on the stroke of it, so the timezone application is observable rather
    // than incidentally agreeing with UTC.
    const instant = new Date(Date.UTC(2026, 5, 30, 23, 0));

    for (const code of authoredCalendarRegions()) {
      const zone = ZONES[code];
      expect(zone, `${code} is missing from the test's zone map`).toBeDefined();
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(instant);
      const field = (t: string) => Number(parts.find((p) => p.type === t)?.value);
      expect(
        regionToday(code, instant),
        `${code} did not resolve through ${zone}`,
      ).toEqual({ month: field("month"), day: field("day") });
    }
  });
});

describe("surfacing (home teaser / learn card / calendar page)", () => {
  // The teaser, the Learn link card and the calendar page all derive their
  // content from activeSeasons(), so they cannot disagree about what is in
  // season. This pins that shared source rather than the three renderers.
  it("gives the same active seasons to every surface", () => {
    const date = on(8, 10);
    const forCalendar = activeSeasons("AU", date).map((s) => s.id);
    const forTeaser = activeSeasons("AU", date).map((s) => s.id);
    expect(forTeaser).toEqual(forCalendar);
    expect(forTeaser.length).toBeGreaterThan(0);
  });

  // Both the teaser and the Learn card hide themselves when nothing is active,
  // so an empty result must be reachable rather than theoretical — otherwise the
  // hidden branch is dead code that never gets exercised.
  it("returns nothing for a region without a calendar, so teasers stay hidden", () => {
    expect(activeSeasons("ZZ", on(8, 10))).toEqual([]);
  });

  it("exposes a title for every active season, for the teaser's summary line", () => {
    for (const s of activeSeasons("AU", on(8, 10))) {
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.why.trim().length).toBeGreaterThan(0);
    }
  });

  // The AU calendar still has genuine quiet stretches — April and May, once the
  // summer/autumn disaster window has closed and before EOFY and tax season open.
  // The teaser and Learn card correctly hide themselves then, which is the honest
  // behaviour: inventing a season to keep a banner on screen would be filling
  // space rather than warning anyone.
  //
  // This documents the quiet months rather than forbidding them, so that adding
  // or removing a season shows up here as a deliberate change in coverage. The
  // set shrank from [3, 4, 5, 11] when the disaster-recovery (Oct–Mar) and
  // spring-racing (Oct–Nov) seasons were added, covering March and November.
  it("has quiet months, and hides the teaser rather than inventing a season", () => {
    const quietMonths = new Set<number>();
    for (let month = 1; month <= 12; month++) {
      for (let day = 1; day <= 28; day++) {
        if (activeSeasons("AU", on(month, day)).length === 0) quietMonths.add(month);
      }
    }
    expect([...quietMonths].sort((a, b) => a - b)).toEqual([4, 5]);
  });

  it("covers the months that matter most for AU scams", () => {
    // Tax time and the pre-Christmas retail window are the two periods the
    // calendar exists for; a gap in either would be a coverage bug.
    for (const month of [6, 7, 8, 9, 10, 12]) {
      expect(
        activeSeasons("AU", on(month, 15)).length,
        `no active season mid-month ${month}`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("formatWindow", () => {
  it("formats a normal window", () => {
    expect(formatWindow({ startMonth: 7, startDay: 1, endMonth: 10, endDay: 31 }))
      .toBe("1 July – 31 October");
  });

  it("formats a year-wrapping window without special-casing", () => {
    expect(formatWindow({ startMonth: 11, startDay: 20, endMonth: 1, endDay: 15 }))
      .toBe("20 November – 15 January");
  });
});

describe("labelSpan", () => {
  it("grows with the title and shrinks as the chart widens", () => {
    expect(labelSpan("Tax season", 1000)).toBeLessThan(labelSpan("Tax season for everyone", 1000));
    expect(labelSpan("Tax season", 2000)).toBeLessThan(labelSpan("Tax season", 1000));
  });

  it("is Infinity before the chart has been measured", () => {
    // Drives the "label nothing until we know the width" behaviour, which is
    // what stops labels rendering server-side and then rearranging on hydration.
    expect(labelSpan("Tax season", 0)).toBe(Infinity);
    expect(labelSpan("Tax season", -1)).toBe(Infinity);
  });
});

describe("labelPlacement", () => {
  // Bands are positioned by hand here rather than derived from a region, so
  // each case states exactly the geometry it is about.
  const band = (start: number, length: number, lane = 0): SeasonBand => ({
    season: season({ startMonth: 1, startDay: 1, endMonth: 1, endDay: 2 }),
    start,
    length,
    lane,
  });

  it("keeps a label inside a bar wide enough to hold it", () => {
    const b = band(0.2, 0.5);
    expect(labelPlacement(b, [b], 0.3)).toBe("inside");
  });

  it("puts an oversized label to the right when the lane is clear", () => {
    const b = band(0.1, 0.05);
    expect(labelPlacement(b, [b], 0.2)).toBe("right");
  });

  it("falls back to the left when the right is blocked", () => {
    const b = band(0.4, 0.05);
    const blocker = band(0.5, 0.3);
    expect(labelPlacement(b, [b, blocker], 0.2)).toBe("left");
  });

  it("hides a label with no room on either side", () => {
    // The case the estimate exists to catch: a narrow bar wedged between two
    // others. Overlapping a neighbour is worse than going unlabelled, and the
    // season is still named in the list below.
    const b = band(0.45, 0.05);
    const before = band(0.1, 0.34);
    const after = band(0.52, 0.3);
    expect(labelPlacement(b, [b, before, after], 0.2)).toBe("hidden");
  });

  it("ignores bars in other lanes", () => {
    // Lanes exist precisely so bars at the same horizontal position don't
    // collide, so a neighbour one lane down must not block a label.
    const b = band(0.1, 0.05, 0);
    const otherLane = band(0.16, 0.3, 1);
    expect(labelPlacement(b, [b, otherLane], 0.2)).toBe("right");
  });

  it("treats the chart edges as the outermost boundaries", () => {
    // A bar at the very end has no bar after it, but it does have the chart
    // edge — a label must not be placed into space that doesn't exist.
    const b = band(0.95, 0.05);
    expect(labelPlacement(b, [b], 0.2)).toBe("left");
  });

  it("labels nothing when the chart is unmeasured", () => {
    const b = band(0.2, 0.5);
    expect(labelPlacement(b, [b], Infinity)).toBe("hidden");
  });

  it("never overlaps a neighbour on any authored region", () => {
    // The real-data guard: for every region, no label may run into the bar
    // beside it. This is the invariant the hand-built cases above generalise.
    for (const code of authoredCalendarRegions()) {
      const bands = seasonBands(code);
      for (const b of bands) {
        const span = labelSpan(b.season.title, 1120);
        const placement = labelPlacement(b, bands, span);
        if (placement !== "right" && placement !== "left") continue;

        const lane = bands.filter((o) => o.lane === b.lane && o !== b);
        const [from, to] =
          placement === "right"
            ? [b.start + b.length, b.start + b.length + span]
            : [b.start - span, b.start];

        expect(from).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThanOrEqual(1);
        for (const other of lane) {
          const overlaps = from < other.start + other.length && other.start < to;
          expect(overlaps).toBe(false);
        }
      }
    }
  });
});

describe("expect: blocked citations", () => {
  // The flag stops the weekly check reporting a bot-blocked host as rot. It
  // WEAKENS a check, so it is worth asserting it stays rare and deliberate —
  // an unchecked citation is the failure the calendar's provenance rule exists
  // to prevent, and this flag is the one way to create one on purpose.
  const flagged = authoredCalendarRegions()
    .flatMap((code) => calendarForRegion(code).flatMap((s) => s.sources))
    .filter((s) => s.expect);

  it("only ever uses the one documented value", () => {
    // A typo ("Blocked", "block") would be silently ignored by the checker and
    // the citation would go back to reporting as dead, which is the confusing
    // failure rather than a loud one.
    for (const s of flagged) {
      expect({ label: s.label, expect: s.expect }).toEqual({ label: s.label, expect: "blocked" });
    }
  });

  it("stays a small minority of citations", () => {
    // No principled threshold — this is a smell test. Each flag is a source CI
    // has stopped genuinely checking, so if these ever outnumber the checked
    // ones the weekly run has become decorative and the approach needs
    // rethinking, not a bigger allowance.
    const all = authoredCalendarRegions().flatMap((code) =>
      calendarForRegion(code).flatMap((s) => s.sources),
    );
    const unique = new Set(all.map((s) => s.url));
    const uniqueFlagged = new Set(flagged.map((s) => s.url));
    expect(uniqueFlagged.size).toBeLessThan(unique.size / 4);
  });

  it("carries a comment explaining the verification", () => {
    // The flag asserts a human opened the page in a browser. That claim needs
    // to be written down next to it, or the next reader cannot tell a verified
    // block from a silenced failure.
    const src = readFileSync(resolve(__dirname, "../lib/scamCalendar.ts"), "utf8");
    for (const s of flagged) {
      const line = src.split("\n").findIndex((l) => l.includes(s.url) && l.includes("expect:"));
      expect({ url: s.url, documented: line > 0 }).toEqual({ url: s.url, documented: true });
      // A CONTIGUOUS comment block must sit directly above the entry, and it
      // must say something about the blocking — any nearby `//` is not a
      // justification, which an earlier version of this test accepted.
      const lines = src.split("\n");
      const block: string[] = [];
      for (let i = line - 1; i >= 0 && lines[i].trim().startsWith("//"); i--) {
        block.unshift(lines[i]);
      }
      const prose = block.join(" ").toLowerCase();
      expect({ url: s.url, hasBlock: block.length > 0 }).toEqual({ url: s.url, hasBlock: true });
      expect({
        url: s.url,
        justified: /block|403|bot|waf|browser/.test(prose),
      }).toEqual({ url: s.url, justified: true });
    }
  });
});
