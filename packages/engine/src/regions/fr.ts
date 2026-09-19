// France — `minimal`.
//
// Tier rules per sg.ts. Everything here is public-registry or published-policy
// fact: the agencies are named public institutions, the suffixes are AFNIC
// eligibility facts, and the number ranges come from ARCEP's numbering plan,
// verified by parsing rather than assumed.
//
// French scam messaging is in French, and the keyword layer is English, so
// this pack contributes on the positive side only — an impersonated agency is
// named, and a victim is pointed at Cybermalveillance and the police rather
// than at a foreign reporting body.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

// National bodies impersonated in France, abbreviation and expanded name both
// listed since scam copy uses whichever reads as more official.
const AUTHORITY_MENTIONS = [
  "dgfip",
  "direction générale des finances publiques",
  "impots.gouv",
  "ameli",
  "assurance maladie",
  "caf",
  "caisse d'allocations familiales",
  "urssaf",
  "cpam",
  "france travail",
  "pôle emploi",
  "carsat",
  "cnav",
  "police nationale",
  "gendarmerie nationale",
  // "ants" is matched CASE-SENSITIVELY (caseSensitiveAuthorities below): the
  // lower-case form is the plural of the English insect, which a message
  // pasted here is scored against; "ANTS" is the agency.
  "ants",
  "agence nationale des titres sécurisés",
  "franceconnect",
  "la poste",
  "amf",
  "autorité des marchés financiers",
  "acpr",
];

// Foreign authorities with no jurisdiction over French residents. Spread from
// the shared constant rather than retyped — see the DE/SG packs for why.
const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const FR: RegionDefinition = {
  code: "FR",
  name: "France",
  coverage: "minimal",
  languages: ["fr"],
  // Ordinary words as well as agency names — matched only in caps.
  caseSensitiveAuthorities: ["ants"],

  // No national campaign keywords — French lures are written in French, and an
  // English list would assert coverage this tier has not earned.
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in France and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the police or via Cybermalveillance.gouv.fr.",

  // France transfers on IBAN; no separate routing identifier equivalent to a
  // BSB or sort code, so the composite falls back to base phrasing.
  bankIdentifiers: ["iban"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the AMF publishes a public blacklist of unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // Eligibility-GATED suffixes only. `.gouv.fr` is restricted to French
  // government bodies. Plain `.fr` is deliberately absent: AFNIC registers it
  // to anyone in the EU/EEA with no eligibility bar beyond residency, which is
  // precisely the namespace a scammer buys.
  trustedHostSuffixes: [".gouv.fr"],
  brandSuffixes: ["fr", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the police or Cybermalveillance.gouv.fr",
  reportingUrl: "https://www.cybermalveillance.gouv.fr/",

  phonePlan: {
    // ARCEP premium/special-rate ranges, authored in national form WITH the
    // trunk 0 because analysePhone matches against "0" + the national number
    // libphonenumber returns. Verified by parsing: 06 12 34 56 78 arrives as
    // nationalNumber "612345678", so a bare "891" would never fire.
    //
    // Verified by injection: libphonenumber classifies 089x as PREMIUM_RATE
    // for France — 0891/0892/0897/0899 all resolve at national length 10.
    // 081x/082x is SHARED_COST (081x tested at "0810"/"0820"/"0825"), and 08x
    // toll-free is 0800/0805.
    premiumPrefixes: ["0891", "0892", "0897", "0899"],
    premiumFlag:
      "Premium rate number — French 089x numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 15 (SAMU/medical), 17 (police) and 18 (fire) are France's own emergency
    // numbers and are NOT in the universal EMERGENCY_NUMBERS set (which
    // carries 112 but not these three). Matched by exact equality.
    emergencyNumbers: ["15", "17", "18"],
    // France's toll-free range is 0800, not the NANP 800.
    tollFreeFlag:
      "Free-call 0800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // 081x/082x is the shared-cost range, billed to the caller at a published
    // rate above the standard call price.
    sharedCostFlag:
      "French 081x and 082x shared-cost numbers are billed to you at a published rate above a standard call — a message pressing you to call one for a refund or to 'confirm' anything is a common cost-shifting tactic",
  },
};
