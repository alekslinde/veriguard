// Vietnam — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// VNNIC eligibility facts, and number ranges come from the MIC/ICT numbering
// plan, verified by parsing rather than assumed.
//
// Vietnamese uses Latin script with diacritics; agency names below are
// authored without diacritics (ASCII form), matching how Vietnamese SMS scam
// copy is very commonly typed on a standard keyboard, and avoiding an
// unverified claim about how the matcher's word-boundary anchoring behaves
// against combining diacritical marks.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "tong cuc thue",
  "general department of taxation",
  "bao hiem xa hoi",
  "vietnam social security",
  "vietnam post",
  // "cong an" alone (bare "police") is not listed alongside this: it is a
  // shorter substring of "bo cong an" that would shadow it (mentions()
  // matches the shorter phrase first, per packShadowing.test.ts), and unlike
  // the full ministry name it reads as ordinary Vietnamese rather than a
  // scam-specific institutional claim.
  "bo cong an",
  "ministry of public security",
  "ngan hang nha nuoc",
  "state bank of vietnam",
  "uy ban chung khoan",
  "state securities commission",
  "vneid",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const VN: RegionDefinition = {
  code: "VN",
  name: "Vietnam",
  coverage: "minimal",

  urgency: {
    foreignAuthority: [],
    toll: [],
    parcel: [],
    utility: [],
    pension: [],
    recall: [],
    tax: [],
    taxThreat: [],
  },

  authorityMentions: AUTHORITY_MENTIONS,
  noLinkSenders: [],
  noLinkSendersFlag: "",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Vietnam and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the Ministry of Public Security (Bo Cong An).",

  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the State Securities Commission publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.gov.vn` is restricted to Vietnamese government bodies. `.com.vn` is
  // deliberately absent — it is open to any registrant, the same reasoning as
  // `.co.uk` in GB.
  trustedHostSuffixes: [".gov.vn"],
  brandSuffixes: ["vn", "com.vn", "net.vn", "org.vn", "edu.vn", "gov.vn", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Ministry of Public Security",
  reportingUrl: "https://canhbao.ncsc.gov.vn/",

  phonePlan: {
    // MIC premium-rate range, authored WITH a leading "0" because
    // analysePhone unconditionally builds `national = "0" + nationalNumber`.
    // A real Vietnamese premium number (1900123456) parses with
    // nationalNumber "1900123456" — the leading "1" is the range digit, not a
    // trunk prefix libphonenumber strips — so analysePhone produces
    // "01900123456" and a bare "1900" prefix would never match. Same trap the
    // DE/SG packs document, generalised: the leading 0 is the function's own
    // construction, not a fact about the country's numbers.
    //
    // Verified by injection: 1900 classifies as PREMIUM_RATE across national
    // lengths 8-10; 1800 classifies as TOLL_FREE.
    premiumPrefixes: ["01900"],
    premiumFlag:
      "Premium rate number — Vietnamese 1900 numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 113 (police), 114 (fire) and 115 (ambulance) are Vietnam's own
    // emergency numbers and are NOT in the universal EMERGENCY_NUMBERS set.
    // Matched by exact equality.
    emergencyNumbers: ["113", "114", "115"],
    // Vietnam's toll-free range is 1800, not the NANP 800.
    tollFreeFlag:
      "Free-call 1800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
