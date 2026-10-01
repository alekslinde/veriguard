// Italy — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// Registro.it eligibility facts, and number ranges come from AGCOM's
// numbering plan, verified by parsing rather than assumed.
//
// Italian scam messaging is in Italian, and the keyword layer is English, so
// this pack contributes on the positive side only.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  // "agenzia delle entrate-riscossione" (the collections sub-unit) is
  // deliberately not listed alongside it: mentions() substring-matches, so
  // the shorter phrase always matches first and the longer one can never be
  // the sole hit — packShadowing.test.ts catches exactly this pair.
  "agenzia delle entrate",
  "inps",
  "istituto nazionale della previdenza sociale",
  "inail",
  "poste italiane",
  "polizia postale",
  "polizia di stato",
  "carabinieri",
  "consob",
  "banca d'italia",
  "agenzia delle dogane",
  "spid",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const IT: RegionDefinition = {
  code: "IT",
  name: "Italy",
  coverage: "minimal",
  languages: ["it"],

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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Italy and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the Polizia Postale or the Carabinieri.",

  bankIdentifiers: ["iban"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — CONSOB publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.gov.it` is restricted to Italian government bodies. Plain `.it` is
  // deliberately absent — Registro.it requires only an EU residency link, not
  // an eligibility bar.
  trustedHostSuffixes: [".gov.it"],
  brandSuffixes: ["it", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Polizia Postale e delle Comunicazioni",
  reportingUrl: "https://www.commissariatodips.it/",

  phonePlan: {
    // AGCOM premium-rate ranges, authored WITH a leading "0" because
    // analysePhone unconditionally builds `national = "0" + nationalNumber` —
    // regardless of the country's own dialling convention. Italian premium
    // numbers don't carry a trunk 0: 899123456 parses with nationalNumber
    // "899123456" (nothing stripped), so analysePhone still produces
    // "0899123456" and a bare "899" prefix would never match. Same trap the
    // DE/SG packs document, generalised: the leading 0 is the function's own
    // construction, not a fact about the country's numbers.
    //
    // Verified by injection: 899 and 144 classify as PREMIUM_RATE at national
    // length 9; 800 classifies as TOLL_FREE.
    premiumPrefixes: ["0899", "0144"],
    premiumFlag:
      "Premium rate number — Italian 899 and 144 numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 112 is already universal. 113 (Polizia di Stato) and 112 overlap in
    // Italy's converged system, but 113 is Italy's own and NOT in the
    // universal set. Matched by exact equality.
    emergencyNumbers: ["113"],
    // Italy's toll-free range is 800.
    tollFreeFlag:
      "Free-call 800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
