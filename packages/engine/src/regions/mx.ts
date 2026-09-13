// Mexico — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// NIC Mexico eligibility facts, and number ranges come from the IFT
// numbering plan, verified by parsing rather than assumed.
//
// Mexican scam messaging is in Spanish, and the keyword layer is English, so
// this pack contributes on the positive side only.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  // "sat" (the tax authority's own acronym) and "ine" (the electoral
  // institute's) are NOT listed bare: both are ordinary English/Spanish words
  // ("I sat down", "fine wine") and, like ZA's "saps"/"hawks", the matcher's
  // word-boundary protection cannot help — these match as whole words because
  // that is what they are. Found by adversarial probe (checkSms("I sat on the
  // porch...", "MX") flagged "Names a government agency" on completely
  // ordinary text). The expanded names below carry the same coverage without
  // the collision.
  "servicio de administración tributaria",
  "imss",
  "instituto mexicano del seguro social",
  "infonavit",
  "condusef",
  "cnbv",
  "comisión nacional bancaria y de valores",
  "correos de méxico",
  "guardia nacional",
  "fiscalía general de la república",
  "instituto nacional electoral",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const MX: RegionDefinition = {
  code: "MX",
  name: "Mexico",
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Mexico and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the Guardia Nacional or the Fiscalía General de la República.",

  // Mexican transfers use CLABE, an 18-digit bank/branch-encoding account
  // number — a routing identifier in the same sense as a BSB or sort code.
  bankIdentifiers: ["clabe"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the CNBV publishes public warnings about unauthorised financial service providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.gob.mx` is restricted to Mexican government bodies. `.com.mx` is
  // deliberately absent from trustedHostSuffixes — it is open to any
  // registrant, the same reasoning as `.co.uk` in GB.
  trustedHostSuffixes: [".gob.mx"],
  brandSuffixes: ["mx", "com.mx", "org.mx", "net.mx", "gob.mx", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Guardia Nacional or your bank's fraud line",
  reportingUrl: "https://www.gob.mx/guardianacional",

  phonePlan: {
    // IFT premium-rate range, authored WITH a leading "0" because analysePhone
    // unconditionally builds `national = "0" + nationalNumber` — regardless
    // of the country's own dialling convention. Mexican premium numbers don't
    // carry a trunk 0: 9001234567 parses with nationalNumber "9001234567"
    // (nothing stripped), so analysePhone still produces "09001234567" and a
    // bare "900" prefix would never match. Same trap the DE/SG packs
    // document, generalised: the leading 0 is the function's own
    // construction, not a fact about the country's numbers.
    //
    // Verified by injection: 900 classifies as PREMIUM_RATE at national
    // length 10; 800 classifies as TOLL_FREE.
    premiumPrefixes: ["0900"],
    premiumFlag:
      "Premium rate number — Mexican 900 numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 911 is already universal (NANP). No additional Mexican emergency
    // numbers outside the universal set.
    emergencyNumbers: [],
    // Mexico's toll-free range is 800, matching the NANP shape but distinct
    // metadata — libphonenumber classifies it directly.
    tollFreeFlag:
      "Free-call 800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
