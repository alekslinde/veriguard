// Kenya — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// KENIC eligibility facts. Number-plan semantics are deliberately thin: swept
// against the full 0xx two-digit prefix space, libphonenumber's Kenyan
// metadata classifies nothing outside mobile/fixed at all — no premium,
// shared-cost, toll-free or UAN range resolves for any prefix tried. That is
// a gap in the library's Kenya coverage, not evidence Kenya has no such
// ranges (Safaricom does operate premium short codes), so the honest move is
// to omit phonePlan entirely rather than author copy for a branch
// analysePhone can never reach here.
//
// Kenyan scam messaging runs predominantly in English and Swahili; the
// English half is more of this pack's audience than in DE or JP, but no
// brands and no allowlist still means a clean verdict downgrades to
// `unknown`.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "kra",
  "kenya revenue authority",
  "nhif",
  "sha",
  "social health authority",
  "nssf",
  "national social security fund",
  "posta kenya",
  "national police service",
  "dci",
  "directorate of criminal investigations",
  "cbk",
  "central bank of kenya",
  "cma kenya",
  "capital markets authority",
  "ca kenya",
  "communications authority of kenya",
  "huduma namba",
  "ecitizen",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const KE: RegionDefinition = {
  code: "KE",
  name: "Kenya",
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Kenya and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the DCI or the National Police Service.",

  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the Capital Markets Authority publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.go.ke` is restricted to Kenyan government bodies. `.co.ke` is
  // deliberately absent — it is open to any registrant, the same reasoning as
  // `.co.uk` in GB.
  trustedHostSuffixes: [".go.ke"],
  brandSuffixes: ["ke", "co.ke", "or.ke", "ne.ke", "ac.ke", "go.ke", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the DCI or the National Police Service",
  reportingUrl: "https://www.dci.go.ke/",

  // No phonePlan authored — see the header. libphonenumber has no premium,
  // shared-cost, toll-free or UAN classification anywhere in Kenya's numbering
  // metadata, so every field of PhonePlan would be unreachable copy.
};
