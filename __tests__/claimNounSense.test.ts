import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/engine/scamDetector";

// "claim" is a prize verb in "claim your prize" and an ordinary administrative
// noun in benefits, insurance and healthcare correspondence. The engine already
// dropped the determiner form ("your claim has been processed") and the verb
// form ("claim was approved"); this covers the COMPOUND-NOUN form, where
// "claim" modifies another noun with no determiner in front of it.
//
// The gap mattered because it compounded with an authority mention: "Your VA
// benefits claim assistance appointment is confirmed for Tuesday" reached
// 37/suspicious on entirely ordinary VA mail — a false alarm handed to elderly
// veterans reading real benefit correspondence.

const rewardFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Prize/reward language"));

describe("claim as an administrative noun", () => {
  it("does not flag compound-noun uses alongside an agency name", () => {
    const r = checkSms(
      "Your VA benefits claim assistance appointment is confirmed for Tuesday.",
      undefined,
      "US",
    );
    expect(rewardFlag(r)).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it("covers the common administrative compounds", () => {
    for (const text of [
      "Your claim status is approved.",
      "Claim status: your VA claim number is 4471.",
      "Please quote your claim reference when you call.",
      "Your claim form has been received.",
    ]) {
      expect(rewardFlag(checkSms(text, undefined, "US"))).toBeFalsy();
    }
  });

  it("holds across regions", () => {
    for (const region of ["AU", "GB", "IE", "US"]) {
      const r = checkSms("Your Medicare claim assistance appointment is confirmed.", undefined, region);
      expect(rewardFlag(r)).toBeFalsy();
    }
  });

  it("still scores the prize-verb sense", () => {
    const r = checkSms("Claim your free prize now at http://x.top", undefined, "US");
    expect(rewardFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("cannot be defused by appending an administrative sentence", () => {
    // The word only stops counting when EVERY occurrence reads as the noun, so
    // a live lure cannot buy the exemption with one trailing sentence.
    for (const text of [
      "Claim your $1000 prize now. Your claim status is ready.",
      "Congratulations! Claim your prize. Claim assistance available.",
    ]) {
      const r = checkSms(text, undefined, "US");
      expect(rewardFlag(r)).toBeTruthy();
    }
  });

  it("still flags a veterans lure that happens to use the compound", () => {
    // The noun sense suppresses only the reward word. The gated benefit-lure
    // rule is independent and still fires on the ask.
    const r = checkSms(
      "VA benefits claim assistance: reply with your SSN to confirm eligibility.",
      undefined,
      "US",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(r.flags.join(" ")).toContain("Veterans-benefit lure");
  });
});
