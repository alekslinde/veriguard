// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// Coverage for D1 of the 2026-08-31 threat-intel roadmap (issue #225) —
// "scambling", fake online gambling platforms. ACCC 14 Aug 2026 / NASC fusion
// cell to Dec 2026; 927% H1 2026 report surge, >$40m losses.
//
// The detection is deliberately NOT the bonus offer. Per the README's
// live-engine verification step, every proposed phrase was measured first:
//
//   "exclusive bonus for new members"              safe (0)
//   "vip access - limited spots"                   safe (0)
//   "claim your free spins"                        suspicious (24) already
//   "verify your account to withdraw your winnings" safe (10)   <- the gap
//
// Licensed operators promote by SMS constantly, so the bait phrases sit too
// close to legitimate marketing; a legitimate Crown registration SMS already
// measured 22. What has no licensed equivalent is the *withdrawal gate* — a
// balance the victim is told they have won, released only after an out-of-band
// "verification". That is what the composite scores.

const gateFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Winnings held behind a verification step"));

describe("#225 — withdrawal-gate composite", () => {
  it("flags the canonical scambling lure", () => {
    const r = checkSms(
      "Your bonus is ready. Verify your account to withdraw your winnings before the offer expires.",
      undefined,
      "AU",
    );
    expect(gateFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags the inverted phrasing, where the withdrawal is stated first", () => {
    const r = checkSms(
      "To withdraw your winnings of $3,200 you must first verify your identity.",
      undefined,
      "AU",
    );
    expect(gateFlag(r)).toBeTruthy();
    expect(r.verdict).not.toBe("safe");
  });

  it("covers prize and jackpot framings, not just 'winnings'", () => {
    const r = checkSms(
      "Jackpot unlocked! Confirm your details to release your jackpot payment.",
      undefined,
      "AU",
    );
    expect(gateFlag(r)).toBeTruthy();
  });

  it("is a base signal — fires in every region, not just AU", () => {
    for (const region of ["AU", "GB", "NZ", "IE", "US", "CA"]) {
      const r = checkSms(
        "Verify your account to withdraw your winnings.",
        undefined,
        region,
      );
      expect(gateFlag(r), `expected the gate to fire under ${region}`).toBeTruthy();
    }
  });
});

describe("#225 — withdrawal-gate false-positive controls", () => {
  // Each of these measured as a false positive against a looser version of the
  // rule, and is the reason the composite requires both halves and gates on
  // winnings rather than on "funds" or "balance".
  const benign: [string, string][] = [
    // Scored 40 (suspicious) when the noun list included "funds": ordinary
    // regulated onboarding says exactly this.
    ["one-time KYC before a first withdrawal",
      "To complete your account setup, please verify your identity before you can withdraw funds. This is a one-time regulatory requirement."],
    // A payout that has already happened states no verification step.
    ["a completed payout",
      "Your payout of $85 has been released to your nominated account."],
    ["real winnings credited and available",
      "Your tournament winnings of $340 have been credited to your balance and are available to withdraw."],
    // "verify your account" alone is +10 urgency and must not reach the gate.
    ["a bank asking you to verify, with no winnings",
      "Verify your account to enable transfers. Log in to the CommBank app."],
    ["a licensed operator's bonus terms",
      "Your no deposit bonus has a 20x wagering requirement. See terms."],
  ];

  it.each(benign)("stays clear of the gate: %s", (_label, text) => {
    const r = checkSms(text, undefined, "AU");
    expect(gateFlag(r)).toBeFalsy();
  });
});

describe("#225 AU — gambling bait words", () => {
  it("flags advertised waiving of a wagering requirement", () => {
    const r = checkSms(
      "Wagering requirement waived on your next deposit - VIP members only.",
      undefined,
      "AU",
    );
    expect(r.flags.join(" ")).toContain("wagering requirement waived");
  });

  it("does not double-score 'free spins' against the existing 'free' reward word", () => {
    // "free spins" is deliberately absent from REWARD_WORDS: the list is
    // substring-matched, so listing it alongside base's "free" scored one
    // phrase twice and pushed this legitimate promo from 12 to 24.
    const r = checkSms(
      "Sportsbet: 10 free spins added to your account. Gamble responsibly.",
      undefined,
      "AU",
    );
    expect(r.verdict).toBe("safe");
    const reward = r.flags.find((f) => f.startsWith("Prize/reward language"));
    expect(reward).toBeTruthy();
    expect(reward).not.toContain("free spins");
  });
});
