import { describe, it, expect } from "vitest";
import { checkUrl, checkSms, checkEmail, checkCustom, checkPhone, analyzeContent } from "@veriguard/scam-detect/scamDetector";
import { DEFAULT_REGION } from "@veriguard/scam-detect/regions";
import { normaliseForAnalysis } from "@veriguard/scam-detect/urlSanitizer";

// Phase 2 threads an optional region through every checker. These assert the
// plumbing: omitting it must be identical to today's behaviour, and an
// unrecognised value must degrade to the default rather than throwing.
//
// Signal-level differences between regions get real coverage in Phase 5, when a
// second region pack exists to differ from.

const AU_SMS = "ATO: your tax refund is waiting, verify now at http://ato-refund.xyz";

describe("region argument plumbing", () => {
  it("omitting region matches passing the default explicitly", () => {
    expect(checkSms(AU_SMS)).toEqual(checkSms(AU_SMS, undefined, DEFAULT_REGION));
    expect(checkUrl("http://ato-refund.xyz")).toEqual(checkUrl("http://ato-refund.xyz", undefined, DEFAULT_REGION));
    expect(checkEmail(AU_SMS)).toEqual(checkEmail(AU_SMS, undefined, DEFAULT_REGION));
    expect(checkCustom(AU_SMS)).toEqual(checkCustom(AU_SMS, undefined, DEFAULT_REGION));
    expect(checkPhone("+61412345678")).toEqual(checkPhone("+61412345678", DEFAULT_REGION));
  });

  it.each(["QQ", "", "not-a-region", null, undefined])(
    "degrades to the default region for %p rather than throwing",
    (region) => {
      expect(checkSms(AU_SMS, undefined, region)).toEqual(checkSms(AU_SMS, undefined, DEFAULT_REGION));
    },
  );

  it("is case-insensitive on the region code", () => {
    expect(checkSms(AU_SMS, undefined, "au")).toEqual(checkSms(AU_SMS, undefined, "AU"));
  });

  it("still detects the AU signal set when region is passed explicitly", () => {
    const result = checkSms(AU_SMS, undefined, "AU");
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.join(" ")).toContain("government agency");
  });
});

describe("analyzeContent region forwarding", () => {
  it("forwards region to every nested checker", async () => {
    const withRegion = await analyzeContent(AU_SMS, undefined, "AU");
    const without = await analyzeContent(AU_SMS);
    expect(withRegion).toEqual(without);
  });

  it("degrades to the default for an unparseable region", async () => {
    const unknown = await analyzeContent(AU_SMS, undefined, "QQ");
    const base = await analyzeContent(AU_SMS, undefined, DEFAULT_REGION);
    expect(unknown).toEqual(base);
  });
});

// ── SMS-only rules must not fire on email ─────────────────────────────────────
//
// checkEmail reuses checkSms for body content. Most signals are channel-
// agnostic, but the no-link-sender rule is specifically about the 2024
// commitment by the ATO, myGov, Medicare, Centrelink and Australia Post to
// remove links from unsolicited *text messages*. Those bodies all send
// legitimate email containing links, so firing this on an email flags ordinary
// mail — and the flag text ("an SMS from one of these bodies with a clickable
// link is a scam") then misdescribes what was checked.
//
// Found when a genuine Australia Post delivery notification scored 38.

describe("the no-link-sender rule is SMS-only", () => {
  const AUSPOST_EMAIL = [
    "From: noreply@auspost.com.au",
    "Subject: Your parcel is on its way",
    "",
    "Track your delivery at https://auspost.com.au/track",
  ].join("\n");

  it("does not fire on a legitimate agency email containing a link", () => {
    const result = checkEmail(AUSPOST_EMAIL, undefined, "AU");
    expect(result.flags.some((f) => /removed links from their unsolicited SMS/i.test(f))).toBe(false);
  });

  it("still fires on an SMS from a no-link sender that carries a link", () => {
    // The rule's real job — this must keep working.
    const sms = "Australia Post: your parcel is held. Pay the fee at http://auspost-redelivery.tk/fee";
    const result = checkSms(sms, undefined, "AU");
    expect(result.flags.some((f) => /removed links from their unsolicited SMS/i.test(f))).toBe(true);
  });

  it("scores a legitimate agency email lower than the same text as an SMS", () => {
    // The channel distinction has to show up in the score, not just the flag.
    const asEmail = checkEmail(AUSPOST_EMAIL, undefined, "AU");
    const asSms = checkSms("Australia Post: track your delivery at https://auspost.com.au/track", undefined, "AU");
    expect(asEmail.score).toBeLessThan(asSms.score);
  });

  it("leaves channel-agnostic signals firing on email", () => {
    // Scoping one rule must not blunt the shared body analysis.
    const scamEmail = [
      "From: service@commbank-secure-login.tk",
      "Subject: Urgent: account suspended",
      "",
      "Your account is suspended. Verify now at http://commbank-secure-login.tk/verify",
    ].join("\n");
    const result = checkEmail(scamEmail, undefined, "AU");
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.length).toBeGreaterThan(2);
  });
});

// ── Mail from an organisation's own domain isn't impersonation ────────────────
//
// The authority-mention signal exists to catch a message that NAMES an agency
// while arriving from somewhere else. When the sender IS that organisation the
// premise fails, and the advice it gives ("verify directly via official
// channels") is wrong for mail that came through the official channel.
//
// A genuine Australia Post delivery notification scored 38/suspicious on this.
//
// The suppression is deliberately narrow: email only (an SMS sender is trivially
// spoofed and unverifiable), exact-or-subdomain matching, and consulting only
// the region's own researched allowlists.

describe("authority mentions from the organisation's own domain", () => {
  const auspostEmail = (from: string) =>
    [`From: ${from}`, "Subject: Your parcel is on its way", "", "Track your delivery at https://auspost.com.au/track"].join("\n");

  it("does not call a genuine Australia Post email impersonation", () => {
    const result = checkEmail(auspostEmail("noreply@auspost.com.au"), undefined, "AU");
    expect(result.flags.some((f) => /Claims to be from a government agency/i.test(f))).toBe(false);
    expect(result.verdict).toBe("safe");
  });

  it("accepts a subdomain of an allowlisted sender", () => {
    const result = checkEmail(auspostEmail("noreply@track.auspost.com.au"), undefined, "AU");
    expect(result.flags.some((f) => /Claims to be from a government agency/i.test(f))).toBe(false);
  });

  it("is not fooled by a lookalike that merely starts with the domain", () => {
    // The false-negative that would matter: auspost.com.au.evil.tk must not
    // inherit Australia Post's standing.
    const result = checkEmail(auspostEmail("noreply@auspost.com.au.evil.tk"), undefined, "AU");
    expect(result.verdict).toBe("likely_scam");
  });

  it("is not fooled by a domain that merely contains the name", () => {
    const result = checkEmail(auspostEmail("noreply@notauspost.com.au"), undefined, "AU");
    expect(result.flags.some((f) => /Claims to be from a government agency/i.test(f))).toBe(true);
  });

  it("still flags a scam that names the agency from an unrelated domain", () => {
    // The rule's actual job — this is the common shape and must keep working.
    const scam = [
      "From: service@parcel-redelivery.tk",
      "Subject: Australia Post: parcel held",
      "",
      "Australia Post: pay the redelivery fee at http://auspost-redelivery.tk/fee",
    ].join("\n");
    const result = checkEmail(scam, undefined, "AU");
    expect(result.verdict).toBe("likely_scam");
    expect(result.flags.some((f) => /Claims to be from a government agency/i.test(f))).toBe(true);
  });

  it("recognises a government sender through the national suffix", () => {
    // .gov.au is already in trustedHostSuffixes, so no allowlist entry needed.
    const gov = ["From: noreply@ato.gov.au", "Subject: Your tax return", "", "Log in at https://ato.gov.au/mytax"].join("\n");
    const result = checkEmail(gov, undefined, "AU");
    expect(result.flags.some((f) => /Claims to be from a government agency/i.test(f))).toBe(false);
  });

  it("does not extend the suppression to SMS, where the sender is unverifiable", () => {
    // A text claiming to be Australia Post proves nothing about its origin.
    const sms = "Australia Post: your parcel is held, pay at http://auspost-redelivery.tk/fee";
    const result = checkSms(sms, undefined, "AU");
    expect(result.flags.some((f) => /Claims to be from a government agency/i.test(f))).toBe(true);
  });
});

describe("trailing-dot hostnames score the same as their plain form", () => {
  // The bypass worked in both directions, so both are asserted.
  it("does not let a scam evade the suspicious-TLD check", () => {
    const plain = checkUrl(normaliseForAnalysis("http://commbank-secure-login.tk/verify"), undefined, "AU");
    const dotted = checkUrl(normaliseForAnalysis("http://commbank-secure-login.tk./verify"), undefined, "AU");
    expect(dotted.score).toBe(plain.score);
    expect(dotted.verdict).toBe("likely_scam");
  });

  it("does not cost a legitimate domain its allowlist credit", () => {
    const plain = checkUrl(normaliseForAnalysis("https://ato.gov.au/mytax"), undefined, "AU");
    const dotted = checkUrl(normaliseForAnalysis("https://ato.gov.au./mytax"), undefined, "AU");
    expect(dotted.score).toBe(plain.score);
    expect(dotted.verdict).toBe("safe");
  });
});

describe("display-name masking cannot lower a verdict", () => {
  const body = "\n\nHi, please confirm your account details when you get a moment.";

  it("scores a masked sender at least as high as the honest form", () => {
    // The evasion: 37/suspicious → 17/safe before the fix.
    const honest = checkEmail("From: attacker@evil-bank-support.tk" + body, undefined, "AU");
    const masked = checkEmail(
      'From: "noreply@ato.gov.au" <attacker@evil-bank-support.tk>' + body,
      undefined,
      "AU",
    );
    expect(masked.score).toBeGreaterThanOrEqual(honest.score);
    expect(masked.verdict).not.toBe("safe");
  });
});

// AU parcel address-correction lure (D1 / 2026-08-29 sweep). Australia Post's
// own scam-alert page names address correction as the dominant live AU parcel
// campaign — six of its eight parcel alerts are address-shaped — while the AU
// pack, the largest of the six, carried nothing for it. Ten phrasings taken
// verbatim from those alerts scored 0/safe before this.
//
// The phrases split in two, and the split is the whole design. Some have no
// clean use in a consumer delivery SMS and score flat. The rest are ordinary
// retail commerce ("please confirm your address for our records before we
// ship") and are GATED on a delivery context, because the scam signal is not
// the address request — it is the address request as the thing blocking a
// delivery. See docs/threat-intel/2026-08-29-threat-roadmap.md.
describe("AU parcel address-correction lure", () => {
  // Verbatim from auspost.com.au scam alerts, with the alert date.
  const scamPhrasings: [string, string][] = [
    ["update your address (2024-07-08)", "Your parcel is waiting. Update your address to complete delivery"],
    ["confirm your address (2024-11-13)", "We could not complete delivery. Confirm your address to receive your parcel"],
    ["update your correct address (2026-02-25)", "Update your correct address to release your shipment"],
    ["schedule redelivery (2025-02-27)", "StarTrack: schedule redelivery to prevent your package being returned"],
    ["missing house number (2026-02-25)", "Shipment has been suspended due to missing house number"],
    ["verify your postcode (2026-03-18)", "Please verify your postcode within 48 hours to complete delivery"],
    ["delivery attempt unsuccessful (2026-07-01)", "Your delivery attempt was unsuccessful. Act within 24 hours or your parcel is returned"],
  ];

  for (const [name, text] of scamPhrasings) {
    it(`no longer scores safe: ${name}`, () => {
      expect(checkSms(text).verdict).not.toBe("safe");
    });
  }

  // The FP half. Each of these is a message a real retailer or courier sends,
  // and each was measured at 0 before and after the change. The first is the
  // one that decided the design: a flat "confirm your address" entry would
  // flag it.
  const legitimate = [
    "Please confirm your address for our records before we ship",
    "Thanks for updating your address with us",
    "Your redelivery is booked for Thursday",
    "Hi, the courier will deliver between 9 and 11 tomorrow",
    "Your order has shipped. Tracking: AP123456789AU",
    "We tried to deliver today and left a card. Collect from the post office",
    "Your parcel was delivered and left in a safe place",
    "Your Woolworths order is on its way, track it in the app",
  ];

  for (const text of legitimate) {
    it(`stays safe: ${text.slice(0, 46)}`, () => {
      expect(checkSms(text).verdict).toBe("safe");
    });
  }

  it("does not fire on an address phrase with no delivery context", () => {
    // The gate's whole purpose. "Confirm your address" is a shipping formality
    // until something says a delivery is being held up by it.
    const result = checkSms("Please confirm your address for our records");
    expect(result.flags.some((f) => f.includes("release a delivery"))).toBe(false);
  });

  it("fires on the same phrase once a delivery context is present", () => {
    const result = checkSms("Your parcel is waiting. Please confirm your address");
    expect(result.flags.some((f) => f.includes("release a delivery"))).toBe(true);
  });

  it("does not fire on a delivery context with no address phrase", () => {
    // Both halves are required. "Your redelivery is booked" carries the
    // delivery noun and is a perfectly ordinary courier message.
    const result = checkSms("Your redelivery is booked for Thursday");
    expect(result.flags.some((f) => f.includes("release a delivery"))).toBe(false);
  });

  it("scores the gated pairing short of likely_scam on its own", () => {
    // +20 reaches "suspicious" (20-44) without reaching "likely_scam" (45+),
    // which is the right ceiling for a signal whose two halves are each
    // individually innocent.
    const result = checkSms("Your parcel is waiting. Update your address to complete delivery");
    expect(result.verdict).toBe("suspicious");
  });

  // D2 — "parcel held" was already listed, but entries match as literal
  // substrings, so the inflected form missed it entirely and scored 0. This is
  // the miss that prompted the sweep.
  it("matches the inflected form of a held parcel", () => {
    const result = checkSms("Your parcel is held. Pay the fee now");
    expect(result.flags.some((f) => f.toLowerCase().includes("parcel is held"))).toBe(true);
  });
});
