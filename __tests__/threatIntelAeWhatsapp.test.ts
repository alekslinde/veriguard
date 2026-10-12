// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";
import { resolveRegionPack } from "@veriguard/detect/regions";

// Coverage for #445 / roadmap D1 (2026-10-11): Dubai Police's eCrime Hub
// describes government-impersonation lures that hand the victim off to
// WhatsApp, a call, or email under manufactured urgency.

const DUBAI_HANDOFF =
  "Dubai Police notice: confirm your Emirates ID within 24 hours or face legal action. Contact our officer on WhatsApp +971 50 123 4567.";

const handoffFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.includes("continue on WhatsApp"));

describe("#445 AE — agency moves contact to WhatsApp/Telegram", () => {
  it("flags an agency asking to continue on WhatsApp", () => {
    const r = checkSms(DUBAI_HANDOFF, undefined, "AE");
    expect(handoffFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("covers Dubai Police by name", () => {
    // Probed 2026-10-11: unknown 0 (names a government agency, nothing else unusual).
    const r = checkSms(
      "This is Dubai Police. Your case is under review. Please message us on WhatsApp to continue, or you will be fined.",
      undefined,
      "AE",
    );
    expect(handoffFlag(r)).toBeTruthy();
  });

  it("sets the flag for AE", () => {
    expect(resolveRegionPack("AE").authorityMessagingAppFlag).toBeTruthy();
  });

  it("needs a named agency — a friend's WhatsApp invite is untouched", () => {
    const r = checkSms("Hey it's Sam, message me on WhatsApp when you're free", undefined, "AE");
    expect(handoffFlag(r)).toBeFalsy();
  });
});
