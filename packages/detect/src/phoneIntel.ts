// Phone number intelligence — pure string analysis, no outbound requests.
//
// IMPORTANT LIMITATION: Caller ID (CLI) spoofing is a fundamental property of
// the SS7 signalling protocol. Any number can be presented as the source. The
// real originating number is embedded in carrier ANI/SS7 data that is only
// accessible to telcos and law enforcement. No civilian tool can unmask it.
//
// What we CAN determine from the number format alone:
// - Line type (mobile, fixed, VoIP, premium, free-call, shared-cost)
// - Country / geographic region
// - Spoofing risk level (based on number patterns and context)
// - Wangiri / premium-rate country risk
//
// Parsing, validity, line type and country come from libphonenumber-js (the
// `max` metadata build — a static lookup table, not a model or an API, so the
// rule-based constraint holds). Everything scam-related stays ours: wangiri
// prefixes, high-scam and elevated-volume country codes, spoofing risk, and the
// per-region number-plan semantics carried on the region pack's phonePlan.

import { parsePhoneNumberFromString, isSupportedCountry, type PhoneNumber } from "libphonenumber-js/max";
import { resolveRegionPack, DEFAULT_REGION, FALLBACK_REGION, ALL_EMERGENCY_NUMBERS, type RegionInput } from "./regions";
import type { PhonePlan } from "./regions/types";

export interface PhoneIntel {
  lineType: "mobile" | "fixed" | "voip_likely" | "premium" | "freecall" | "shared_cost" | "emergency" | "unknown";
  region?: string;
  carrierHint?: string;
  country: string;
  /**
   * Whether the number belongs to the region the check is being run for.
   * Replaces the AU-only `isAustralian` — "domestic" is relative to the
   * resolved region, so a UK number is domestic for a UK user and foreign for
   * an Australian one.
   */
  isDomestic: boolean;
  wangiriRisk: boolean;
  highScamCountry: boolean;
  spoofingRisk: "low" | "medium" | "high" | "very_high";
  spoofingNotes: string[];
  normalised: string;
}

// ── Wangiri ("one ring") scam prefixes ────────────────────────────────────────
// Victim receives a single ring, calls back out of curiosity, and is charged
// international premium rates. Country codes chosen by operators because their
// local regulations allow high per-minute charges.
const WANGIRI_PREFIXES = [
  "252",  // Somalia
  "269",  // Comoros
  "675",  // Papua New Guinea
  "1242", // Bahamas
  "1246", // Barbados
  "1264", // Anguilla
  "1268", // Antigua and Barbuda
  "1284", // British Virgin Islands
  "1473", // Grenada
  "1649", // Turks and Caicos
  "1664", // Montserrat
  "1758", // Saint Lucia
  "1767", // Dominica
  "1784", // Saint Vincent and the Grenadines
  "1876", // Jamaica
  "1869", // Saint Kitts and Nevis
];

// Country codes frequently associated with scam call operations targeting Australia
const HIGH_SCAM_COUNTRY_CODES: Record<string, string> = {
  "234": "Nigeria",
  "237": "Cameroon",
  "216": "Tunisia",
  "256": "Uganda",
  "260": "Zambia",
  "263": "Zimbabwe",
  "381": "Serbia",
  "385": "Croatia",
  "386": "Slovenia",
  "387": "Bosnia and Herzegovina",
  "389": "North Macedonia",
  "420": "Czech Republic",
  "421": "Slovakia",
};

// High-VOLUME scam-call origins (D15 / #49) that ALSO carry enormous legitimate
// traffic — large diaspora communities in Australia receive genuine family and
// business calls from here every day. Kept separate from HIGH_SCAM_COUNTRY_CODES
// so a match only nudges risk to "medium" (not "high") and the note explicitly
// acknowledges legitimate callers — we flag the elevated base rate, not the call.
const ELEVATED_VOLUME_COUNTRY_CODES: Record<string, string> = {
  "91": "India",
  "86": "China",
  "63": "Philippines",
};

// NANP (North American Numbering Plan) — Caribbean/Pacific islands that share
// the +1 country code but have their own distinct 3-digit area codes.
const NANP_ISLANDS: Record<string, string> = {
  "1242": "Bahamas",
  "1246": "Barbados",
  "1264": "Anguilla",
  "1268": "Antigua and Barbuda",
  "1284": "British Virgin Islands",
  "1340": "US Virgin Islands",
  "1345": "Cayman Islands",
  "1441": "Bermuda",
  "1473": "Grenada",
  "1649": "Turks and Caicos",
  "1664": "Montserrat",
  "1670": "Northern Mariana Islands",
  "1671": "Guam",
  "1684": "American Samoa",
  "1758": "Saint Lucia",
  "1767": "Dominica",
  "1784": "Saint Vincent and the Grenadines",
  "1787": "Puerto Rico",
  "1809": "Dominican Republic",
  "1829": "Dominican Republic",
  "1868": "Trinidad and Tobago",
  "1869": "Saint Kitts and Nevis",
  "1876": "Jamaica",
  "1939": "Puerto Rico",
};

// Abbreviated international prefix → country name table.
const COUNTRY_CODES: Record<string, string> = {
  "1":   "United States / Canada",
  "7":   "Russia / Kazakhstan",
  "20":  "Egypt",
  "27":  "South Africa",
  "30":  "Greece",
  "31":  "Netherlands",
  "32":  "Belgium",
  "33":  "France",
  "34":  "Spain",
  "36":  "Hungary",
  "39":  "Italy",
  "40":  "Romania",
  "41":  "Switzerland",
  "43":  "Austria",
  "44":  "United Kingdom",
  "45":  "Denmark",
  "46":  "Sweden",
  "47":  "Norway",
  "48":  "Poland",
  "49":  "Germany",
  "51":  "Peru",
  "52":  "Mexico",
  "53":  "Cuba",
  "54":  "Argentina",
  "55":  "Brazil",
  "56":  "Chile",
  "57":  "Colombia",
  "58":  "Venezuela",
  "60":  "Malaysia",
  "61":  "Australia",
  "62":  "Indonesia",
  "63":  "Philippines",
  "64":  "New Zealand",
  "65":  "Singapore",
  "66":  "Thailand",
  "81":  "Japan",
  "82":  "South Korea",
  "84":  "Vietnam",
  "86":  "China",
  "90":  "Turkey",
  "91":  "India",
  "92":  "Pakistan",
  "93":  "Afghanistan",
  "94":  "Sri Lanka",
  "95":  "Myanmar",
  "98":  "Iran",
  "212": "Morocco",
  "213": "Algeria",
  "216": "Tunisia",
  "218": "Libya",
  "220": "Gambia",
  "221": "Senegal",
  "223": "Mali",
  "224": "Guinea",
  "225": "Ivory Coast",
  "226": "Burkina Faso",
  "227": "Niger",
  "228": "Togo",
  "229": "Benin",
  "230": "Mauritius",
  "231": "Liberia",
  "232": "Sierra Leone",
  "233": "Ghana",
  "234": "Nigeria",
  "237": "Cameroon",
  "238": "Cape Verde",
  "239": "Sao Tome and Principe",
  "240": "Equatorial Guinea",
  "241": "Gabon",
  "242": "Republic of Congo",
  "243": "DR Congo",
  "244": "Angola",
  "248": "Seychelles",
  "249": "Sudan",
  "250": "Rwanda",
  "251": "Ethiopia",
  "252": "Somalia",
  "253": "Djibouti",
  "254": "Kenya",
  "255": "Tanzania",
  "256": "Uganda",
  "257": "Burundi",
  "258": "Mozambique",
  "260": "Zambia",
  "261": "Madagascar",
  "263": "Zimbabwe",
  "264": "Namibia",
  "265": "Malawi",
  "266": "Lesotho",
  "267": "Botswana",
  "268": "Eswatini",
  "269": "Comoros",
  "291": "Eritrea",
  "297": "Aruba",
  "298": "Faroe Islands",
  "299": "Greenland",
  "350": "Gibraltar",
  "351": "Portugal",
  "352": "Luxembourg",
  "353": "Ireland",
  "354": "Iceland",
  "355": "Albania",
  "356": "Malta",
  "357": "Cyprus",
  "358": "Finland",
  "359": "Bulgaria",
  "370": "Lithuania",
  "371": "Latvia",
  "372": "Estonia",
  "373": "Moldova",
  "374": "Armenia",
  "375": "Belarus",
  "376": "Andorra",
  "377": "Monaco",
  "380": "Ukraine",
  "381": "Serbia",
  "382": "Montenegro",
  "383": "Kosovo",
  "385": "Croatia",
  "386": "Slovenia",
  "387": "Bosnia and Herzegovina",
  "389": "North Macedonia",
  "420": "Czech Republic",
  "421": "Slovakia",
  "500": "Falkland Islands",
  "501": "Belize",
  "502": "Guatemala",
  "503": "El Salvador",
  "504": "Honduras",
  "505": "Nicaragua",
  "506": "Costa Rica",
  "507": "Panama",
  "509": "Haiti",
  "590": "Guadeloupe",
  "591": "Bolivia",
  "592": "Guyana",
  "593": "Ecuador",
  "594": "French Guiana",
  "595": "Paraguay",
  "596": "Martinique",
  "597": "Suriname",
  "598": "Uruguay",
  "670": "East Timor",
  "672": "Norfolk Island",
  "673": "Brunei",
  "674": "Nauru",
  "675": "Papua New Guinea",
  "676": "Tonga",
  "677": "Solomon Islands",
  "678": "Vanuatu",
  "679": "Fiji",
  "680": "Palau",
  "685": "Samoa",
  "686": "Kiribati",
  "687": "New Caledonia",
  "688": "Tuvalu",
  "689": "French Polynesia",
  "691": "Micronesia",
  "692": "Marshall Islands",
  "850": "North Korea",
  "852": "Hong Kong",
  "853": "Macau",
  "855": "Cambodia",
  "856": "Laos",
  "880": "Bangladesh",
  "886": "Taiwan",
  "960": "Maldives",
  "961": "Lebanon",
  "962": "Jordan",
  "963": "Syria",
  "964": "Iraq",
  "965": "Kuwait",
  "966": "Saudi Arabia",
  "967": "Yemen",
  "968": "Oman",
  "970": "Palestinian Territory",
  "971": "UAE",
  "972": "Israel",
  "973": "Bahrain",
  "974": "Qatar",
  "975": "Bhutan",
  "976": "Mongolia",
  "977": "Nepal",
  "992": "Tajikistan",
  "993": "Turkmenistan",
  "994": "Azerbaijan",
  "995": "Georgia",
  "996": "Kyrgyzstan",
  "998": "Uzbekistan",
};

// AU number-plan specifics now live in lib/regions/au.ts as `phonePlan`, so
// every region can carry its own equivalents.

function lookupCountry(digits: string): string {
  if (digits.startsWith("1")) {
    return NANP_ISLANDS[digits.slice(0, 4)] ?? "United States / Canada";
  }
  for (let len = Math.min(digits.length, 3); len >= 1; len--) {
    const c = COUNTRY_CODES[digits.slice(0, len)];
    if (c) return c;
  }
  return "Unknown";
}

/** Line types libphonenumber reports that we surface as "mobile". */
const MOBILE_TYPES = new Set(["MOBILE", "FIXED_LINE_OR_MOBILE"]);

/**
 * Emergency numbers that must never be scored as suspicious, anywhere.
 *
 * Kept outside the region packs deliberately. A pack's phonePlan is withheld
 * for regions we have no pack for, and emergency numbers are the one rule that
 * must survive that: they are short enough to trip the "too short to be real"
 * guard, so without this a UK user checking 999 — or anyone checking the
 * GSM-universal 112 — was told their caller ID had been manipulated.
 *
 * Union rather than per-region: dialling another country's emergency number is
 * not a scam signal, and treating an unrecognised one as fabricated is the
 * failure mode worth avoiding.
 */
const EMERGENCY_NUMBERS = new Set([
  "000", "112", "106",  // AU (112 is GSM-universal, 106 is the AU TTY line)
  "999",                // UK, IE, and much of the Commonwealth
  "911",                // US, CA and the NANP
  "111",                // NZ
  "110", "119", "118",  // widely used across Asia and parts of Europe
]);

/**
 * Territories that share a country's numbering plan closely enough that a
 * number resolving to one should still count as domestic for the other.
 *
 * libphonenumber returns the most specific territory it can: a perfectly
 * ordinary UK mobile such as +44 7911 123456 comes back as `GG` (Guernsey),
 * which shares +44. Treating that as a foreign number would tell a UK user
 * their own mobile format is international — so the Crown Dependencies map
 * onto GB. Australia's external territories (Cocos, Christmas Island) share
 * +61 the same way.
 */
const SHARED_NUMBER_PLANS: Record<string, string[]> = {
  GB: ["GG", "JE", "IM"],
  AU: ["CC", "CX"],
  US: ["PR", "VI", "MP", "GU", "AS"],
};

/**
 * Countries that are *peers* within one numbering plan, as opposed to
 * territories subordinate to a parent.
 *
 * The distinction matters because SHARED_NUMBER_PLANS does double duty: it
 * decides domesticity, and countryName() reverse-maps it to display a territory
 * as its parent. That is right for Guernsey (a +44 mobile should read "United
 * Kingdom") and wrong for Canada — a Canadian number must still display as
 * "Canada", not "United States".
 *
 * So NANP peers are held separately. Found when the CA pack was added: the
 * premium number `1-900-555-1212` scored 95 for a US user and 35 for a Canadian
 * one, because libphonenumber resolves any bare `+1 900` to `US`. For the
 * Canadian it therefore read as *foreign*, and the domestic-premium guard —
 * added in Phase 4 to stop an unparseable foreign number being called domestic
 * premium — suppressed the "this call will cost you money" warning entirely.
 * Risk collapsed from very_high to low on the one case that costs the user
 * directly, which is precisely the Phase 4 failure mode repeating at a new seam.
 */
const PLAN_PEERS: Record<string, string[]> = {
  US: ["CA"],
  CA: ["US", "PR", "VI", "MP", "GU", "AS"],
};

function sameCountry(parsed: PhoneNumber, home: string): boolean {
  if (!parsed.country) return false;
  if (parsed.country === home) return true;
  if (SHARED_NUMBER_PLANS[home]?.includes(parsed.country)) return true;
  return PLAN_PEERS[home]?.includes(parsed.country) ?? false;
}

/**
 * The country whose number plan input is parsed against, and against which
 * "domestic" is judged.
 *
 * Deliberately NOT the resolved pack's code. Pack resolution falls back to AU
 * for any region without a pack, which is a sound default for *keyword*
 * detection — but applying it to number parsing would read a British national
 * number like `07911 123456` against the Australian plan and declare a
 * perfectly valid UK mobile fabricated. Detection quality collapsing silently
 * for uncovered regions is the exact failure the coverage work exists to
 * prevent, so parsing follows the requested region even where no pack exists.
 *
 * libphonenumber knows every country's plan regardless of whether we have
 * scam rules for it, so this is safe well ahead of Phase 5.
 */
function parsingCountry(region: RegionInput, packCode: string): string {
  const requested = (region ?? "").toString().toUpperCase();
  // Validated against libphonenumber's own country list rather than by shape.
  // The value can be an arbitrary header, and a plausible-looking non-code is
  // worse than no code at all: libphonenumber resolves "UK" and "EN" (neither
  // is an ISO 3166-1 code — the UK is "GB") to Switzerland, so a valid AU
  // number came back "may be fabricated" at high risk.
  if (requested !== FALLBACK_REGION && isSupportedCountry(requested)) return requested;
  // ZZ is the base-only fallback pack, not a country, so it has no number plan
  // of its own. International-format input still parses correctly on its
  // country code; national-format input has to be read against *some* plan, and
  // the default region is a better guess than refusing to parse. The national
  // plan itself is still withheld (see the caller), so this only recovers line
  // type and country — never Australian scam specifics.
  return packCode === FALLBACK_REGION ? DEFAULT_REGION : packCode;
}

/**
 * ISO alpha-2 → display name, falling back to the code itself.
 *
 * Shared-plan territories are displayed as their parent country. libphonenumber
 * resolves an ordinary +44 mobile to `GG` (Guernsey) because the Crown
 * Dependencies share the UK's ranges; showing "Guernsey" for a British mobile
 * reads as a false signal to someone checking whether a caller is local.
 */
function countryName(code: string): string {
  const parent = Object.entries(SHARED_NUMBER_PLANS)
    .find(([, shared]) => shared.includes(code))?.[0];
  const display = parent ?? code;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(display) ?? display;
  } catch {
    return display;
  }
}

/**
 * Look up the area a national-form number falls in.
 *
 * Longest-prefix match, not a fixed-width slice. Australia's plan has uniform
 * two-digit STD codes (02/03/07/08), so the original code sliced two characters
 * — but that is an AU assumption, and most plans are mixed-width: the UK has
 * `020` (London) alongside `0161` (Manchester) and `0113` (Leeds), and a
 * two-character slice matches none of them. Sorting by length descending means
 * a more specific code always wins over a shorter one that shares its prefix.
 */
function areaFor(plan: PhonePlan, national: string): string | undefined {
  const codes = plan.areaCodes;
  if (!codes) return undefined;
  const match = Object.keys(codes)
    .filter((code) => national.startsWith(code))
    .sort((a, b) => b.length - a.length)[0];
  return match ? codes[match] : undefined;
}

/**
 * Analyse a phone number.
 *
 * `region` is the region the check is running for. It decides two things: which
 * number plan is applied for national-format input (a bare `0412…` is
 * Australian for an AU user), and what counts as domestic. Defaults to the
 * default region so existing callers keep AU behaviour.
 */
export function analysePhone(raw: string, region?: RegionInput): PhoneIntel {
  const pack = resolveRegionPack(region);
  const homeCountry = parsingCountry(region, pack.code);
  // The number plan only applies when the resolved pack actually governs the
  // country we're parsing against. Pack resolution falls back to AU for any
  // region without a pack, so using its plan unconditionally would tell a UK
  // user their 0800 number is "commonly faked by scammers pretending to be the
  // ATO" — asserting Australian specifics about a British number. An empty
  // plan degrades to libphonenumber's own classification, which is honest.
  const plan: PhonePlan = homeCountry === pack.code ? pack.phonePlan : {};
  // The pack's display name is only right when the pack matches the country we
  // parse against; for a region with no pack yet, fall back to the country's
  // own name rather than mislabelling its numbers with the fallback pack's.
  const homeName = homeCountry === pack.code ? pack.name : countryName(homeCountry);

  /**
   * Display name for a number we've judged domestic.
   *
   * Prefers the number's *own* resolved country over the home country's name.
   * The two only diverge for NANP peers (see PLAN_PEERS): a Toronto number is
   * domestic for a US user, but calling it "United States" would state
   * something false about a number a user may well be checking precisely
   * because it looks out-of-area. Subordinate territories are unaffected —
   * countryName() maps Guernsey onto "United Kingdom" by design, so a +44
   * mobile still reads as British.
   */
  const domesticName = (parsed?: PhoneNumber) =>
    parsed?.country ? countryName(parsed.country) : homeName;

  const cleaned = raw.replace(/[\s\-().+]/g, "");
  const spoofingNotes: string[] = [];
  let spoofingRisk: PhoneIntel["spoofingRisk"] = "low";

  function bump(risk: PhoneIntel["spoofingRisk"]) {
    const order = ["low", "medium", "high", "very_high"];
    if (order.indexOf(risk) > order.indexOf(spoofingRisk)) spoofingRisk = risk;
  }

  // Emergency numbers are checked before anything else — they are short enough
  // to trip the "too short" guard, and must never be scored as suspicious.
  //
  // Every pack's numbers apply regardless of the active region, not just the
  // active pack's. The union is what makes the rule stated on EMERGENCY_NUMBERS
  // actually true: an unrecognised emergency number must not be reported as
  // fabricated, and which country the *user* is in does not change whether a
  // number is one. Before this, checking Brazil's 190 from anywhere but BR
  // returned `likely_scam` on the "too short to be real" guard.
  // `plan.emergencyNumbers` is deliberately NOT consulted here. It would be dead
  // code: every pack reachable through `plan` comes from the same REGIONS map
  // the union is flat-mapped from, so the union already contains it. Reading it
  // as a third source would imply per-region numbers still have an independent
  // effect, which is exactly the belief that produced this defect.
  if (EMERGENCY_NUMBERS.has(cleaned) || ALL_EMERGENCY_NUMBERS.includes(cleaned)) {
    return {
      lineType: "emergency",
      country: homeName,
      isDomestic: true,
      wangiriRisk: false,
      highScamCountry: false,
      spoofingRisk: "low",
      spoofingNotes: [],
      normalised: cleaned,
    };
  }

  // Too short to be a real number
  if (cleaned.length < 6) {
    return {
      lineType: "unknown",
      country: "Unknown",
      isDomestic: false,
      wangiriRisk: false,
      highScamCountry: false,
      spoofingRisk: "very_high",
      spoofingNotes: ["Number is too short to be real — caller ID has been manipulated"],
      normalised: raw.trim(),
    };
  }

  // Obvious fake patterns
  if (/^(\d)\1{5,}$/.test(cleaned)) {
    spoofingNotes.push("Repetitive digit pattern — this number is almost certainly fabricated");
    bump("very_high");
  }

  // Parse with the home region as the default, so national-format input
  // ("0412 345 678", "020 7946 0123") resolves against the right number plan.
  const parsed: PhoneNumber | undefined =
    parsePhoneNumberFromString(raw, homeCountry as never) ?? undefined;

  // National form, used for the plan-based prefix rules below. libphonenumber
  // strips the trunk prefix, so re-add a leading 0 to match how the plans are
  // authored (and how users read their own numbers).
  const national = parsed ? "0" + parsed.nationalNumber : cleaned;

  // ── Premium rate ───────────────────────────────────────────────────────────
  // Checked before validity: libphonenumber rejects AU 190x as invalid, but
  // "you will be charged premium rates" is far better advice than "invalid".
  // An explicit foreign country code disqualifies the domestic premium rule —
  // otherwise an unparseable foreign number could be reported as a domestic
  // premium line. Unparseable input with no country resolved still qualifies,
  // since that is how AU 190x arrives (libphonenumber rejects it as invalid).
  const isDomesticFormat = parsed ? (!parsed.country || sameCountry(parsed, homeCountry)) : !raw.trim().startsWith("+");
  if (isDomesticFormat && plan.premiumPrefixes?.some((p) => national.startsWith(p))) {
    if (plan.premiumFlag) spoofingNotes.push(plan.premiumFlag);
    bump("very_high");
    return {
      lineType: "premium",
      country: domesticName(parsed),
      isDomestic: true,
      wangiriRisk: false,
      highScamCountry: false,
      spoofingRisk,
      spoofingNotes,
      normalised: parsed?.formatInternational() ?? national,
    };
  }

  // ── International number typed without a leading "+" ───────────────────────
  // A number that isn't valid at home may simply be a foreign one the user typed
  // as they saw it — caller ID and missed-call logs routinely show "18765551234"
  // with no plus. Parsing that against the home plan yields `country = home` and
  // invalid, so it fell through to the unparseable branch below and was reported
  // as the *user's own country* with the international risk checks skipped
  // entirely: an Australian checking a Jamaican wangiri number was told
  // "Australia", no wangiri flag. The same held for GB, NZ and IE, and for
  // non-NANP prefixes (Somalia +252 read as "Australia").
  //
  // Reparsing is deliberately narrow, because it is easy to make worse. The
  // guards, in order:
  //   · only after the domestic parse has already failed — a valid home number
  //     never reaches here, so this cannot reinterpret one;
  //   · not when the user typed "+", which was already handled correctly;
  //   · not when the input starts with "0", which is a national trunk prefix —
  //     stripping it invents a country code ("0412 345 678" → Switzerland);
  //   · the reparse must produce a *valid* number, or match a known wangiri /
  //     high-scam prefix at a plausible international length. The second clause
  //     exists because libphonenumber rates many small-territory subscriber
  //     ranges invalid, which would otherwise drop exactly the Caribbean wangiri
  //     numbers this fixes.
  const reparsedIntl = ((): PhoneNumber | undefined => {
    if (parsed?.isValid()) return undefined;
    if (raw.trim().startsWith("+")) return undefined;
    if (cleaned.startsWith("0")) return undefined;
    // 8 digits is below any plausible country-code-plus-subscriber number, and
    // keeps short codes and local-format numbers out.
    if (cleaned.length < 8) return undefined;

    const candidate = parsePhoneNumberFromString("+" + cleaned);
    if (candidate?.isValid()) return candidate;

    const knownRisk =
      WANGIRI_PREFIXES.some((p) => cleaned.startsWith(p)) ||
      Object.keys(HIGH_SCAM_COUNTRY_CODES).some((p) => cleaned.startsWith(p));
    return knownRisk ? candidate : undefined;
  })();

  if (reparsedIntl) {
    return analyseInternational(reparsedIntl, cleaned, spoofingNotes, () => spoofingRisk, bump);
  }

  // ── Unparseable ────────────────────────────────────────────────────────────
  if (!parsed || !parsed.isValid()) {
    spoofingNotes.push("Number doesn't match any known phone number format — it may be fabricated or disguised");
    bump("high");
    return {
      lineType: "unknown",
      country: parsed?.country ? countryName(parsed.country) : lookupCountry(cleaned.replace(/^0+/, "")),
      // sameCountry, not raw equality: `country` above already maps shared-plan
      // territories to their parent, so comparing raw codes here would report a
      // Northern Marianas number as "United States" yet not domestic for a US
      // user — the same object disagreeing with itself.
      isDomestic: parsed ? sameCountry(parsed, homeCountry) : false,
      wangiriRisk: false,
      highScamCountry: false,
      spoofingRisk,
      spoofingNotes,
      normalised: parsed?.formatInternational() ?? cleaned,
    };
  }

  const type = parsed.getType();
  const isDomestic = sameCountry(parsed, homeCountry);
  const normalised = parsed.formatInternational();

  // ── Domestic, plan-aware analysis ──────────────────────────────────────────
  //
  // Fixed-line, toll-free and shared-cost numbers carry their spoofing note but
  // no risk bump. Every one of those line types IS trivially spoofable, and the
  // note says so — but that is a fact about the phone network, not evidence
  // about the number in front of the reader. Scored, it put a flat 30 on the
  // published contact number of essentially every business and government
  // agency in the country: an ordinary landline, an 1800 line and a 1300 line
  // all came back "suspicious", so someone checking their own GP's number was
  // told it was dodgy.
  //
  // The note still reaches the reader through spoofingNotes, which is where a
  // "here is how caller ID works" caution belongs. What stays scored is a range
  // that is unusual for its claimed purpose — VoIP, premium rate, wangiri, an
  // elevated-volume origin — because those say something about THIS number.
  if (isDomestic) {
    if (type === "TOLL_FREE") {
      if (plan.tollFreeFlag) spoofingNotes.push(plan.tollFreeFlag);
      return {
        lineType: "freecall",
        region: "National — free call",
        country: domesticName(parsed),
        isDomestic,
        wangiriRisk: false,
        highScamCountry: false,
        spoofingRisk,
        spoofingNotes,
        normalised: parsed.formatNational(),
      };
    }

    if (type === "SHARED_COST") {
      if (plan.sharedCostFlag) spoofingNotes.push(plan.sharedCostFlag);
      return {
        lineType: "shared_cost",
        region: "National — shared cost",
        country: domesticName(parsed),
        isDomestic,
        wangiriRisk: false,
        highScamCountry: false,
        spoofingRisk,
        spoofingNotes,
        normalised: parsed.formatNational(),
      };
    }

    if (type && MOBILE_TYPES.has(type)) {
      const isVoip = plan.voipMobilePrefixes?.some((p) => national.startsWith(p)) ?? false;
      if (isVoip) {
        spoofingNotes.push("This number range is commonly used by internet phone and virtual number services — the caller's real identity is easily hidden");
        bump("medium");
      }
      return {
        lineType: isVoip ? "voip_likely" : "mobile",
        region: `${domesticName(parsed)} mobile`,
        carrierHint: isVoip ? "VoIP / virtual number provider (likely)" : undefined,
        country: domesticName(parsed),
        isDomestic,
        wangiriRisk: false,
        highScamCountry: false,
        spoofingRisk,
        spoofingNotes,
        normalised,
      };
    }

    if (type === "FIXED_LINE") {
      const area = areaFor(plan, national);
      spoofingNotes.push("Landline numbers are easy to fake — a local area code doesn't mean the caller is actually nearby or who they claim to be");
      return {
        lineType: "fixed",
        region: area,
        country: domesticName(parsed),
        isDomestic,
        wangiriRisk: false,
        highScamCountry: false,
        spoofingRisk,
        spoofingNotes,
        normalised,
      };
    }

    if (type === "VOIP") {
      spoofingNotes.push("This number range is commonly used by internet phone and virtual number services — the caller's real identity is easily hidden");
      bump("medium");
      return {
        lineType: "voip_likely",
        carrierHint: "VoIP / virtual number provider (likely)",
        country: domesticName(parsed),
        isDomestic,
        wangiriRisk: false,
        highScamCountry: false,
        spoofingRisk,
        spoofingNotes,
        normalised,
      };
    }

    if (type === "PREMIUM_RATE") {
      if (plan.premiumFlag) spoofingNotes.push(plan.premiumFlag);
      bump("very_high");
      return {
        lineType: "premium",
        country: domesticName(parsed),
        isDomestic,
        wangiriRisk: false,
        highScamCountry: false,
        spoofingRisk,
        spoofingNotes,
        normalised,
      };
    }

    // Valid domestic number of a type we don't specialise on.
    return {
      lineType: "unknown",
      country: domesticName(parsed),
      isDomestic,
      wangiriRisk: false,
      highScamCountry: false,
      spoofingRisk,
      spoofingNotes,
      normalised,
    };
  }

  // ── International numbers ──────────────────────────────────────────────────
  return analyseInternational(parsed, cleaned, spoofingNotes, () => spoofingRisk, bump);
}

/**
 * Risk analysis for a number that belongs to some country other than the
 * user's — wangiri, high-scam and elevated-volume origins.
 *
 * Extracted so the two paths that reach it share one implementation: a number
 * carrying an explicit country code, and one the user typed without a leading
 * "+" that we recovered by reparsing (see analysePhone). Before that second
 * path existed, a foreign number typed in bare digits skipped every check here
 * and was reported as the user's own country.
 */
function analyseInternational(
  parsed: PhoneNumber,
  cleaned: string,
  spoofingNotes: string[],
  // A getter, not the value. `bump` mutates the caller's risk variable, so
  // capturing it as a plain parameter here would freeze it at its value on
  // entry and discard every escalation this function makes.
  currentRisk: () => PhoneIntel["spoofingRisk"],
  bump: (risk: PhoneIntel["spoofingRisk"]) => void,
): PhoneIntel {
  const intl = parsed.countryCallingCode
    ? parsed.countryCallingCode + parsed.nationalNumber
    : cleaned;

  const isWangiri = WANGIRI_PREFIXES.some((p) => intl.startsWith(p));
  if (isWangiri) {
    spoofingNotes.push("Country frequently used in Wangiri ('one ring') scams — you receive one ring, call back, and are charged international premium rates");
    bump("very_high");
  }

  const highScamEntry = Object.entries(HIGH_SCAM_COUNTRY_CODES).find(([code]) => intl.startsWith(code));
  if (highScamEntry) {
    spoofingNotes.push(`International call from ${highScamEntry[1]} — a country frequently associated with scam call operations targeting your region`);
    bump("high");
  }

  // Elevated-volume origins: only flagged when not already a stronger signal,
  // and with language that respects the many legitimate callers from here.
  const elevatedEntry = !highScamEntry && !isWangiri
    ? Object.entries(ELEVATED_VOLUME_COUNTRY_CODES).find(([code]) => intl.startsWith(code))
    : undefined;
  if (elevatedEntry) {
    spoofingNotes.push(`International call from ${elevatedEntry[1]} — a common origin for scam call centres, though most calls from here are perfectly legitimate. Be cautious only if the caller pressures you or asks for money or personal details.`);
    bump("medium");
  }

  const type = parsed.getType();
  const lineType: PhoneIntel["lineType"] =
    type === "TOLL_FREE" ? "freecall"
    : type === "SHARED_COST" ? "shared_cost"
    : type === "PREMIUM_RATE" ? "premium"
    : type === "VOIP" ? "voip_likely"
    : type === "FIXED_LINE" ? "fixed"
    : type && MOBILE_TYPES.has(type) ? "mobile"
    : "unknown";

  return {
    lineType,
    country: parsed.country ? countryName(parsed.country) : lookupCountry(intl),
    isDomestic: false,
    wangiriRisk: isWangiri,
    highScamCountry: !!highScamEntry || isWangiri,
    spoofingRisk: currentRisk(),
    spoofingNotes,
    normalised: parsed.isValid() ? parsed.formatInternational() : "+" + intl,
  };
}
