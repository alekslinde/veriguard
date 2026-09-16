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

  it("reports the worst identifier, with that identifier's own score", async () => {
    // The pairing is the property: a headline verdict from one identifier beside
    // a score from another describes neither.
    const check = await runCheck(
      "Hi there, see you at 6. http://mygov-secure-login.tk/verify",
      "AU",
    );
    expect(check).not.toBeNull();
    const worst = check!.results.find((r) => r.result.verdict === check!.verdict);
    expect(worst!.result.score).toBe(check!.score);
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
