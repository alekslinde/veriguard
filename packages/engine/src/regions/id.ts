// Indonesia — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// PANDI eligibility facts, and number ranges come from the Kominfo/APJII
// numbering plan, verified by parsing rather than assumed.
//
// Indonesian scam messaging runs in Bahasa Indonesia and regional languages,
// and the keyword layer is English, so this pack contributes on the positive
// side only — the same multilingual reasoning as SG and ZA.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "djp",
  "direktorat jenderal pajak",
  "bpjs kesehatan",
  "bpjs ketenagakerjaan",
  "pos indonesia",
  "polri",
  "kepolisian",
  "ojk",
  "otoritas jasa keuangan",
  "bank indonesia",
  "dukcapil",
  "kominfo",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const ID: RegionDefinition = {
  code: "ID",
  name: "Indonesia",
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Indonesia and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to Polri or via the OJK.",

  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the OJK (Otoritas Jasa Keuangan) publishes a public warning list of unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.go.id` is restricted to Indonesian government bodies. `.co.id` is
  // deliberately absent — it requires only a business registration document,
  // not a government eligibility bar, and is exactly the namespace a scammer
  // buys.
  trustedHostSuffixes: [".go.id"],
  brandSuffixes: ["id", "co.id", "or.id", "web.id", "ac.id", "go.id", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Polri cybercrime unit or your bank's fraud line",
  reportingUrl: "https://patrolisiber.id/",

  phonePlan: {
    // Kominfo premium-rate range, authored in national form WITH the trunk 0
    // because analysePhone matches against "0" + the national number
    // libphonenumber returns. Verified by parsing: 0812345678 arrives as
    // nationalNumber "812345678", so the authored prefix must be "0809".
    //
    // Verified by injection: 0809 classifies as PREMIUM_RATE at national
    // length 11; 0804 classifies as SHARED_COST; 0800 classifies as
    // TOLL_FREE. 0807 classifies as UAN, which has no branch in analysePhone
    // — not named in copy, same reasoning as JP's 0570 and ZA's 0861.
    premiumPrefixes: ["0809"],
    premiumFlag:
      "Premium rate number — Indonesian 0809 numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 110 (police) and 118/119 (ambulance) are already in the universal set.
    // 112 is Indonesia's unified emergency number and is already universal
    // too. No additional national numbers to add.
    emergencyNumbers: [],
    // Indonesia's toll-free range is 0800, not the NANP 800.
    tollFreeFlag:
      "Free-call 0800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // 0804 is the shared-cost range, billed to the caller above a standard
    // call rate.
    sharedCostFlag:
      "Indonesian 0804 shared-cost numbers are billed to you above a standard call rate — a message pressing you to call one for a refund or to 'confirm' anything is a common cost-shifting tactic",
  },
};
