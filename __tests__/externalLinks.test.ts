// Every link that leaves the site goes through one component.
//
// They did not, and the drift is what this suite exists to stop recurring:
// five hover treatments, two arrow glyphs (→ and ↗) used interchangeably, one
// hardcoded English "(opens in a new tab)" where everything else reads the
// message bundle, two links with no new-tab note at all, and no focus ring on
// any of them — while every other interactive surface in the app had one.
//
// None of that fails a build, and none of it is visible in review unless the
// reviewer happens to compare two files. So it is asserted here.
//
// Read as source text rather than rendered: this suite runs under environment
// "node" with no DOM, the same approach as waysIn.test.ts and homeStats
// .test.ts. Brittle to renaming, which is the trade — the regression is
// otherwise silent.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** Every .tsx under components/ and app/, which is where links live. */
function tsxFiles(): string[] {
  const out: string[] = [];
  for (const dir of ["components", "app"]) {
    const walk = (rel: string) => {
      for (const entry of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
        const next = path.join(rel, entry.name);
        if (entry.isDirectory()) walk(next);
        else if (entry.name.endsWith(".tsx")) out.push(next);
      }
    };
    walk(dir);
  }
  return out;
}

const FILES = tsxFiles();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/**
 * Files allowed to set target="_blank" by hand.
 *
 * ExternalLink is the component itself. CheckFlow's reporting link is
 * conditionally external — it is a mailto: for some providers and a URL for
 * others — so it sets the attribute from a ternary and cannot use a component
 * that always opens a new tab. It already carries the arrow and the note.
 */
const ALLOWED_RAW = ["components/ExternalLink.tsx", "components/CheckFlow.tsx"];

describe("external links go through ExternalLink", () => {
  it("finds the files to check", () => {
    // Guards against the walk silently returning nothing.
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES).toContain("components/ExternalLink.tsx");
  });

  it("has no hand-rolled target=_blank outside the allowed files", () => {
    const offenders = FILES.filter(
      (f) => !ALLOWED_RAW.includes(f) && read(f).includes('target="_blank"'),
    );
    expect(
      offenders,
      `these set target="_blank" directly instead of using ExternalLink: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("never uses → inside an external link", () => {
    // → means "this continues"; ↗ means "this leaves". The two were mixed, so
    // the glyph told the reader nothing.
    //
    // → on an INTERNAL link is correct and stays: the packages CTA in WaysGrid
    // uses it, because that navigation does not leave the site. So this looks
    // for → in an external link specifically, rather than anywhere in a file —
    // the broader check flagged that CTA, which was the test being wrong rather
    // than the code.
    const offenders = FILES.filter((f) => {
      const source = read(f);
      // Each <ExternalLink …>…</ExternalLink> and each raw <a target="_blank">.
      const externals = [
        ...source.matchAll(/<ExternalLink[\s\S]*?<\/ExternalLink>/g),
        ...source.matchAll(/<a\s[^>]*target="_blank"[\s\S]*?<\/a>/g),
      ].map((m) => m[0]);
      return externals.some((block) => block.includes("→"));
    });
    expect(offenders, `these mark an external link with → instead of ↗: ${offenders.join(", ")}`)
      .toEqual([]);
  });

  it("never hardcodes the new-tab wording", () => {
    // app/about/page.tsx carried the English string inline, so it stayed
    // English in every other language.
    const offenders = FILES.filter((f) => /\(opens in a new tab\)/.test(read(f)));
    expect(
      offenders,
      `these hardcode the a11y string instead of t("a11y.newTab"): ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

describe("the ExternalLink contract", () => {
  const source = read("components/ExternalLink.tsx");

  it("always pairs target=_blank with rel=noopener noreferrer", () => {
    // Without noopener the opened page gets a handle on this one. Centralising
    // it is the point: it was correct in seven places and missing nowhere only
    // by luck.
    expect(source).toContain('target="_blank"');
    expect(source).toContain('rel="noopener noreferrer"');
  });

  it("announces the destination to a screen reader", () => {
    // The glyph is aria-hidden, so the information has to arrive as text.
    expect(source).toContain('className="sr-only"');
    expect(source).toContain('t("a11y.newTab")');
  });

  it("hides the arrow from assistive tech", () => {
    // "north east arrow" read aloud after every link is noise.
    expect(source).toMatch(/aria-hidden="true">\s*↗/);
  });

  it("gives every variant the app's focus ring", () => {
    // The gap that prompted this: no external link had a focus-visible style,
    // so keyboard users got the browser default while buttons and summaries
    // had an explicit one.
    expect(source).toContain("focus-visible:outline-[var(--clear)]");

    const variants = source.slice(source.indexOf("const VARIANTS"), source.indexOf("} as const"));
    const entries = [...variants.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]);
    expect(entries.length, "no variants parsed").toBeGreaterThan(2);
    // Each either names FOCUS or interpolates it.
    for (const name of entries) {
      const line = variants.slice(variants.indexOf(`${name}:`));
      expect(line.slice(0, line.indexOf("\n")), `variant "${name}" has no focus ring`)
        .toMatch(/FOCUS/);
    }
  });

  it("can omit the arrow without omitting the note", () => {
    // Citation runs and store-button rows turn the arrow off because one per
    // item is noise. The note must not be optional with it — that is the part
    // a reader cannot see.
    const body = source.slice(source.indexOf("return ("));
    expect(body).toMatch(/\{arrow && /);
    const noteIndex = body.indexOf('className="sr-only"');
    const arrowGuard = body.indexOf("{arrow &&");
    expect(noteIndex, "the note is inside the arrow guard").toBeLessThan(arrowGuard);
  });
});

// ── Cases carried over from main's independent version of this suite ─────────
//
// main fixed the same five link sites while this branch was open and wrote its
// own externalLinks.test.ts, per-file and matching raw <a target="_blank">.
// Those assertions go vacuous here, because the anchors are ExternalLink now
// and its regex finds nothing — which is the trap in a suite that iterates
// whatever it happens to find.
//
// This case is the one main had that this file did not, and it survives the
// merge on its own merits.

describe("the install buttons", () => {
  const grid = read("components/WaysGrid.tsx");

  it("does not mark the browsers that are not links", () => {
    // Edge and Safari render as plain text while unpublished — nothing
    // navigates, so an arrow or a new-tab note there would promise a click
    // that does nothing.
    const start = grid.indexOf("if (!target.url)");
    expect(start, "the unpublished-browser branch is gone").toBeGreaterThan(-1);
    const pendingBranch = grid.slice(start, grid.indexOf("</li>", start));
    expect(pendingBranch).not.toContain("↗");
    expect(pendingBranch).not.toContain("a11y.newTab");
    expect(pendingBranch).not.toContain("ExternalLink");
  });

  it("routes the real store links through the shared component", () => {
    // The regression main's suite was written for: these opened a browser
    // store with no arrow and no note, in the one section of the app whose
    // subject is where a link really goes. They now get all of it, plus the
    // focus ring main's version did not cover, from ExternalLink.
    expect(grid).toContain("<ExternalLink");
    expect(grid).not.toMatch(/<a\b[^>]*target="_blank"/);
  });
});
