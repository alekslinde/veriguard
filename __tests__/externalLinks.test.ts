import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import enNormal from "@/messages/en.normal.json";

/**
 * Every link that leaves the site says so, the same way.
 *
 * The convention is two marks, and both are load-bearing for a different
 * reader: a `↗` glyph, which tells a sighted reader the tab is about to
 * change, and an sr-only "(opens in a new tab)", which tells everyone else.
 * SiteFooter's "Built by Aleks Linde" is the reference implementation.
 *
 * This matters more here than on a typical site. The product's whole subject
 * is noticing where a link actually goes — a tool that opens new tabs without
 * saying so is teaching the opposite of what it exists to teach.
 *
 * The browser-store install buttons were the one place missing both: they
 * looked like in-page buttons and silently opened a store.
 *
 * Asserted on source text, with the limitation the other UI tests record: the
 * suite runs under environment "node" with no DOM, so nothing can be mounted.
 * Brittle to renaming, but the regression is otherwise silent — a new outbound
 * link simply renders, and nothing says it is inconsistent.
 */

const ROOTS = ["components", "app"];
const messages = enNormal as Record<string, string>;

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsxFiles(full));
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/** Each `target="_blank"` anchor, as the slice of source that opens it. */
function outboundAnchors(src: string): string[] {
  const out: string[] = [];
  // Anchors are written across several lines here, so match the tag and take
  // the element text after it up to the closing </a>.
  const re = /<a\b[^>]*target="_blank"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push(m[0]);
  return out;
}

describe("the external-link convention", () => {
  it("has the string every outbound link announces", () => {
    expect(messages["a11y.newTab"]).toBeTruthy();
  });

  const files = ROOTS.flatMap((r) => tsxFiles(join(process.cwd(), r)));

  it("finds files to check", () => {
    // Guards against a moved directory turning this whole suite into a pass
    // over an empty list.
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const anchors = outboundAnchors(src);
    if (anchors.length === 0) continue;
    const rel = file.slice(process.cwd().length + 1);

    it(`${rel} marks every outbound link`, () => {
      for (const anchor of anchors) {
        // Some anchors render a shared label component rather than inlining
        // the marks; accept the marks appearing anywhere in the file for
        // those, since the anchor itself is only a few lines of it.
        // The note may be the message key or, on the pages that carry no
        // message keys by design (About is the canonical privacy record and
        // has one wording), the literal string.
        const note = messages["a11y.newTab"];
        const announced =
          anchor.includes("a11y.newTab") ||
          anchor.includes(note) ||
          src.includes("a11y.newTab");
        const marked = announced && (anchor.includes("↗") || src.includes("↗"));
        expect(marked, `${rel}: ${anchor.slice(0, 90).replace(/\s+/g, " ")}`).toBe(true);
      }
    });
  }
});

describe("the install buttons follow it", () => {
  // The specific regression: these opened a browser store with no arrow and
  // no screen-reader note, in the one section of the app whose subject is
  // where a link really goes.
  const grid = readFileSync(join(process.cwd(), "components/WaysGrid.tsx"), "utf8");

  it("announces the new tab", () => {
    expect(grid).toMatch(/sr-only[^>]*>\s*\(\{t\("a11y\.newTab"\)\}\)/);
  });

  it("shows the arrow", () => {
    expect(grid).toMatch(/aria-hidden="true"[^>]*>\s*↗/);
  });

  it("does not mark the browsers that are not links", () => {
    // Edge and Safari render as plain text while unpublished — nothing
    // navigates, so an arrow there would promise a click that does nothing.
    const pendingBranch = grid.slice(grid.indexOf("if (!target.url)"), grid.indexOf("return (\n          <li"));
    expect(pendingBranch).not.toContain("↗");
    expect(pendingBranch).not.toContain("a11y.newTab");
  });
});
