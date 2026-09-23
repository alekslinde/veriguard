import { describe, expect, it } from "vitest";
import { analyzeContent } from "@veriguard/engine/scamDetector";

// The engine runs over attacker-controlled text, and the extension hands it up
// to 20,000 characters of whatever a drag selected. Each case below is a shape
// that once made a scan rescan to the end of the input from every position:
// 20,000 identical characters took over six seconds before the fix, and ~15ms
// after. The bound is loose enough for a loaded CI runner and tight enough
// that a quadratic regression cannot pass under it.
const BOUND_MS = 1000;

async function timed(text: string): Promise<number> {
  const started = Date.now();
  await analyzeContent(text);
  return Date.now() - started;
}

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
});
