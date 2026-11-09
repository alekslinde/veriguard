// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkEmail, checkSms } from "@veriguard/detect/scamDetector";
import { SETTLEMENT_REDIRECT_FLAG } from "@veriguard/detect/signals/settlementRedirect";
import { SIGNALS } from "@veriguard/detect/signalRegistry";

// Property-settlement payment redirection (#521, 2026-11-08 roadmap
// ENGINE-D1). A new composite rather than a wider rental-bond gate: settlement
// context, a changed account, and somewhere to pay — never the context alone.

const row = (r: { signals?: Array<{ text: string; points: number }> }) =>
  (r.signals ?? []).find((s) => s.text.startsWith(SETTLEMENT_REDIRECT_FLAG));

const LURE_UPDATED = `From: Smith Conveyancing <accounts@smith-conveyancing.com.au>
Subject: Settlement funds - updated bank details

Hi, ahead of Friday's property settlement please note our trust account has changed. Please transfer the balance of settlement funds to our updated bank details: BSB 062-000, account number 12345678. Kind regards, Conveyancer`;

const LURE_MOVED_BANKS =
  "Hi both, just a heads up before settlement on Friday: our trust account has moved banks. Please use the new BSB 062-000 and account 12345678 for the balance. Thanks, Sarah (Conveyancer)";

const LURE_DETAILS_UPDATED =
  "Please note our solicitor's trust account details have been updated. Transfer the settlement funds to BSB 062-000 Acc 12345678 today to avoid delaying settlement.";

describe("#521 settlement redirect — fires on the fraud", () => {
  it.each([
    ["updated bank details", LURE_UPDATED],
    ["moved banks / new BSB", LURE_MOVED_BANKS],
    ["details have been updated", LURE_DETAILS_UPDATED],
  ])("flags the %s lure on both channels", (_label, lure) => {
    expect(row(checkSms(lure, undefined, "AU"))).toBeDefined();
    expect(row(checkEmail(lure, undefined, "AU"))).toBeDefined();
  });

  it("scores the same 25 on email as on SMS — the discount never touches it", () => {
    // Before this rule the whole body was discounted 0.7× by email: this lure
    // scored 65 by SMS and 45 by email.
    expect(row(checkSms(LURE_UPDATED, undefined, "AU"))?.points).toBe(25);
    expect(row(checkEmail(LURE_UPDATED, undefined, "AU"))?.points).toBe(25);
  });

  it("lifts the moved-banks wording out of safe on email", () => {
    // Probed 2026-11-08: safe 10 by email — "new BSB" and "moved banks" were
    // not read as a changed account at all.
    const r = checkEmail(LURE_MOVED_BANKS, undefined, "AU");
    expect(r.verdict).toBe("suspicious");
    expect(r.score).toBeGreaterThanOrEqual(30);
  });

  it("reads the UK vocabulary — completion, client account, sort code", () => {
    const r = checkEmail(
      "Ahead of completion and settlement, please note our client account has changed. New sort code 20-00-00, account number 12345678. Please transfer today.",
      undefined,
      "GB",
    );
    expect(row(r)).toBeDefined();
    expect(r.verdict).toBe("likely_scam");
  });
});

describe("#521 settlement redirect — stays out of genuine conveyancing mail", () => {
  it("does not fire on trust-account details that are not claimed to have changed", () => {
    const genuine =
      "Hi, ahead of Friday's property settlement please find our trust account details for the balance of settlement funds: BSB 062-000, account number 12345678. Please call our office to verify before transferring.";
    expect(row(checkSms(genuine, undefined, "AU"))).toBeUndefined();
    expect(row(checkEmail(genuine, undefined, "AU"))).toBeUndefined();
  });

  it("does not fire on the firm's own warning against this fraud", () => {
    // The warning quotes the changed-details half verbatim. Note the generic
    // keyword rows still score this message — a separate, pre-existing issue —
    // so only this rule's row is asserted here.
    const warning =
      "Hi Jane, ahead of Friday's property settlement please find our trust account details for the balance: BSB 062-000, account number 12345678. Please note our bank details will never change by email. If you receive an email saying our bank details have changed, call our office on 08 8123 4567 before transferring.";
    expect(row(checkSms(warning, undefined, "AU"))).toBeUndefined();
    expect(row(checkEmail(warning, undefined, "AU"))).toBeUndefined();
  });

  it("does not read a new settlement date or statement as a changed account", () => {
    const r = checkEmail(
      "Hi Jane, the new settlement date is Friday 14 November. Our updated settlement statement is attached. No action needed until then.",
      undefined,
      "AU",
    );
    expect(row(r)).toBeUndefined();
    expect(r.verdict).toBe("safe");
  });

  it("needs settlement context — a changed account alone is the generic row's job", () => {
    const r = checkSms(
      "Our supplier's bank details have changed. Please transfer this month's invoice to BSB 062-000 account 12345678.",
      undefined,
      "AU",
    );
    expect(row(r)).toBeUndefined();
  });

  it("does not count 'completion' outside conveyancing", () => {
    const r = checkSms(
      "Congratulations on completion of the course! Your new account login is ready; pay any outstanding fees by transfer.",
      undefined,
      "AU",
    );
    expect(row(r)).toBeUndefined();
  });
});

describe("#521 settlement redirect — registry declaration", () => {
  it("declares a bare weight of 25 on sms and email", () => {
    const def = SIGNALS.find((d) => d.id === "settlement.redirect");
    expect(def).toBeDefined();
    expect(def?.weight).toBe(25);
    expect(def?.channels).toEqual(["sms", "email"]);
  });
});
