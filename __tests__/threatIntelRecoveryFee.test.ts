// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";
import { inferTargetRegion } from "@/lib/targetRegion";

// Coverage for the 2026-10-06 roadmap's D5 / #424: recovered funds held for a
// release fee. Also covers GB's Report Fraud service as a named authority. It
// is the body the GB lure impersonates, and the pack already names it as
// where to report, but it was not an authority mention.

const recoveryFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Says your lost money has been recovered"));
const authorityFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Claims to be from a government agency"));

describe("#424 base — recovered funds held for a release fee", () => {
  it.each([
    ["GB", "Report Fraud: your lost funds of £3,200 have been recovered. A release fee of £150 is required before the money can be returned to you."],
    ["US", "Federal Trade Commission: we have recovered $8,400 lost in your previous investment fraud. To release the funds, confirm your banking details and pay the processing fee."],
    ["CA", "Canadian Anti-Fraud Centre: we have recovered $8,400 lost in your previous investment fraud. To release the funds, confirm your banking details and pay the processing fee."],
  ])("flags the %s lure", (region, text) => {
    // Probed 2026-10-06: 0 in all three.
    const r = checkSms(text, undefined, region);
    expect(recoveryFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("reads through a decimal amount", () => {
    const r = checkSms("Your funds of $1,250.50 have been recovered. Pay the clearance fee to receive them.", undefined, "AU");
    expect(recoveryFlag(r)).toBeTruthy();
  });

  it("fires in every region (base signal)", () => {
    const text = "Your money has been recovered. A release fee of $200 applies.";
    for (const region of ["AU", "GB", "US", "NZ", "SG", "ZZ"]) {
      expect(recoveryFlag(checkSms(text, undefined, region)), region).toBeTruthy();
    }
  });

  it("needs both halves", () => {
    for (const text of [
      // Recovered, no fee.
      "Your payment has been recovered by our disputes team and will be credited within 3 days.",
      "Your account access has been recovered. No action needed.",
      "We have recovered your parcel. Redelivery is free of charge.",
      // Fee, no recovery claim.
      "A processing fee of $5 applies to international transfers.",
    ]) {
      expect(recoveryFlag(checkSms(text, undefined, "AU")), text).toBeFalsy();
    }
  });
});

describe("GB — Report Fraud as a named authority", () => {
  it("names the service in title case", () => {
    const r = checkSms(
      "Report Fraud: your lost funds of £3,200 have been recovered. A release fee of £150 is required before the money can be returned to you.",
      undefined,
      "GB",
    );
    expect(authorityFlag(r)).toBeTruthy();
  });

  it("does not take the ordinary verb phrase for the service", () => {
    const r = checkSms("If you notice anything unusual, call us on 0300 555 0100 to report fraud.", undefined, "GB");
    expect(authorityFlag(r)).toBeFalsy();
  });

  it("does not pull a region guess toward GB", () => {
    // The probe in lib/targetRegion ignores case. Without the exclusion this
    // inferred GB from ordinary bank wording.
    expect(inferTargetRegion("If you notice anything unusual, call us to report fraud.").region).not.toBe("GB");
  });
});
