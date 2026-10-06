// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// Coverage for the 2026-10-06 roadmap's law-enforcement impersonation items:
// D4 / #423 (scam coaching — "don't tell your bank") and D6 / #427 ("money
// laundering case" wording). Both come from FBI IC3 PSA I-091726-PSA, so they
// share a file.
//
// Where the shipped behaviour differs from the filing:
// - #423 leaves out "do not discuss this with anyone". It is common in
//   workplace confidentiality notices, too broad to carry +30. The FBI lure
//   that uses it is caught by #427's wording instead.
// - #427 leaves out "your identity has been used in". Genuine data-breach
//   notices use that wording.
// - #427 lands in every pack that carries "money laundering investigation"
//   (AU, GB, CA, NZ, IE, US), not just US. The same one-word gap was measured
//   in all six.

const coachingFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Tells you to keep this from your bank"));
const urgencyFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Urgency language detected"));

describe("#423 base — scam coaching", () => {
  it("flags an instruction to keep the bank out of it", () => {
    // Probed 2026-10-06: safe 0.
    const r = checkSms(
      "FBI: Your Social Security number has been linked to a money laundering case. Do not tell your bank about this call. Call Agent Reyes at 973-555-0142.",
      undefined,
      "US",
    );
    expect(coachingFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags the branch-staff form", () => {
    // Probed 2026-10-06: safe 12.
    const r = checkSms(
      "This is the fraud team. Your account is compromised. Do not tell the bank staff why you are withdrawing the cash, they may be involved.",
      undefined,
      "AU",
    );
    expect(coachingFlag(r)).toBeTruthy();
    expect(r.verdict).not.toBe("safe");
  });

  it("flags a cover story, with a curly apostrophe", () => {
    const r = checkSms("If the bank asks why, tell the bank it’s for a family holiday.", undefined, "AU");
    expect(coachingFlag(r)).toBeTruthy();
  });

  it("scores once however many phrases appear", () => {
    const one = checkSms("Do not tell your bank.", undefined, "AU");
    const many = checkSms("Do not tell your bank. Don't tell the teller. If the bank asks why, say it's a gift.", undefined, "AU");
    expect(many.score).toBe(one.score);
  });

  it("fires in every region (base signal)", () => {
    for (const region of ["AU", "GB", "US", "NZ", "SG", "ZZ"]) {
      expect(coachingFlag(checkSms("Do not tell your bank about this call.", undefined, region))).toBeTruthy();
    }
  });

  it("leaves the benign guards alone", () => {
    for (const text of [
      "Your code is 482913. Do not share this code with anyone.",
      "Party is Saturday, don't tell him, it's a surprise",
      // Genuine bank anti-scam copy is not an imperative to the reader.
      "If someone tells you not to tell your bank about a payment, it's a scam.",
      "Please do not discuss this with anyone until the announcement on Friday.",
    ]) {
      expect(coachingFlag(checkSms(text, undefined, "AU")), text).toBeFalsy();
    }
  });
});

describe("#427 — law-enforcement \"money laundering case\" wording", () => {
  it("catches the wording that broke the old list", () => {
    // Probed 2026-10-06: safe 0, against 35 for "investigation".
    const r = checkSms(
      "FBI: your Social Security number has been linked to a money laundering case. Call Agent Reyes at 973-555-0142 today.",
      undefined,
      "US",
    );
    expect(urgencyFlag(r)).toContain("money laundering case");
    expect(r.verdict).toBe("likely_scam");
  });

  it("catches the field-office script", () => {
    // Probed 2026-10-06: safe 0.
    const r = checkSms(
      "This is Special Agent Mark Reyes with the FBI field office. Your identity has been used in a money laundering case. Do not discuss this with anyone.",
      undefined,
      "US",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it.each(["AU", "GB", "CA", "NZ", "IE", "US"])("covers the %s pack", (region) => {
    // Probed 2026-10-06: safe 0 (unknown 0 for CA) in every pack.
    const r = checkSms(
      "Police: your bank account has been linked to a money laundering case. Call Officer Reyes on 0412 345 678 today.",
      undefined,
      region,
    );
    expect(urgencyFlag(r)).toContain("money laundering case");
  });

  it("keeps the US-only federal wording in the US pack", () => {
    expect(urgencyFlag(checkSms("There is a federal case against you.", undefined, "US"))).toBeTruthy();
    expect(urgencyFlag(checkSms("There is a federal case against you.", undefined, "AU"))).toBeFalsy();
  });

  it("does not reach a verdict on a bare mention", () => {
    const r = checkSms("The firm's money laundering case review is attached for the compliance meeting.", undefined, "AU");
    expect(r.verdict).toBe("safe");
  });
});
