import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/scam-detect/scamDetector";

// Regression cover for #234 — one phrase counted as two findings.
//
// 22 entries across the scored lists were substrings of another entry in the
// same list: "tax refund" inside "council tax refund", "final notice" inside
// "final notice of unpaid toll", "reward" inside "reward points". Both fired,
// both scored, and the flag quoted both — so a reader saw one phrase presented
// as two independent signals.
//
// The longer entry in each pair was unreachable: the shorter one always matches
// first, so it could never be the sole hit and contributed nothing but the
// duplicate. All 22 were deleted rather than re-weighted around.
//
// The double-score was load-bearing for a handful of bare-text cases that sat
// at exactly the suspicious threshold of 20. That was an artefact of the
// duplicate, not real detection: as these campaigns actually arrive — with a
// link — they carry link, TLD and authority signals and score 70-97. The tests
// below pin both halves.

const urgency = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Urgency language detected"));

describe("#234 — a phrase is quoted once, not twice", () => {
  // region, text, the deleted phrase that must not be quoted, the surviving
  // phrase that must still be. Both halves are asserted: checking only the
  // absence would pass vacuously if urgency detection stopped firing at all.
  const cases: [string, string, string, string][] = [
    ["US", "Final notice of unpaid toll. Pay now to avoid penalty.", "final notice of unpaid toll", "unpaid toll"],
    ["NZ", "Final toll notice: payment required.", "final toll notice", "toll notice"],
    ["GB", "Your council tax refund of £240 is ready to claim.", "council tax refund", "tax refund"],
    ["CA", "Your carbon tax rebate is pending.", "carbon tax rebate", "tax rebate"],
    ["IE", "Emergency tax refund available now.", "emergency tax refund", "tax refund"],
    ["GB", "Meter reading required urgently.", "meter reading required urgently", "urgent"],
  ];

  it.each(cases)("%s: quotes the phrase once", (region, text, removed, kept) => {
    const r = checkSms(text, undefined, region);
    const flag = urgency(r);
    expect(flag, `no urgency flag at all for: ${text}`).toBeTruthy();
    expect(flag!).toContain(kept);
    expect(flag!).not.toContain(removed);
  });
});

describe("#234 — the IRS levy threat survives its deletion", () => {
  // "final notice of intent to levy" was one of the 22 deletions, and the only
  // one whose shadow ("final notice") is documented as a deliberately weak +10
  // that needs corroboration — the corroborating half was what got deleted, so
  // "Final notice of intent to levy. Call ..." fell to safe (10).
  //
  // Recovered as "intent to levy" in URGENCY_TAX_THREAT rather than by reverting:
  // the full phrase would be shadowed by "final notice" all over again. The
  // shorter form carries the levy threat on its own, so the signal no longer
  // depends on a duplicate hit.
  it("scores a bare levy notice without relying on a duplicate", () => {
    const r = checkSms("Final notice of intent to levy. Call 1800 555 0000.", undefined, "US");
    expect(r.verdict).not.toBe("safe");
    expect(urgency(r)!).toContain("intent to levy");
  });

  it("keeps the wage-levy variant at likely_scam", () => {
    const r = checkSms("Final notice of intent to levy your wages. IRS.", undefined, "US");
    expect(r.verdict).toBe("likely_scam");
  });

  it("fires without 'final notice' present at all", () => {
    // The point of the shorter form: it no longer needs the generic phrase.
    const r = checkSms("Notice of intent to levy your bank account. Call now.", undefined, "US");
    expect(urgency(r)!).toContain("intent to levy");
  });
});

describe("#234 — the campaigns are still caught as they arrive", () => {
  // Each of these is a bare-text case that sat at exactly 20 (suspicious) on
  // the strength of the duplicate alone. With the link these messages actually
  // carry, they are well clear.
  const withLink: [string, string][] = [
    ["US", "Final notice of unpaid toll. Pay at http://ezpass-toll.tk to avoid penalty."],
    ["NZ", "Final toll notice: payment required at http://nzta-toll.tk"],
    ["CA", "Your carbon tax rebate is pending. Claim at http://cra-rebate.tk"],
    ["GB", "Your council tax refund is ready. Claim at http://hmrc-refund.tk"],
    ["IE", "Emergency tax refund available. Claim at http://revenue-ie.tk"],
  ];

  it.each(withLink)("%s: still likely_scam with a link", (region, text) => {
    expect(checkSms(text, undefined, region).verdict).toBe("likely_scam");
  });

  it("still scores the base phrase that did the real work", () => {
    // Deleting "council tax refund" must not stop "tax refund" matching.
    for (const [region, text] of [
      ["GB", "Your council tax refund of £240 is ready."],
      ["US", "You have an unclaimed tax refund waiting."],
      ["NZ", "Final toll notice: payment required."],
    ] as const) {
      expect(urgency(checkSms(text, undefined, region)), text).toBeTruthy();
    }
  });
});
