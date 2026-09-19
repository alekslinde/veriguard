// The extension's checking layer: does it score, and does it own up to its gaps?
//
// The second half is the one that matters. A client that is deliberately less
// capable than the site must say so, or a reader takes a quiet result for a
// clean one — that is the coverage-honesty constraint, and here it also covers
// the shortener this client will not follow.

import { describe, it, expect } from "vitest";
import { runCheck } from "../extension/src/check";
import { UNEXPANDED_SHORTENER_NOTE } from "@veriguard/engine/scamDetector";
import { VERDICT_COPY } from "../extension/src/copy";
import messages from "../messages/en.normal.json";

describe("runCheck", () => {
  it("returns null for input with nothing in it", async () => {
    expect(await runCheck("   ", "AU")).toBeNull();
  });

  it("scores a plain scam message without any network access", async () => {
    const check = await runCheck(
      "URGENT: your myGov account is suspended. Verify now at http://mygov-secure.tk/login",
      "AU",
    );
    expect(check).not.toBeNull();
    expect(check!.score).toBeGreaterThan(45);
    expect(check!.verdict).toBe("likely_scam");
  });

  it("takes its verdict from the worst identifier", async () => {
    const check = await runCheck(
      "Hi there, see you at 6. http://mygov-secure-login.tk/verify",
      "AU",
    );
    expect(check).not.toBeNull();
    const ranks = { safe: 0, unknown: 1, suspicious: 2, likely_scam: 3 } as const;
    const worst = check!.results.reduce((a, b) =>
      ranks[b.result.verdict] > ranks[a.result.verdict] ? b : a,
    );
    expect(check!.verdict).toBe(worst.result.verdict);
  });

  it("shows evidence rows that add up to the score above them", async () => {
    // The invariant, and the one the extension originally broke: the headline
    // came from one identifier while the rows were flat-mapped from all of them,
    // so a reader who added up the column got a different number. This is the
    // same defect `composeVerdictWithEvidence` documents having already fixed on
    // the website, which is why both now share the engine's arithmetic.
    const check = await runCheck(
      "URGENT: your myGov account is suspended. Verify at http://mygov-secure.tk/login or call 0400 000 000",
      "AU",
    );
    expect(check).not.toBeNull();
    // More than one identifier, or the invariant is trivially satisfied.
    expect(check!.results.length).toBeGreaterThan(1);
    const total = check!.signals.reduce((n, s) => n + s.points, 0);
    expect(total).toBe(check!.score);
  });

  it("collapses a finding reported by two identifiers into one row", async () => {
    // A URL is scanned both inside the message and on its own, so the same
    // sentence arrives twice. Listed twice it reads as two independent findings.
    const check = await runCheck(
      "Your parcel is held. Pay at http://auspost-redelivery.tk/fee",
      "AU",
    );
    const texts = check!.signals.map((s) => s.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("puts the clamp row last when the cap bites", async () => {
    const check = await runCheck(
      "URGENT: your myGov account is suspended, verify immediately at http://mygov-secure.tk/login to avoid permanent closure. Gift card payment required. Bitcoin accepted. Call 0400 000 000 now.",
      "AU",
    );
    const clamps = check!.signals.filter((s) => s.source === "score");
    if (clamps.length) {
      expect(check!.signals.at(-1)!.source).toBe("score");
      expect(check!.score).toBe(100);
    }
    // Either way the rows still add up.
    expect(check!.signals.reduce((n, s) => n + s.points, 0)).toBe(check!.score);
  });

  it("flags a shortener it declined to follow", async () => {
    // No fetcher is passed, so expansion cannot run — the engine says so, and
    // the extension has to surface that rather than present a partial verdict
    // as a whole one.
    const check = await runCheck("Parcel held: https://bit.ly/3xamPle", "AU");
    expect(check).not.toBeNull();
    expect(check!.unexpandedShortener).toBe(true);
    expect(check!.results.some((r) => r.result.flags.includes(UNEXPANDED_SHORTENER_NOTE))).toBe(true);
  });

  it("does not claim an unexpanded shortener when there was none", async () => {
    const check = await runCheck("Your parcel is ready for collection.", "AU");
    expect(check!.unexpandedShortener).toBe(false);
  });

  it("surfaces the weakest coverage across results", async () => {
    // ZZ runs base signals only. A reader must be told that a quiet result there
    // means "we could not look", not "nothing is wrong".
    const check = await runCheck("Your parcel is held pending a fee.", "ZZ");
    expect(check).not.toBeNull();
    expect(check!.coverage).toBe("none");
  });

  it("reports full coverage for a fully-authored region", async () => {
    const check = await runCheck("Your parcel is held pending a fee.", "AU");
    expect(check!.coverage).toBe("full");
  });
});

describe("blocklistConsulted", () => {
  // "A list was consulted" and "a current list was consulted" are different
  // claims, and only the honest one belongs on a clean verdict. A stale copy is
  // still used — it can only raise a score — but a host added to the feed since
  // that copy was taken is one this check could not have caught, which is
  // exactly the gap the popup's notice names.
  const lookup = { has: () => false };

  it("is false when no list was available", async () => {
    const check = await runCheck("Your parcel is held pending a fee.", "AU");
    expect(check!.blocklistConsulted).toBe(false);
  });

  it("is false for a stale copy, even though the copy is still used", async () => {
    const check = await runCheck("Your parcel is held pending a fee.", "AU", {
      lookup,
      fresh: false,
    });
    expect(check!.blocklistConsulted).toBe(false);
  });

  it("is true only for a current copy", async () => {
    const check = await runCheck("Your parcel is held pending a fee.", "AU", {
      lookup,
      fresh: true,
    });
    expect(check!.blocklistConsulted).toBe(true);
  });
});

describe("popup copy", () => {
  it("says the same thing as the website for every verdict", () => {
    // Copied rather than imported — see copy.ts for why — so this is what keeps
    // the two from forking. A reword on the site fails here.
    const bundle = messages as Record<string, string>;
    for (const [verdict, copy] of Object.entries(VERDICT_COPY)) {
      expect(copy.label, `${verdict} label`).toBe(bundle[`verdict.${verdict}.label`]);
      expect(copy.sub, `${verdict} sub`).toBe(bundle[`verdict.${verdict}.sub`]);
    }
  });
});
