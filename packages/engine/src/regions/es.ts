// Spain — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// Red.es/nic.es eligibility facts, and number ranges come from the CNMC
// numbering plan, verified by parsing rather than assumed.
//
// Spanish scam messaging is in Spanish (and Catalan, Galician, Basque in
// their regions), and the keyword layer is English, so this pack contributes
// on the positive side only.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "agencia tributaria",
  "aeat",
  "seguridad social",
  "tgss",
  "sepe",
  "dgt",
  "dirección general de tráfico",
  "policía nacional",
  "guardia civil",
  "correos",
  "cnmv",
  "comisión nacional del mercado de valores",
  "banco de españa",
  "incibe",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const ES: RegionDefinition = {
  code: "ES",
  name: "Spain",
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Spain and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the Policía Nacional or via INCIBE.",

  bankIdentifiers: ["iban"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the CNMV publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.gob.es` is restricted to Spanish government bodies. Plain `.es` is
  // deliberately absent — Red.es registers it with only a light identity
  // check, not an eligibility bar.
  trustedHostSuffixes: [".gob.es"],
  brandSuffixes: ["es", "com.es", "org.es", "nom.es", "gob.es", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the Policía Nacional or INCIBE",
  reportingUrl: "https://www.incibe.es/ciudadania",

  phonePlan: {
    // CNMC premium/special-rate ranges, authored WITH a leading "0" because
    // analysePhone unconditionally builds `national = "0" + nationalNumber` —
    // regardless of whether the country's own dialling convention uses a
    // trunk prefix. Spanish numbers don't: 803123456 parses with
    // nationalNumber "803123456" (nothing stripped), so analysePhone still
    // produces "0803123456" and a bare "803" prefix would never match. Same
    // trap the DE/SG packs document, generalised: the leading 0 is the
    // function's own construction, not a fact about the country's numbers.
    //
    // Verified by injection: 803/806/807 classify as PREMIUM_RATE, 901/902 as
    // SHARED_COST, and 900 as TOLL_FREE — all at national length 9.
    premiumPrefixes: ["0803", "0806", "0807"],
    premiumFlag:
      "Premium rate number — Spanish 803/806/807 numbers bill the caller at elevated per-minute rates, and a message pushing you to call one is charging you for the privilege",
    // 091 (Policía Nacional) and 062 (Guardia Civil) are Spain's own emergency
    // numbers and are NOT in the universal EMERGENCY_NUMBERS set. Matched by
    // exact equality.
    emergencyNumbers: ["091", "062"],
    // Spain's toll-free range is 900.
    tollFreeFlag:
      "Free-call 900 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // 901/902 is the shared-cost range, billed to the caller above a standard
    // call rate.
    sharedCostFlag:
      "Spanish 901/902 shared-cost numbers are billed to you above a standard call rate — a message pressing you to call one for a refund or to 'confirm' anything is a common cost-shifting tactic",
  },
};
