// Singapore — the first `minimal` pack.
//
// A worked example of the tier, and the reference for the ones that follow. It
// exists to prove a claim: that a country can be lifted from "no local rules at
// all" to "we know who your authorities are and where you report this" for
// roughly thirty lines sourced from public registries, with no threat research
// and no reviewer who reads the local languages.
//
// WHAT A MINIMAL PACK MAY CONTAIN
// Facts published by registries and the bodies themselves, verifiable by
// someone with no local knowledge:
//   · authorityMentions   — the agencies scammers impersonate, by name
//   · reportingBody/Url    — where a victim actually goes
//   · trustedHostSuffixes  — registry-GATED suffixes only
//   · phonePlan            — premium ranges and emergency numbers, both public
//
// WHAT IT MUST NOT CONTAIN, AND WHY
// Everything below needs local judgement, and an unreviewed list fails
// asymmetrically — a wrong entry does not degrade detection, it manufactures a
// false accusation or a false reassurance:
//   · typosquatBrands / brandMentions — which brands get impersonated HERE is
//     the most region-specific signal there is, and guessing produces false
//     positives on ordinary commerce. (The globally-squatted names in
//     BaseSignals.typosquatBrands are merged in by buildPack and are not this
//     pack's claim to make or withhold.)
//   · legitDomains — an allowlist short-circuits URL scoring to "safe". A
//     wrong entry is a scam waved through
//   · noLinkSenders — the flag copy asserts an organisation has publicly
//     committed to never sending links. Asserting that about a foreign agency
//     without checking its actual policy fabricates a regulatory claim
//   · urgency keywords — Singapore's scam messaging runs in English, Mandarin,
//     Malay and Tamil. English-only lists against a multilingual population is
//     precisely the gap that holds CA at `partial`
//
// So this pack ships coverage:"minimal", clean verdicts downgrade to
// "unknown", and the value it adds is entirely on the positive side: an
// impersonated agency is named, and a victim is pointed at ScamShield and the
// police rather than at Scamwatch in another country.

import { CHINESE_AUTHORITY_MENTIONS } from "./base";
import type { RegionDefinition } from "./types";

// Agencies and public bodies impersonated in Singapore. Each is a named public
// institution, not a judgement about campaign prevalence — that would need
// research this tier deliberately does without.
const AUTHORITY_MENTIONS = [
  "iras",
  "inland revenue authority",
  "cpf",
  "central provident fund",
  "singpost",
  "singapore police",
  "spf",
  "scamshield",
  "mas",
  "monetary authority of singapore",
  "ica",
  "immigration and checkpoints authority",
  "moh",
  "ministry of health",
  "lta",
  "land transport authority",
  "singpass",
  "cpib",
];

// Foreign authorities with no jurisdiction over Singapore residents.
//
// The Chinese-authority block is SPREAD FROM THE SHARED CONSTANT, never
// retyped. It is diaspora-targeted rather than country-targeted, so every
// national pack carries the same list, and hand-copying it is what produced the
// "Chinese Embassy" gap six times over in 2026-08. Writing this list out by
// hand here reproduced that defect immediately — the hand-written version was
// missing both reversed word orders ("consulate of china", "embassy of china"),
// caught by the shared-list invariant in regions.test.ts.
//
// Interpol and Europol have no direct enforcement powers anywhere, so they
// apply here as they do in the other non-AU packs.
const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol",
  "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

export const SG: RegionDefinition = {
  code: "SG",
  name: "Singapore",
  // Minimal, not partial. The distinction is not effort — it is that this pack
  // carries no brand knowledge at all, where CA's `partial` carries brands, a
  // number plan and agencies and lacks only French keywords.
  coverage: "minimal",

  // No national campaign keywords, for the multilingual reason in the header.
  // Base contributes generic urgency and the voice-clone script, which are
  // language-independent enough to stand on their own.
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
  // Empty by tier rule, not by oversight: see the header. Naming a body here
  // asserts it has publicly committed to sending no links, which this tier has
  // not verified. The flag string is unreachable while the list is empty.
  noLinkSenders: [],
  noLinkSendersFlag: "",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign police or government authority — Interpol, Europol and Chinese police and consular officials have no jurisdiction over residents of Singapore and never contact individuals to demand payment or transfers. Report it to the police via ScamShield.",

  // Singapore transfers run on PayNow and bank account numbers; there is no
  // separate routing identifier equivalent to a BSB or sort code, so the
  // composite falls back to the generic phrasings in base.
  bankIdentifiers: [],

  // Singpass re-registration lures are a known local script, but the phrasing
  // that distinguishes them from genuine mail is exactly the researched
  // judgement this tier excludes. Left empty; base credential-ask signals still
  // fire on the underlying request.
  identityRereg: [],
  identityReregFlag: "",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the Monetary Authority of Singapore maintains a public Investor Alert List of unregulated entities of this kind. Do not invest.`,

  // No NATIONAL brand knowledge — the defining property of the tier, and what
  // this field asserts. The pack claims nothing about which brands Singaporean
  // scammers impersonate, because finding that out is the research a `minimal`
  // pack does not do.
  //
  // buildPack still unions in BaseSignals.typosquatBrands — the few names
  // squatted in every market. That is not a tier violation and not local
  // knowledge: it is the same global list every other pack gets, and it is what
  // makes the structural typosquat rules (substring, keyboard adjacency) reach
  // a country before anyone authors it.
  typosquatBrands: { substring: [], word: [] },
  // `.gov.sg` is restricted to Singapore government agencies, so a brand name
  // under it is genuine. `.edu.sg` is likewise restricted to accredited
  // institutions.
  //
  // `.sg` and `.com.sg` are deliberately absent. Both are open to any
  // registrant with a local presence, which is a business-registration bar and
  // not an eligibility one — exempting them would suppress brand scoring on
  // exactly the domains a scammer registers. Same reasoning as `.co.uk` in the
  // GB pack and `.ca` in CA.
  trustedHostSuffixes: [".gov.sg", ".edu.sg"],
  // Public-registry facts, which is all a `minimal` pack may assert: these are
  // Singapore's registrable namespaces, not a judgement about which brands use
  // which.
  //
  // This is load-bearing now rather than merely forward-looking. With the base
  // brands merged in, `paypal.com.sg` reaches the brand-owns-the-label
  // exemption only because `com.sg` is a multi-label suffix some pack lists —
  // and this is the pack that lists it. It is the same fix the PSL adoption
  // shipped for `barclays.com.sg`, which scored 55/likely_scam on a real bank's
  // own site when SG's suffixes sat outside the checker's union.
  brandSuffixes: ["com.sg", "net.sg", "org.sg", "edu.sg", "gov.sg", "sg", "com", "net", "org"],
  brandMentions: { substring: [], word: [] },
  officialSenderNames: [],

  // No allowlist. An entry here short-circuits URL scoring to "safe", so the
  // bar is verified evidence, and this tier does no verification.
  legitDomains: [],
  legitDomainFlag: "",
  legitDomainDetails: "",

  // senderIdFlag deliberately omitted. Singapore does operate an SMS Sender ID
  // Registry, and a full pack should carry this — but the copy has to state
  // precisely what the register does, and getting that wrong tells a user to
  // trust or distrust a label on incorrect grounds. Left for the promotion to
  // `full`, where it can be written against the IMDA's own wording.

  reportingBody: "the Singapore Police Force via ScamShield",
  reportingUrl: "https://www.scamshield.gov.sg",

  phonePlan: {
    // 1900 is Singapore's premium-rate range (IMDA numbering plan), authored
    // WITH the trunk 0 because analysePhone matches against "0" + the national
    // number libphonenumber returns. Without it the prefix is compared against
    // "01900…" and never matches, which silently made premiumFlag unreachable
    // and skipped the very_high risk bump entirely.
    //
    // US and CA get away with a bare "900" only because libphonenumber
    // independently classifies NANP premium numbers as PREMIUM_RATE; it does
    // not do that for SG, so the prefix rule is the only thing that fires here.
    premiumPrefixes: ["01900"],
    premiumFlag:
      "Premium rate number — Singapore 1900 numbers bill the caller at a premium rate, and a message pushing you to call one is charging you for the privilege",
    // 999 (police) and 995 (fire/ambulance) are already in the universal
    // EMERGENCY_NUMBERS set in phoneIntel. 1799 is the ScamShield helpline.
    //
    // Matched by exact equality, not as a prefix — so this lists whole numbers
    // only. 1800 is deliberately absent: it is the toll-free RANGE, covered by
    // tollFreeFlag below, and listing it here would neither work (equality) nor
    // be correct (it is not an emergency number).
    emergencyNumbers: ["1799"],
    // Singapore's toll-free range is 1800, not the NANP 800. Naming the wrong
    // range told a user checking a genuine 1800 line about "800 numbers" —
    // exactly the unverified regional claim this tier's header forbids.
    tollFreeFlag:
      "Free-call 1800 numbers are commonly faked by scammers posing as banks or government agencies — always verify by calling the number printed on your card or on the organisation's official website",
  },
};
