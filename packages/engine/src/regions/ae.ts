// United Arab Emirates — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// .aeDA eligibility facts, and number ranges come from the TDRA numbering
// plan, verified by parsing rather than assumed.
//
// UAE scam messaging runs heavily in English alongside Arabic given the
// expatriate population, so this pack contributes on the positive side beyond
// what DE/JP can claim — the same reasoning as ZA/PH/NG — but no brands and
// no allowlist still means a clean verdict downgrades to `unknown`. Arabic
// agency names are not authored, the same non-Latin-script precedent as
// jp.ts/kr.ts.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "federal tax authority",
  "fta uae",
  "emirates post",
  "dubai police",
  "abu dhabi police",
  "central bank of the uae",
  "cbuae",
  "securities and commodities authority",
  "sca uae",
  "tdra",
  "telecommunications and digital government regulatory authority",
  "icp",
  "federal authority for identity, citizenship, customs and port security",
  "uae pass",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const AE: RegionDefinition = {
  code: "AE",
  name: "United Arab Emirates",
  coverage: "minimal",
  languages: ["ar", "en"],

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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in the UAE and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to Dubai Police, Abu Dhabi Police, or via the eCrime platform.",

  bankIdentifiers: ["iban"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the Securities and Commodities Authority publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.gov.ae` is restricted to UAE government bodies. `.ae` itself requires
  // only a UAE trade licence or Emirates ID, not a government eligibility
  // bar, so it is deliberately absent from trustedHostSuffixes.
  trustedHostSuffixes: [".gov.ae"],
  brandSuffixes: ["ae", "co.ae", "net.ae", "org.ae", "gov.ae", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "Dubai Police or Abu Dhabi Police",
  reportingUrl: "https://ecrime.ae/",

  phonePlan: {
    // No consumer premium-rate range appeared in libphonenumber's UAE
    // metadata when swept against the known IDD/premium candidate ranges —
    // TDRA premium services in the UAE are billed through carrier short
    // codes rather than a dialable national premium prefix. Authoring a
    // speculative prefix here would be the unverified regional claim the
    // tier's header forbids, so the field is omitted rather than filled.
    // 999 (police) is already in the universal EMERGENCY_NUMBERS set. 997
    // (ambulance) and 998 (civil defence/fire) are the UAE's own and are not.
    // Matched by exact equality.
    emergencyNumbers: ["997", "998"],
    // The UAE's toll-free range is 800, matching the NANP shape but distinct
    // metadata — libphonenumber classifies it directly, across a wide range
    // of national lengths (short-code-style 800 numbers are common here).
    tollFreeFlag:
      "Free-call 800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
