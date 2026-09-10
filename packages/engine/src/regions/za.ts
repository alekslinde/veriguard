// South Africa — `minimal`.
//
// ZA has sat on the roadmap's "not next" list for a while, parked because a
// `full` pack needs its own agency, brand and regulator research. It ships here
// at `minimal` instead, which is the tier working as intended: the parking was
// against the PRICE of a full pack, never against breadth.
//
// Tier rules per sg.ts. Everything here is public-registry or published-policy
// fact — agencies are named institutions, suffixes are ZADNA/registry
// eligibility facts, ranges come from the ICASA numbering plan.
//
// English is an official language here and much scam messaging is in it, so
// base's keyword layer contributes more in ZA than in DE or JP. That is a
// reason the pack is useful, not grounds to claim a higher tier: no brands and
// no allowlist means a clean verdict still downgrades to `unknown`.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

// South African public bodies impersonated by scammers. Abbreviation and
// expanded name both listed, since scam copy uses whichever reads as official.
//
// Excludes bare "revenue service" and "home affairs" as institution-kind terms
// rather than specific names, the same bar sg.ts and the targetRegion
// attribution map apply.
const AUTHORITY_MENTIONS = [
  "sars",
  "south african revenue service",
  // "saps" and "hawks" are NOT listed, though both name real ZA bodies (the
  // police service and the Directorate for Priority Crime Investigation).
  // Both are ordinary English words, and the matcher's structural protection
  // cannot help: single tokens are already matched on word boundaries, so
  // these do not leak into other words — they match as whole words, because
  // that is what they are. "The saps and stems of plants need urgent care"
  // plus a link scored 50/likely_scam with a false "Claims to be from a
  // government agency" flag.
  //
  // No coverage is lost that this tier was entitled to claim: the expanded
  // "south african police service" below carries the SAPS case, and a
  // realistic "SAPS Anti-Fraud Unit…" lure still reaches suspicious through
  // it. The Hawks are dropped outright rather than approximated — their
  // expanded name is the Directorate for Priority Crime Investigation, which
  // is listed, and inventing a phrase that separates "the Hawks" the agency
  // from "the hawks" the birds is exactly the researched judgement this tier
  // excludes.
  //
  // The general rule this instance belongs to: an agency list has no
  // substring/word split (unlike BrandSet), so a bare entry that is also a
  // dictionary word has no safe form. Prefer the expanded name.
  "south african police service",
  "directorate for priority crime investigation",
  "sassa",
  "south african social security agency",
  "nsfas",
  "ters",
  "uif",
  "unemployment insurance fund",
  "capitec bank",
  "fsca",
  "financial sector conduct authority",
  "icasa",
  "eskom",
  "city power",
  "home affairs department",
  "department of home affairs",
  "rica",
];

const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const ZA: RegionDefinition = {
  code: "ZA",
  name: "South Africa",
  coverage: "minimal",

  // No national campaign keywords. South Africa has eleven official languages
  // and its scam messaging runs across several of them, which is the SG
  // multilingual argument with a larger number attached.
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
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in South Africa and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to the SAPS or the FSCA.",

  // South African domestic transfers use a bank account number plus a branch
  // code, which is a routing identifier in the same sense as a BSB or a sort
  // code — so unlike DE and SG this region does have one to name.
  bankIdentifiers: ["branch code"],

  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the FSCA publishes public warnings about unauthorised financial service providers of this kind. Do not invest.`,

  typosquatBrands: { substring: [], word: [] },

  // Eligibility-GATED suffixes only.
  //
  // `.gov.za` is restricted to South African government bodies and `.ac.za` to
  // accredited tertiary institutions, both vetted by their respective
  // administrators. `.co.za` is deliberately absent: it is open to any
  // registrant, which is exactly the namespace a scammer buys — the same
  // reasoning as `.co.uk` in GB.
  trustedHostSuffixes: [".gov.za", ".ac.za"],
  brandSuffixes: ["co.za", "org.za", "net.za", "web.za", "ac.za", "gov.za", "za", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  reportingBody: "the South African Police Service (SAPS) or your bank's fraud line",
  reportingUrl: "https://www.saps.gov.za/contacts/contacts.php",

  phonePlan: {
    // ICASA premium ranges in national form WITH the trunk 0, verified against
    // real numbers: +27 86 123 4567 arrives as nationalNumber "861234567", so
    // the authored prefix is "086" and a bare "86" would never fire.
    //
    // 0860 and 0861 are share-call/UAN rather than strictly premium, so they
    // are NOT listed as premium here — they are charged at a local rate, and
    // flagging them as premium would tell a user their own bank's published
    // service line is billing them at elevated rates. 0862 is the
    // premium-rate range proper, and 0900 is the adult/premium service range.
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
    premiumPrefixes: ["0862", "0900"],
    premiumFlag:
      "Premium rate number — South African 0862 and 0900 numbers bill the caller at elevated rates, and a message pushing you to call one is charging you for the privilege",
    // 10111 (police) and 10177 (ambulance) are South Africa's own emergency
    // numbers and are NOT in the universal EMERGENCY_NUMBERS set, which
    // carries 112 but not these. Matched by exact equality, so whole numbers
    // only.
    emergencyNumbers: ["10111", "10177"],
    // South Africa's toll-free range is 0800. libphonenumber classifies the
    // line type, so this copy fires without an authored prefix.
    tollFreeFlag:
      "Free-call 0800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
    // 0860 share-call: billed to the caller at local rates.
    //
    // Names 0860 ONLY, deliberately. 0861 is also a ZA share-call range and the
    // obvious thing to name alongside it — but libphonenumber classifies 0861
    // as **UAN**, not SHARED_COST, and UAN has no branch in analysePhone, so an
    // 0861 number returns lineType "unknown" with no notes at all. Naming it in
    // copy that only ever fires on 0860 would describe a range the flag can
    // never actually be shown for.
    //
    // Verified by parsing rather than assumed: +27 86 0123456 → SHARED_COST,
    // +27 86 1123456 → UAN. This is the same UAN gap JP hit with 0570 Navi
    // Dial, and the same remedy — say only what the reachable branch covers.
    // Giving UAN its own branch is a base-layer change affecting every region
    // and wants its own probe, so it is out of scope for a data-only pack.
    sharedCostFlag:
      "South African 0860 share-call numbers are billed to you at a local rate — a message pressing you to call one to 'verify' an account or claim a refund is a common cost-shifting tactic",
  },
};
