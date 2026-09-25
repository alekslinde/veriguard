import { describe, it, expect } from "vitest";
import { checkSms, checkUrl } from "@veriguard/engine/scamDetector";

// Coverage for the 2026-09-25 threat-intel roadmap additions (issues #355-#357).
// Same shape as threatIntelSep2026: each block asserts the new phrasing/rule
// raises the right flag, the near-miss the issue called out stays clean, and
// the documented false-positive tradeoff holds.
//
// #355 and #356 landed as URGENCY_TAX_THREAT and URGENCY_VOICE_CLONE entries
// respectively rather than the arrays the issues named (URGENCY_PENSION is
// superannuation-specific; bare "as per our call" was deliberately dropped as
// too short) — see the code comments at each array for why.

const urgencyFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Urgency language detected"));
const authorityFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Claims to be from a government agency"));
const linkFlag = (r: { flags: string[] }, needle: string) =>
  r.flags.find((f) => f.toLowerCase().includes(needle.toLowerCase()));

describe("#355 AU — Centrelink/Medicare payment-suspension lure", () => {
  it("flags the compound lure as likely_scam", () => {
    const r = checkSms(
      "Your Medicare and Centrelink payments will be suspended if you do not verify your identity. Click here.",
      undefined,
      "AU",
    );
    expect(urgencyFlag(r)).toBeTruthy();
    expect(urgencyFlag(r)!.toLowerCase()).toContain("payments will be suspended");
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("covers the other suspension phrasings", () => {
    for (const text of [
      "medicare payments suspended pending review",
      "centrelink payments suspended — act now",
      "your benefit payments will be suspended tomorrow", // caught by the shorter "payments will be suspended"
      "payments will be stopped unless you confirm",
    ]) {
      const r = checkSms(text, undefined, "AU");
      expect(urgencyFlag(r)).toBeTruthy();
    }
  });

  it("is AU-scoped, not a base signal", () => {
    const r = checkSms("payments will be suspended", undefined, "GB");
    expect(urgencyFlag(r)).toBeFalsy();
  });

  it("does not collide with the existing account-suspended base signal", () => {
    // "account will be suspended" (base.ts) and "payments will be suspended"
    // (au.ts) are distinct phrases; a message using only the base wording
    // should not also report the AU-specific one.
    const r = checkSms("Your account will be suspended.", undefined, "AU");
    expect(urgencyFlag(r)!.toLowerCase()).not.toContain("payments will be suspended");
  });
});

describe("#356 base — AI voice-clone post-call pressure phrases", () => {
  it("a lone post-call phrase stays safe", () => {
    const r = checkSms("As per our phone call, please confirm the invoice details.", undefined, "AU");
    expect(urgencyFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("safe");
  });

  it("escalates to likely_scam when compounded with an authority mention and urgency", () => {
    const r = checkSms(
      "As per our phone call, please transfer the outstanding amount to the ATO holding account immediately. Case reference: ATO-2026-12345.",
      undefined,
      "AU",
    );
    expect(urgencyFlag(r)).toBeTruthy();
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("covers the other anchored post-call phrasings", () => {
    for (const text of [
      "as discussed in our call, wire the funds today",
      "following our recent call, here are the transfer details",
      "as i mentioned on the call, action is required",
      "confirming what we discussed on the call — payment is due",
      "following up on our call about your account",
    ]) {
      const r = checkSms(text, undefined, "AU");
      expect(urgencyFlag(r)).toBeTruthy();
    }
  });

  it("fires regardless of region (base signal)", () => {
    for (const region of ["AU", "GB", "NZ", "IE", "US"]) {
      const r = checkSms("as per our phone call, please proceed", undefined, region);
      expect(urgencyFlag(r)).toBeTruthy();
    }
  });

  it("does not match the deliberately-omitted bare form", () => {
    // "as per our call" alone was excluded as too short/generic (issue #356) —
    // only the longer anchored forms should match.
    const r = checkSms("as per our call", undefined, "AU");
    expect(urgencyFlag(r)).toBeFalsy();
  });
});

describe("#357 URL — AiTM OAuth2-path phishing kit heuristic", () => {
  it("flags an OAuth2 path on a non-provider domain", () => {
    const r = checkUrl(
      "https://login-verify.pages.dev/oauth2/v2.0/authorize?client_id=123",
      undefined,
      "AU",
    );
    expect(linkFlag(r, "adversary-in-the-middle")).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("also matches the /openid/ path shape", () => {
    const r = checkUrl("https://accounts-secure.top/openid/connect/authorize", undefined, "AU");
    expect(linkFlag(r, "adversary-in-the-middle")).toBeTruthy();
  });

  it("does not flag a known identity-provider host", () => {
    const r = checkUrl(
      "https://login.microsoftonline.com/oauth2/v2.0/authorize?client_id=123",
      undefined,
      "AU",
    );
    expect(linkFlag(r, "adversary-in-the-middle")).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it("does not flag other known OAuth hosts", () => {
    for (const url of [
      "https://accounts.google.com/o/oauth2/v2/auth",
      "https://appleid.apple.com/auth/oauth2/authorize",
      "https://login.okta.com/oauth2/default/v1/authorize",
    ]) {
      const r = checkUrl(url, undefined, "AU");
      expect(linkFlag(r, "adversary-in-the-middle")).toBeFalsy();
    }
  });

  it("does not flag a URL with no oauth2/openid path at all", () => {
    const r = checkUrl("https://example.com/login", undefined, "AU");
    expect(linkFlag(r, "adversary-in-the-middle")).toBeFalsy();
  });

  it("keeps a lone hit on a self-hosted OAuth server below suspicious", () => {
    // The FP guard: a self-hosted OAuth2 server (here on a multi-label .com.au
    // suffix) carrying no other signal must stay "safe" — the flag explains the
    // path shape, but one signal alone must not accuse a legitimate login page.
    const r = checkUrl("https://sso.mycompany.com.au/oauth2/authorize", undefined, "AU");
    expect(linkFlag(r, "adversary-in-the-middle")).toBeTruthy();
    expect(r.score).toBeLessThan(20);
    expect(r.verdict).toBe("safe");
  });

  it("reaches suspicious when the URL also carries a login keyword (accepted tradeoff)", () => {
    const r = checkUrl("https://login.mycompany.com/oauth2/authorize", undefined, "AU");
    expect(linkFlag(r, "adversary-in-the-middle")).toBeTruthy();
    expect(r.verdict).toBe("suspicious");
  });
});
