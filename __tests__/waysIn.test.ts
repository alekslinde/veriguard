import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WAYS_IN } from "@/lib/waysIn";
import enNormal from "@/messages/en.normal.json";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const messages = enNormal as Record<string, string>;

describe("ways in", () => {
  it("resolves every message key it names", () => {
    for (const way of WAYS_IN) {
      for (const key of [way.name, way.how, way.detail, way.cta, way.unavailable]) {
        if (key) expect(messages[key], `${way.id}: ${key}`).toBeTruthy();
      }
    }
  });

  it("keeps every entry's copy authored, pending or not", () => {
    // Written as a filter on `unavailable`, which is now empty — the packages
    // row was the last pending entry and it shipped. An empty filter passes
    // while checking nothing, so the rule is asserted against every row.
    //
    // The original point stands either way: copy stays written whether or not
    // the row currently renders it, so clearing the one flag is the whole
    // change and an entry emptied while it waited is not rewritten from
    // nothing.
    for (const way of WAYS_IN) {
      expect(messages[way.detail], `${way.id}: no detail copy`).toBeTruthy();
    }
  });

  it("gives a row with a call to action somewhere for it to go", () => {
    // A label with no href renders nothing, so the pair has to hold: this is
    // how a CTA goes quietly missing after an href is set to null.
    for (const way of WAYS_IN.filter((w) => w.cta)) {
      expect(way.href, `${way.id} has a cta but no href`).toBeTruthy();
      expect(messages[way.cta!], `${way.id}: cta copy missing`).toBeTruthy();
    }
  });

  it("does not describe any surface as pending", () => {
    // This branch ships with both packages published, so a row still flagged
    // unavailable here would reach production announcing something that is
    // already live.
    const pending = WAYS_IN.filter((w) => w.unavailable).map((w) => w.id);
    expect(pending, `still marked unavailable: ${pending.join(", ")}`).toEqual([]);
  });
});

describe("the shelf scales to the channels still being added", () => {
  // Edge and Safari listings, the package docs, a Telegram bot: the stacked
  // rows this replaced cost a full screen-width line each, so seven of them at
  // the bottom of the home page was a footer link farm. A grid costs a shelf.
  const grid = read("components/WaysGrid.tsx");
  // Comments stripped for the "absence" assertions: the component explains
  // the class it no longer uses, and naming one is not applying it.
  const gridCode = grid.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("lays the channels out as rows in one column", () => {
    // Columns were the wrong answer to a real problem. The problem was that
    // the channels used to be full-width rows across the WHOLE page, so seven
    // of them would be a footer link farm. A 2-then-3 column grid fixed the
    // width and broke everything else: at 165px a tile's name wrapped and its
    // half-line clamped to nothing useful.
    //
    // The PAGE solves the width now — this sits in one column of a two-column
    // control centre, so a row is ~420px. Ten channels cost ten short rows in
    // a side column, which is the compactness the grid was reaching for.
    expect(grid).toMatch(/<div className="space-y-2\.5">/);
    expect(gridCode).not.toMatch(/grid-cols-2 md:grid-cols-3/);
  });

  it("does not resize a tile when it opens", () => {
    // `open:col-span-full` made an open tile jump to full width while its
    // neighbours stayed narrow, reflowing the rest around it and leaving a
    // ragged block of three different widths. Rows are already full width, so
    // opening one moves nothing sideways.
    expect(gridCode).not.toMatch(/open:col-span-full/);
  });

  it("sits inside a width the page caps", () => {
    // The shelf's rows are full width, so the PAGE has to be what bounds them.
    // Unbounded, a row is the full 1180px and seven of them read as a footer
    // link farm — the problem the shelf was reshaped to escape.
    //
    // Asserted as the cap rather than as the specific layout that provides it.
    // This was pinned to the two-column grid that used to hold the radar
    // alongside; when the radar left the home page the column went with it and
    // the cap moved onto the block itself, which bounds the rows just as well.
    // A test that names one mechanism fails on a layout change that preserves
    // the property it exists to protect.
    const home = read("app/page.tsx");
    const shelf = home.slice(home.indexOf("<WaysTeaser"));
    expect(shelf).not.toBe("");

    // The nearest wrapper above the shelf caps its width, by a max-w on the
    // block or by handing it a column of a wider grid.
    const capped =
      /max-w-\[\d+px\][^>]*>\s*(?:\{\/\*(?:[^*]|\*(?!\/))*\*\/\}\s*)*(?:<AddToHomeScreen[^>]*\/>\s*)?<WaysTeaser/.test(home) ||
      /lg:grid-cols-\[minmax\(/.test(home);
    expect(capped).toBe(true);
  });

  it("names a glyph for every channel", () => {
    // The shelf no longer DRAWS these. The rows are one line each — name, the
    // clause that follows it, and where it runs — and the icon column was
    // decoration costing the horizontal room that the right-hand chip now uses;
    // three named rows do not need telling apart by picture.
    //
    // The field stays authored and asserted because it is data about the
    // channel rather than about this shelf: WayIcon still exists and anything
    // else listing these surfaces draws from the same named set, which is what
    // stops a second list introducing a glyph at a different weight.
    for (const way of WAYS_IN) {
      expect(way.icon, way.id).toBeTruthy();
    }
  });

  it("gives every row its name, its clause and where it runs", () => {
    // What replaced the glyph. The one-line row is only self-describing if all
    // three parts are there — without `runs` on the face, the privacy
    // distinction between forwarding (via email) and the extension (on your
    // device) is invisible until a row is opened, and that is the fact a reader
    // choosing between them most needs.
    expect(grid).toMatch(/t\(way\.name\)/);
    expect(grid).toMatch(/t\(way\.how\)/);
    expect(grid).toMatch(/ways\.runs\.device/);
    expect(grid).toMatch(/ways\.runs\.server/);

    // And it is stated once, on the face. It used to be in the body because a
    // narrow tile had no room for it; both copies on screen would say the same
    // thing twice in two registers.
    expect(grid.match(/ways\.runs\.device/g)).toHaveLength(1);
  });
});

describe("an undistributed surface is not interactive", () => {
  // The npm package is built but unpublished. Its row opens to nothing anyone
  // can act on — a paragraph describing an install that does not exist — so it
  // renders flat: no disclosure, no link, no focus stop. A chevron there only
  // invites a click that pays out in disappointment.
  //
  // Asserted against source text rather than a mounted component, as in
  // homeStats.test.ts: this suite runs under environment "node" with no DOM.
  // Brittle to renaming, but the regression is otherwise silent.
  //
  // The rows became tiles in a shelf. A pending entry is its own component
  // again, as PendingRow was, and for the reason that shape existed: it must
  // not be a <details> at all.
  const grid = read("components/WaysGrid.tsx");
  const pending = grid.slice(
    grid.indexOf("function PendingTile("),
    grid.indexOf("function Tile("),
  );

  it("finds the pending tile to assert against", () => {
    // The assertions below slice the source, and a failed indexOf returns -1 —
    // which slices from the END of the file and yields a string that trivially
    // satisfies every `not.toContain` after it. This guard is what stops a
    // rename turning the rest of this block into a silent pass.
    expect(grid).toContain("function PendingTile(");
    expect(grid).toContain("function Tile(");
    expect(pending.length).toBeGreaterThan(200);
  });

  it("routes a pending entry away from the disclosure entirely", () => {
    expect(grid).toMatch(/if \(way\.unavailable\) return <PendingTile/);
  });

  it("is not a disclosure, so it is not a dead focus stop", () => {
    // A <summary> is focusable whatever you do to it. An earlier pass rendered
    // a <details> that prevented its own click, which stopped the mouse and
    // nothing else: a keyboard reader still tabbed to it, still got a focus
    // ring, and Enter still toggled an element whose body renders nothing —
    // offered to the reader least able to guess why it did nothing.
    expect(pending).not.toContain("<details");
    expect(pending).not.toContain("<summary");
    expect(pending).not.toContain("<a ");
    expect(pending).not.toContain("<button");
    expect(pending).not.toContain("onClick");
    // `open` as a React prop with no onToggle can also desync from the DOM's
    // own state.
    expect(pending).not.toMatch(/\bopen[:=]/);
  });

  it("states the status in place of a call to action", () => {
    expect(pending).toContain("pending");
    expect(pending).not.toContain("way.cta");
    // The status itself is rendered by the shared face, which is where the
    // interactive tile gets its name and half-line too — so the two shapes
    // cannot drift apart.
    //
    // Matched without the surrounding braces: the face renders this from a
    // ternary now (a pending row shows its status where a live one shows where
    // it runs), so `{t(…)}` as a literal was asserting the call's punctuation
    // rather than that the status is shown.
    expect(grid).toMatch(/t\(way\.unavailable!\)/);
  });
});
