// Netherlands — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// SIDN eligibility facts, and number ranges come from the ACM numbering plan,
// verified by parsing rather than assumed.
//
// Dutch scam messaging is in Dutch, and the keyword layer is English, so this
// pack contributes on the positive side only.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "belastingdienst",
  "uwv",
  "svb",
  "sociale verzekeringsbank",
  // "duo" (the bare acronym for Dienst Uitvoering Onderwijs) is NOT listed:
  // it is an ordinary English/Dutch word ("the duo performed"), the same
  // ZA saps/hawks and MX sat/ine class — found by adversarial probe. The
  // expanded name above carries the same coverage without the collision.
  "dienst uitvoering onderwijs",
  "postnl",
  "politie",
  "kvk",
  "kamer van koophandel",
  "afm",
  "autoriteit financiële markten",
  "dnb",
  "de nederlandsche bank",
  "digid",
  "rdw",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const NL: RegionDefinition = {
  code: "NL",
  name: "Netherlands",
  coverage: "minimal",
  languages: ["nl"],
  // Ordinary words as well as agency names — matched only in caps.
  caseSensitiveAuthorities: ["duo"],

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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in the Netherlands and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the Politie or via Fraudehelpdesk.",

  bankIdentifiers: ["iban"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the AFM publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.overheid.nl` is not a registrable suffix; Dutch government sites publish
  // under a curated Rijksoverheid domain rather than a gated second-level
  // namespace, so there is no eligibility-restricted suffix to list here.
  // Plain `.nl` is open to anyone via SIDN with no eligibility bar.
  trustedHostSuffixes: [],
  brandSuffixes: ["nl", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Politie or Fraudehelpdesk",
  reportingUrl: "https://www.fraudehelpdesk.nl/",

  phonePlan: {
    // ACM premium-rate range, authored in national form WITH the trunk 0
    // because analysePhone matches against "0" + the national number
    // libphonenumber returns. Verified by parsing: 0612345678 arrives as
    // nationalNumber "612345678", so the authored prefix must be "0900".
    //
    // Verified by injection: 0900/0906/0909 classify as PREMIUM_RATE across
    // national lengths 8-11; 0800 classifies as TOLL_FREE.
    premiumPrefixes: ["0900", "0906", "0909"],
    premiumFlag:
      "Premium rate number — Dutch 0900/0906/0909 numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 112 is already universal. No additional Dutch emergency numbers outside
    // the universal set.
    emergencyNumbers: [],
    // The Netherlands' toll-free range is 0800, not the NANP 800.
    tollFreeFlag:
      "Free-call 0800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
