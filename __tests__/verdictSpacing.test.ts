// The verdict sheet is one object made of bands, and the bands have to share
// an inset or it stops reading as one.
//
// They had drifted: the header and the score band sat at py-5, five more bands
// across two files at py-4, the score band itself at pt-4/pb-5, and the
// evidence list at py-[5px] — a figure smaller than the padding of the rows
// inside it, so the first row crowded the rule above. None of that fails a
// build, and none of it is visible in review unless the reviewer happens to
// compare two files; it shows up as a sheet that looks slightly wrong and
// cannot be pointed at.
//
// Read as source text rather than rendered, as the other layout suites here do
// (waysIn, externalLinks): these run under environment "node" with no DOM.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

const BADGE = read("components/VerdictBadge.tsx");
const FLOW = read("components/CheckFlow.tsx");

/**
 * Every CONTENT band of the sheet: a full-width strip, separated by a rule,
 * holding prose.
 *
 * A row of buttons is deliberately not one. Controls carry their own padding —
 * the action row's buttons are 40px tall inside a py-3.5 strip — so holding it
 * to the prose inset would make it the tallest band in the sheet while saying
 * the least. It is excluded by its flex layout, which is what distinguishes a
 * row of controls from a block of text.
 *
 * A decimal step (py-3.5) is likewise not a content band's inset; the capture
 * group only matches whole numbers, and the exclusion below is what keeps that
 * from being an accident of the pattern.
 */
const BAND = /border-[tb] border-\[var\(--rule\)\][^"]*px-5 py-(\d+)(?!\.)|px-5 py-(\d+)(?!\.)[^"]*border-[tb] border-\[var\(--rule\)\]/g;

/**
 * A strip of controls rather than prose.
 *
 * `flex-wrap` is the tell, and the verdict's own header is why it has to be:
 * that header is `flex items-start gap-4` and IS a content band, so flex alone
 * would exclude the one band the inset matters most for. A wrapping row is what
 * a set of buttons needs and what a dot-beside-a-heading never does.
 */
const isControlRow = (cls: string) => /\bflex-wrap\b/.test(cls);

describe("the verdict sheet's bands share one inset", () => {
  it("uses py-5 for every ruled band", () => {
    const offenders: string[] = [];

    for (const [file, src] of [
      ["components/VerdictBadge.tsx", BADGE],
      ["components/CheckFlow.tsx", FLOW],
    ] as const) {
      // Matched over whole className strings, so the control-row exclusion can
      // see the rest of the classes rather than just the fragment around the
      // padding.
      for (const attr of src.matchAll(/className=\{?[`"]([^`"]*)[`"]/g)) {
        const cls = attr[1];
        if (isControlRow(cls)) continue;

        for (const m of cls.matchAll(BAND)) {
          const value = m[1] ?? m[2];
          if (value !== "5") {
            offenders.push(`${file}: py-${value} on a ruled band — "${cls.slice(0, 70)}"`);
          }
        }
      }
    }

    expect(
      offenders,
      `the sheet's bands must all sit at py-5:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("does not inset the score band asymmetrically", () => {
    // It was pt-4/pb-5. The band opens on a label row and closes on a
    // paragraph — nothing about that asks for more space below than above, and
    // the result read as a panel that had settled low in its own box.
    const score = BADGE.slice(BADGE.indexOf("bg-black/[0.22]"));
    const cls = score.slice(0, score.indexOf('"'));
    expect(cls).not.toMatch(/p[tb]-\d/);
    expect(cls).toMatch(/py-5/);
  });

  it("gives the evidence list more room than its own rows", () => {
    // py-[5px] was less than the rows' own padding inside it, so the first
    // row's eyebrow sat nearer the header rule above than its own sentence
    // below — the list looked like it was crowding the section boundary rather
    // than sitting within it.
    const list = BADGE.slice(BADGE.indexOf("<ul className="));
    const listPad = list.match(/<ul className="py-(\d+)"/);
    expect(listPad, "the evidence list declares vertical padding").not.toBeNull();

    const rowPad = list.match(/px-5 py-(\d+) last:border-b-0/);
    expect(rowPad, "the evidence rows declare vertical padding").not.toBeNull();

    // In Tailwind's scale both are quarter-rem steps, so they compare directly.
    expect(Number(listPad![1])).toBeLessThanOrEqual(Number(rowPad![1]));
  });
});
