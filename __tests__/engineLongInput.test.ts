import { describe, expect, it } from "vitest";
import { analyzeContent } from "@veriguard/engine/scamDetector";

// The engine runs over attacker-controlled text, and the extension hands it up
// to 20,000 characters of whatever a drag selected. Each case below is a shape
// that once made a scan rescan to the end of the input from every position:
// 20,000 identical characters took over six seconds before the fix, and ~15ms
// after. The bound is loose enough for a loaded CI runner and tight enough
// that a quadratic regression cannot pass under it.
const BOUND_MS = 1000;

// The check route admits 100,000 characters. The shapes at that length are
// ones whose quadratic cost stayed under BOUND_MS at 20,000 and so would have
// passed the cases above; at the full length each took seconds, and each now
// takes tens of milliseconds.
const ROUTE_MAX = 100_000;

async function timed(text: string): Promise<number> {
  const started = Date.now();
  await analyzeContent(text);
  return Date.now() - started;
}

const fill = (unit: string) => unit.repeat(Math.ceil(ROUTE_MAX / unit.length)).slice(0, ROUTE_MAX);

describe("engine on long, unbroken input", () => {
  it("stays linear on one run of a single letter", async () => {
    expect(await timed("x".repeat(20_000))).toBeLessThan(BOUND_MS);
  });

  it("stays linear on a brand name repeated with no dot after it", async () => {
    expect(await timed("amazon".repeat(4_000))).toBeLessThan(BOUND_MS);
  });

  it("stays linear on a long token with an @ only at the end", async () => {
    expect(await timed("x".repeat(20_000) + "@")).toBeLessThan(BOUND_MS);
  });

  it("stays linear on a long run that ends in a scheme separator", async () => {
    expect(await timed("x".repeat(20_000) + "://")).toBeLessThan(BOUND_MS);
  });

  // Every "." or "-" was a word boundary where the email pattern started over
  // and scanned to the end of the run for an "@": 4.7s.
  it.each(["a.", "a-", "1.2."])("stays linear on %j repeated to the route's limit", async (unit) => {
    expect(await timed(fill(unit))).toBeLessThan(BOUND_MS);
  });

  // One hostname of 25,000 labels, each of whose suffixes was joined and
  // looked up in the public suffix list: 13s at 80,000 characters.
  it("stays linear on a hostname with tens of thousands of labels", async () => {
    expect(await timed(fill("www."))).toBeLessThan(BOUND_MS);
  });

  // Linear, but the message was re-folded once per pack entry: a second.
  it("folds accented text once, not once per pack entry", async () => {
    expect(await timed(fill("ã"))).toBeLessThan(BOUND_MS / 4);
  });
});
