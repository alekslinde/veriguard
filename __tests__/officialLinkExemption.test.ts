import { describe, it, expect } from "vitest";
import { checkSms, checkEmail } from "@veriguard/engine/scamDetector";

// A message whose links all point at the agency's OWN allowlisted domain must
// not be told to "verify directly via official channels" — the link already is
// the official channel.
//
// Before this, a real Australia Post tracking SMS and a "log in at revenue.ie"
// message both scored 55/likely_scam: the same score the engine gave an outright
// lookalike (revenue-ie.top). Legitimate agency mail was indistinguishable from
// phishing, which is the failure mode that trains people to ignore the verdict.

const authorityFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => /Claims to be from a government agency/i.test(f));
const noLinkFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => /never send texts with links/i.test(f));

describe("official-link exemption (SMS)", () => {
  it("clears an agency message whose only link is that agency's own domain", () => {
    for (const [region, text] of [
      ["IE", "Log in at https://revenue.ie to check your account."],
      ["US", "Log in at https://irs.gov to check your account."],
      ["GB", "Log in at https://gov.uk to check your account."],
    ] as const) {
      const r = checkSms(text, undefined, region);
      expect(authorityFlag(r)).toBeFalsy();
      expect(r.verdict).toBe("safe");
    }
  });

  it("covers domains that live in authorityOwnDomains rather than legitDomains", () => {
    // auspost.com.au is the case the narrower list exists for — its real mail
    // comes from a commercial domain, not a government one. Checking only
    // legitDomains left this at 55.
    const r = checkSms("Track your parcel at https://auspost.com.au", undefined, "AU");
    expect(authorityFlag(r)).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it("accepts a subdomain of an allowlisted domain", () => {
    const r = checkSms("Track your delivery at https://track.auspost.com.au/abc123", undefined, "AU");
    expect(authorityFlag(r)).toBeFalsy();
  });

  // A trailing root dot is a valid FQDN for the identical host, but it survives
  // URL parsing into `hostname` and defeated every comparison in the matcher —
  // so the SAME message scored 15/safe without it and 55/likely_scam with it.
  // normaliseForAnalysis already strips it for exactly this reason; the
  // exemption's own matcher did not. Found by the metamorphic
  // host-trailing-dot relation, which asserts the two must score equal, not by
  // any fixture here.
  //
  // This covers the FALSE-POSITIVE direction only. The same dot also drops a
  // suspicious-TLD flag on a scam, and the relation cannot see that half — see
  // urlTrailingDot.test.ts for why, and for the tests that do cover it.
  it("accepts an allowlisted domain written in fully-qualified form", () => {
    const plain = checkSms("Track your parcel at https://auspost.com.au/mypost/track", undefined, "AU");
    const fqdn  = checkSms("Track your parcel at https://auspost.com.au./mypost/track", undefined, "AU");
    expect(authorityFlag(fqdn)).toBeFalsy();
    expect(fqdn.verdict).toBe("safe");
    // The property that matters: the root dot changes nothing at all.
    expect(fqdn.score).toBe(plain.score);
  });

  it("accepts a subdomain in fully-qualified form", () => {
    const r = checkSms("Track your delivery at https://track.auspost.com.au./abc123", undefined, "AU");
    expect(authorityFlag(r)).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  // The strip must not become a way past the allowlist: a lookalike is still a
  // lookalike in FQDN form.
  it("does not let a trailing dot launder a lookalike domain", () => {
    const r = checkSms("AusPost: parcel held, pay fee at http://auspost-redelivery.top./x", undefined, "AU");
    expect(r.verdict).not.toBe("safe");
  });

  it("suppresses the no-link-sender flag for the sender's own domain", () => {
    // This rule's premise is "these bodies never put links in their texts",
    // which cannot be the right call for a link to the body's own site.
    const r = checkSms("Revenue: log in at https://revenue.ie to view your balance.", undefined, "IE");
    expect(noLinkFlag(r)).toBeFalsy();
  });

  it("still flags a lookalike domain", () => {
    const r = checkSms("Log in at https://revenue-ie.top to check your account.", undefined, "IE");
    expect(r.verdict).toBe("likely_scam");
  });

  it("is not fooled by a subdomain-suffix evasion", () => {
    // revenue.ie.evil.tk must not inherit Revenue's standing.
    const r = checkSms("Revenue: verify at https://revenue.ie.evil.tk now.", undefined, "IE");
    expect(r.verdict).toBe("likely_scam");
  });

  it("requires EVERY link to be official, not just one", () => {
    // The obvious evasion: pad the message with a real link next to the payload.
    const r = checkSms(
      "Revenue: see https://revenue.ie then verify at http://revenue-verify.top now.",
      undefined,
      "IE",
    );
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("does not let one agency's message launder through another's domain", () => {
    // The exemption tested only "is this domain allowlisted", so an ATO
    // impersonation pointing at auspost.com.au was cleared. The link must not
    // contradict the agency the message names.
    const r = checkSms(
      "ATO: your tax refund is pending. Log in at https://auspost.com.au/track",
      undefined,
      "AU",
    );
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("keeps the exemption when the agency is named only by the link itself", () => {
    // The other side of that rule. A genuine notification often names its
    // sender nowhere but the URL, so "no authority named in prose" must keep
    // the exemption — requiring a prose match would reintroduce the original bug.
    const r = checkSms("Track your parcel at https://auspost.com.au", undefined, "AU");
    expect(authorityFlag(r)).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it("refuses an open redirect on an allowlisted host", () => {
    // checkUrl already treats a nested URL as suspicious; the exemption must
    // not override it, or gov.ie/redirect?url=... launders any destination.
    const r = checkSms(
      "Revenue: claim at https://www.gov.ie/redirect?url=https://revenue-ie.top/claim",
      undefined,
      "IE",
    );
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("matches a multi-word agency name against its abbreviated domain", () => {
    // The headline case. "australia post" does not appear in auspost.com.au as
    // a substring, and inferring identity from string overlap alone left this
    // real tracking SMS at 55. These messages NAME the agency in prose, so they
    // exercise the matching path rather than the no-authority early return.
    const r = checkSms(
      "Australia Post: your parcel is on its way, track it at https://auspost.com.au/track/ABC123",
      undefined,
      "AU",
    );
    expect(authorityFlag(r)).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it("accepts a parent agency's domain for the services it hosts", () => {
    // Centrelink and Medicare both live under servicesaustralia.gov.au, and
    // Revenue publishes under gov.ie. No string match can bridge a parent
    // agency relationship — the government estate does.
    for (const [region, text] of [
      ["AU", "Centrelink: view your payment at https://servicesaustralia.gov.au/centrelink"],
      ["AU", "Medicare: your claim is ready at https://servicesaustralia.gov.au/medicare"],
      ["IE", "Revenue: log in at https://gov.ie/revenue to view your balance."],
    ] as const) {
      const r = checkSms(text, undefined, region);
      expect(authorityFlag(r)).toBeFalsy();
      expect(r.verdict).toBe("safe");
    }
  });

  it("requires EVERY named authority to be consistent with the link", () => {
    // The mirror of the padding evasion the links loop guards against: adding
    // the single word "AusPost." to an ATO impersonation must not buy the
    // exemption for a link that contradicts the ATO.
    const r = checkSms(
      "ATO: your tax refund is pending. AusPost. Log in at https://auspost.com.au/track",
      undefined,
      "AU",
    );
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("still flags an agency-named scam pointing somewhere else entirely", () => {
    const r = checkSms("AusPost: parcel held, pay fee at http://auspost-redelivery.top", undefined, "AU");
    expect(r.verdict).toBe("likely_scam");
  });

  it("leaves link-free agency messages alone", () => {
    // No links means no exemption — the deferred authority flag still applies.
    const r = checkSms("Revenue: your tax return is due this month.", undefined, "IE");
    expect(r.flags.join(" ")).toContain("government agency");
  });
});

describe("official-link exemption does not apply to email", () => {
  const auspostEmail = (from: string) =>
    [`From: ${from}`, "Subject: Your parcel is on its way", "", "Track your delivery at https://auspost.com.au/track"].join("\n");

  it("keeps trusting the sender domain, not the body link", () => {
    // A spoofed sender quoting the real tracking link is ordinary phishing.
    // Email has a verifiable sender, so the body link must not override it —
    // isOwnDomainSender already covers the genuine case.
    const r = checkEmail(auspostEmail("noreply@auspost.com.au.evil.tk"), undefined, "AU");
    expect(r.verdict).toBe("likely_scam");
  });

  it("still flags a near-miss sender domain", () => {
    const r = checkEmail(auspostEmail("noreply@notauspost.com.au"), undefined, "AU");
    expect(authorityFlag(r)).toBeTruthy();
  });
});
