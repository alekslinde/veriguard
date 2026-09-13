// Poland — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// NASK/DNS.pl eligibility facts, and number ranges come from the UKE
// numbering plan, verified by parsing rather than assumed.
//
// Polish scam messaging is in Polish, and the keyword layer is English, so
// this pack contributes on the positive side only.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "urząd skarbowy",
  "krajowa administracja skarbowa",
  "zus",
  "zakład ubezpieczeń społecznych",
  "poczta polska",
  "policja",
  "knf",
  "komisja nadzoru finansowego",
  "nbp",
  "narodowy bank polski",
  "profil zaufany",
  "mobywatel",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const PL: RegionDefinition = {
  code: "PL",
  name: "Poland",
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Poland and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the Policja or via CERT Polska.",

  bankIdentifiers: ["iban"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the KNF publishes a public warning list of unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.gov.pl` is restricted to Polish government bodies. `.com.pl` is
  // deliberately absent — it is open to any registrant, the same reasoning as
  // `.co.uk` in GB.
  trustedHostSuffixes: [".gov.pl"],
  brandSuffixes: ["pl", "com.pl", "net.pl", "org.pl", "gov.pl", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Policja or CERT Polska",
  reportingUrl: "https://incydent.cert.pl/",

  phonePlan: {
    // UKE premium-rate range, authored in national form WITH the trunk 0
    // because analysePhone matches against "0" + the national number
    // libphonenumber returns. Verified by parsing: a real 700-range premium
    // number (e.g. 700151234) arrives as nationalNumber "700151234" — no
    // leading zero to strip — so analysePhone builds "0700151234" and the
    // authored prefix must be "0700" to match it.
    //
    // Verified by injection: the 700-range classifies as PREMIUM_RATE at
    // national length 9; 801 classifies as SHARED_COST; 800 classifies as
    // TOLL_FREE.
    premiumPrefixes: ["0700"],
    premiumFlag:
      "Premium rate number — Polish 700-range numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 112 is already universal. No additional Polish emergency numbers
    // outside the universal set.
    emergencyNumbers: [],
    // Poland's toll-free range is 800.
    tollFreeFlag:
      "Free-call 800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // 801 is the shared-cost range, billed to the caller above a standard
    // call rate.
    sharedCostFlag:
      "Polish 801 shared-cost numbers are billed to you above a standard call rate — a message pressing you to call one for a refund or to 'confirm' anything is a common cost-shifting tactic",
  },
};
