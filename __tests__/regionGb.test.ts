// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkUrl, checkEmail, checkPhone } from "@veriguard/detect/scamDetector";
import { analysePhone } from "@veriguard/detect/phoneIntel";
import { resolveRegionPack } from "@veriguard/detect/regions";
import { GB } from "@veriguard/detect/regions/gb";
import { AU } from "@veriguard/detect/regions/au";

// Phase 5 — the UK pack. Two jobs here:
//
//  1. UK fixtures detect correctly (the Phase 5 gate).
//  2. Neither region's signals leak into the other. That's the real risk the
//     plan calls "silent quality collapse": a UK user scored against Australian
//     agencies gets a confident-looking verdict built from the wrong rules.
//     Isolation is asserted in both directions, not just AU→GB.

const flagText = (r: { flags: string[] }) => r.flags.join(" | ").toLowerCase();

describe("GB pack shape", () => {
  const pack = resolveRegionPack("GB");

  it("resolves as a fully-covered region", () => {
    expect(pack.code).toBe("GB");
    expect(pack.name).toBe("United Kingdom");
    expect(pack.coverage).toBe("full");
  });

  it("uses the ISO code GB, never UK", () => {
    // libphonenumber resolves the invalid "UK" to Switzerland — the Phase 4
    // regression. Passing "UK" must not resolve to the UK pack.
    expect(resolveRegionPack("UK").code).not.toBe("GB");
  });

  it("names Report Fraud as the reporting body, not the decommissioned Action Fraud", () => {
    // City of London Police replaced Action Fraud with Report Fraud on
    // 4 Dec 2025, public switchover 20 Jan 2026. This string is the last line of
    // a "this is almost certainly a scam" verdict, so a stale agency name sends
    // someone acting on that advice to a service that no longer exists.
    expect(pack.reportingBody).toBe("Report Fraud (reportfraud.police.uk)");
    expect(pack.reportingBody).not.toContain("Action Fraud");
  });

  it("omits senderIdFlag — the UK has no ACMA-style register", () => {
    // The UK registry blocks unregistered senders rather than labelling them
    // "Unverified", so there is no label for a scammer to explain away.
    // Asserting one would state foreign regulation as fact.
    expect(pack.senderIdFlag).toBeUndefined();
  });

  it("only claims no-link senders that are also impersonated authorities", () => {
    const authorities = GB.authorityMentions.map((a) => a.toLowerCase());
    for (const sender of GB.noLinkSenders) {
      expect(authorities).toContain(sender.toLowerCase());
    }
  });

  it("has no duplicate entries within a signal list", () => {
    const lists = {
      authorityMentions: GB.authorityMentions.map((a) => a.toLowerCase()),
      legitDomains: GB.legitDomains,
      identityRereg: GB.identityRereg,
      foreignAuthorityMentions: GB.foreignAuthorityMentions,
      typosquatSubstring: GB.typosquatBrands.substring,
      typosquatWord: GB.typosquatBrands.word,
      officialSenderNames: GB.officialSenderNames,
    };
    for (const [name, list] of Object.entries(lists)) {
      expect({ [name]: new Set(list).size }).toEqual({ [name]: list.length });
    }
  });

  it("keeps the flat urgency union free of duplicates", () => {
    // A phrase in two groups would score twice for one match.
    expect(new Set(pack.urgencyWords).size).toBe(pack.urgencyWords.length);
  });

  it("keeps short brands out of the substring lists", () => {
    // Anything this short matched as a bare substring collides with ordinary
    // words ("bt" in "subtle", "ee" in almost anything).
    for (const brand of [...GB.typosquatBrands.substring, ...GB.brandMentions.substring]) {
      expect(brand.length).toBeGreaterThan(2);
    }
  });
});

describe("GB SMS detection", () => {
  it("detects the HMRC tax-refund smish", () => {
    const r = checkSms(
      "HMRC: You are eligible for a tax refund of 284.50. Claim your refund at http://hmrc-refund.top",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("government agency");
  });

  it("detects the National Insurance suspension threat", () => {
    const r = checkSms(
      "HMRC final notice: your NI number suspended pending a money laundering investigation. Call us immediately.",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("ni number");
  });

  it("detects the Royal Mail redelivery-fee lure", () => {
    const r = checkSms(
      "Royal Mail: your parcel is held. A redelivery fee is required: http://royalmail-redeliver.xyz",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags a link from a sender that never sends links", () => {
    const r = checkSms(
      "DVLA: your vehicle tax refund is ready, claim at http://dvla-refunds.top",
      undefined,
      "GB",
    );
    expect(flagText(r)).toContain("never ask for personal or payment details by text");
  });

  it("detects the pension-release lure", () => {
    const r = checkSms(
      "Free pension review: unlock your pension early and release your pension funds today. Reply YES.",
      undefined,
      "GB",
    );
    expect(["suspicious", "likely_scam"]).toContain(r.verdict);
  });

  it("detects the Dart Charge / congestion-charge toll lure", () => {
    const r = checkSms(
      "Dart Charge: you have an unpaid toll. A penalty charge notice will be issued: http://dartcharge-pay.top",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("detects Interpol foreign-authority impersonation", () => {
    const r = checkSms(
      "Interpol notice: an arrest warrant has been issued in your name over a money laundering investigation.",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
    // Points at Report Fraud, not the decommissioned Action Fraud.
    expect(flagText(r)).toContain("reportfraud.police.uk");
    expect(flagText(r)).not.toContain("action fraud");
  });

  it("detects the Government Gateway re-registration lure", () => {
    const r = checkSms(
      "Your government gateway has been suspended. Verify your gov.uk account to restore access.",
      undefined,
      "GB",
    );
    expect(flagText(r)).toContain("one login");
  });

  it("detects bond-redirect fraud using the UK routing identifier", () => {
    // The composite pairs a rental context with a bank-detail ask. The ask half
    // used to be a hardcoded "bsb", which is meaningless in the UK — a sort-code
    // request would have matched nothing.
    const r = checkSms(
      "Your property manager here — the holding deposit must go to a new sort code, details below.",
      undefined,
      "GB",
    );
    expect(flagText(r)).toContain("property bond fraud");
  });

  // Code review, finding 4 — "three" as a brand word fired on ordinary English.
  it("does not treat the numeral 'three' as brand impersonation", () => {
    const r = checkSms("Your order is ready: three items in your basket are reserved.", undefined, "GB");
    expect(flagText(r)).not.toContain("well-known company");
  });

  // Code review, finding 5 — the region-agnostic phone heuristic had an
  // unanchored 9-14 digit alternative, so an order or reference number
  // satisfied the "there is a number to ring" half of the TOAD composite.
  it("does not accept a bare digit run as a phone number", () => {
    const r = checkSms(
      "Coinbase: suspicious login on order 1234567890123. Call support to resolve.",
      undefined,
      "GB",
    );
    expect(flagText(r)).not.toContain("asking you to phone them");
  });

  it.each(["02079460000", "+442079460000"])(
    "still fires the TOAD composite for the dialable number %s",
    (number) => {
      const r = checkSms(`Coinbase: suspicious login. Call support on ${number} to resolve.`, undefined, "GB");
      expect(flagText(r)).toContain("asking you to phone them");
    },
  );

  it("flags a UK consumer brand without calling it a government agency", () => {
    const r = checkSms("Evri: your delivery could not be completed, update your address.", undefined, "GB");
    expect(flagText(r)).toContain("well-known company");
    expect(flagText(r)).not.toContain("government agency");
  });

  it("matches short brands on word boundaries only", () => {
    // "bt" and "ee" as bare substrings would fire on ordinary prose.
    const innocuous = checkSms("Subtle changes to your committee meeting agenda are attached.", undefined, "GB");
    expect(flagText(innocuous)).not.toContain("well-known company");

    const real = checkSms("BT: your broadband will be disconnected today unless you call us.", undefined, "GB");
    expect(flagText(real)).toContain("well-known company");
  });
});

describe("GB URL detection", () => {
  it("treats gov.uk and its subdomains as legitimate", () => {
    for (const url of ["https://www.gov.uk/vehicle-tax", "https://tax.service.gov.uk/account"]) {
      const r = checkUrl(url, undefined, "GB");
      expect(r.verdict).toBe("safe");
      expect(flagText(r)).toContain("verified uk government");
    }
  });

  it("flags a DVLA typosquat", () => {
    const r = checkUrl("http://dvla-vehicle-tax-refund.top/login", undefined, "GB");
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("impersonates \"dvla\"");
  });

  it("flags a UK bank typosquat", () => {
    const r = checkUrl("http://barclays-secure-login.xyz", undefined, "GB");
    expect(flagText(r)).toContain("impersonates \"barclays\"");
  });

  it("does not flag a brand on its own national domain", () => {
    // A brand name under the region's own suffix is expected, not suspicious.
    expect(checkUrl("https://www.barclays.co.uk/", undefined, "GB").verdict).toBe("safe");
    expect(checkUrl("https://www.hmrc.gov.uk/", undefined, "GB").verdict).toBe("safe");
  });

  it("matches short brands on separator boundaries, not substrings", () => {
    // "bt" must hit bt-billing but not subtleshop; same rule as the AU "agl" case.
    expect(flagText(checkUrl("http://bt-billing-refund.top", undefined, "GB"))).toContain("impersonates \"bt\"");
    expect(flagText(checkUrl("https://subtleshop.com/x", undefined, "GB"))).not.toContain("impersonates");
  });

  // Code review, finding 1 — the blocker. Trusted suffixes suppress brand
  // scoring entirely, so listing an *open* registration whitelists exactly what
  // scammers buy. `.co.uk` and `.org.uk` are sold to anyone; the first version
  // of this pack exempted them, and `dvla-vehicle-tax.org.uk` came back "safe".
  it.each([
    ["http://barclays-secure-verify.co.uk/login", "barclays"],
    ["http://hmrc-tax-refund-claim.co.uk", "hmrc"],
    ["http://dvla-vehicle-tax.org.uk", "dvla"],
    ["http://natwest-login.co.uk", "natwest"],
    ["http://secure-barclays.co.uk", "barclays"],
  ])("flags a typosquat on the open registration %s", (url, brand) => {
    const r = checkUrl(url, undefined, "GB");
    expect(flagText(r)).toContain(`impersonates "${brand}"`);
    expect(r.verdict).toBe("likely_scam");
  });

  it("still exempts eligibility-restricted suffixes", () => {
    // .gov.uk and .nhs.uk are vetted registries, so a brand name is genuine.
    for (const url of ["https://www.hmrc.gov.uk/", "https://www.nhs.uk/"]) {
      expect(flagText(checkUrl(url, undefined, "GB"))).not.toContain("impersonates");
    }
  });

  // The other half of finding 1: dropping the .co.uk exemption without the
  // registrable-label rule flagged 21 of 24 real UK brand sites as likely_scam.
  it.each([
    "https://www.barclays.co.uk/",
    "https://www.tesco.com/",
    "https://www.argos.co.uk/",
    "https://www.nationwide.co.uk/",
    "https://www.britishgas.co.uk/",
    "https://personal.natwest.com/",
  ])("does not flag the genuine site %s", (url) => {
    expect(flagText(checkUrl(url, undefined, "GB"))).not.toContain("impersonates");
  });

  it("flags a brand used as a subdomain of another registrable domain", () => {
    // The brand owns the label only on its real site; here "evil" does.
    const r = checkUrl("http://barclays.co.uk.evil.top/login", undefined, "GB");
    expect(flagText(r)).toContain("impersonates \"barclays\"");
  });

  // Code review, finding 3 — "three" was in the substring list, contradicting
  // its own comment, and fires on ordinary words. No matching strategy
  // separates an English numeral from the brand, so it was removed outright.
  it.each(["https://threefold.network/about", "https://threema.ch/en"])(
    "does not flag %s as brand impersonation",
    (url) => {
      expect(flagText(checkUrl(url, undefined, "GB"))).not.toContain("impersonates");
    },
  );
});

describe("GB email detection", () => {
  it("flags an HMRC impersonation from a non-UK domain", () => {
    const r = checkEmail(
      "From: HMRC <refunds@hmrc-secure.top>\nSubject: Tax rebate\n\nDear Customer, your HMRC tax rebate is waiting. Confirm your sort code and national insurance number.",
      undefined,
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("domain doesn't match");
  });

  it("forwards the region to the SMS body scorer", () => {
    // checkEmail delegates body scoring to checkSms and previously dropped the
    // region, so every email body was scored against the AU signal set.
    //
    // The fixture is deliberately built so the *only* possible source of
    // divergence is that delegated call: a UK-only urgency phrase, a sender on
    // a neutral domain, and no name from officialSenderNames — otherwise
    // checkEmail's own region-aware rules mask the bug and the test passes
    // whether or not the region is forwarded.
    const body = "From: Notices <post@example.com>\n\nYour vehicle is untaxed. A penalty charge notice will follow.";
    const gb = checkEmail(body, undefined, "GB");
    const au = checkEmail(body, undefined, "AU");
    expect(gb.score).toBeGreaterThan(au.score);
    expect(flagText(gb)).toContain("urgency language");
    expect(flagText(au)).not.toContain("urgency language");
  });
});

describe("GB phone detection", () => {
  it("flags 09 premium-rate numbers", () => {
    const i = analysePhone("09112345678", "GB");
    expect(i.lineType).toBe("premium");
    expect(i.spoofingRisk).toBe("very_high");
  });

  it("flags 070 personal numbers as premium", () => {
    // Widely used to disguise premium-rate forwarding.
    expect(analysePhone("07012345678", "GB").lineType).toBe("premium");
  });

  it("classifies a UK mobile as a domestic mobile", () => {
    const i = analysePhone("07911123456", "GB");
    expect(i.lineType).toBe("mobile");
    expect(i.isDomestic).toBe(true);
    expect(i.country).toBe("United Kingdom");
  });

  it("attributes mixed-width area codes", () => {
    // The UK plan mixes 020 with 0161 and 0113; a fixed two-character slice
    // (the original AU-shaped logic) matches none of them.
    expect(analysePhone("02079460000", "GB").region).toBe("London");
    expect(analysePhone("01612345678", "GB").region).toBe("Manchester");
    expect(analysePhone("01132345678", "GB").region).toBe("Leeds");
  });

  it("recognises UK non-emergency service numbers", () => {
    // 999/112 come from the universal set; 101 and 111 are national additions.
    expect(analysePhone("101", "GB").lineType).toBe("emergency");
    expect(analysePhone("111", "GB").lineType).toBe("emergency");
    expect(analysePhone("999", "GB").lineType).toBe("emergency");
  });

  it("treats an AU number as foreign for a UK user", () => {
    const i = analysePhone("+61412345678", "GB");
    expect(i.country).toBe("Australia");
    expect(i.isDomestic).toBe(false);
  });

  it("uses UK freephone wording, not AU 1800 wording", () => {
    const notes = analysePhone("08001111", "GB").spoofingNotes.join(" ");
    expect(notes).toContain("0800");
    expect(notes).not.toContain("1800");
    expect(notes).not.toContain("ATO");
  });

  it("reports Report Fraud when a UK number scores badly", () => {
    const r = checkPhone("09112345678", "GB");
    const copy = r.details + r.flags.join(" ");
    expect(copy).toContain("Report Fraud");
    expect(copy).toContain("reportfraud.police.uk");
  });
});

describe("region isolation", () => {
  it("does not apply UK agencies to an AU check", () => {
    const hmrc = "HMRC: your tax refund is waiting, claim it at http://hmrc-refund.top";
    expect(flagText(checkSms(hmrc, undefined, "AU"))).not.toContain("government agency");
    expect(flagText(checkSms(hmrc, undefined, "GB"))).toContain("government agency");
  });

  it("does not apply AU agencies to a UK check", () => {
    const ato = "ATO: your myGov account has a tax refund waiting, verify now at http://ato-refund.xyz";
    expect(flagText(checkSms(ato, undefined, "GB"))).not.toContain("government agency");
    expect(flagText(checkSms(ato, undefined, "AU"))).toContain("government agency");
  });

  it("keeps AU regulator copy out of UK flags", () => {
    const r = checkSms("Quantum AI is verified by ASIC — guaranteed returns, join our trading group", undefined, "GB");
    const text = flagText(r);
    expect(text).toContain("fca");
    expect(text).not.toContain("asic");
    expect(text).not.toContain("scamwatch");
  });

  it("keeps the AU sender-ID rule out of UK checks", () => {
    const msg = "Your bank: this message may appear as unverified, please ignore the 'Unverified' label.";
    expect(flagText(checkSms(msg, undefined, "AU"))).toContain("acma");
    expect(flagText(checkSms(msg, undefined, "GB"))).not.toContain("acma");
  });

  it("does not treat .com.au as trusted for a UK check, or .co.uk for an AU one", () => {
    // Each region's trusted suffixes must not leak — otherwise a typosquat
    // hides behind the other country's domain convention.
    expect(flagText(checkUrl("http://barclays-login.com.au", undefined, "GB"))).toContain("impersonates");
    expect(flagText(checkUrl("http://commbank-login.co.uk", undefined, "AU"))).toContain("impersonates");
  });

  it("scopes crypto-exchange TOAD copy to the matched brand", () => {
    // The old flag named CoinSpot, Swyftx and Binance to every region.
    const r = checkSms(
      "Coinbase: suspicious login on your account. Call our helpline on 02079460000 immediately.",
      undefined,
      "GB",
    );
    const text = flagText(r);
    expect(text).toContain("coinbase");
    expect(text).not.toContain("coinspot");
    expect(text).not.toContain("swyftx");
  });

  it("gives the two packs disjoint national brand lists", () => {
    // Some global brands (amazon, netflix, paypal) legitimately appear in both;
    // the national ones must not.
    const auOnly = ["commbank", "westpac", "linkt", "australiansuper"];
    const gbOnly = ["barclays", "natwest", "dvla", "tvlicensing"];
    for (const brand of auOnly) {
      expect(AU.typosquatBrands.substring).toContain(brand);
      expect(GB.typosquatBrands.substring).not.toContain(brand);
    }
    for (const brand of gbOnly) {
      expect(GB.typosquatBrands.substring).toContain(brand);
      expect(AU.typosquatBrands.substring).not.toContain(brand);
    }
  });
});
