// Philippines — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// dotPH eligibility facts, and number ranges come from the NTC numbering
// plan, verified by parsing rather than assumed.
//
// Philippine scam messaging runs in English, Filipino and regional languages
// interchangeably, so this pack contributes on the positive side beyond what
// SG/ZA can claim — English is not merely an official language here, it is
// the dominant SMS-scam register — but no brands and no allowlist still means
// a clean verdict downgrades to `unknown`.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "bir",
  "bureau of internal revenue",
  "sss",
  "social security system",
  "philhealth",
  "pag-ibig",
  "philippine postal corporation",
  "phlpost",
  "philippine national police",
  "pnp",
  "nbi",
  "national bureau of investigation",
  "bangko sentral ng pilipinas",
  "bsp",
  "securities and exchange commission",
  "sec philippines",
  "ntc",
  "national telecommunications commission",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const PH: RegionDefinition = {
  code: "PH",
  name: "Philippines",
  coverage: "minimal",
  languages: ["tl", "en"],

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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in the Philippines and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the PNP Anti-Cybercrime Group or the NBI.",

  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the SEC publishes a public advisory list of unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.gov.ph` is restricted to Philippine government bodies. `.com.ph` is
  // deliberately absent — it is open to any registrant with a light
  // documentation check, not an eligibility bar.
  trustedHostSuffixes: [".gov.ph"],
  brandSuffixes: ["ph", "com.ph", "net.ph", "org.ph", "gov.ph", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the PNP Anti-Cybercrime Group or the NBI Cybercrime Division",
  reportingUrl: "https://acg.pnp.gov.ph/",

  phonePlan: {
    // No consumer premium-rate range appeared in libphonenumber's Philippine
    // metadata when swept against the known IDD/premium candidate ranges —
    // NTC premium services in the Philippines are billed through carrier
    // short codes rather than a dialable national premium prefix. Authoring a
    // speculative prefix here would be the unverified regional claim the
    // tier's header forbids, so the field is omitted rather than filled.
    //
    // premiumFlag is omitted with it: a flag string with no prefix list is
    // unreachable copy, the same shape IN's header calls out.
    emergencyNumbers: [],
    // The Philippines' toll-free range is 1800, not the NANP 800.
    tollFreeFlag:
      "Free-call 1800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
