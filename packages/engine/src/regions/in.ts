// India — `minimal`.
//
// The other half of the roadmap's parked pair (with ZA), shipping at `minimal`
// rather than waiting for the research a `full` pack needs.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// NIXI/registry eligibility facts, and the number ranges come from the TRAI
// National Numbering Plan.
//
// India is the pack where the language qualification bites hardest and is
// worth stating plainly: scam messaging runs in Hindi, English and a dozen
// major regional languages, and the keyword layer covers one of them. This
// pack adds an impersonated agency by name and a local place to report — and
// the roadmap's item 4b gap (roughly 70% of base is English prose) is the
// reason it does not add more.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

// Indian public bodies impersonated by scammers, abbreviation and expanded
// name both. Excludes bare "income tax" and "police" as institution-kind
// terms — "income tax" in particular appears in ordinary financial prose.
const AUTHORITY_MENTIONS = [
  "income tax department",
  "cbdt",
  "central board of direct taxes",
  "gst department",
  "trai",
  "telecom regulatory authority of india",
  "uidai",
  "aadhaar",
  "epfo",
  "employees provident fund",
  "sebi",
  "securities and exchange board of india",
  "reserve bank of india",
  "rbi",
  "cbi",
  "central bureau of investigation",
  "narcotics control bureau",
  "ncb",
  "enforcement directorate",
  "cybercrime portal",
  "cert-in",
  "irctc",
  "digilocker",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const IN: RegionDefinition = {
  code: "IN",
  name: "India",
  coverage: "minimal",

  // No national campaign keywords, for the multilingual reason in the header.
  // The "digital arrest" script is a well-known Indian lure and would be the
  // obvious candidate — but its distinguishing phrasing is exactly the
  // researched judgement this tier excludes, and it runs in several languages.
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in India and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the National Cyber Crime Reporting Portal.",

  // Indian domestic transfers are addressed by IFSC code (branch routing) or
  // by UPI ID, so unlike DE there are real routing identifiers to name.
  bankIdentifiers: ["ifsc", "upi id"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — SEBI publishes public warnings about unregistered investment advisers and platforms of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // Eligibility-GATED suffixes only.
  //
  // `.gov.in` is restricted to Indian government bodies, `.nic.in` to bodies
  // served by the National Informatics Centre, and `.ac.in` to recognised
  // academic institutions — all three vetted by the registry. `.in` and
  // `.co.in` are deliberately absent: both are open to any registrant.
  trustedHostSuffixes: [".gov.in", ".nic.in", ".ac.in"],
  brandSuffixes: ["co.in", "in", "net.in", "org.in", "firm.in", "gen.in", "ind.in", "ac.in", "gov.in", "nic.in", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the National Cyber Crime Reporting Portal or your local cyber cell",
  reportingUrl: "https://cybercrime.gov.in",

  phonePlan: {
    // India has no premium-rate range in the 0900 sense that DE or SG do —
    // TRAI's numbering plan allocates no consumer premium-service level, and
    // premium content is billed through short codes rather than dialable
    // national numbers. Authoring a speculative prefix here would be the
    // unverified regional claim the tier's header forbids, so the field is
    // omitted rather than filled.
    //
    // premiumFlag is omitted with it: a flag string with no prefix list is
    // unreachable copy, which is the shape sg.ts calls out for noLinkSenders.
    //
    // 100 (police), 101 (fire), 102 (ambulance) and 112 (the unified
    // emergency number) — 112 is already in the universal set; the rest are
    // not, and are matched by exact equality so whole numbers only.
    emergencyNumbers: ["100", "101", "102", "1930"],
    // India's toll-free range is 1800. libphonenumber classifies the line
    // type, so naming the right national range is all this copy must do —
    // telling an Indian user about "800 numbers" is the SG tollFreeFlag defect.
    tollFreeFlag:
      "Free-call 1800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
