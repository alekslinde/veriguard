// South Korea — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// KISA eligibility facts, and number ranges come from the KCC numbering plan,
// verified by parsing rather than assumed.
//
// Korean scam messaging is in Korean, and the keyword layer is English, so
// this pack contributes on the positive side only.
//
// Agency names below are listed in ROMANISED and English form only, the same
// non-Latin-script precedent as jp.ts: the keyword matcher's word-boundary
// anchoring (`\b`/`\w` in scamDetector.ts's `mentions()`) is ASCII-only, so a
// Hangul entry would silently lose the boundary protection every other short
// entry gets — untested territory, and exactly the unverified judgement this
// tier's header forbids. Checking that safely is the research a `minimal`
// pack does not do.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

const AUTHORITY_MENTIONS = [
  "nts",
  "national tax service",
  "nhis",
  "national health insurance service",
  "nps",
  "national pension service",
  "korea post",
  "national police agency",
  "fss",
  "financial supervisory service",
  "prosecutors' office",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const KR: RegionDefinition = {
  code: "KR",
  name: "South Korea",
  coverage: "minimal",

  // No urgency keywords are authored: Korean lures are written in Korean, and
  // an English list would assert coverage this tier has not earned.
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in South Korea and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the National Police Agency (112) or the Financial Supervisory Service.",

  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the Financial Supervisory Service publishes public warnings about unauthorised investment providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // `.go.kr` is restricted to South Korean government bodies. `.co.kr` is
  // deliberately absent — it is open to any registrant, the same reasoning as
  // `.co.uk` in GB.
  trustedHostSuffixes: [".go.kr"],
  brandSuffixes: ["kr", "co.kr", "or.kr", "ne.kr", "ac.kr", "go.kr", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the National Police Agency or the Financial Supervisory Service",
  reportingUrl: "https://www.fss.or.kr/",

  phonePlan: {
    // No consumer premium-rate range appeared in libphonenumber's Korean
    // metadata when swept against the known IDD/premium candidate ranges.
    // The 15xx "UAN" numbers (customer-service lines like 1588, 1577) are
    // legitimate business contact numbers, not premium-rate, and correctly
    // classify as UAN — which has no branch in analysePhone, so nothing is
    // authored for them. Authoring a speculative premium prefix would be the
    // unverified regional claim the tier's header forbids.
    emergencyNumbers: [],
    // South Korea's toll-free range is 080, not the NANP 800 — verified by
    // parsing: 0801xxxxxx at national length 10 classifies as TOLL_FREE.
    tollFreeFlag:
      "Free-call 080 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
