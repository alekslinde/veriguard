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
  // The npm package is built but unpublished. Its row does not open: there is
  // no disclosure and no call to action, because a chevron promising install
  // instructions that do not work yet pays out in disappointment.
  //
  // It DOES link to its documentation, which is the one thing that exists
  // whether or not the package is published. That changed when /packages was
  // added: this row is the only place on the home page that names the package,
  // so suppressing its link left the docs reachable from nowhere. The rule is
  // about what is behind the link, not about linking:
  //
  //   · an on-site path is documentation — link it;
  //   · an external URL is the listing that does not exist yet — do not.
  //
  // Asserted against source text rather than a mounted component, as in
  // homeStats.test.ts: this suite runs under environment "node" with no DOM.
  // Brittle to renaming, but the regression is otherwise silent.
  const grid = read("components/WaysGrid.tsx");

  it("routes a pending entry away from the disclosure", () => {
    expect(grid).toMatch(/if \(way\.unavailable\) return <PendingRow/);
  });

  it("renders the flat row without a disclosure", () => {
    const body = grid.slice(
      grid.indexOf("function PendingRow"),
      grid.indexOf("function Row("),
    );
    expect(body).not.toContain("<summary");
    expect(body).not.toContain("<details");
    expect(body).not.toContain("onClick");
  });

  it("links a pending row only to an on-site path", () => {
    const body = grid.slice(
      grid.indexOf("function PendingRow"),
      grid.indexOf("function Row("),
    );
    // The guard is what keeps a store URL out of a row whose whole message is
    // that the listing is not live.
    expect(body).toContain('way.href?.startsWith("/")');
    // Next's Link, so an internal navigation is client-side like every other
    // on-site link in this component.
    expect(body).toContain("<Link");
    expect(body).not.toContain("<a ");
  });

  it("gives the npm row a docs path to link to", () => {
    // The row is the home page's only mention of the package. If this href
    // ever becomes external or null, the docs lose their entry point — which
    // is the bug this pair of tests exists to prevent.
    const npm = WAYS_IN.find((w) => w.id === "npm");
    expect(npm?.href, "the npm row has no href").toBeTruthy();
    expect(npm?.href?.startsWith("/"), `href is not on-site: ${npm?.href}`).toBe(true);
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
