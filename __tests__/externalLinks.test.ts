// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

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

  it("marks each outbound link exactly once", () => {
    // The merge doubled these: main added the arrow and the note inline while
    // this branch was wrapping the same buttons in ExternalLink, so every store
    // button rendered two arrows and announced the new tab twice. Both suites
    // passed throughout — each asserted the marks were PRESENT, and neither
    // counted them.
    //
    // Checked on the children a component is given, because that is where the
    // duplicate lived: ExternalLink always supplies one of each, so a mark in
    // its children is a second one.
    // Counted per FILE, not per ExternalLink block. The duplicate that
    // prompted this lived in a `label` variable built several lines above the
    // component and passed in as children — so a check that scanned only
    // between <ExternalLink> and </ExternalLink> saw nothing, and a mutation
    // reinstating the bug passed. Marks are rare enough that a file-level
    // count is the measure that actually binds.
    for (const file of FILES) {
      // Comments stripped first: they discuss the glyph (" the ↗ would say
      // 'this leaves the site' "), and counting prose made this fail on a file
      // whose markup was correct.
      const source = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const uses = [...source.matchAll(/<ExternalLink/g)].length;
      if (!uses) continue;

      // Each `arrow={false}` is a deliberate opt-out that places its own arrow
      // (the agency cards put it on the domain line), so it licenses one.
      const optOuts = [...source.matchAll(/arrow=\{false\}/g)].length;

      // Arrows written by hand in a file that also uses the component. Any
      // beyond the opt-outs is a second mark on a link already marked.
      const handWritten = [...source.matchAll(/↗/g)].length;
      expect(
        handWritten,
        `${file}: ${handWritten} hand-written ↗ with ${optOuts} arrow={false} — ` +
          "ExternalLink already supplies one per link",
      ).toBeLessThanOrEqual(optOuts);

      // The note is never placed by hand in a file using the component: unlike
      // the arrow it has no positioning reason to exist, so any occurrence is
      // a duplicate announcement.
      const handNotes = [...source.matchAll(/sr-only[^>]*>\s*\(\{t\("a11y\.newTab"\)\}\)/g)].length;
      expect(
        handNotes,
        `${file}: announces the new tab by hand while using ExternalLink, which already does`,
      ).toBe(0);
    }
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

  it("does not let bare be used as a prose variant", () => {
    // The gap the invariants above could not see. Every assertion in this file
    // so far is about what EVERY link gets — the rel, the arrow, the note, the
    // ring — and all of them passed while three prose links rendered in three
    // different colours, because each had reached for `bare` and supplied its
    // own styling on top.
    //
    // `bare` means "the caller's box is the control": an agency card, a store
    // button. Passing it a className that colours or underlines TEXT is the
    // signature of a prose link going around the variants, which is how five
    // hover treatments came back the first time.
    //
    // Matched on the className rather than on bare itself, so a card keeping
    // its border and padding in a className is untouched.
    //
    // A className given as an identifier (`className={LINK}`) is resolved to
    // the string that identifier holds in the same file. The real offender was
    // written exactly that way, so a check reading only the literal text of the
    // tag saw an opaque name and passed — this assertion was written once
    // without this step and missed the bug it exists for.
    const TEXTY = /\b(underline|text-\[var\(--clear\)\])/;

    const offenders: string[] = [];
    for (const file of FILES) {
      const source = read(file);

      // `const NAME = "…";` and `const NAME = "…" + "…";` — the shapes these
      // style constants are written in.
      //
      // The separator is `\s*\+\s*` with the + REQUIRED, and the whole group
      // is what repeats. Written as `(?:"[^"]*"\s*\+?\s*)+` — a string followed
      // by an optional plus — every part after the first string could match
      // empty, so a run of adjacent quoted strings gave the engine exponentially
      // many ways to divide it and CodeQL flagged the backtracking. Requiring
      // the join inside the repeated group leaves exactly one parse.
      const consts = new Map<string, string>();
      for (const c of source.matchAll(/const (\w+)\s*=\s*("[^"]*"(?:\s*\+\s*"[^"]*")*)\s*;/g)) {
        consts.set(c[1], c[2].replace(/"/g, "").replace(/\s*\+\s*/g, ""));
      }

      for (const m of source.matchAll(/<ExternalLink[\s\S]*?>/g)) {
        const tag = m[0];
        if (!/variant="bare"/.test(tag)) continue;

        const cls = tag.match(/className=(?:\{(\w+)\}|["`]([^"`]*)["`])/);
        if (!cls) continue;
        const styles = cls[1] ? (consts.get(cls[1]) ?? "") : (cls[2] ?? "");

        if (TEXTY.test(styles)) {
          offenders.push(`${file}: ${tag.replace(/\s+/g, " ").slice(0, 80)}`);
        }
      }
    }
    expect(
      offenders,
      `these style a prose link through bare instead of using a variant:\n${offenders.join("\n")}`,
    ).toEqual([]);
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
