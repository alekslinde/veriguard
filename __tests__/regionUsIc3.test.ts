// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// FBI warning (Aug 2026): IC3 impersonation to re-victimise fraud reporters.
describe("US IC3 impersonation", () => {
  it.each([
    "IC3 case update: your lost funds have been located and are ready for release. A $200 processing fee is required to complete your recovery.",
    "We represent the Internet Crime Complaint Center and have recovered your stolen funds. A processing fee is required before release.",
  ])("reaches suspicious: %s", (text) => {
    const r = checkSms(text, undefined, "US");
    expect(["suspicious", "likely_scam"]).toContain(r.verdict);
  });

  it("leaves an unrelated message alone", () => {
    expect(checkSms("Your table for two is booked for 7pm Friday.", undefined, "US").verdict).toBe("safe");
  });
});
