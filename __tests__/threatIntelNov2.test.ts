// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// Coverage for three gaps from the 2026-11-02 roadmap: #511 (IE authority
// moving a case onto WhatsApp), #509 (AU "Yepbit" named fraudulent platform)
// and #510 (AU Centrelink "bonus payment" lure).

describe("#511 IE — Garda/WhatsApp-crest impersonation", () => {
  const LURE =
    "Garda fraud unit: please continue this conversation on WhatsApp to protect your case and avoid arrest.";

  it("flags the handoff and reaches likely_scam", () => {
    // Probed 2026-11-02: safe 0.
    const r = checkSms(LURE, undefined, "IE");
    expect(r.flags.some((f) => f.includes("continue on WhatsApp or Telegram"))).toBe(true);
    expect(r.verdict).toBe("likely_scam");
  });

  it("matches the AU result for the identical lure, reworded", () => {
    const auLure =
      "AFP fraud unit: please continue this conversation on WhatsApp to protect your case and avoid arrest.";
    const ieResult = checkSms(LURE, undefined, "IE");
    const auResult = checkSms(auLure, undefined, "AU");
    expect(ieResult.verdict).toBe(auResult.verdict);
  });

  it("needs a named agency — an ordinary WhatsApp mention is untouched", () => {
    const r = checkSms("Hey it's Sinead, message me on WhatsApp when you're free", undefined, "IE");
    expect(r.flags.some((f) => f.includes("continue on WhatsApp or Telegram"))).toBe(false);
  });
});

describe("#509 AU — named fraudulent platform Yepbit", () => {
  const LURE = "Start investing with Yepbit today - guaranteed high returns, verified by our trading experts.";

  it("flags the named platform and reaches likely_scam", () => {
    // Probed 2026-11-02: safe 0, zero signals.
    const r = checkSms(LURE, undefined, "AU");
    expect(r.flags.some((f) => f.includes('"yepbit"'))).toBe(true);
    expect(r.verdict).toBe("likely_scam");
  });

  it("matches case-insensitively", () => {
    const r = checkSms("Guaranteed returns on yepbit, sign up now.", undefined, "AU");
    expect(r.flags.some((f) => f.toLowerCase().includes("yepbit"))).toBe(true);
  });
});

describe("#510 AU — Centrelink 'bonus payment' lure", () => {
  const LURE =
    "You are eligible for a new Centrelink bonus payment. Confirm your myGov details to receive your bonus payment now.";

  it("reaches at least suspicious once the phrase corroborates the authority mention", () => {
    // Probed 2026-11-02: safe 0 — the deferred Centrelink credit never converted.
    const r = checkSms(LURE, undefined, "AU");
    expect(r.score).toBeGreaterThanOrEqual(20);
    expect(r.verdict).not.toBe("safe");
  });

  it("covers the cost-of-living bonus variant from the same advisory", () => {
    const r = checkSms(
      "Centrelink: you qualify for a cost of living bonus. Confirm your myGov login to claim.",
      undefined,
      "AU",
    );
    expect(r.verdict).not.toBe("safe");
  });

  it("does not score the phrase alone with no authority mention", () => {
    const r = checkSms("Don't forget — payday bonus payment hits accounts Friday this month.", undefined, "AU");
    expect(r.verdict).toBe("safe");
  });
});
