// Japan — `minimal`.
//
// Tier rules per sg.ts. Agencies are named public institutions, suffixes are
// JPRS eligibility facts, and the number ranges come from the MIC numbering
// plan.
//
// Japan is the pack that makes the structural/lexical split from the roadmap's
// failure types concrete. Japanese scam messaging is written in Japanese, in
// three scripts, so the English keyword layer contributes nothing — but the
// structural signals in base (homoglyph and IDN detection, keyboard adjacency,
// mixed-script words) are script-agnostic by construction and reach Japan on
// day one. This pack adds the epistemic layer's cheapest half: who the
// authorities are, and where to report.
//
// One authoring note specific to a non-Latin-script country: the agency names
// below are listed in ROMANISED and English form only. The keyword matcher
// lowercases and compares literal text, so Japanese-script names would need
// the tokeniser and matching semantics checked against them first — and
// "reuse a list without reading the code that matches it" is the pattern that
// produced nine defects in lib/targetRegion.ts. Not a gap this pack silently
// carries: it is why the pack is `minimal`.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

// Japanese public bodies impersonated by scammers, in romanised and English
// form. Excludes bare "national tax agency"-style institution-kind terms only
// where they are genuinely ambiguous; these are specific named bodies.
const AUTHORITY_MENTIONS = [
  "national tax agency",
  "kokuzeicho",
  "nta japan",
  "japan pension service",
  "nenkin",
  "financial services agency",
  "kanto finance bureau",
  "consumer affairs agency",
  "japan legal support center",
  "houterasu",
  "npa cybercrime",
  "national police agency",
  "japan post",
  "yubin",
  "nhk",
  "mynumber",
  "my number card",
  "jpki",
  "e-tax",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const JP: RegionDefinition = {
  code: "JP",
  name: "Japan",
  coverage: "minimal",

  // No national campaign keywords, for the script and language reason in the
  // header. Base contributes generic urgency and the voice-clone script.
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Japan and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to your local police or the Consumer Affairs Agency.",

  // Japanese domestic transfers are addressed by bank, branch and account
  // number rather than by a single routing code, so there is no BSB/sort-code
  // equivalent to name. Base phrasing carries the composite.
  bankIdentifiers: [],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — Japan's Financial Services Agency publishes public warnings about unregistered financial operators of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // Eligibility-GATED suffixes only.
  //
  // `.go.jp` is restricted to Japanese government organisations, `.ac.jp` to
  // accredited educational institutions, `.lg.jp` to local governments, and
  // `.or.jp` to incorporated non-profits — all vetted by JPRS, which runs one
  // of the stricter eligibility regimes of any ccTLD.
  //
  // `.co.jp` is a genuine judgement call and is EXCLUDED. It is restricted to
  // companies registered in Japan, which is a business-registration bar rather
  // than an eligibility one — the same distinction that keeps `.com.sg` out of
  // SG's trusted list. A scammer who incorporates a company clears it.
  trustedHostSuffixes: [".go.jp", ".ac.jp", ".lg.jp", ".or.jp"],
  brandSuffixes: ["co.jp", "jp", "ne.jp", "or.jp", "go.jp", "ac.jp", "lg.jp", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "your local police or the Consumer Affairs Agency hotline (188)",
  reportingUrl: "https://www.caa.go.jp/policies/policy/consumer_policy/caution/",

  phonePlan: {
    // MIC premium ranges in national form WITH the trunk 0, verified against a
    // real number: +81 990 123456 arrives as nationalNumber "990123456", so
    // the authored prefix is "0990" and a bare "990" would silently never
    // fire — the SG defect.
    //
    // 0990 is the premium information-service range. 0570 ("Navi Dial") is
    // charged to the caller but is NOT premium, so it is deliberately absent
    // here: flagging a company's published Navi Dial support line as premium
    // would be a false claim about an ordinary business number. See the
    // sharedCostFlag note below for why it is not carried there either.
    // NOTE, verified by injection rather than assumed: libphonenumber ALREADY
    // classifies this range as PREMIUM_RATE, and analysePhone pushes
    // `premiumFlag` from that branch too (phoneIntel.ts, the `type ===
    // "PREMIUM_RATE"` case). So the authored prefixes below are redundant here —
    // breaking them to a bare, trunk-less form changes nothing observable:
    // lineType, the flag copy and the very_high risk bump are all identical.
    //
    // They are kept anyway, in correct trunk-0 form, for two reasons: the
    // prefix rule runs BEFORE the validity check and is the only thing that
    // fires when libphonenumber rejects a range as invalid (SG 1900, AU 190x),
    // and an incorrectly-authored prefix here would become live the moment the
    // library's metadata changed. What must not be inferred from a green test
    // is that these prefixes are doing the work — the roadmap already recorded
    // this trap for NANP ("US and CA hide this class of bug"); DE, ZA and JP
    // are in the same category, and SG is the exception that made it visible.
    premiumPrefixes: ["0990"],
    premiumFlag:
      "Premium rate number — Japanese 0990 numbers bill the caller at elevated rates, and a message pushing you to call one is charging you for the privilege",
    // 110 (police) and 119 (fire/ambulance) are already in the universal
    // EMERGENCY_NUMBERS set. 188 is the Consumer Affairs Agency's consumer
    // hotline and 189 the child-welfare line; both are short official numbers
    // that must never score as suspicious, which is what this field is for.
    // Matched by exact equality, so whole numbers only.
    emergencyNumbers: ["188", "189"],
    // Japan's toll-free range is 0120 (and 0800). libphonenumber classifies the
    // line type, so this copy only has to name the right national range.
    tollFreeFlag:
      "Free-call 0120 and 0800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // sharedCostFlag deliberately OMITTED, and this is a finding rather than an
    // oversight — recorded here because the next pack author will reach for it.
    //
    // Japan's 0570 "Navi Dial" range is the obvious shared-cost candidate and
    // Navi Dial genuinely bills the caller. But sharedCostFlag is only ever
    // pushed from the `type === "SHARED_COST"` branch in analysePhone, and
    // libphonenumber classifies JP 0570 as **UAN**, not SHARED_COST — verified
    // by printing the parse rather than assuming, since UAN has no branch at
    // all and falls through to lineType "unknown".
    //
    // So authoring the flag here would have shipped copy that can never reach a
    // reader: the exact shape of SG's unreachable premiumFlag, and of the
    // noLinkSendersFlag the tier rules require to be empty when its list is.
    // ZA's 0860 is not a counter-example — libphonenumber does classify that
    // one as SHARED_COST, which is why ZA authors the flag and JP does not.
    //
    // Giving UAN its own branch would be a base-layer change affecting every
    // region, so it is out of scope for a data-only pack and left unclaimed
    // rather than half-built.
  },
};
