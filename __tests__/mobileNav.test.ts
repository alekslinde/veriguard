import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LINKS,
  TAB_LINKS,
  HEADER_LINKS,
  CHILD_LINKS,
  isCurrentPath,
  isChildCurrent,
} from "@/components/navLinks";
import { translate, type LangMode } from "@/lib/i18n";

const NORMAL: LangMode = { locale: "en", tone: "normal" };
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * Three destinations, three tabs, nothing hidden.
 *
 * The bar used to show four tabs plus a More sheet, because six destinations do
 * not fit four slots. The sheet was a symptom: the information architecture was
 * too wide for the frame. What is pinned here is that it stays narrow enough
 * not to need one — not the specific destinations, which are free to change.
 */
describe("navigation model", () => {
  it("gives every destination a tab", () => {
    // The property the More sheet cost. A destination that is not a tab is one
    // a reader has to open something to discover.
    expect(TAB_LINKS).toHaveLength(LINKS.length);
    expect(new Set(LINKS.map((l) => l.href)).size).toBe(LINKS.length);
  });

  it("offers every route the app serves from a menu", () => {
    // THE BLIND SPOT THIS BLOCK USED TO HAVE. Everything above walks LINKS,
    // so folding Radar and Calendar into Learn left them in no menu at all —
    // reachable only by scrolling Learn or typing the URL — while every
    // assertion here still passed. Walking the ROUTES is what notices.
    //
    // /report and /share are deliberately absent: one is an errand reached
    // from a verdict, the other is where a share-sheet lands. Neither is
    // browsed to, and listing them would pad the menu with places nobody
    // navigates to on purpose.
    const offered = new Set([...LINKS, ...CHILD_LINKS].map((l) => l.href));
    for (const route of ["/", "/learn", "/about", "/radar", "/calendar", "/submissions"]) {
      expect(offered.has(route), `${route} is in no menu`).toBe(true);
    }
  });

  it("keeps a child out of the top level", () => {
    // Radar and Calendar are views of what Learn already holds, not peers of
    // Check. Promoting one is how the tab bar gets back to five targets and
    // re-grows a More sheet.
    for (const child of CHILD_LINKS) {
      expect(LINKS.some((l) => l.href === child.href), child.href).toBe(false);
      expect(child.icon, `${child.href} must not claim a tab slot`).toBeUndefined();
    }
  });

  it("resolves every child's label", () => {
    for (const c of CHILD_LINKS) {
      expect(translate(NORMAL, c.key), c.href).toBeTruthy();
    }
  });

  it("stays within what a narrow phone can label", () => {
    // At 390px, five targets is where the labels start truncating. Three is
    // comfortable; this fails before a fourth and fifth quietly arrive and
    // re-create the sheet.
    expect(TAB_LINKS.length).toBeLessThanOrEqual(4);
  });

  it("puts Check first, so the tool's own job is the leftmost tab", () => {
    expect(TAB_LINKS[0]?.href).toBe("/");
  });

  it("shows the same destinations in the desktop header", () => {
    expect(HEADER_LINKS).toEqual([...LINKS]);
  });

  it("resolves every nav label against the base bundle", () => {
    for (const l of LINKS) {
      expect(translate(NORMAL, l.key), l.href).toBeTruthy();
    }
  });
});

describe("isCurrentPath", () => {
  it("matches the home tab only on the home page", () => {
    // The bug this pins: startsWith("/") is true of every path, so a prefix
    // match would light the Check tab on every page of the site.
    expect(isCurrentPath("/", "/")).toBe(true);
    expect(isCurrentPath("/", "/learn")).toBe(false);
    expect(isCurrentPath("/", "/about")).toBe(false);
  });

  it("matches a section on its own nested pages", () => {
    expect(isCurrentPath("/learn", "/learn")).toBe(true);
    expect(isCurrentPath("/learn", "/learn/email")).toBe(true);
    expect(isCurrentPath("/learn", "/about")).toBe(false);
  });

  it("lights Learn on the sections it owns", () => {
    // Radar, Calendar and Reports keep their own addresses — a link to /radar
    // must not break — but a reader who follows one is in Learn.
    for (const p of ["/radar", "/calendar", "/submissions"]) {
      expect(isCurrentPath("/learn", p), p).toBe(true);
    }
  });

  it("lights Check on the routes that are the check under another name", () => {
    // /share renders the same CheckFlow; /report is the errand a verdict leads
    // to. Neither is a tab, and a bar with nothing lit reads as broken.
    for (const p of ["/share", "/report"]) {
      expect(isCurrentPath("/", p), p).toBe(true);
    }
  });
});

/**
 * The property that matters on a phone, asserted over every route the app
 * serves rather than over the nav list.
 *
 * Iterating the list is what let `/report` ship with no tab lit at all: it was
 * written into the old sheet's markup instead of the shared model, so it was in
 * no group and every test that walked those groups passed. Walking the ROUTES
 * is what catches a destination the model has forgotten.
 */
describe("every route lights exactly one tab", () => {
  const ROUTES = [
    "/",
    "/learn",
    "/radar",
    "/calendar",
    "/submissions",
    "/about",
    "/report",
    "/share",
  ];

  for (const route of ROUTES) {
    it(`lights one tab on ${route}`, () => {
      const lit = TAB_LINKS.filter((l) => isCurrentPath(l.href, route));
      expect(lit.length, `${route} lit: ${lit.map((l) => l.href).join(", ")}`).toBe(1);
    });
  }
});

describe("the root's exact match does not depend on data edited elsewhere", () => {
  // "/" is matched exactly precisely because startsWith("/") is true of every
  // path. That guard used to run AFTER the owned-route check, so its
  // correctness rested on a list in another part of the file happening not to
  // contain "/". Adding it there — a natural edit, given the list holds the
  // routes a section borrows — would have lit Check on every page of the site,
  // with nothing throwing and every list-walking test still passing.
  const src = read("components/navLinks.ts");

  it("decides the root before consulting any section list", () => {
    const rootGuard = src.indexOf('if (href === "/")');
    const ownedCheck = src.indexOf("if (isOwnedBy(href, pathname)) return true;");
    expect(rootGuard).toBeGreaterThan(-1);
    expect(ownedCheck).toBeGreaterThan(-1);
    expect(rootGuard).toBeLessThan(ownedCheck);
  });

  it("filters the root out of the owned set in any case", () => {
    expect(src).toMatch(/\.filter\(\(p\) => p !== "\/"\)/);
  });

  it("still lights exactly one tab if someone adds the root to a section", () => {
    // The behavioural version of the above: whatever the list says, no route
    // may light two tabs.
    for (const route of ["/", "/learn", "/about", "/radar", "/report"]) {
      const lit = TAB_LINKS.filter((l) => isCurrentPath(l.href, route));
      expect(lit.length, route).toBe(1);
    }
  });
});

describe("exactly one element claims to be the page", () => {
  // A parent stays visually lit on a child's page — the reader IS in that
  // section — but aria-current="page" is a claim about the page itself, and
  // two of them is a contradiction a screen reader reads out twice. Both menus
  // gate the parent's on isChildCurrent; without it /radar lit Learn AND
  // Radar, which the browser confirmed before this test existed.
  it("hands the claim to the child on a child's page", () => {
    const learn = LINKS.find((l) => l.href === "/learn")!;
    for (const child of learn.children ?? []) {
      expect(isChildCurrent(learn, child.href), child.href).toBe(true);
    }
  });

  it("leaves it with the parent on the parent's own page", () => {
    const learn = LINKS.find((l) => l.href === "/learn")!;
    expect(isChildCurrent(learn, "/learn")).toBe(false);
  });

  it("is false for a section with no children", () => {
    for (const l of LINKS.filter((x) => !x.children)) {
      expect(isChildCurrent(l, l.href), l.href).toBe(false);
    }
  });

  it("gates the claim in both menus", () => {
    for (const file of ["components/SiteHeader.tsx", "components/MobileTabBar.tsx"]) {
      expect(read(file), file).toMatch(/aria-current=\{[^}]*!\s*(isChildCurrent|onChild)/);
    }
  });
});

describe("the section's pages are offered where the reader is", () => {
  it("renders the sub-links in the header", () => {
    expect(read("components/SiteHeader.tsx")).toMatch(/l\.children\?\.map/);
  });

  it("renders them above the tab bar too", () => {
    const bar = read("components/MobileTabBar.tsx");
    expect(bar).toMatch(/section\?\.children/);
    // A fourth and fifth tab is what forced the More sheet; the children are a
    // row above the bar instead, shown only inside the section that owns them.
    expect(bar).toMatch(/data-subnav/);
  });

  it("reserves room for that row so it cannot cover the footer", () => {
    // Measured at 52px of overlap before this existed: --tabbar-h is what the
    // page reserves as bottom padding, and the bar got taller without it.
    const css = read("app/globals.css");
    expect(css).toMatch(/--subnav-h/);
    expect(css).toMatch(/:root:has\(nav \[data-subnav\]\)/);
    expect(css).toMatch(/--tabbar-h: calc\(55px \+ var\(--subnav-h\)/);
  });
});

describe("the More sheet and its machinery are gone", () => {
  // The sheet needed a scrim, a scroll lock, a focus return, a resize guard and
  // an open-state-as-pathname trick to close on a back navigation. None of that
  // was gratuitous — it was all load-bearing for a control that existed only
  // because the nav was too wide. Re-adding any of it means the nav grew again.
  const bar = read("components/MobileTabBar.tsx");

  it("renders no sheet, scrim or toggle", () => {
    expect(bar).not.toMatch(/tab-more|MoreGlyph|isMoreCurrent/);
    expect(bar).not.toMatch(/aria-expanded/);
  });

  it("locks no scroll and traps no focus", () => {
    expect(bar).not.toMatch(/overflow.*hidden.*body|document\.body\.style/);
    expect(bar).not.toMatch(/addEventListener\("keydown"/);
  });

  it("needs no effects at all", () => {
    // Three links and a current-path check. If this component grows a
    // useEffect, something stateful came back.
    expect(bar).not.toMatch(/useEffect|useState/);
  });

  it("leaves the footer reachable on a phone", () => {
    // The sheet held the bug report, because the footer was desktop-only. With
    // the sheet gone, a footer still hidden below md would make it unreachable.
    expect(read("app/layout.tsx")).not.toMatch(/hidden md:block[\s\S]{0,80}SiteFooter/);
  });
});
