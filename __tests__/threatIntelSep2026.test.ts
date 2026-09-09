import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/engine/scamDetector";

// Coverage for the 2026-09-06 threat-intel roadmap additions (issues #270-#275).
// Same shape as threatIntelAug2026: each block asserts the new phrasing raises
// the right flag, the region scoping holds, and the false-positive near-miss the
// issue called out stays clean.
//
// Several of these issues proposed phrase sets that were measured against the
// engine before implementation and adjusted — the notes below record where the
// shipped behaviour deliberately differs from the filing.

const requestFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Asks for sensitive info"));
const urgencyFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Urgency language detected"));

describe("#272 base — crypto seed-phrase solicitation", () => {
  it("flags a seed-phrase ask as a sensitive-info request", () => {
    const r = checkSms("Your wallet is locked. Enter your seed phrase to restore access.");
    expect(requestFlag(r)).toBeTruthy();
    expect(requestFlag(r)!.toLowerCase()).toContain("seed phrase");
  });

  it("covers the secret-recovery-phrase wording", () => {
    const r = checkSms("Confirm your secret recovery phrase to re-enable transfers.");
    expect(requestFlag(r)).toBeTruthy();
  });

  it("fires regardless of region (base signal)", () => {
    for (const region of ["AU", "GB", "NZ", "IE", "US"]) {
      expect(requestFlag(checkSms("enter your seed phrase", undefined, region))).toBeTruthy();
    }
  });

  it("escalates a seed-phrase lure carrying a link", () => {
    const r = checkSms("Wallet locked — enter your seed phrase now: http://ledger-recovery.com");
    expect(r.verdict).not.toBe("safe");
  });

  it("does not double-score the longer recovery variants", () => {
    // "recovery phrase" substring-matches "wallet recovery phrase", so the
    // longer forms are deliberately absent from the list. One phrase, one hit.
    const one = checkSms("enter your recovery phrase");
    const longer = checkSms("enter your wallet recovery phrase");
    expect(longer.score).toBe(one.score);
  });
});

describe("#273 base — money mule recruitment", () => {
  it("flags explicit mule-recruitment terms", () => {
    for (const phrase of ["money mule", "financial courier", "act as a payment agent"]) {
      expect(requestFlag(checkSms(`Job offer: ${phrase} role, weekly pay.`))).toBeTruthy();
    }
  });

  it("flags the transfer-handling phrasings", () => {
    const r = checkSms("Work from home: receive transfers into your account and transfer funds on our behalf.");
    expect(requestFlag(r)).toBeTruthy();
  });

  it("moves a recruitment message off safe", () => {
    const r = checkSms(
      "Work from home: act as a payment agent and receive transfers into your account for a fee.",
    );
    expect(r.verdict).not.toBe("safe");
  });

  it("fires regardless of region (base signal)", () => {
    for (const region of ["AU", "GB", "IE", "US"]) {
      expect(requestFlag(checkSms("money mule", undefined, region))).toBeTruthy();
    }
  });
});

describe("#275 US — jury duty / bench warrant SMS", () => {
  it("flags missed-jury-duty phrasing", () => {
    const r = checkSms("You missed jury duty and a bench warrant has been issued.", undefined, "US");
    expect(urgencyFlag(r)).toBeTruthy();
  });

  it("raises the SMS-only variant that has no agency name or callback", () => {
    // The gap the issue actually closed: the call-side script already reached
    // likely_scam via an authority mention, but this link-only variant measured
    // 35/suspicious before the phrases were added.
    const r = checkSms(
      "You failed to appear for jury duty. Bench warrant for your arrest. Pay fine now: http://court-fine.top/pay",
      undefined,
      "US",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("is scoped to the US pack", () => {
    expect(urgencyFlag(checkSms("missed jury duty", undefined, "AU"))).toBeFalsy();
  });

  it("does not double-score against the existing tax-threat warrant entry", () => {
    // "warrant issued" lives in URGENCY_TAX_THREAT; neither string contains the
    // other, so "bench warrant" must not stack a second hit on one fact.
    const r = checkSms("bench warrant", undefined, "US");
    const hits = (urgencyFlag(r) ?? "").match(/"/g)?.length ?? 0;
    expect(hits).toBeLessThanOrEqual(2);
  });
});

describe("#274 US — veterans benefit lures (gated)", () => {
  it("flags a veterans lure that carries an information ask", () => {
    const r = checkSms(
      "VA benefits claim assistance: your veteran benefit entitlement review is pending. Reply with your SSN.",
      undefined,
      "US",
    );
    expect(r.flags.join(" ")).toContain("Veterans-benefit lure");
  });

  it("flags a veterans lure that carries a link", () => {
    const r = checkSms(
      "Veterans savings program: confirm eligibility at http://va-benefits-review.top",
      undefined,
      "US",
    );
    expect(r.flags.join(" ")).toContain("Veterans-benefit lure");
  });

  it("stays clean on legitimate VA correspondence with no ask or link", () => {
    // The false positive that drove the gate: this phrasing appears verbatim in
    // real veteran-support messages, and "va" is already an authority mention.
    const r = checkSms(
      "Your VA benefits claim assistance appointment is confirmed for Tuesday.",
      undefined,
      "US",
    );
    expect(r.flags.join(" ")).not.toContain("Veterans-benefit lure");
  });

  it("is scoped to the US pack", () => {
    const r = checkSms(
      "veterans savings program — reply with your SSN",
      undefined,
      "GB",
    );
    expect(r.flags.join(" ")).not.toContain("Veterans-benefit lure");
  });
});

describe("#271 IE — NTMA / State Savings impersonation", () => {
  it("treats NTMA and State Savings as authority mentions", () => {
    for (const name of ["NTMA", "State Savings"]) {
      const r = checkSms(`${name}: your account requires attention.`, undefined, "IE");
      expect(r.flags.join(" ")).toContain("government agency");
    }
  });

  it("flags the fake Personal Investment Account product name", () => {
    const r = checkSms(
      "Your State Savings account has been selected for the new Personal Investment Account — click to register http://statesavings-ie.com",
      undefined,
      "IE",
    );
    expect(r.verdict).not.toBe("safe");
    expect(r.flags.join(" ")).toContain("Prize/reward language");
  });

  it("adds the no-link-sender signal when a link accompanies the NTMA name", () => {
    // The NTMA sells State Savings by post and through An Post; it does not send
    // unsolicited SMS links. This is the corroboration that keeps the authority
    // mention from carrying a verdict alone.
    const withLink = checkSms("State Savings: register here http://statesavings-ie.com", undefined, "IE");
    const withoutLink = checkSms("State Savings: register at your local post office.", undefined, "IE");
    expect(withLink.score).toBeGreaterThan(withoutLink.score);
  });

  it("carries the real NTMA domains in the legitimate-domain allowlist", () => {
    // The no-link-sender flag now points people at statesavings.ie, so the real
    // estate behind the impersonation has to be allowlisted. Asserted against
    // revenue.ie rather than an absolute verdict: a bare agency domain in an SMS
    // still trips the no-link-sender rule (an agency name plus a link is the
    // signature the rule is built on), so the guarantee here is parity with the
    // other Irish agency domains, not a "safe" verdict. The wider question of
    // that rule firing on an agency's own domain is pre-existing on main and
    // out of scope for this batch.
    const baseline = checkSms("Log in at https://revenue.ie to check your account.", undefined, "IE");
    for (const host of ["https://statesavings.ie", "https://ntma.ie"]) {
      const r = checkSms(`Log in at ${host} to check your account.`, undefined, "IE");
      expect(r.score).toBeLessThanOrEqual(baseline.score);
      expect(r.flags.join(" ")).not.toContain("looks dodgy");
    }
  });

  it("is scoped to the IE pack", () => {
    expect(checkSms("state savings", undefined, "GB").flags.join(" ")).not.toContain("government agency");
  });
});

describe("#270 GB — energy allowance / price-cap lures", () => {
  it("flags the Action Fraud allowance lure", () => {
    const r = checkSms(
      "You are eligible for an energy support allowance of £350 — claim at http://ofgem-rebate-claim.uk",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags household energy support and bill-rebate claim framing", () => {
    for (const phrase of ["household energy support", "claim your bill rebate"]) {
      expect(urgencyFlag(checkSms(phrase, undefined, "GB"))).toBeTruthy();
    }
  });

  it("no longer flags ordinary supplier billing language", () => {
    // Bare "energy rebate" was removed from URGENCY_TAX: it is normal billing
    // copy, and this real-shaped message previously scored +10 with an urgency
    // flag on it. The claim/eligibility framing is the signal, not the noun.
    const r = checkSms("Your energy rebate of £12 has been applied to your account balance.", undefined, "GB");
    expect(urgencyFlag(r)).toBeFalsy();
    expect(r.verdict).toBe("safe");
  });

  it("still flags the qualified government-rebate lure phrasing", () => {
    // Guards the #167 entries that stayed in REQUEST_WORDS.
    const r = checkSms(
      "British Gas: you are eligible for a government energy rebate. Confirm your bank details now: http://bg-rebate.top",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("is scoped to the GB pack", () => {
    expect(urgencyFlag(checkSms("energy support allowance", undefined, "AU"))).toBeFalsy();
  });
});
