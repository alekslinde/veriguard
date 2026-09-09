// New Zealand — region pack.
//
// The closest region to Australia in scam playbook and language, which makes it
// the cheapest of the four follow-ups — but the agencies are entirely different
// (IRD not the ATO, NZ Post not Australia Post), so an AU-scored NZ check would
// have been confidently wrong rather than merely thin. That is the whole reason
// this pack exists.
//
// Phase 4 verified NZ numbers classify correctly from libphonenumber, so this is
// the scam layer only.

import type { RegionDefinition } from "./types";
import { CHINESE_AUTHORITY_MENTIONS } from "./base";

// Toll smishing. New Zealand has only three tolled roads (Northern Gateway,
// Tauranga Eastern Link, Takitimu Drive), all run by NZTA Waka Kotahi — a much
// smaller surface than AU or the US, but the campaigns run here anyway, and the
// small road network makes "you have an unpaid toll" no less plausible to a
// recipient who has driven one.
const URGENCY_TOLL = [
  "unpaid toll", "outstanding toll", "overdue toll", "toll payment",
  "toll notice", "toll invoice", "northern gateway",
  "tauranga eastern link", "takitimu drive",
  // Vehicle licensing — the NZ analogue of AU "rego": the rego/WoF pair is the
  // recurring cover, and both are genuinely enforceable, which is the lure.
  "vehicle licence expired", "rego expired", "your rego is due",
  "warrant of fitness expired", "wof expired", "infringement notice",
];

// NZ Post / CourierPost parcel-redelivery lures. Same script as AU, different
// carrier names.
const URGENCY_PARCEL = [
  "parcel held", "package held", "delivery failed", "couldn't be delivered",
  "redelivery fee", "reschedule your delivery", "incomplete address",
  "insufficient address", "shipping fee required", "customs fee",
  "parcel is waiting", "arrange redelivery",
];

// Utility/telco disconnection threats. Chorus runs the UFB fibre network — the
// NZ counterpart to NBN Co — and the retail ISPs and power companies are the
// covers.
const URGENCY_UTILITY = [
  "broadband will be disconnected", "internet will be disconnected",
  "fibre will be disconnected", "service will be disconnected",
  "power will be disconnected", "electricity will be disconnected",
  "chorus technician",
  "account will be cut off",
];

// KiwiSaver phishing — the NZ analogue of AU superannuation and UK pension
// lures. Hardship and first-home withdrawals are the real mechanisms scammers
// mimic; a provider never solicits these by SMS.
const URGENCY_PENSION = [
  "kiwisaver review", "kiwisaver balance", "your kiwisaver account",
  "kiwisaver withdrawal", "access your kiwisaver", "unlock your kiwisaver",
  "kiwisaver hardship", "first home withdrawal",
  "superannuation review", "your retirement savings are at risk",
];

// Fake product-recall lures. Same script as the AU campaign; NZ retailers
// (The Warehouse, Briscoes, Countdown/Woolworths NZ) don't announce recalls by
// SMS either.
const URGENCY_RECALL = [
  "product recall", "safety recall", "recall alert", "recall notice",
  "item has been recalled", "safety review",
];

// IRD refund and Work and Income benefit lures. The IRD does issue automatic
// end-of-year refunds, which is exactly what makes the refund lure land — so
// these compound with an authority mention rather than firing alone.
const URGENCY_TAX = [
  "tax refund", "tax rebate", "you are eligible for a refund",
  "ird refund", "refund is waiting", "claim your refund",
  "tax assessment is ready", "cost of living payment",
  "winter energy payment",
  "working for families", "accommodation supplement",
  "best start payment",
];

// IRD debt / enforcement coercion. The threat framing reaches a different
// demographic than the refund lures — the self-employed and contractors around
// the 7 July return deadline. The IRD does pursue genuine debts, so these lean
// on the compound scorer: an "ird" authority hit alongside one of these is what
// escalates.
//
// "arrest warrant" is deliberately absent — it lives in the foreign-authority
// group, and listing it twice would double-score. Same convention as AU and GB.
const URGENCY_TAX_THREAT = [
  "tax debt", "outstanding tax", "overdue tax", "unpaid tax",
  "tax liability", "ird debt", "ird arrears",
  "tax audit", "under audit", "audit notice",
  "ird number suspended", "your ird number has been suspended",
  "deduction notice", "legal action will be taken", "warrant issued",
  "your assets will be", "bailiff", "debt collection agency",
];

// Foreign-authority impersonation. The NZ pattern mirrors Australia's closely —
// the same Chinese-police script aimed at student and migrant communities, which
// NZ Police and CERT NZ have both issued advisories about.
const URGENCY_FOREIGN_AUTHORITY = [
  "arrest warrant", "detention order", "deportation notice",
  "money laundering investigation", "your visa will be cancelled",
  "involved in criminal activity",
];

// Digital-identity re-registration phishing. RealMe is the NZ government's
// single sign-on — the direct analogue of myID and GOV.UK One Login — and the
// myIR (IRD) login is the long-standing target. Long multi-word phrases keep
// false positives low.
const IDENTITY_REREG = [
  "re-verify your identity", "verify your identity to continue",
  "your identity verification has expired", "complete your identity verification",
  "your realme account", "realme verification", "reactivate your realme",
  "your myir account has been suspended", "verify your myir account",
  "reactivate your myir", "set up your new digital identity",
];

// Matched case-insensitively by the scorer, so entries are lower-case only.
// Short acronyms here ("ird", "acc", "dia", "inz", "fma") are matched on word
// boundaries by mentionsAny in scamDetector, not as bare substrings — otherwise
// "ird" fires inside "weird" and "third", and "acc" inside "account", which
// flagged "your account is fine" as government impersonation. The boundary rule
// is automatic for entries of 3 characters or fewer, so they are safe to list.
const AUTHORITY_MENTIONS = [
  "ird", "inland revenue", "myir",
  "work and income", "winz", "msd", "ministry of social development",
  "acc", "accident compensation",
  "nzta", "waka kotahi", "nz transport agency",
  "immigration new zealand", "inz",
  "te whatu ora", "health new zealand", "ministry of health",
  "realme", "govt.nz",
  // Law enforcement and the fraud-reporting bodies — the reporting authority is
  // itself used as a lure ("we're investigating fraud on your account").
  "nz police", "new zealand police", "police",
  "cert nz", "netsafe", "dia", "department of internal affairs",
  // Financial regulators. The FMA never cold-calls consumers, and
  // "FMA-registered" is a common false-legitimacy claim.
  "fma", "financial markets authority", "commerce commission", "comcom",
  "reserve bank",
  // NZ Post is a state-owned enterprise and functions as the parcel-lure
  // authority exactly as Australia Post does.
  "nz post", "nzpost", "new zealand post", "courierpost",
];

// NZ bodies that have publicly confirmed they do not send links in unsolicited
// SMS. The IRD states it never sends links asking for personal details; Work and
// Income, ACC and NZ Post carry equivalent published guidance. Scoped to the
// confirmed no-link senders so the flag wording stays accurate — Te Whatu Ora
// and NZTA do legitimately send links (appointment reminders, rego renewals).
const NO_LINK_SENDERS = [
  "ird", "inland revenue", "myir",
  "work and income", "winz", "msd",
  "acc", "nz post", "nzpost", "new zealand post",
];

// Interpol/Europol plus the shared Chinese-authority terms (see base.ts).
const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol", "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

// NZ-specific identifiers and schemes solicited by scammers. National terms
// (IRD number, NHI, KiwiSaver) with no meaning in other markets, so they sit
// here rather than in the base request list.
//
// No bank-routing entry: NZ account numbers embed the bank and branch in the
// number itself, so there is no separate BSB/sort-code term to solicit. The
// bond composite reads bankIdentifiers, which carries the NZ phrasing.
const REQUEST_WORDS = [
  "ird number", "myir login", "realme login",
  "nhi number", "national health index",
  "driver licence number", "community services card",
  // KiwiSaver access phishing — the NZ counterpart to the AU super terms.
  // Bare "kiwisaver" only: this list is substring-matched, so "kiwisaver funds"
  // and "release kiwisaver" would each score the same phrase twice. The access
  // framing is already carried by the pension urgency group above.
  "kiwisaver",
  // Bank-transfer terminology used in NZ authorised-push-payment fraud.
  // "bank account number" is deliberately absent — base already lists "account
  // number", which substring-matches it, so listing both double-scores.
  "account suffix",
];

// FMA-licensed providers are prohibited from claiming regulator endorsement, and
// the FMA never endorses investments — so these are exclusively false-legitimacy
// claims. The FMA maintains a public warning list. Mirrors the AU "verified by
// asic" and GB "fca approved" entries.
const REWARD_WORDS = [
  "fma approved", "fma-approved", "fma registered", "verified by fma",
  "government backed investment",
  // Deepfake media-brand investment lures (#169 / FMA NZ advisory, April 2026).
  // Fake articles carrying RNZ/TVNZ/NZ Herald logos with deepfaked politicians
  // endorse fake trading platforms. These "as seen on <trusted media>"
  // legitimacy-cover phrases are essentially always scam in an investment-offer
  // context and compound with the FMA-endorsement claims above.
  "as seen on rnz", "as featured in nz herald", "as seen on tvnz",
];

// Crown and agency domains. These are exact-or-subdomain matched by checkUrl, so
// "govt.nz" covers the whole estate (ird.govt.nz, workandincome.govt.nz); the
// specific entries below are the non-govt.nz official domains that would
// otherwise miss.
const LEGIT_DOMAINS = [
  "govt.nz", "ird.govt.nz", "workandincome.govt.nz", "msd.govt.nz",
  "acc.co.nz", "nzta.govt.nz", "immigration.govt.nz",
  "tewhatuora.govt.nz", "health.govt.nz",
  "realme.govt.nz", "police.govt.nz",
  "cert.govt.nz", "netsafe.org.nz", "consumerprotection.govt.nz",
  "fma.govt.nz", "comcom.govt.nz", "rbnz.govt.nz",
  "nzpost.co.nz",
];

// Cover brands for callback/TOAD phishing — NZ-operating additions to the base
// list. Spark and 2degrees appear in fake-renewal and account-suspension
// invoices, the same role Currys plays in the UK.
const CALLBACK_BRANDS = ["spark", "2degrees", "noel leeming"];

// Typosquatted brands (URL checker). Matched with hostname.includes(), so
// entries must be long enough to be distinctive — short and dictionary-colliding
// names go in the word list below.
const TYPOSQUAT_BRANDS = [
  // The big four Australian-owned banks plus Kiwibank and the local players —
  // the dominant NZ phishing targets. Note "anz" is deliberately in the word
  // list below, not here.
  "kiwibank", "westpac", "bnznz", "bnzbank", "asbbank", "aszbank",
  "cooperativebank", "tsbbank", "heartlandbank", "rabobank",
  // Government and agency portals.
  "ird-govt", "irdgovt", "inlandrevenue", "myir", "realme",
  "workandincome", "nzta", "wakakotahi", "immigrationnz",
  // Health and post.
  "tewhatuora", "nzpost", "courierpost",
  // Telcos and ISPs.
  "spark", "vodafonenz", "2degrees", "slingshot", "orcon",
  // Retail and delivery — the local retailers are impersonated in refund
  // lures. paypal/amazon/netflix moved to base.
  "trademe", "thewarehouse", "briscoes",
  "countdown", "woolworthsnz", "mightyape",
  // Energy retailers — billing and rebate phishing.
  "mercuryenergy", "meridianenergy", "contactenergy", "genesisenergy",
  // Crypto exchanges. The three global names are in base; Easy Crypto is the
  // NZ-specific addition.
  "easycrypto",
];

// Brands too short or too dictionary-colliding for substring matching. "anz",
// "asb" and "bnz" are three-letter bank names that collide inside longer strings
// ("anz" appears in "franzia" and "manzanita"), and "ird" fires on "third",
// "bird" and "weird" — matched on separator boundaries instead, so
// "anz-secure.top" hits and "franzia-wines.com" doesn't.
const TYPOSQUAT_WORD_BRANDS = ["anz", "asb", "bnz", "tsb", "ird", "acc", "nzp"];

// Consumer (non-government) brands impersonated in SMS bodies.
const BRAND_MENTIONS = [
  // Delivery — a high-volume NZ smishing category.
  "nz post", "nzpost", "new zealand post", "courierpost", "aramex",
  "uber eats", "ubereats", "menulog", "delivereasy",
  // Telcos and ISPs.
  "spark", "vodafone", "one nz", "2degrees", "slingshot", "orcon", "chorus",
  // Energy retailers — billing and rebate SMS scams.
  "mercury energy", "mercuryenergy", "meridian energy", "meridianenergy",
  "contact energy", "contactenergy", "genesis energy", "genesisenergy",
  // Retail and streaming.
  "trade me", "trademe", "the warehouse", "thewarehouse", "briscoes",
  "countdown", "mighty ape", "mightyape", "amazon", "netflix",
  // Crypto.
  "coinbase", "binance", "kraken", "easy crypto", "crypto exchange",
  // Trusted NZ news brands, impersonated in deepfake investment articles
  // (#169 / FMA NZ, April 2026). "nz herald" is a multi-word phrase with no
  // collision risk, so it sits here; the short "rnz"/"tvnz" go in the word list
  // below for \b-boundary matching.
  "nz herald",
];

// Short names that need word-boundary matching in message text. "anz", "asb"
// and "bnz" as bare substrings would fire inside ordinary words, and "acc" is
// a fragment of "account" — which appears in almost every scam message, so
// substring matching it would flag essentially everything.
const BRAND_MENTION_WORDS = [
  "anz", "asb", "bnz", "tsb",
  // Trusted NZ news brands (#169). Short/distinctive acronyms matched on \b
  // boundaries so "rnz" can't fire inside a longer token; the full "nz herald"
  // phrase is in the substring list above.
  "rnz", "tvnz",
];

// Names whose genuine mail always comes from a .govt.nz / .co.nz domain, so a
// mismatched sender domain is textbook impersonation. Narrower than
// brandMentions by design — only bodies whose real mail is reliably on an NZ
// domain, so a mismatch means something.
const OFFICIAL_SENDER_NAMES = [
  "ird", "inland revenue", "work and income", "acc", "nzta",
  "nz post", "realme",
  "kiwibank", "westpac", "asb", "bnz", "anz",
];

// ── Number plan (NZ Telecommunications Forum) ────────────────────────────────
// libphonenumber handles parsing, validity, line type and country for NZ
// correctly — Phase 4 specifically verified NZ mobile line-type detection, which
// is why the `max` metadata build was chosen over `min`. What stays ours is the
// scam-relevant reading of the plan.

// NZ geographic area codes, national (0-prefixed) form. Only five regional codes
// exist, so unlike the US this is a complete map rather than a sample.
const NZ_AREA_CODES: Record<string, string> = {
  "09": "Auckland / Northland",
  "07": "Waikato / Bay of Plenty",
  "06": "Taranaki / Manawatū / Hawke's Bay",
  "04": "Wellington",
  "03": "South Island",
};

export const NZ: RegionDefinition = {
  code: "NZ",
  name: "New Zealand",
  coverage: "full",

  urgency: {
    foreignAuthority: URGENCY_FOREIGN_AUTHORITY,
    toll: URGENCY_TOLL,
    parcel: URGENCY_PARCEL,
    utility: URGENCY_UTILITY,
    pension: URGENCY_PENSION,
    recall: URGENCY_RECALL,
    tax: URGENCY_TAX,
    taxThreat: URGENCY_TAX_THREAT,
  },

  authorityMentions: AUTHORITY_MENTIONS,
  noLinkSenders: NO_LINK_SENDERS,
  noLinkSendersFlag:
    "Inland Revenue, Work and Income, ACC and NZ Post all state they never ask for personal or payment details by text — a message from one of these with a clickable link is a scam. Log in at ird.govt.nz or the agency's own site directly instead.",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over New Zealand residents and never contact individuals to demand payment, and foreign police and consular officials have no jurisdiction in New Zealand. Report it to CERT NZ or Netsafe.",

  // NZ bank account numbers embed the bank and branch, so there is no separate
  // routing identifier equivalent to a BSB or sort code — the redirect ask is
  // for the account number itself. Listed once: "bank account number" contains
  // "account number", and the composite matches by substring, so both would
  // fire on one phrase.
  bankIdentifiers: ["account number"],

  identityRereg: IDENTITY_REREG,
  identityReregFlag:
    "RealMe / myIR re-registration lure — Inland Revenue and RealMe never send unsolicited requests to 're-verify' or 'reactivate' your account. Go to ird.govt.nz or realme.govt.nz directly, never via a message link.",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the FMA has warned that platforms of this kind are scams, and it maintains a public warning list. Do not invest.`,

  typosquatBrands: { substring: TYPOSQUAT_BRANDS, word: TYPOSQUAT_WORD_BRANDS },
  // Restricted registries only. `.govt.nz` is limited to government agencies and
  // `.mil.nz` to the Defence Force, so a brand name under either is genuine.
  //
  // `.co.nz` is deliberately absent even though it is New Zealand's most common
  // suffix: it is an open registration sold to anyone, so exempting it would
  // suppress brand scoring on exactly the domains scammers register —
  // `kiwibank-secure-verify.co.nz` would score no brand signal at all. Genuine
  // brands there are covered by legitDomains and the registrable-label rule.
  trustedHostSuffixes: [".govt.nz", ".mil.nz"],
  brandSuffixes: ["co.nz", "net.nz", "org.nz", "govt.nz", "mil.nz", "ac.nz", "school.nz", "nz", "com", "net", "org"],
  brandMentions: { substring: BRAND_MENTIONS, word: BRAND_MENTION_WORDS },
  officialSenderNames: OFFICIAL_SENDER_NAMES,

  legitDomains: LEGIT_DOMAINS,
  legitDomainFlag: "Verified New Zealand government domain",
  legitDomainDetails:
    "This looks like a legitimate New Zealand government website. Still be cautious about what you're entering.",

  // senderIdFlag deliberately omitted. New Zealand has no equivalent of the ACMA
  // Sender ID register — the NZTF operates a voluntary industry code rather than
  // a labelling scheme, so there is no "Unverified" label for a scammer to
  // explain away. Asserting one would be false, and the rule is skipped where
  // the field is absent.

  reportingBody: "CERT NZ",
  // CERT NZ has merged into the NCSC; cert.govt.nz (already in legitDomains
  // above) resolves to the successor body that now takes the reports.
  reportingUrl: "https://www.cert.govt.nz",

  phonePlan: {
    // 0900 is the NZ premium-rate range. libphonenumber classifies it, but the
    // same reasoning as AU applies: we want the "this will cost you money"
    // warning to survive regardless of how the library rates validity.
    premiumPrefixes: ["0900"],
    premiumFlag:
      "Premium rate number — calling or texting an 0900 number costs significantly more than a standard call",
    areaCodes: NZ_AREA_CODES,
    // 111 is New Zealand's emergency number and is already in the universal
    // EMERGENCY_NUMBERS set in phoneIntel; *555 (non-emergency traffic) and 105
    // (police non-emergency) are NZ-specific additions.
    emergencyNumbers: ["105", "*555"],
    tollFreeFlag:
      "Free-call 0800 numbers are commonly faked by scammers posing as banks, Inland Revenue or NZ Post — always verify by calling the number printed on your card or on the organisation's official website",
    // No sharedCostFlag: NZ has no shared-cost tier equivalent to AU's 13xx or
    // the UK's 03xx, so there is nothing to describe.
  },

  callbackBrands: CALLBACK_BRANDS,
  // Domestic exchange; binance/coinbase/kraken come from base.
  cryptoExchanges: ["easycrypto"],
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
};
