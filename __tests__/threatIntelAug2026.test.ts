// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkCustom } from "@veriguard/detect/scamDetector";

// Coverage for the 2026-08-16 threat-intel roadmap additions (issues #164-#169).
// Each block asserts three things where they apply: the new phrase raises the
// right flag, the region scoping is correct (base phrases fire everywhere;
// regional phrases fire only under their pack), and the near-miss the issue
// called out as a false-positive risk stays clean.

const requestFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Asks for sensitive info"));
const rewardFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Prize/reward language"));
const brandFlag = (r: { flags: string[] }) =>
  r.flags.find((f) => f.startsWith("Claims to be from a well-known company"));

describe("#164 base — ClickFix Windows Terminal (Win+X) variant", () => {
  it("flags the Win+X → Windows Terminal instruction as a sensitive-info request", () => {
    const r = checkSms("To verify you're human, press Windows+X then open Windows Terminal and paste this.");
    expect(requestFlag(r)).toBeTruthy();
    expect(requestFlag(r)!.toLowerCase()).toMatch(/win(dows)?\+x|windows terminal/);
  });

  it("fires regardless of region (base signal)", () => {
    for (const region of ["AU", "GB", "NZ", "IE", "US"]) {
      const r = checkSms("press win+x to continue", undefined, region);
      expect(requestFlag(r)).toBeTruthy();
    }
  });

  it("contributes to a pasted overlay lure routed through checkCustom", () => {
    const r = checkCustom(
      "Verify you are human: press Windows+X, open Windows Terminal, then paste the following command.",
    );
    expect(r.verdict).not.toBe("safe");
    expect(r.flags.join(" ").toLowerCase()).toContain("press windows+x");
  });
});

describe("#165 AU — ReportCyber reference + cold storage fraud", () => {
  it("flags 'cold storage account' and 'reportcyber reference' under AU", () => {
    const r = checkSms(
      "Quote the ReportCyber reference and transfer everything to the cold storage account today.",
      undefined,
      "AU",
    );
    expect(requestFlag(r)).toBeTruthy();
    expect(requestFlag(r)!.toLowerCase()).toContain("cold storage account");
  });

  it("does not fire under a non-AU pack (region-scoped)", () => {
    const r = checkSms("cold storage account, reportcyber reference", undefined, "GB");
    expect((requestFlag(r) ?? "").toLowerCase()).not.toContain("cold storage account");
  });

  it("leaves legitimate cold-wallet guidance clean ('cold storage wallet')", () => {
    const r = checkSms("Store your Bitcoin in a cold storage wallet for long-term security.", undefined, "AU");
    expect((requestFlag(r) ?? "").toLowerCase()).not.toContain("cold storage account");
  });
});

describe("#166 AU — ASIC pump-and-dump group invite", () => {
  it("flags group-invite recruitment phrasing as reward/opportunity language under AU", () => {
    const r = checkSms(
      "Act now — you're invited to our exclusive trading group, verified by ASIC, guaranteed returns.",
      undefined,
      "AU",
    );
    expect(rewardFlag(r)).toBeTruthy();
    expect(r.verdict).toBe("likely_scam");
  });

  it("is region-scoped to AU", () => {
    const r = checkSms("join our closed trading group", undefined, "GB");
    expect((rewardFlag(r) ?? "").toLowerCase()).not.toContain("closed trading group");
  });
});

describe("#167 GB — smart meter fee + energy rebate lures", () => {
  it("flags the fee and rebate phrases under GB", () => {
    for (const phrase of [
      "smart meter installation fee",
      "smart meter replacement charge",
      "government energy rebate",
      "energy bill rebate",
      "energy support payment",
    ]) {
      const r = checkSms(`Action required: ${phrase} outstanding, pay now.`, undefined, "GB");
      expect(requestFlag(r), phrase).toBeTruthy();
      expect(requestFlag(r)!.toLowerCase()).toContain(phrase);
    }
  });

  it("compounds a British Gas mention with the rebate lure to likely_scam", () => {
    const r = checkSms(
      "British Gas: you are eligible for a government energy rebate. Confirm your bank details now: http://bg-rebate.top",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("is region-scoped to GB", () => {
    const r = checkSms("government energy rebate available", undefined, "AU");
    expect((requestFlag(r) ?? "").toLowerCase()).not.toContain("government energy rebate");
  });
});

describe("#168 base — physical courier cash/card collection fraud", () => {
  it("flags the courier-collection script as a sensitive-info request", () => {
    const r = checkSms("Your account is compromised. A courier will collect your card for safekeeping.");
    expect(requestFlag(r)).toBeTruthy();
    expect(requestFlag(r)!.toLowerCase()).toMatch(/courier will collect|collect your card/);
  });

  it("fires across the AU/GB/IE packs it targets (base signal)", () => {
    for (const region of ["AU", "GB", "IE"]) {
      const r = checkSms("we will send a courier to collect your card", undefined, region);
      expect(requestFlag(r), region).toBeTruthy();
    }
  });

  it("leaves a legitimate branch card-collection notice clean", () => {
    const r = checkSms("Your new card is ready to pick up — collect from the branch during opening hours.");
    expect(requestFlag(r) ?? "").not.toContain("collect your card");
  });
});

describe("#169 NZ — deepfake media brand investment lures", () => {
  it("flags NZ media brand mentions under NZ", () => {
    const r = checkSms("As seen on RNZ: this trading platform delivers guaranteed returns.", undefined, "NZ");
    expect(brandFlag(r)).toBeTruthy();
    expect(rewardFlag(r)).toBeTruthy();
  });

  it("matches the multi-word 'nz herald' brand", () => {
    const r = checkSms("As featured in NZ Herald — join now.", undefined, "NZ");
    expect(brandFlag(r)).toBeTruthy();
  });

  it("word-boundaries the short 'rnz' so it doesn't fire inside a longer token", () => {
    const r = checkSms("The tavern hosts a barnzone event tonight.", undefined, "NZ");
    expect(brandFlag(r) ?? "").not.toContain("well-known company");
  });

  it("the 'as seen on' reward phrasing is region-scoped to NZ", () => {
    const r = checkSms("As seen on RNZ, guaranteed returns", undefined, "GB");
    expect((rewardFlag(r) ?? "").toLowerCase()).not.toContain("as seen on rnz");
  });
});
