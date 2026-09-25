import { describe, it, expect } from "vitest";
import { checkSms, checkUrl, checkEmail, checkPhone } from "@veriguard/scam-detect/scamDetector";
import { analysePhone } from "@veriguard/scam-detect/phoneIntel";
import { resolveRegionPack, supportedRegions } from "@veriguard/scam-detect/regions";
import { US } from "@veriguard/scam-detect/regions/us";
import { NZ } from "@veriguard/scam-detect/regions/nz";
import { CA } from "@veriguard/scam-detect/regions/ca";
import { IE } from "@veriguard/scam-detect/regions/ie";
import { AU } from "@veriguard/scam-detect/regions/au";
import { GB } from "@veriguard/scam-detect/regions/gb";

// The US / NZ / CA / IE follow-up packs — the cheap, data-only regions the
// Phase 5 sequencing calls for once the interface stabilised.
//
// Three jobs, in order of what actually protects the product:
//
//  1. Each region's fixtures detect correctly.
//  2. No region's signals leak into another. This is the "silent quality
//     collapse" risk the plan names: a user scored against the wrong country's
//     agencies gets a confident-looking verdict built from rules that don't
//     apply to them. IE↔GB is the sharpest case — shared language, shared
//     brands, entirely different agencies — so it's asserted hardest.
//  3. The structural invariants hold for every new pack. Most of these are
//     enforced generically in regions.test.ts via supportedRegions(); what's
//     here is what that loop can't express.

const flagText = (r: { flags: string[] }) => r.flags.join(" | ").toLowerCase();

const NEW_PACKS = [
  ["US", US],
  ["NZ", NZ],
  ["CA", CA],
  ["IE", IE],
] as const;

describe("follow-up pack shape", () => {
  it.each(NEW_PACKS)("%s is registered and resolvable", (code) => {
    expect(supportedRegions()).toContain(code);
    expect(resolveRegionPack(code).code).toBe(code);
  });

  it.each(NEW_PACKS)("%s only claims no-link senders that are also authorities", (_code, def) => {
    // The flag copy names these bodies, so a sender missing from
    // authorityMentions could never reach the nested no-link check.
    const authorities = def.authorityMentions.map((a) => a.toLowerCase());
    for (const sender of def.noLinkSenders) {
      expect(authorities).toContain(sender.toLowerCase());
    }
  });

  it.each(NEW_PACKS)("%s has no duplicate entries within a signal list", (_code, def) => {
    const lists = {
      authorityMentions: def.authorityMentions.map((a) => a.toLowerCase()),
      legitDomains: def.legitDomains,
      identityRereg: def.identityRereg,
      foreignAuthorityMentions: def.foreignAuthorityMentions,
      typosquatSubstring: def.typosquatBrands.substring,
      typosquatWord: def.typosquatBrands.word,
      brandSubstring: def.brandMentions.substring,
      brandWord: def.brandMentions.word,
      officialSenderNames: def.officialSenderNames,
      requestWords: def.requestWords ?? [],
    };
    for (const [name, list] of Object.entries(lists)) {
      expect({ [name]: new Set(list).size }).toEqual({ [name]: list.length });
    }
  });

  it.each(NEW_PACKS)("%s keeps short brands out of the substring lists", (_code, def) => {
    // Anything this short matched as a bare substring collides with ordinary
    // words ("td" in countless strings, "eir" in "their").
    for (const brand of [...def.typosquatBrands.substring, ...def.brandMentions.substring]) {
      expect(brand.length).toBeGreaterThan(2);
    }
  });

  it.each(NEW_PACKS)("%s keeps the flat urgency union free of duplicates", (code) => {
    // A phrase in two groups would score twice for one match.
    const pack = resolveRegionPack(code);
    expect(new Set(pack.urgencyWords).size).toBe(pack.urgencyWords.length);
  });

  it.each(NEW_PACKS)("%s builds the fraudulent-platform flag around the matched name", (_code, def) => {
    expect(def.fakeInvestmentPlatformFlag("quantum ai")).toContain("quantum ai");
  });

  it.each(NEW_PACKS)("%s omits senderIdFlag — no ACMA-style register exists", (_code, def) => {
    // Only Australia has a scheme that labels messages "Unverified", which is
    // what makes "ignore the Unverified label" a tell. Asserting one elsewhere
    // would state foreign regulation as fact.
    expect(def.senderIdFlag).toBeUndefined();
  });

  it("declares Canada as partial coverage, not full", () => {
    // Every keyword in the CA pack is English, against an officially bilingual
    // population. Without the partial declaration a French-language smish would
    // match almost nothing and return a confident-looking clean verdict — the
    // exact failure the coverage gate exists to prevent.
    expect(CA.coverage).toBe("partial");
    expect(resolveRegionPack("CA").coverage).toBe("partial");
  });

  it.each([["US", US], ["NZ", NZ], ["IE", IE]] as const)(
    "%s declares full coverage",
    (_code, def) => {
      expect(def.coverage).toBe("full");
    },
  );
});

describe("US detection", () => {
  it("detects the IRS refund smish", () => {
    const r = checkSms(
      "IRS: you are eligible for a refund of $1,284.50. Claim your refund at http://irs-refund-claim.top",
      undefined,
      "US",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("government agency");
  });

  it("detects the SSN suspension threat", () => {
    const r = checkSms(
      "Social Security Administration: your SSN has been suspended pending a money laundering investigation. Call immediately.",
      undefined,
      "US",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("ssn");
  });

  it("detects the E-ZPass toll lure — the dominant US smish", () => {
    const r = checkSms(
      "E-ZPass: you have an unpaid toll. Pay now to avoid a late fee: http://ezpass-tolls-pay.top",
      undefined,
      "US",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags a link from a sender that never sends links", () => {
    const r = checkSms(
      "USPS: your package is waiting, confirm your shipping address at http://usps-redelivery.top",
      undefined,
      "US",
    );
    expect(flagText(r)).toContain("never initiate contact by text");
  });

  it("detects the 401k rollover lure", () => {
    const r = checkSms(
      "Your retirement account is at risk. A free 401k rollover review is available — reply YES to speak to an advisor.",
      undefined,
      "US",
    );
    expect(["suspicious", "likely_scam"]).toContain(r.verdict);
  });

  it("detects the ID.me re-registration lure", () => {
    const r = checkSms(
      "Your ID.me account could not be verified. Complete your identity verification to keep your IRS access.",
      undefined,
      "US",
    );
    expect(flagText(r)).toContain("re-registration");
  });

  it("treats .gov as legitimate", () => {
    const r = checkUrl("https://www.irs.gov/refunds", undefined, "US");
    expect(r.verdict).toBe("safe");
    expect(flagText(r)).toContain("verified us government");
  });

  it("flags an IRS typosquat on an open .com registration", () => {
    // .com is not a trusted suffix — exempting it would disable brand scoring
    // across most of the web.
    const r = checkUrl("http://irs-gov-refund-claim.com/login", undefined, "US");
    expect(flagText(r)).toContain("impersonates");
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags a Chase typosquat but not the genuine site", () => {
    expect(flagText(checkUrl("http://chase-secure-verify.top/login", undefined, "US")))
      .toContain('impersonates "chase"');
    expect(flagText(checkUrl("https://www.chase.com/", undefined, "US")))
      .not.toContain("impersonates");
  });

  it("matches short brands on separator boundaries, not substrings", () => {
    // "ups" must hit ups-tracking but not "startups".
    expect(flagText(checkUrl("http://ups-tracking-redelivery.top", undefined, "US")))
      .toContain('impersonates "ups"');
    expect(flagText(checkUrl("https://startups.com/directory", undefined, "US")))
      .not.toContain("impersonates");
  });

  it("does not treat 'attention' as the AT&T brand", () => {
    // "att" as a bare substring fires on "attention", which appears in a large
    // share of scam messages — it must be word-matched only.
    const r = checkSms("Attention: your account attachment requires review.", undefined, "US");
    expect(flagText(r)).not.toContain("well-known company");
  });

  it("flags 900 premium numbers", () => {
    const i = analysePhone("19005551212", "US");
    expect(i.lineType).toBe("premium");
  });

  it("classifies a US mobile as domestic", () => {
    const i = analysePhone("2125551234", "US");
    expect(i.isDomestic).toBe(true);
    expect(i.country).toBe("United States");
  });

  it("recognises 988 as a crisis line, not a suspicious short number", () => {
    // Without the national addition this falls through to the "too short to be
    // real" guard — the same class of bug Phase 4 fixed for 999/911.
    expect(analysePhone("988", "US").lineType).toBe("emergency");
  });

  it("reports the FTC when a US number scores badly", () => {
    const r = checkPhone("19005551212", "US");
    expect(r.details + r.flags.join(" ")).toContain("ftc");
  });
});

describe("NZ detection", () => {
  it("detects the IRD refund smish", () => {
    const r = checkSms(
      "IRD: your tax assessment is ready and a refund is waiting. Claim at http://ird-refund.top",
      undefined,
      "NZ",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("government agency");
  });

  it("detects the KiwiSaver access lure", () => {
    const r = checkSms(
      "Unlock your KiwiSaver early — access your KiwiSaver funds today under hardship provisions. Reply YES.",
      undefined,
      "NZ",
    );
    expect(["suspicious", "likely_scam"]).toContain(r.verdict);
  });

  it("detects the NZ Post redelivery lure", () => {
    const r = checkSms(
      "NZ Post: your parcel is held pending a redelivery fee: http://nzpost-redeliver.xyz",
      undefined,
      "NZ",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags a link from a sender that never sends links", () => {
    const r = checkSms(
      "Work and Income: your payment is on hold, verify at http://winz-verify.top",
      undefined,
      "NZ",
    );
    expect(flagText(r)).toContain("never ask for personal or payment details by text");
  });

  it("detects the RealMe re-registration lure", () => {
    const r = checkSms(
      "Your RealMe account could not be verified. Complete your identity verification to restore access.",
      undefined,
      "NZ",
    );
    expect(flagText(r)).toContain("re-registration");
  });

  it("detects the rego / WoF infringement lure", () => {
    const r = checkSms(
      "NZTA: your rego expired and an infringement notice has been issued: http://nzta-pay.top",
      undefined,
      "NZ",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("treats govt.nz as legitimate", () => {
    const r = checkUrl("https://www.ird.govt.nz/income-tax", undefined, "NZ");
    expect(r.verdict).toBe("safe");
    expect(flagText(r)).toContain("verified new zealand government");
  });

  it("flags a typosquat on the open .co.nz registration", () => {
    // .co.nz is sold to anyone, so it must not be a trusted suffix — the same
    // trap the GB pack fell into with .co.uk.
    const r = checkUrl("http://kiwibank-secure-verify.co.nz/login", undefined, "NZ");
    expect(flagText(r)).toContain('impersonates "kiwibank"');
    expect(r.verdict).toBe("likely_scam");
  });

  it("does not flag genuine NZ brand sites", () => {
    for (const url of ["https://www.kiwibank.co.nz/", "https://www.trademe.co.nz/"]) {
      expect(flagText(checkUrl(url, undefined, "NZ"))).not.toContain("impersonates");
    }
  });

  it("does not treat 'third' or 'weird' as the IRD brand", () => {
    // "ird" as a bare substring fires on ordinary English — it must be
    // word-matched only.
    expect(flagText(checkUrl("https://thirdweird.com/x", undefined, "NZ")))
      .not.toContain("impersonates");
  });

  it("attributes NZ area codes", () => {
    expect(analysePhone("093456789", "NZ").region).toBe("Auckland / Northland");
    expect(analysePhone("043456789", "NZ").region).toBe("Wellington");
  });

  it("classifies an NZ mobile as domestic", () => {
    // NZ mobile line-type detection is one of the two cases that drove the
    // libphonenumber `max` metadata build in Phase 4.
    const i = analysePhone("0211234567", "NZ");
    expect(i.lineType).toBe("mobile");
    expect(i.isDomestic).toBe(true);
    expect(i.country).toBe("New Zealand");
  });

  it("uses NZ freephone wording, not AU 1800 wording", () => {
    const notes = analysePhone("0800123456", "NZ").spoofingNotes.join(" ");
    expect(notes).toContain("0800");
    expect(notes).not.toContain("1800");
    expect(notes).not.toContain("ATO");
  });

  it("reports CERT NZ when an NZ number scores badly", () => {
    const r = checkPhone("0900123456", "NZ");
    expect(r.details + r.flags.join(" ")).toContain("CERT NZ");
  });
});

describe("CA detection", () => {
  it("detects the CRA refund smish", () => {
    const r = checkSms(
      "CRA: your GST credit refund is waiting. Claim your refund at http://cra-gst-refund.top",
      undefined,
      "CA",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("government agency");
  });

  it("detects the SIN suspension threat", () => {
    const r = checkSms(
      "CRA final notice: your SIN has been suspended pending a money laundering investigation.",
      undefined,
      "CA",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("detects the Interac e-Transfer lure", () => {
    const r = checkSms(
      "You have received an Interac e-Transfer. Deposit it now at http://interac-deposit.top",
      undefined,
      "CA",
    );
    expect(["suspicious", "likely_scam"]).toContain(r.verdict);
  });

  it("detects the Canada Post customs-fee lure", () => {
    const r = checkSms(
      "Canada Post: your parcel is held, duty and taxes owing. Pay at http://canadapost-duty.xyz",
      undefined,
      "CA",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags a link from a sender that never sends links", () => {
    const r = checkSms(
      "Service Canada: your EI payment needs verification at http://servicecanada-verify.top",
      undefined,
      "CA",
    );
    expect(flagText(r)).toContain("never send texts or emails with links");
  });

  it("recognises canada.ca as a government domain, but does not call it safe", () => {
    // The legit-domain pass fires, so the flag is there — but CA is declared
    // partial coverage, so downgradeForCoverage turns the clean verdict into
    // "unknown" rather than a confident "safe". That is the gate doing its job:
    // an English-only pack must not vouch for a bilingual market.
    const r = checkUrl("https://www.canada.ca/en/revenue-agency.html", undefined, "CA");
    expect(flagText(r)).toContain("verified canadian government");
    expect(r.verdict).toBe("unknown");
    expect(r.coverage).toBe("partial");
  });

  it("flags a CRA typosquat on the open .ca registration", () => {
    // .ca has residency requirements but is otherwise open — residency is not
    // the same eligibility bar as government status, so it is not trusted.
    const r = checkUrl("http://cra-refund-secure.ca/login", undefined, "CA");
    expect(flagText(r)).toContain('impersonates "cra"');
  });

  it("does not treat 'craft' or 'scratch' as the CRA brand", () => {
    // "cra" as a bare substring fires on ordinary English — word-matched only.
    expect(flagText(checkUrl("https://craftshop.com/scratch", undefined, "CA")))
      .not.toContain("impersonates");
  });

  it("does not treat ordinary words containing 'td' as the TD brand", () => {
    // "td" is the worst substring offender of any brand in any pack.
    const r = checkSms("Kindly note the limited time offer stated above.", undefined, "CA");
    expect(flagText(r)).not.toContain("well-known company");
  });

  it("classifies a Canadian number as domestic", () => {
    const i = analysePhone("4165551234", "CA");
    expect(i.isDomestic).toBe(true);
    expect(i.country).toBe("Canada");
  });

  it("reports the Anti-Fraud Centre when a CA number scores badly", () => {
    const r = checkPhone("19005551212", "CA");
    expect(r.details + r.flags.join(" ")).toContain("Anti-Fraud Centre");
  });

  // The coverage gate is the load-bearing guarantee for a partial region.
  it("never returns a confident-safe verdict under partial coverage", () => {
    const r = checkSms("Hi, are we still on for lunch tomorrow?", undefined, "CA");
    expect(r.verdict).not.toBe("safe");
    expect(r.coverage).toBe("partial");
  });

  it("still reports positive detections normally under partial coverage", () => {
    // The downgrade applies to clean verdicts only — a real finding must still
    // be reported as found.
    const r = checkSms(
      "CRA: your SIN has been suspended, legal action will be taken. Pay at http://cra-pay.top",
      undefined,
      "CA",
    );
    expect(r.verdict).toBe("likely_scam");
  });
});

describe("IE detection", () => {
  it("detects the Revenue refund smish", () => {
    const r = checkSms(
      "Revenue: you are eligible for a refund of €412. Claim your refund at http://revenue-refund.top",
      undefined,
      "IE",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(flagText(r)).toContain("government agency");
  });

  it("detects the PPS number suspension threat", () => {
    const r = checkSms(
      "Revenue final notice: your PPS number has been suspended pending a money laundering investigation.",
      undefined,
      "IE",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("detects the eFlow M50 toll lure", () => {
    const r = checkSms(
      "eFlow: you have an unpaid toll for an M50 passage. A penalty notice issued: http://eflow-pay.top",
      undefined,
      "IE",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("detects the An Post customs-fee lure", () => {
    const r = checkSms(
      "An Post: your parcel is held, customs duty owing. Pay at http://anpost-customs.xyz",
      undefined,
      "IE",
    );
    expect(r.verdict).toBe("likely_scam");
  });

  it("flags a link from a sender that never sends links", () => {
    const r = checkSms(
      "Revenue: your tax refund is ready, claim at http://revenue-ie-refund.top",
      undefined,
      "IE",
    );
    expect(flagText(r)).toContain("never send texts with links");
  });

  it("detects the MyGovID re-registration lure", () => {
    const r = checkSms(
      "Your MyGovID account could not be verified. Complete your identity verification to restore access.",
      undefined,
      "IE",
    );
    expect(flagText(r)).toContain("re-registration");
  });

  it("treats gov.ie as legitimate", () => {
    const r = checkUrl("https://www.revenue.ie/en/personal-tax-credits", undefined, "IE");
    expect(r.verdict).toBe("safe");
    expect(flagText(r)).toContain("verified irish government");
  });

  it("flags a typosquat on the open .ie registration", () => {
    // .ie relaxed its connection-to-Ireland requirement in 2018 and is now
    // effectively open, so it must not be a trusted suffix. Only .gov.ie is.
    const r = checkUrl("http://revenue-ie-refund.ie/login", undefined, "IE");
    expect(flagText(r)).toContain("impersonates");
  });

  it("does not treat 'their' or 'receiving' as the Eir brand", () => {
    // "eir" as a bare substring appears in a large share of ordinary English —
    // the single worst collision in this pack, so it is word-matched only.
    const r = checkSms("Their order is receiving weird delays, sorry about that.", undefined, "IE");
    expect(flagText(r)).not.toContain("well-known company");
  });

  it("still matches Eir on a separator boundary", () => {
    expect(flagText(checkUrl("http://eir-billing-refund.top", undefined, "IE")))
      .toContain('impersonates "eir"');
  });

  it("attributes Irish area codes", () => {
    expect(analysePhone("015551234", "IE").region).toBe("Dublin");
    expect(analysePhone("0215551234", "IE").region).toBe("Cork");
  });

  it("classifies an Irish fixed line correctly", () => {
    // IE fixed-line detection is the other case that drove the libphonenumber
    // `max` metadata build in Phase 4.
    const i = analysePhone("015551234", "IE");
    expect(i.country).toBe("Ireland");
    expect(i.isDomestic).toBe(true);
  });

  it("reports An Garda Síochána when an Irish number scores badly", () => {
    const r = checkPhone("1550123456", "IE");
    expect(r.details + r.flags.join(" ")).toContain("Garda");
  });
});

// The core risk. A user scored against the wrong country's rules gets a
// confident-looking verdict built from rules that don't apply to them.
describe("region isolation", () => {
  // IE↔GB is the sharpest pair: shared language, shared brands (Vodafone, Sky,
  // Tesco), entirely different agencies. An Irish user scored as GB would be
  // checked against HMRC and the DVLA, which have no jurisdiction there.
  it("does not apply UK agencies to an Irish check", () => {
    const hmrc = "HMRC: your tax refund is waiting, claim it at http://hmrc-refund.top";
    expect(flagText(checkSms(hmrc, undefined, "IE"))).not.toContain("government agency");
    expect(flagText(checkSms(hmrc, undefined, "GB"))).toContain("government agency");
  });

  it("does not apply Irish agencies to a UK check", () => {
    const rev = "Revenue: your PPS number has been suspended, verify at http://revenue-ie.top";
    expect(flagText(checkSms(rev, undefined, "GB"))).not.toContain("government agency");
    expect(flagText(checkSms(rev, undefined, "IE"))).toContain("government agency");
  });

  it("does not apply US agencies to a Canadian check, or vice versa", () => {
    const irs = "IRS: your tax refund is waiting at http://irs-refund.top";
    expect(flagText(checkSms(irs, undefined, "CA"))).not.toContain("government agency");
    expect(flagText(checkSms(irs, undefined, "US"))).toContain("government agency");

    const cra = "CRA: your GST credit is waiting at http://cra-refund.top";
    expect(flagText(checkSms(cra, undefined, "US"))).not.toContain("government agency");
    expect(flagText(checkSms(cra, undefined, "CA"))).toContain("government agency");
  });

  it("does not apply AU agencies to an NZ check, or vice versa", () => {
    // The closest pair by playbook — and the one most likely to be conflated.
    const ato = "ATO: your myGov account has a tax refund waiting at http://ato-refund.xyz";
    expect(flagText(checkSms(ato, undefined, "NZ"))).not.toContain("government agency");
    expect(flagText(checkSms(ato, undefined, "AU"))).toContain("government agency");

    const ird = "IRD: your myIR tax assessment is ready at http://ird-refund.xyz";
    expect(flagText(checkSms(ird, undefined, "AU"))).not.toContain("government agency");
    expect(flagText(checkSms(ird, undefined, "NZ"))).toContain("government agency");
  });

  it("keeps each region's regulator out of the others' flags", () => {
    const bait = "Quantum AI — guaranteed returns, join our trading group";
    const regulators: Record<string, string> = {
      US: "sec", NZ: "fma", CA: "canadian", IE: "central bank",
    };
    for (const [code, regulator] of Object.entries(regulators)) {
      const text = flagText(checkSms(bait, undefined, code));
      expect(text).toContain(regulator);
      // No other region's regulator may appear.
      expect(text).not.toContain("asic");
      expect(text).not.toContain("scamwatch");
    }
  });

  it("keeps the AU sender-ID rule out of every new region", () => {
    const msg = "Your bank: this message may appear as unverified, please ignore the 'Unverified' label.";
    expect(flagText(checkSms(msg, undefined, "AU"))).toContain("acma");
    for (const code of ["US", "NZ", "CA", "IE"]) {
      expect(flagText(checkSms(msg, undefined, code))).not.toContain("acma");
    }
  });

  it("does not leak trusted suffixes between regions", () => {
    // Each region's trusted suffixes must not apply elsewhere — otherwise a
    // typosquat hides behind another country's domain convention.
    expect(flagText(checkUrl("http://chase-login.com.au", undefined, "US"))).toContain("impersonates");
    expect(flagText(checkUrl("http://kiwibank-login.co.uk", undefined, "NZ"))).toContain("impersonates");
    expect(flagText(checkUrl("http://commbank-login.co.nz", undefined, "AU"))).toContain("impersonates");
  });

  it("forwards the region through checkEmail to the body scorer", () => {
    // checkEmail delegates body scoring to checkSms; Phase 5 found it dropping
    // the region, which silently scored every email against AU. The fixture
    // uses a US-only urgency phrase, a sender on a neutral domain, and no name
    // from officialSenderNames, so the delegated call is the only possible
    // source of divergence.
    const body = "From: Notices <post@example.com>\n\nYour E-ZPass account has an unpaid toll. A toll violation notice will follow.";
    const us = checkEmail(body, undefined, "US");
    const au = checkEmail(body, undefined, "AU");
    expect(us.score).toBeGreaterThan(au.score);
    expect(flagText(us)).toContain("urgency language");
  });

  // Code review finding. The registrable-label rule inferred a two-part public
  // suffix from the penultimate label alone, so `.gov.co` and `.co.io` were read
  // as suffixes even though `.co` and `.io` are ordinary gTLDs. That made the
  // brand own the registrable label, tripping the "this is the real site"
  // exemption — so a single open-registration domain suppressed brand scoring in
  // every pack simultaneously.
  //
  // Kept alongside the generic invariant in regions.test.ts because the concrete
  // hostnames are the point: these are domains an attacker can buy today.
  it.each([
    ["http://chase.gov.co/login", "US", "chase"],
    ["http://paypal.gov.io/verify", "US", "paypal"],
    ["http://commbank.gov.co/login", "AU", "commbank"],
    ["http://barclays.com.co/login", "GB", "barclays"],
    ["http://kiwibank.co.io/login", "NZ", "kiwibank"],
    ["http://scotiabank.gov.io/login", "CA", "scotiabank"],
    ["http://anpost.gov.co/track", "IE", "anpost"],
  ])("flags %s as impersonating despite the fake two-part suffix", (url, region, brand) => {
    const r = checkUrl(url, undefined, region);
    expect(flagText(r)).toContain(`impersonates "${brand}"`);
  });

  it("gives the packs disjoint national brand lists", () => {
    // Some global brands (amazon, netflix, paypal) legitimately appear in
    // several packs; the national ones must not cross.
    const nationals: Record<string, [string[], typeof US]> = {
      US: [["chase", "wellsfargo", "ezpass"], US],
      NZ: [["kiwibank", "trademe", "nzpost"], NZ],
      CA: [["scotiabank", "canadapost", "interac"], CA],
      IE: [["bankofireland", "anpost", "eflow"], IE],
    };
    const others = { AU, GB, US, NZ, CA, IE };
    for (const [code, [brands, def]] of Object.entries(nationals)) {
      for (const brand of brands) {
        expect(def.typosquatBrands.substring).toContain(brand);
        for (const [otherCode, other] of Object.entries(others)) {
          if (otherCode === code) continue;
          expect(other.typosquatBrands.substring).not.toContain(brand);
        }
      }
    }
  });
});
