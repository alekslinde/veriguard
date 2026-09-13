// Sweden — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// IIS eligibility facts, and number ranges come from the PTS numbering plan,
// verified by parsing rather than assumed.
//
// Swedish scam messaging is in Swedish, and the keyword layer is English, so
// this pack contributes on the positive side only.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "skatteverket",
  "försäkringskassan",
  "pensionsmyndigheten",
  "postnord",
  "polisen",
  "finansinspektionen",
  "kronofogden",
  "bankid",
  "arbetsförmedlingen",
  "csn",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const SE: RegionDefinition = {
  code: "SE",
  name: "Sweden",
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Sweden and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to Polisen.",

  bankIdentifiers: ["iban"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — Finansinspektionen publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // No eligibility-gated Swedish government suffix — Swedish government
  // agencies each publish under their own `.se` domain rather than a shared
  // gated second-level namespace, and `.se` itself is open to anyone via IIS.
  trustedHostSuffixes: [],
  brandSuffixes: ["se", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Polisen",
  reportingUrl: "https://polisen.se/utsatt-for-brott/olika-typer-av-brott/bedrageri/",

  phonePlan: {
    // PTS premium-rate range, authored in national form WITH the trunk 0
    // because analysePhone matches against "0" + the national number
    // libphonenumber returns. Verified by parsing: 0701234567 arrives as
    // nationalNumber "701234567", so the authored prefix must be "0900".
    //
    // Verified by injection: 0900/0939 classify as PREMIUM_RATE across
    // national lengths 8-11; 020/0200 classify as TOLL_FREE; 0770 classifies
    // as SHARED_COST.
    premiumPrefixes: ["0900", "0939"],
    premiumFlag:
      "Premium rate number — Swedish 0900/0939 numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 112 is already universal. No additional Swedish emergency numbers
    // outside the universal set.
    emergencyNumbers: [],
    // Sweden's toll-free range is 020, not the NANP 800.
    tollFreeFlag:
      "Free-call 020 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // 0770 is the shared-cost range, billed to the caller above a standard
    // call rate.
    sharedCostFlag:
      "Swedish 0770 shared-cost numbers are billed to you above a standard call rate — a message pressing you to call one for a refund or to 'confirm' anything is a common cost-shifting tactic",
  },
};
