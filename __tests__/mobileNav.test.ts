import { describe, it, expect } from "vitest";
import {
  LINKS,
  TAB_LINKS,
  MORE_LINKS,
  isCurrentPath,
  isMoreCurrent,
} from "@/components/navLinks";
import { translate, type LangMode } from "@/lib/i18n";

const NORMAL: LangMode = { locale: "en", tone: "normal" };

/**
 * The phone shows four tabs plus More; the desktop header shows all six inline.
 * Both read the same list, so what is pinned here is the split staying coherent
 * — not the specific destinations, which are free to change.
 */
describe("navigation model", () => {
  it("splits every link into exactly one of the two groups", () => {
    expect([...TAB_LINKS, ...MORE_LINKS]).toHaveLength(LINKS.length);
    expect(new Set(LINKS.map((l) => l.href)).size).toBe(LINKS.length);
  });

  it("keeps the tab bar to five targets", () => {
    // Four links plus the More button. A fifth link makes six targets, and at
    // 390px the labels start truncating — which is the width of the phone most
    // likely to be holding the suspicious message.
    expect(TAB_LINKS).toHaveLength(4);
  });

  it("puts Check first, so the tool's own job is the leftmost tab", () => {
    expect(TAB_LINKS[0]?.href).toBe("/");
  });

  it("resolves every nav label against the base bundle", () => {
    for (const l of LINKS) {
      expect(translate(NORMAL, l.key), l.href).toBeTruthy();
    }
    // The two strings the tab bar adds beyond the shared list.
    expect(translate(NORMAL, "nav.more")).toBeTruthy();
    expect(translate(NORMAL, "nav.report")).toBeTruthy();
  });
});

describe("isCurrentPath", () => {
  it("matches the home tab only on the home page", () => {
    expect(isCurrentPath("/", "/")).toBe(true);
    // The bug this pins: startsWith("/") is true of every path, so a prefix
    // match would light the Check tab on every page of the site.
    expect(isCurrentPath("/", "/radar")).toBe(false);
    expect(isCurrentPath("/", "/about")).toBe(false);
  });

  it("matches a section on its own nested pages", () => {
    expect(isCurrentPath("/learn", "/learn")).toBe(true);
    expect(isCurrentPath("/learn", "/learn/email")).toBe(true);
    expect(isCurrentPath("/learn", "/radar")).toBe(false);
  });
});

describe("isMoreCurrent", () => {
  it("is true on the pages the sheet holds", () => {
    for (const l of MORE_LINKS) {
      expect(isMoreCurrent(l.href), l.href).toBe(true);
    }
  });

  it("is false on the pages that have their own tab", () => {
    // Otherwise two tabs light at once, or — on "/" — More lights instead of
    // Check.
    for (const l of TAB_LINKS) {
      expect(isMoreCurrent(l.href), l.href).toBe(false);
    }
  });
});
