// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { analyzeContent, checkEmail, checkSms } from "@veriguard/detect/scamDetector";

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

  // A different shape from the ones above, and a worse one. These patterns put
  // two or more `\s`-matching groups next to each other with nothing between
  // them that must match, so a run of spaces that never reaches the keyword can
  // be divided among the groups in exponentially many ways and the engine tries
  // each. Cost grew about fourfold per doubling rather than fourfold per
  // quadrupling: the voicemail prefix below took 20 seconds at 5,000 spaces,
  // where the quadratic shapes above needed 100,000 characters to reach
  // seconds. Each group now owns its own separator, leaving one way to match.
  //
  // Held well under the general bound because the fixed forms run in under a
  // millisecond; anything approaching BOUND_MS here means the ambiguity is back.
  describe.each([
    ["a quantity-word voicemail lure", "you have "],
    ["a reply-to-activate lure", "reply"],
    ["a ClickFix run-command lure", "press win"],
  ])("%s followed by spaces that never reach the keyword", (_label, prefix) => {
    it("does not backtrack over the run", async () => {
      expect(await timed(prefix + " ".repeat(20_000))).toBeLessThan(BOUND_MS / 4);
    });
  });

  // The counted voicemail lure starts with `\d+`, which is a separate cause
  // and needs its own input: a long run of *digits*, not spaces. Unanchored,
  // the match was attempted from each digit in turn and each attempt rescanned
  // the rest of the run — quadratic, and untouched by the group rewrite that
  // fixed the three above. A space run leaves it at a millisecond either way,
  // so only this shape can catch a regression.
  //
  // Measured through checkSms rather than analyzeContent, which is the only way
  // to see it: analyzeContent reads a long digit string as a phone-number
  // candidate and never reaches the message rules, so it returned in 3ms while
  // checkSms and checkEmail took 3.5 seconds. The direct entry points are the
  // reachable ones here — submissionGuard scores content through them.
  it("attempts a long digit run once, not from every digit", () => {
    const started = Date.now();
    checkSms(fill("0"));
    expect(Date.now() - started).toBeLessThan(BOUND_MS / 4);
  });

  // checkEmail reaches the same rule and was equally slow, but it also does
  // header parsing and distillation that checkSms skips, and that work is
  // genuinely linear in the input: 63ms, 127ms and 254ms at 25,000, 50,000 and
  // 100,000 digits. So it is held to the general bound rather than the tight
  // one above — the tight bound assumes a sub-millisecond floor this path does
  // not have, and would fail on a loaded runner for a reason unrelated to
  // backtracking.
  it("stays linear on a long digit run through the email path", () => {
    const started = Date.now();
    checkEmail(fill("0"));
    expect(Date.now() - started).toBeLessThan(BOUND_MS);
  });
});
