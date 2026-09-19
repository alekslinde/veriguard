// Thailand — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// THNIC eligibility facts, and number ranges come from the NBTC numbering
// plan, verified by parsing rather than assumed.
//
// Agency names below are in ROMANISED and English form only, the same
// non-Latin-script precedent as jp.ts — Thai script is not matched here for
// the reason documented there.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "revenue department",
  "social security office",
  "thailand post",
  "royal thai police",
  "immigration bureau",
  "bank of thailand",
  "sec thailand",
  "securities and exchange commission",
  "nbtc",
  "national broadcasting and telecommunications commission",
  "dsi",
  "department of special investigation",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const TH: RegionDefinition = {
  code: "TH",
  name: "Thailand",
  coverage: "minimal",
  languages: ["th"],

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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Thailand and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the Royal Thai Police or the DSI.",

  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the SEC publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.go.th` is restricted to Thai government bodies. `.co.th` is
  // deliberately absent — it is open to any registrant with a light
  // documentation check, not an eligibility bar.
  trustedHostSuffixes: [".go.th"],
  brandSuffixes: ["th", "co.th", "or.th", "net.th", "in.th", "ac.th", "go.th", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Royal Thai Police or the DSI",
  reportingUrl: "https://www.tcsd.in.th/",

  phonePlan: {
    // NBTC premium-rate range, authored WITH a leading "0" because
    // analysePhone unconditionally builds `national = "0" + nationalNumber`.
    // A real Thai premium number (1900123456) parses with nationalNumber
    // "1900123456" — the leading "1" is the range digit, not a trunk prefix
    // libphonenumber strips — so analysePhone produces "01900123456" and a
    // bare "1900" prefix would never match. Same trap the DE/SG packs
    // document, generalised: the leading 0 is the function's own
    // construction, not a fact about the country's numbers.
    //
    // Verified by injection: 1900 classifies as PREMIUM_RATE at national
    // length 10; 1800 classifies as TOLL_FREE.
    premiumPrefixes: ["01900"],
    premiumFlag:
      "Premium rate number — Thai 1900 numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 191 (police) and 199 (fire) are Thailand's own emergency numbers and
    // are NOT in the universal EMERGENCY_NUMBERS set. Matched by exact
    // equality.
    emergencyNumbers: ["191", "199"],
    // Thailand's toll-free range is 1800, not the NANP 800.
    tollFreeFlag:
      "Free-call 1800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
