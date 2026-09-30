import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import enNormal from "@/messages/en.normal.json";
import { circulatingLures } from "@/lib/threatRadar";
import { activeSeasons, regionToday } from "@/lib/scamCalendar";

/**
 * Learn presents the sections it owns, rather than linking to them in prose.
 *
 * Radar, Calendar and Reports were top-level tabs competing with the check
 * itself. Folding them into Learn only works if Learn actually shows them —
 * otherwise the change hides three destinations behind a word.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const hub = read("components/LearnHub.tsx");
const messages = enNormal as Record<string, string>;

describe("the hub leads the page", () => {
  it("renders above the table of contents", () => {
    // These are destinations, not anchors. An index cannot carry them: a chip
    // saying "Radar" is a word, where a card can say what is circulating now.
    const learn = read("components/LearnContent.tsx");
    const hubAt = learn.indexOf("<LearnHub");
    const tocAt = learn.indexOf('aria-label={t("learn.toc.heading")}');
    expect(hubAt).toBeGreaterThan(-1);
    expect(tocAt).toBeGreaterThan(-1);
    expect(hubAt).toBeLessThan(tocAt);
  });

  it("links to each section Learn took over", () => {
    for (const href of ["/radar", "/calendar", "/submissions"]) {
      expect(hub, href).toContain(`"${href}"`);
    }
  });

  it("resolves every string it renders", () => {
    for (const key of [
      "learn.hub.heading",
      "learn.hub.radar.title",
      "learn.hub.radar.count",
      "learn.hub.radar.blurb",
      "learn.hub.calendar.title",
      "learn.hub.calendar.count",
      "learn.hub.calendar.blurb",
      "learn.hub.reports.title",
      "learn.hub.reports.blurb",
    ]) {
      expect(messages[key], key).toBeTruthy();
    }
  });
});

describe("the cards carry live figures", () => {
  // The data is real — scraped from official sources, dated, cited — and the
  // strongest argument for reading it is what it currently says. "4
  // circulating now" is an invitation; "Threat radar" is a menu item.
  it("labels each count with an interpolated figure", () => {
    expect(messages["learn.hub.radar.count"]).toContain("{n}");
    expect(messages["learn.hub.calendar.count"]).toContain("{n}");
  });

  it("reads the counts from the same data the pages render", () => {
    expect(hub).toMatch(/circulatingLures\(/);
    expect(hub).toMatch(/activeSeasons\(/);
  });

  it("has something to count for the authored region", () => {
    // AU is the region with a radar and a calendar authored. If this ever
    // returns nothing the cards are honest but empty, and that is worth
    // noticing here rather than on the page.
    expect(circulatingLures("AU", 99).length).toBeGreaterThan(0);
    expect(activeSeasons("AU", regionToday("AU"))).toBeInstanceOf(Array);
  });
});

describe("an absent count is not reported as zero", () => {
  it("renders no figure where the region has no radar authored", () => {
    // "0 circulating" is a claim we cannot support, and it reads as
    // reassurance — the opposite of what an unauthored region means. Null is
    // the absence; zero would be a finding.
    expect(hub).toMatch(/lures\.length \|\| null/);
  });

  it("keeps a real zero on the calendar, where it means something", () => {
    // Nothing peaking today IS a true statement about today, unlike an
    // unauthored radar. The card says it rather than hiding the figure.
    expect(hub).toMatch(/count: seasons\.length,/);
  });
});

describe("the cards stay legible on a phone", () => {
  it("scrolls as a rail rather than squeezing into three columns", () => {
    // Three columns at 390px gives each card ~110px, which turns every title
    // into a ladder and makes the block 245px tall to say three short things.
    expect(hub).toMatch(/overflow-x-auto/);
    expect(hub).toMatch(/sm:grid sm:grid-cols-3/);
  });

  it("sizes a rail card so the next one shows its edge", () => {
    // What says the row continues. A card at full width hides the rest.
    expect(hub).toMatch(/w-\[62%\]/);
    expect(hub).toMatch(/shrink-0/);
  });

  it("clamps the blurb so no card outgrows its neighbours", () => {
    expect(hub).toMatch(/line-clamp-3/);
  });
});
