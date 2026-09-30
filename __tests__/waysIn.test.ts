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

  it("keeps a pending entry's copy authored, ready for the day it ships", () => {
    // `detail`, `cta` and `href` are not rendered while an entry is pending.
    // They stay written anyway: clearing the one flag is then the whole change,
    // where an entry emptied while it waited would need writing from nothing.
    for (const way of WAYS_IN.filter((w) => w.unavailable)) {
      expect(messages[way.detail]).toBeTruthy();
      expect(way.cta && messages[way.cta]).toBeTruthy();
    }
  });
});

describe("the shelf scales to the channels still being added", () => {
  // Edge and Safari listings, the package docs, a Telegram bot: the stacked
  // rows this replaced cost a full screen-width line each, so seven of them at
  // the bottom of the home page was a footer link farm. A grid costs a shelf.
  const grid = read("components/WaysGrid.tsx");

  it("lays the channels out as a grid, not a stack", () => {
    expect(grid).toMatch(/grid grid-cols-2 md:grid-cols-3/);
  });

  it("keeps two columns on the narrowest phone", () => {
    // One column on the width where compactness matters most would give back
    // exactly what the shelf was for. A closed tile is a glyph, a name and a
    // clamped half-line — it fits.
    expect(grid).not.toMatch(/grid-cols-1 (xs|sm):grid-cols-2/);
  });

  it("gives an open tile the full row", () => {
    // The bodies hold control groups — a copy button, four install buttons —
    // that wrap one per line in a half-width cell on a phone.
    expect(grid).toMatch(/open:col-span-full/);
  });

  it("does not stretch a closed tile to its row's height", () => {
    expect(grid).toMatch(/items-start/);
  });

  it("draws every channel's glyph from the shared set", () => {
    // A tile's icon is named in the data and drawn by one component, so adding
    // a channel cannot introduce a glyph at a different weight — a shelf is
    // read as one object, and an odd glyph reads as a different KIND of thing.
    expect(grid).toMatch(/<WayIcon name=\{way\.icon\}/);
    for (const way of WAYS_IN) {
      expect(way.icon, way.id).toBeTruthy();
    }
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
  // The rows became tiles in a shelf, so a pending entry is no longer a
  // separate component — it is a tile that refuses to open. The property is
  // unchanged and so are these assertions; only where they look has moved.
  const grid = read("components/WaysGrid.tsx");
  const tile = grid.slice(grid.indexOf("function Tile("), grid.indexOf("export default function"));

  it("finds the tile body to assert against", () => {
    // The two assertions below slice the source, and a failed indexOf returns
    // -1 — which slices from the END of the file and yields a string that
    // trivially satisfies every `not.toContain` after it. This guard is what
    // stops a rename turning the rest of this block into a silent pass.
    expect(grid).toContain("function Tile(");
    expect(tile.length).toBeGreaterThan(200);
  });

  it("marks a pending entry so the tile can refuse to open", () => {
    expect(tile).toMatch(/const pending = Boolean\(way\.unavailable\)/);
  });

  it("gives a pending tile no body and no way to open it", () => {
    // The disclosure body and the chevron are both behind `!pending`, and the
    // summary's click is prevented — so there is no focus stop that pays out in
    // a paragraph about an install nobody can run.
    expect(tile).toMatch(/\{!pending && <Chevron \/>\}/);
    expect(tile).toMatch(/\{!pending && \(/);
    expect(tile).toMatch(/e\.preventDefault\(\)/);
  });

  it("states the status in place of a call to action", () => {
    expect(tile).toContain("way.unavailable");
    expect(tile).not.toContain("way.cta");
  });
});
