import { describe, it, expect } from "vitest";
import { analysePhone } from "@veriguard/engine/phoneIntel";
import { checkPhone } from "@veriguard/engine/scamDetector";
import {
  FALLBACK_REGION,
  ALL_EMERGENCY_NUMBERS,
  supportedRegions,
  resolveRegionPack,
} from "@veriguard/engine/regions";

// Phase 4 — phone number generalisation.
//
// Parsing, validity, line type and country come from libphonenumber; the scam
// heuristics (wangiri, high-scam origins, spoofing risk) and the national
// number-plan semantics on each pack's phonePlan stay ours. These tests cover
// the seam between the two, and the regions Phase 5 targets.

describe("analysePhone — AU (region with a full pack)", () => {
  it("classifies mobile, fixed, toll-free and shared-cost lines", () => {
    expect(analysePhone("+61412345678", "AU").lineType).toBe("mobile");
    expect(analysePhone("+61280001234", "AU").lineType).toBe("fixed");
    expect(analysePhone("1800123456", "AU").lineType).toBe("freecall");
    expect(analysePhone("1300975707", "AU").lineType).toBe("shared_cost");
  });

  it("accepts national format without a country code", () => {
    const national = analysePhone("0412345678", "AU");
    const international = analysePhone("+61412345678", "AU");
    expect(national.lineType).toBe("mobile");
    expect(national.normalised).toBe(international.normalised);
  });

  it("keeps the 190x premium rule even though libphonenumber rejects it", () => {
    // libphonenumber reports +61 190… as invalid, so deferring to it would
    // degrade "you will be charged premium rates" into "invalid number".
    const intel = analysePhone("+61190012345", "AU");
    expect(intel.lineType).toBe("premium");
    expect(intel.spoofingRisk).toBe("very_high");
  });

  it("flags VoIP-range mobiles from the pack's phonePlan", () => {
    const intel = analysePhone("0480123456", "AU");
    expect(intel.lineType).toBe("voip_likely");
    expect(intel.spoofingRisk).toBe("medium");
  });

  it("never scores emergency numbers as suspicious", () => {
    for (const n of ["000", "112", "106"]) {
      const intel = analysePhone(n, "AU");
      expect(intel.lineType).toBe("emergency");
      expect(intel.spoofingRisk).toBe("low");
    }
  });

  it("keeps the short shared-cost 13xxxx range", () => {
    // 13 25 62 is the ATO's own number — the impersonation the copy targets.
    for (const n of ["132562", "13 25 62", "131114"]) {
      expect(analysePhone(n, "AU").lineType).toBe("shared_cost");
    }
  });

  it("catches premium 190x in every input format", () => {
    for (const n of ["+61190012345", "0190012345", "190012345"]) {
      const intel = analysePhone(n, "AU");
      expect(intel.lineType).toBe("premium");
      expect(intel.spoofingRisk).toBe("very_high");
    }
  });

  it("maps geographic area codes to a named region", () => {
    expect(analysePhone("+61280001234", "AU").region).toBe("New South Wales / ACT");
    expect(analysePhone("+61390001234", "AU").region).toBe("Victoria / Tasmania");
  });
});

describe("analysePhone — UK", () => {
  // No UK pack exists yet (Phase 5). Parsing must still follow the requested
  // region, or British input would be read against the Australian number plan.
  it("parses national-format UK mobiles as UK, not as broken AU numbers", () => {
    const intel = analysePhone("07911123456", "GB");
    expect(intel.lineType).toBe("mobile");
    expect(intel.isDomestic).toBe(true);
    expect(intel.country).toBe("United Kingdom");
  });

  it("classifies fixed, freephone and premium UK lines", () => {
    expect(analysePhone("+442079460123", "GB").lineType).toBe("fixed");
    expect(analysePhone("+448009177777", "GB").lineType).toBe("freecall");

    const premium = analysePhone("+449098790123", "GB");
    expect(premium.lineType).toBe("premium");
    expect(premium.spoofingRisk).toBe("very_high");
  });

  it("treats Crown Dependency ranges as domestic for a UK user", () => {
    // libphonenumber resolves this ordinary +44 mobile to GG (Guernsey), which
    // shares the UK's ranges — it must not read as a foreign number.
    const intel = analysePhone("+447911123456", "GB");
    expect(intel.isDomestic).toBe(true);
    expect(intel.country).toBe("United Kingdom");
  });

  it("treats an Australian number as foreign for a UK user", () => {
    const intel = analysePhone("+61412345678", "GB");
    expect(intel.isDomestic).toBe(false);
    expect(intel.country).toBe("Australia");
  });

  it("reports country and domesticity consistently for unparseable input", () => {
    // Regression: the unparseable branch compared raw country codes while
    // `country` applied the shared-plan parent mapping, so a Northern Marianas
    // number read as "United States" yet not domestic for a US user.
    const intel = analysePhone("+16701234", "US");
    expect(intel.country).toBe("United States");
    expect(intel.isDomestic).toBe(true);
  });
});

describe("analysePhone — US", () => {
  it("classifies mobile and toll-free lines", () => {
    const mobile = analysePhone("+12125551234", "US");
    expect(mobile.lineType).toBe("mobile");
    expect(mobile.isDomestic).toBe(true);
    expect(mobile.country).toBe("United States");

    expect(analysePhone("+18005551212", "US").lineType).toBe("freecall");
  });

  it("treats a UK number as foreign for a US user", () => {
    expect(analysePhone("+442079460123", "US").isDomestic).toBe(false);
  });
});

describe("analysePhone — region-relative domesticity", () => {
  it("reports the same number as domestic or foreign depending on region", () => {
    expect(analysePhone("+61412345678", "AU").isDomestic).toBe(true);
    expect(analysePhone("+61412345678", "GB").isDomestic).toBe(false);
    expect(analysePhone("+447911123456", "GB").isDomestic).toBe(true);
    expect(analysePhone("+447911123456", "AU").isDomestic).toBe(false);
  });

  it("defaults to AU when no region is given", () => {
    expect(analysePhone("0412345678")).toEqual(analysePhone("0412345678", "AU"));
  });

  it("still parses national input for the base-only region", () => {
    // ZZ is the coverage:"none" pack, not a country. National-format input has
    // to be read against some plan, so it uses the default region — but the
    // national plan is withheld, so no Australian specifics leak into the copy.
    const intel = analysePhone("0412345678", FALLBACK_REGION);
    expect(intel.lineType).toBe("mobile");
    expect(analysePhone("1300975707", FALLBACK_REGION).spoofingNotes.join(" "))
      .not.toMatch(/ATO|myGov|Centrelink/);
  });
});

describe("analysePhone — emergency numbers are never suspicious", () => {
  // Regression: these were scored very_high ("caller ID has been manipulated")
  // outside AU. The pack's phonePlan is withheld for regions we have no pack
  // for, and emergency numbers are short enough to trip the "too short" guard,
  // so the list has to live outside the packs.
  it("recognises emergency numbers in regions with no pack", () => {
    for (const [n, region] of [["999", "GB"], ["911", "US"], ["111", "NZ"], ["112", "GB"]]) {
      const intel = analysePhone(n, region);
      expect(intel.lineType).toBe("emergency");
      expect(intel.spoofingRisk).toBe("low");
    }
  });

  it("never reports an emergency number as a scam risk", () => {
    expect(checkPhone("999", "GB").score).toBeLessThanOrEqual(20);
  });

  // Same defect as the block above, one layer down, found by the 2026-09-11
  // probe of the `minimal` wave. The hardcoded set was already region-independent;
  // everything a PACK authored was not, so it was only recognised when that pack
  // happened to be the active region. A user in AU checking Brazil's 190 — or
  // India's 1930, or Japan's 188 — got `likely_scam` on the "too short to be
  // real" guard, with "No obvious red flags" printed directly above it.
  //
  // Which country the USER is in does not change whether a number is an
  // emergency line, so this asserts the cross-product rather than each pack
  // against its own region.
  it("recognises every pack's emergency numbers from any region", () => {
    const authored = [
      ["190", "BR"], ["180", "BR"], ["193", "BR"],   // Brazil
      ["1930", "IN"], ["100", "IN"],                  // India
      ["188", "JP"], ["189", "JP"],                   // Japan
      ["10111", "ZA"], ["10177", "ZA"],               // South Africa
      ["116117", "DE"],                               // Germany / Ireland
      ["1799", "SG"],                                 // Singapore
      ["101", "GB"], ["105", "NZ"], ["988", "US"],    // pre-wave packs
    ] as const;
    // Every authored number, checked from every region we ship a pack for.
    for (const [number] of authored) {
      for (const region of supportedRegions()) {
        const intel = analysePhone(number, region);
        expect(intel.lineType, `${number} in ${region}`).toBe("emergency");
        expect(intel.spoofingRisk, `${number} in ${region}`).toBe("low");
      }
    }
  });

  it("does not flag another country's emergency number as fabricated", () => {
    // The user-facing half: the guard that produced "caller ID has been
    // manipulated" is what this fix is for.
    for (const [number, home] of [["190", "AU"], ["1930", "GB"], ["188", "US"]] as const) {
      const result = checkPhone(number, home);
      expect(result.verdict, `${number} in ${home}`).not.toBe("likely_scam");
      expect(
        result.flags.join(" "),
        `${number} in ${home}`,
      ).not.toContain("too short to be real");
    }
  });

  it("keeps the union in sync with the packs automatically", () => {
    // Built from REGIONS rather than hand-listed, so authoring a number in a
    // pack is sufficient. If this drifts, the union was hardcoded somewhere.
    for (const region of supportedRegions()) {
      for (const number of resolveRegionPack(region).phonePlan?.emergencyNumbers ?? []) {
        expect(ALL_EMERGENCY_NUMBERS, `${number} from ${region}`).toContain(number);
      }
    }
  });
});

describe("analysePhone — invalid region input", () => {
  // Regression: any two ASCII letters were passed straight to libphonenumber.
  // "UK" and "EN" are not ISO 3166-1 codes (the UK is "GB") and both resolve
  // to Switzerland, so a valid AU number came back "may be fabricated".
  it("ignores region codes that are not real countries", () => {
    for (const region of ["UK", "EN", "XX", "!!", "australia", ""]) {
      const intel = analysePhone("0412345678", region);
      expect(intel.lineType).toBe("mobile");
      expect(intel.spoofingRisk).toBe("low");
    }
  });
});

describe("analysePhone — scam heuristics stay ours", () => {
  it("flags wangiri origins regardless of region", () => {
    for (const region of ["AU", "GB", "US"]) {
      const intel = analysePhone("+252612345678", region);
      expect(intel.wangiriRisk).toBe(true);
      expect(intel.spoofingRisk).toBe("very_high");
    }
  });

  it("flags high-scam country origins", () => {
    const intel = analysePhone("+2348012345678", "AU");
    expect(intel.highScamCountry).toBe(true);
    expect(intel.spoofingRisk).toBe("high");
  });

  it("softens elevated-volume origins to medium with balanced wording", () => {
    const intel = analysePhone("+919876543210", "AU");
    expect(intel.spoofingRisk).toBe("medium");
    expect(intel.spoofingNotes.join(" ")).toContain("perfectly legitimate");
  });

  it("rejects fabricated numbers", () => {
    expect(analysePhone("12345", "AU").spoofingRisk).toBe("very_high");
    expect(analysePhone("111111111", "AU").spoofingRisk).toBe("very_high");
  });
});

// A foreign number typed without a leading "+" — exactly how a missed call or
// caller ID displays it. Parsed against the home plan it comes back invalid with
// `country = home`, so it fell through to the "unparseable" branch and was
// reported as the *user's own country* with every international risk check
// skipped: an Australian checking a Jamaican wangiri number saw "Australia" and
// no wangiri flag.
//
// Found reviewing the region packs, but not a region-pack bug — it affected
// every non-NANP region (AU, GB, NZ, IE) and non-NANP prefixes too, so Somalia
// +252 also read as "Australia".
describe("analysePhone — international numbers typed without a '+'", () => {
  it.each(["AU", "GB", "NZ", "IE", "CA", "US"])(
    "recognises a Jamaican wangiri number for a %s user",
    (region) => {
      const intel = analysePhone("18765551234", region);
      expect(intel.country).toBe("Jamaica");
      expect(intel.wangiriRisk).toBe(true);
      expect(intel.spoofingRisk).toBe("very_high");
    },
  );

  it.each([
    ["12685551234", "Antigua & Barbuda"],
    ["16645551234", "Montserrat"],
    ["12465551234", "Barbados"],
  ])("recognises the NANP wangiri number %s as %s", (number, country) => {
    // libphonenumber rates these small-territory subscriber ranges invalid, so
    // the reparse falls back to matching the known wangiri prefix. Without that
    // fallback these three would still be missed.
    const intel = analysePhone(number, "AU");
    expect(intel.country).toBe(country);
    expect(intel.wangiriRisk).toBe(true);
  });

  it("recognises a non-NANP wangiri origin", () => {
    const intel = analysePhone("2525551234", "AU");
    expect(intel.country).toBe("Somalia");
    expect(intel.wangiriRisk).toBe(true);
  });

  it("still grades high-scam and elevated-volume origins correctly", () => {
    const nigeria = analysePhone("2348001234567", "AU");
    expect(nigeria.country).toBe("Nigeria");
    expect(nigeria.highScamCountry).toBe(true);
    expect(nigeria.spoofingRisk).toBe("high");

    // Elevated-volume must stay "medium" — large diaspora communities receive
    // genuine calls from here daily, and the reparse must not escalate that.
    const india = analysePhone("919876543210", "AU");
    expect(india.country).toBe("India");
    expect(india.spoofingRisk).toBe("medium");
  });

  // The reparse is only safe because it is narrowly guarded. These assert the
  // guards: a valid domestic number must never be reinterpreted as foreign.
  it.each([
    ["0412345678", "AU", "Australia"],
    ["1300975707", "AU", "Australia"],
    ["1800931678", "AU", "Australia"],
    ["132221", "AU", "Australia"],
    ["0190012345", "AU", "Australia"],
    ["07911123456", "GB", "United Kingdom"],
    ["08001111", "GB", "United Kingdom"],
    ["0211234567", "NZ", "New Zealand"],
    ["015551234", "IE", "Ireland"],
    ["2125551234", "US", "United States"],
    ["4165551234", "CA", "Canada"],
  ])("does not reinterpret the domestic number %s (%s) as foreign", (number, region, country) => {
    const intel = analysePhone(number, region);
    expect({ country: intel.country, domestic: intel.isDomestic })
      .toEqual({ country, domestic: true });
  });

  it("leaves a leading-zero national number alone", () => {
    // "0412345678" stripped of its trunk prefix parses as Switzerland (+41).
    // The guard against reparsing anything starting with "0" is what stops that.
    const intel = analysePhone("0412345678", "AU");
    expect(intel.country).not.toBe("Switzerland");
  });

  it("still rejects short and fabricated input rather than reparsing it", () => {
    expect(analysePhone("12345", "AU").spoofingRisk).toBe("very_high");
    expect(analysePhone("5551234", "AU").lineType).toBe("unknown");
  });
});

describe("checkPhone — region-neutral copy", () => {
  it("no longer hardcodes Australian agencies or ranges in flags", () => {
    const flags = checkPhone("+448009177777", "GB").flags.join(" ");
    expect(flags).not.toMatch(/ATO|myGov|Centrelink|1300|1800|190x/i);
  });

  it("describes foreign-origin risk without naming Australia", () => {
    const flags = checkPhone("+2348012345678", "GB").flags.join(" ");
    expect(flags).toContain("your region");
    expect(flags).not.toContain("targeting Australia");
  });

  it("still surfaces the AU-specific wording for an AU check", () => {
    // Region-specific copy moved to the pack, so it must still reach the user.
    const flags = checkPhone("1300975707", "AU").flags.join(" ");
    expect(flags).toMatch(/ATO|myGov|Centrelink/);
  });

  it("attaches intel to the result", () => {
    expect(checkPhone("+61412345678", "AU").phoneIntel?.isDomestic).toBe(true);
  });
});

describe("line-type spoofability is context, not evidence", () => {
  // Every fixed-line, toll-free and shared-cost number IS trivially spoofable,
  // and the note says so. Scored, that put a flat 30 — "suspicious" — on the
  // published contact number of essentially every business and government
  // agency in the country, so someone checking their own GP's number was told
  // it was dodgy. Found by eval/corpus/au-phone.jsonl.

  it.each([
    ["AU", "02 9000 1234", "landline"],
    ["AU", "1800 000 000", "toll-free"],
    ["AU", "13 00 00", "shared-cost"],
    ["GB", "020 7946 0000", "landline"],
    ["GB", "0800 001 0000", "toll-free"],
    ["US", "800 555 0100", "toll-free"],
    ["IE", "01 234 5678", "landline"],
    ["NZ", "09 373 5000", "landline"],
  ])("%s: does not call an ordinary %s number suspicious (%s)", (region, number) => {
    expect(checkPhone(number, region as never).verdict).toBe("safe");
  });

  it("still tells the reader the number type is spoofable", () => {
    // The caution is not deleted, only unscored — it reaches the reader through
    // spoofingNotes, which is where "here is how caller ID works" belongs.
    const intel = analysePhone("02 9000 1234", "AU");
    expect(intel.spoofingNotes.join(" ")).toMatch(/easy to fake|local area code/i);
    expect(intel.spoofingRisk).toBe("low");
  });

  it.each([
    ["AU", "1900 654 321", "premium rate"],
    ["AU", "+234 801 234 5678", "high-scam international"],
    ["NZ", "0900 12345", "premium rate"],
  ])("%s: still scores %s, which says something about this number (%s)", (region, number) => {
    expect(checkPhone(number, region as never).verdict).toBe("likely_scam");
  });

  it("still flags a number that is not a valid format", () => {
    // "09 123 4567" is one digit short for an NZ geographic number. The max
    // metadata catches it, and saying so is correct.
    expect(checkPhone("09 123 4567", "NZ" as never).verdict).not.toBe("safe");
  });
});
