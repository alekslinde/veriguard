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

describe("an undistributed surface is not interactive", () => {
  // The npm package is built but unpublished. Its row opens to nothing anyone
  // can act on — a paragraph describing an install that does not exist — so it
  // renders flat: no disclosure, no link, no focus stop. A chevron there only
  // invites a click that pays out in disappointment.
  //
  // Asserted against source text rather than a mounted component, as in
  // homeStats.test.ts: this suite runs under environment "node" with no DOM.
  // Brittle to renaming, but the regression is otherwise silent.
  const grid = read("components/WaysGrid.tsx");

  it("routes a pending entry away from the disclosure", () => {
    expect(grid).toMatch(/if \(way\.unavailable\) return <PendingRow/);
  });

  it("renders the flat row without a summary or a link", () => {
    const body = grid.slice(
      grid.indexOf("function PendingRow"),
      grid.indexOf("function Row("),
    );
    expect(body).not.toContain("<summary");
    expect(body).not.toContain("<details");
    expect(body).not.toContain("<a ");
    expect(body).not.toContain("<Link");
    expect(body).not.toContain("onClick");
  });

  it("states the status in place of a call to action", () => {
    const body = grid.slice(
      grid.indexOf("function PendingRow"),
      grid.indexOf("function Row("),
    );
    expect(body).toContain("way.unavailable");
    expect(body).not.toContain("way.cta");
  });
});
