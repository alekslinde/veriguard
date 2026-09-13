// Nigeria — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// NiRA eligibility facts, and number ranges come from the NCC numbering plan,
// verified by parsing rather than assumed.
//
// Nigerian scam messaging runs predominantly in English, so this pack
// contributes on the positive side beyond what DE/JP can claim — the same
// reasoning as ZA and PH — but no brands and no allowlist still means a clean
// verdict downgrades to `unknown`.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "firs",
  "federal inland revenue service",
  "nimc",
  "national identity management commission",
  "nipost",
  "nigeria police force",
  "efcc",
  "economic and financial crimes commission",
  "nsitf",
  "cbn",
  "central bank of nigeria",
  "sec nigeria",
  "securities and exchange commission",
  "ncc",
  "nigerian communications commission",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const NG: RegionDefinition = {
  code: "NG",
  name: "Nigeria",
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Nigeria and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the EFCC or the Nigeria Police Force.",

  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the SEC publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.gov.ng` is restricted to Nigerian government bodies. `.com.ng` is
  // deliberately absent — it is open to any registrant with only a light
  // documentation check, not an eligibility bar.
  trustedHostSuffixes: [".gov.ng"],
  brandSuffixes: ["ng", "com.ng", "org.ng", "net.ng", "gov.ng", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the EFCC or the Nigeria Police Force",
  reportingUrl: "https://efccnigeria.org/efcc/report-a-crime",

  phonePlan: {
    // No consumer premium-rate range appeared in libphonenumber's Nigerian
    // metadata when swept against the known IDD/premium candidate ranges.
    // 0700 classifies as UAN (not premium, and has no branch in analysePhone
    // — see the ZA 0861 and JP 0570 precedent for why it is not named here).
    // Authoring a speculative prefix would be the unverified regional claim
    // the tier's header forbids, so the field is omitted rather than filled.
    emergencyNumbers: [],
    // Nigeria's toll-free range is 0800, not the NANP 800.
    tollFreeFlag:
      "Free-call 0800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
