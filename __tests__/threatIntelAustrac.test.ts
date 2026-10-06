// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkUrl } from "@veriguard/detect/scamDetector";
import { resolveRegionPack } from "@veriguard/detect/regions";

// Coverage for the 2026-10-06 roadmap's AUSTRAC items: D1 / #425 (AUSTRAC
// impersonation) and D2 / #426 (an agency moving contact onto WhatsApp or
// Telegram). Both come from the same AUSTRAC alert (Sep 2026), so they share a
// file: the AUSTRAC lure only reaches the hand-off rule once AUSTRAC is a named
// authority.

const AUSTRAC_LURE =
  "AUSTRAC notice: your account has been flagged for suspicious transactions. To avoid a freeze, contact our compliance officer on WhatsApp +61 412 345 678 today.";
const ATO_HANDOFF =
  "ATO notice: there is an issue with your tax account. Please contact our officer on WhatsApp +61 412 345 678 to resolve it today.";

const authorityFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Claims to be from a government agency"));
const handoffFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.includes("continue on WhatsApp or Telegram"));

describe("#425 AU — AUSTRAC impersonation", () => {
  it("names AUSTRAC as an authority", () => {
    const r = checkSms(AUSTRAC_LURE, undefined, "AU");
    expect(authorityFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("matches the agency's full name", () => {
    const r = checkSms(
      "Australian Transaction Reports and Analysis Centre: your account is frozen. Click http://example.top to verify.",
      undefined,
      "AU",
    );
    expect(authorityFlag(r)).toBeTruthy();
  });

  it("flags an AUSTRAC lookalike domain", () => {
    const r = checkUrl("https://austrac-compliance.com/case", undefined, "AU");
    expect(r.flags.some((f) => f.includes('"austrac"'))).toBe(true);
    expect(r.verdict).toBe("likely_scam");
  });

  it("treats austrac.gov.au as the real agency", () => {
    const r = checkUrl("https://www.austrac.gov.au/scams", undefined, "AU");
    expect(r.verdict).toBe("safe");
  });

  it("scores a bare mention at zero, as for every other agency", () => {
    // Exchanges and remitters cite AUSTRAC in genuine KYC mail.
    for (const text of [
      "AUSTRAC has published its annual report on financial crime trends.",
      "Under AUSTRAC requirements we must verify your identity before your first withdrawal.",
    ]) {
      expect(checkSms(text, undefined, "AU").score).toBe(0);
    }
  });
});

describe("#426 AU — agency moves contact to WhatsApp/Telegram", () => {
  it("flags an agency asking to continue on WhatsApp", () => {
    // Probed 2026-10-06: safe 0.
    const r = checkSms(ATO_HANDOFF, undefined, "AU");
    expect(handoffFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("covers Telegram and the other verbs", () => {
    const r = checkSms(
      "Services Australia: to finish your claim, chat with a case officer via Telegram.",
      undefined,
      "AU",
    );
    expect(handoffFlag(r)).toBeTruthy();
  });

  it("needs a named agency — a friend's WhatsApp invite is untouched", () => {
    const r = checkSms("Hey it's Sam from footy, message me on WhatsApp when you're free", undefined, "AU");
    expect(handoffFlag(r)).toBeFalsy();
  });

  it("needs the instruction — an agency next to an app name is not enough", () => {
    const r = checkSms(
      "Join our WhatsApp group via the link, the police community update is on Telegram too",
      undefined,
      "AU",
    );
    expect(handoffFlag(r)).toBeFalsy();
  });

  it("does not take the agency from a link's hostname", () => {
    const r = checkSms("Contact me on WhatsApp about the car: https://ato-carsales.example.com", undefined, "AU");
    expect(handoffFlag(r)).toBeFalsy();
  });

  it("is opt-in per pack — AU sets the flag, others don't", () => {
    expect(resolveRegionPack("AU").authorityMessagingAppFlag).toBeTruthy();
    // Singapore runs official Gov.sg WhatsApp channels.
    expect(resolveRegionPack("SG").authorityMessagingAppFlag).toBeUndefined();
    for (const region of ["GB", "US", "NZ", "SG"]) {
      expect(handoffFlag(checkSms(ATO_HANDOFF, undefined, region))).toBeFalsy();
    }
  });

  it("lifts the AUSTRAC lure now that AUSTRAC is a named agency", () => {
    // Probed 2026-10-06: safe 10.
    const r = checkSms(AUSTRAC_LURE, undefined, "AU");
    expect(handoffFlag(r)).toBeTruthy();
  });
});
