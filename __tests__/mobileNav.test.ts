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
    const header = read("components/SiteHeader.tsx");

    // Shown for the section the reader is IN, resolved the same way the tab
    // bar resolves its own row — one predicate over one list, so the two bars
    // cannot come to disagree about which section a route belongs to.
    //
    // This used to assert `l.children?.map`, which rendered EVERY section's
    // children flat beside their parent: six links in a bar whose phone
    // equivalent showed three, with Radar, Calendar and Reports sitting as
    // visual peers of Check while the model says they are Learn's. The
    // property the suite protects is that a section's pages are offered where
    // the reader is, and that still holds — it is the flat rendering that went.
    expect(header).toMatch(/HEADER_LINKS\.find\(/);
    expect(header).toMatch(/section\?\.children/);
    expect(header).toMatch(/children\.map/);
  });

  it("reserves room for the header's own row", () => {
    // --header-h is what everything pinning below the header measures from,
    // and the learn page's sticky table of contents is the proof: Learn is
    // exactly the section that has children, so a token blind to this row
    // would pin that bar underneath it on the one page where both show.
    const header = read("components/SiteHeader.tsx");
    const css = read("app/globals.css");
    expect(header).toMatch(/data-header-subnav/);
    expect(css).toMatch(/:root:has\(header \[data-header-subnav\]\)/);

    // The row's height is declared, not left to a font metric, so the token can
    // state it exactly rather than approximating it — and the two numbers have
    // to agree, which is the thing that actually breaks. Read both and compare
    // rather than pinning either: the height is a design choice that may change
    // again, while "the token equals the row plus its 1px border" may not.
    // Anchored to the sub-nav's own <ul>, not the first h-[…] in the file —
    // that one is the main row's min-h-[52px], which is a different bar and was
    // what this compared against on its first writing.
    const rowH = header.match(/justify-end[^"]*\bh-\[(\d+)px\]/);
    expect(rowH, "the sub-nav row declares a height").not.toBeNull();

    const tokenH = css.match(/--header-h: calc\(59px \+ (\d+)px\)/);
    expect(tokenH, "--header-h accounts for the row").not.toBeNull();

    expect(Number(tokenH![1])).toBe(Number(rowH![1]) + 1);
  });

  it("shows each width one copy of the section row", () => {
    // Both bars render the same children. The header's row is md-and-up and
    // the tab bar's is below it, so a reader meets one — two would be two
    // places to look for one thing.
    expect(read("components/SiteHeader.tsx")).toMatch(/hidden md:block[^"]*/);
    expect(read("components/MobileTabBar.tsx")).toMatch(/md:hidden/);
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

  it("scopes only --subnav-h to the routes that show the row", () => {
    // The bug this pins, which nothing else could see: the :has() block was
    // inserted so it swallowed --header-h, leaving that token defined ONLY on
    // routes whose section has sub-links. On /, /share, /about and /report
    // below 768px it was undefined, so every reader of it fell back to 0 —
    // including [data-step-heading]'s scroll-margin-top, which then scrolled
    // each check step flush under the sticky header on the one route the
    // check flow lives on.
    const css = read("app/globals.css");
    const start = css.indexOf(":root:has(nav [data-subnav])");
    expect(start).toBeGreaterThan(-1);
    const block = css.slice(start, css.indexOf("}", start));
    const declared = [...block.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]);
    expect(declared).toEqual(["--subnav-h"]);
  });

  it("defines --header-h unconditionally", () => {
    // Everything that pins below the header reads it: the learn page's sticky
    // index, the check flow's step headings. It must not depend on which route
    // is rendering.
    const css = read("app/globals.css");
    const base = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    expect(base).toMatch(/--header-h:/);
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

  it("keeps the bug report reachable on a phone", () => {
    // The property, across three homes. It lived in the More sheet, then in a
    // site footer that had to render at every width because nothing else
    // offered it. Both are gone — an app has neither — and it is on the about
    // page now, beside the prose explaining what sending one includes.
    //
    // What makes that safe is that /about is a tab: reachable in one tap on a
    // phone, not scrolled to. If the bug report ever moves somewhere that is
    // not a top-level destination, this is the test that should stop it.
    const about = read("app/about/page.tsx");
    expect(about).toMatch(/<ReportBugButton/);

    const aboutIsATab = LINKS.some((l) => l.href === "/about" && l.icon);
    expect(aboutIsATab).toBe(true);
  });

  it("mounts no site footer", () => {
    // A chrome strip under every screen is a website's shape. Its items were
    // rehomed rather than dropped (see the note in layout.tsx), so this guards
    // the removal rather than merely recording it.
    expect(read("app/layout.tsx")).not.toMatch(/SiteFooter/);
  });
});
