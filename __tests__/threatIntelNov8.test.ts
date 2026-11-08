// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// Coverage for three gaps from the 2026-11-08 roadmap: #520 (GB NCSC
// impersonation and the WhatsApp handoff), #518 (US "$2,000 tariff rebate")
// and #519 (CA fake traffic-summons texts).

const hasFlag = (flags: string[], text: string) => flags.some((f) => f.includes(text));

describe("#520 GB — NCSC impersonation", () => {
  const LURE =
    "This is the National Cyber Security Centre. Your bank account has been compromised. Continue this conversation on WhatsApp.";

  it("flags the WhatsApp handoff and reaches likely_scam", () => {
    // Probed 2026-11-08: safe 0, zero signals.
    const r = checkSms(LURE, undefined, "GB");
    expect(hasFlag(r.flags, "continue on WhatsApp or Telegram")).toBe(true);
    expect(r.verdict).toBe("likely_scam");
  });

  it("matches the AU result for the identical lure, reworded", () => {
    const au = checkSms(
      "This is the AFP. Your bank account has been compromised. Continue this conversation on WhatsApp.",
      undefined,
      "AU",
    );
    expect(checkSms(LURE, undefined, "GB").score).toBe(au.score);
  });

  it("credits the bare acronym once something corroborates it", () => {
    // Probed 2026-11-08: safe 0 — "NCSC" named no authority in the GB pack.
    const r = checkSms(
      "NCSC: your device has been compromised. Secure it now at https://ncsc-secure.top",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("suspicious");
    expect(hasFlag(r.flags, "Claims to be from a government agency")).toBe(true);
  });

  it("leaves an ordinary mention of the NCSC safe", () => {
    const r = checkSms(
      "Our IT team is running the NCSC Cyber Essentials checklist this week, no action needed.",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("safe");
  });

  it("needs a named agency — an ordinary WhatsApp mention is untouched", () => {
    const r = checkSms("Hey it's Tom, message me on WhatsApp when you're around", undefined, "GB");
    expect(hasFlag(r.flags, "continue on WhatsApp or Telegram")).toBe(false);
  });
});

describe("#518 US — $2,000 tariff rebate", () => {
  it("lifts the link-only lure to suspicious", () => {
    // Probed 2026-11-08: safe 15, the link alone.
    const r = checkSms(
      "Your $2,000 tariff rebate is ready for deposit. Confirm your details to receive it: https://tariff-rebate-gov.top",
      undefined,
      "US",
    );
    expect(r.verdict).toBe("suspicious");
    expect(hasFlag(r.flags, '"tariff rebate"')).toBe(true);
  });

  it("scores the tariff-dividend wording", () => {
    const r = checkSms(
      "You qualify for the $2000 tariff dividend payment. Tap to claim: https://tariff-dividend.top",
      undefined,
      "US",
    );
    expect(hasFlag(r.flags, '"tariff dividend"')).toBe(true);
    expect(r.verdict).toBe("suspicious");
  });

  it("stays one urgency hit, below suspicious, with nothing else present", () => {
    // The group scores +10 a hit by design; the phrase alone is not a verdict.
    const r = checkSms(
      "Senators are still debating a tariff rebate for farmers, the paper reports.",
      undefined,
      "US",
    );
    expect(r.verdict).toBe("safe");
  });
});

describe("#519 CA — fake traffic-summons texts", () => {
  it("scores the summons wording in the representative lure", () => {
    // Probed 2026-11-08: 15, the link alone.
    const r = checkSms(
      "NOTICE: You have a Mandatory Traffic Summons. Case #SK-2026-04471. Failure to respond will result in prosecution. View details: https://courts-saskatchewan.top",
      undefined,
      "CA",
    );
    expect(hasFlag(r.flags, '"traffic summons"')).toBe(true);
    expect(r.verdict).toBe("suspicious");
  });

  it("scores the summons phrase once, not twice, in its longer form", () => {
    const r = checkSms("You have a Mandatory Traffic Summons.", undefined, "CA");
    expect(r.score).toBe(10);
  });

  it.each([
    ["Courts of Saskatchewan", "Courts of Saskatchewan: an outstanding traffic citation is registered to your plate. Pay now at https://sk-courts-pay.top to avoid prosecution."],
    ["Alberta Registry Services", "Alberta Registry Services: you have an unpaid traffic citation. Pay today: https://ab-registry.top"],
  ])("credits the court or registry named in the %s variant", (_name, lure) => {
    const r = checkSms(lure, undefined, "CA");
    expect(hasFlag(r.flags, "Claims to be from a government agency")).toBe(true);
    expect(r.verdict).toBe("likely_scam");
  });

  it("leaves a genuine court reminder with no link or demand alone", () => {
    const r = checkSms(
      "Reminder: your hearing at the Provincial Court in Regina is on 12 December at 9:30am.",
      undefined,
      "CA",
    );
    expect(r.score).toBe(0);
  });
});
