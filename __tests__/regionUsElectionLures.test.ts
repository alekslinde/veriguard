// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";

// FBI IC3 PSA I-101526-3-PSA (15 Oct 2026): midterm election fraud lures.
describe("US election fraud lures", () => {
  it("flags a flagged-voter-registration text on the phrase alone", () => {
    const r = checkSms(
      "Your voter registration has been flagged. Confirm now or you will not be able to vote.",
      undefined,
      "US",
    );
    expect(r.score).toBeGreaterThanOrEqual(20);
    expect(r.verdict).not.toBe("safe");
  });

  it("flags the same lure with a link", () => {
    const r = checkSms(
      "Your voter registration has been flagged. Confirm at https://vrcheck2026.top before Nov 3 or you will not be able to vote.",
      undefined,
      "US",
    );
    expect(r.verdict).not.toBe("safe");
  });

  it("flags a campaign investment pool pitch", () => {
    const r = checkSms(
      "Join our campaign investment pool today - guaranteed returns once our candidate wins the midterm election.",
      undefined,
      "US",
    );
    expect(r.score).toBeGreaterThanOrEqual(20);
    expect(r.verdict).not.toBe("safe");
  });

  it("leaves ordinary voting messages alone", () => {
    for (const t of [
      "Reminder: early voting opens Monday at the county library.",
      "Check your registration status at vote.gov before the deadline.",
      "Please donate to our campaign to help us win in November.",
    ]) {
      expect(checkSms(t, undefined, "US").verdict).toBe("safe");
    }
  });
});
