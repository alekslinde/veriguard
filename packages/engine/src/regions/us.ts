// United States — region pack.
//
// The first of the four cheap follow-ups the Phase 5 sequencing calls for
// (US / NZ / CA / IE): the pack interface stabilised in Phase 5, and Phase 4
// established that US numbers classify correctly from libphonenumber alone, so
// this is the scam layer only — agencies, brands, legit domains — with no
// number-plan work beyond premium ranges.
//
// Signals here are US-specific: the IRS and the SSA, USPS, the DMV, Medicare
// and the federal benefit programmes, and the national banks. Anything that
// would hold true in another market belongs in ./base.ts instead.

import type { RegionDefinition } from "./types";
import { CHINESE_AUTHORITY_MENTIONS } from "./base";

// Toll smishing. The dominant US SMS scam of 2024-2026 by volume — the FBI's
// IC3 issued a dedicated advisory. E-ZPass covers most of the eastern
// seaboard, with SunPass (FL), FasTrak (CA) and TxTag (TX) the regional
// equivalents. The "small unpaid toll plus a late fee" framing is near
// universal across the campaign.
const URGENCY_TOLL = [
  "unpaid toll", "outstanding toll", "toll payment", "toll charge",
  "toll invoice", "final toll notice",
  "e-zpass", "ezpass", "sunpass", "fastrak", "txtag", "peachpass",
  "toll violation",
  // The DMV registration-suspension variant — the US analogue of the AU "rego"
  // escalation, and the same threat shape: your vehicle's legal status.
  "vehicle registration will be suspended", "registration suspension",
  "dmv record",
];

// USPS / UPS / FedEx redelivery lures. "Shipping address is incomplete" is the
// dominant US variant, harvesting card details behind a small redelivery fee.
const URGENCY_PARCEL = [
  "parcel held", "package held", "delivery failed", "couldn't be delivered",
  "redelivery fee", "reschedule your delivery", "incomplete address",
  "shipping address is incomplete", "shipping fee required", "customs fee",
  "package is waiting", "arrange redelivery", "delivery attempt failed",
];

// Utility shutoff threats. Unlike the AU/UK broadband framing, the dominant US
// script is a same-day *power* disconnection demanding payment by prepaid card
// — regulated utilities never do this, which is what makes it scoreable.
const URGENCY_UTILITY = [
  "service will be disconnected", "power will be shut off",
  "electricity will be disconnected", "utility will be disconnected",
  "scheduled for disconnection", "disconnection notice",
  "past due utility",
  "internet will be disconnected",
];

// Retirement-account phishing — the US analogue of AU superannuation and UK
// pension lures. 401(k) and IRA rollover fraud is the recurring script, plus
// the perennial "your Social Security benefits are suspended" call.
const URGENCY_PENSION = [
  "401k rollover", "401(k) rollover", "ira rollover", "retirement account review",
  "your retirement account is at risk", "pension buyout",
  "social security benefits suspended", "benefits will be suspended",
  "your social security number has been suspended",
];

// Veterans-benefit lures, gated (D6 / #274 / FTC consumer alert 24 Aug 2026).
// Scammers impersonate veterans' benefit programmes to extract personal
// information and up-front fees.
//
// These are NOT in URGENCY_PENSION and never score alone, which is a departure
// from the filing issue's proposal. "va" is already an authorityMention (+25),
// so a flat entry here would stack on top of it and push ordinary VA
// correspondence from suspicious to likely_scam. Legitimate veteran-support
// organisations use this exact vocabulary, and the population this would
// misfire on is elderly veterans reading real benefit mail — the wrong people
// to hand a false alarm.
//
// The benign case this protects: "Your VA benefits claim assistance
// appointment is confirmed for Tuesday". That measured 37/suspicious even with
// this list gated, because "claim" in "benefits claim assistance" was scoring
// as a reward word on top of the "va" authority mention. Fixed separately in
// the claimIsAlwaysNoun heuristic in scamDetector — see
// __tests__/claimNounSense.test.ts — and it now measures 0/safe.
//
// The composite in scamDetector requires a link or an information ask
// alongside, which is what separates the lure from the appointment reminder.
// "champva" and "tricare for life" stay out entirely: they are real programme
// names carrying no scam signal of their own.
const VETERANS_BENEFIT_PHRASES = [
  "veterans savings program", "va benefits claim assistance",
  "veteran benefit entitlement review",
];

// Fake product-recall lures. Same script as the AU/UK campaigns; the CPSC
// publishes genuine recalls, and no US retailer announces them by SMS.
const URGENCY_RECALL = [
  "product recall", "safety recall", "recall alert", "recall notice",
  "item has been recalled", "safety review", "cpsc recall",
];

// IRS refund and federal benefit lures. Economic-impact payments and the
// various relief programmes are real, which is exactly why they work as bait —
// so these compound with an authority mention rather than firing alone.
const URGENCY_TAX = [
  "tax refund", "tax rebate", "you are eligible for a refund",
  "irs refund", "refund is waiting", "claim your refund",
  "economic impact payment", "stimulus payment", "stimulus check",
  "tax credit you are owed", "snap benefits", "ebt card",
  "medicaid renewal", "medicare card",
];

// IRS collection / enforcement coercion. The IRS initiates contact by mail, not
// by phone or text, and never demands payment by gift card or wire — the
// dominant tell. Threat framing reaches a different demographic than the refund
// lures (the self-employed, older taxpayers) around the April filing deadline.
//
// "arrest warrant" is deliberately absent — it lives in the foreign-authority
// group, and listing it twice would double-score. Same convention as AU and GB.
const URGENCY_TAX_THREAT = [
  "tax debt", "outstanding tax", "overdue tax", "unpaid tax",
  "tax liability", "irs debt", "back taxes",
  "tax lien", "levy on your", "wage garnishment", "garnish your wages",
  // The IRS "final notice of intent to levy" letter (LT11/Letter 1058) is a
  // real instrument, which is exactly why the phrasing is impersonated. Listed
  // as "intent to levy" rather than the full sentence: "final notice" sits in
  // URGENCY_GENERIC and would shadow the longer form, scoring one phrase twice
  // (#234). This carries the levy threat on its own, so the pair no longer
  // depends on a duplicate hit — the IRS notifies by post, never by SMS.
  "intent to levy",
  "irs audit", "under audit",
  "your ssn has been suspended", "ssn suspended", "ssn compromised",
  "legal action will be taken", "warrant issued",
  "federal charges", "your assets will be frozen",
];

// Foreign / federal-authority impersonation. The US pattern is dominated by
// impersonated federal agencies rather than foreign police — the FBI, DEA and
// USCIS scripts, plus the same Chinese-police script run against Chinese
// student and immigrant communities (the FBI has issued matching alerts).
const URGENCY_FOREIGN_AUTHORITY = [
  "arrest warrant", "detention order", "deportation notice",
  "money laundering investigation", "your visa will be cancelled",
  "your visa will be revoked", "involved in criminal activity",
  "immigration violation",
  // Jury-duty / bench-warrant SMS (D4 / #275 / FTC consumer alert Jun 2026;
  // US Courts advisory 2026; Lancaster County Sheriff AI-voice report). The
  // call side of this script already scores well — an "us marshals" authority
  // hit plus urgency reaches likely_scam on its own. The gap these close is the
  // SMS-only variant, which carries a payment link but no callback and no
  // agency name, and measured only 35/suspicious before they were added.
  //
  // Real courts summon jurors by postal mail and never demand payment, so
  // "missed jury duty" in a text is effectively always a scam.
  //
  // Bare "bench warrant" is NOT listed: it is ordinary legal-professional
  // vocabulary, and "the bench warrant was recalled by the court this morning"
  // — routine solicitor-to-client correspondence — scored an urgency hit on it.
  // The scam always addresses the recipient personally, so the second-person
  // forms carry the signal without touching case-discussion language. Neither
  // is shadowed by "warrant issued" in URGENCY_TAX_THREAT, since that string
  // appears in neither.
  "missed jury duty", "failed to appear for jury duty",
  "bench warrant for your arrest", "bench warrant has been issued for you",
  "bench warrant against you", "a bench warrant for you",
];

// Identity re-registration phishing. The US has no single national digital
// identity, so the analogue is ID.me and Login.gov — the federal sign-on
// providers used for IRS, SSA and VA accounts — plus the perennial "your Social
// Security account needs re-verification" lure. Long multi-word phrases keep
// false positives low.
const IDENTITY_REREG = [
  "re-verify your identity", "verify your identity to continue",
  "your identity verification has expired", "complete your identity verification",
  "your id.me account", "verify with id.me", "id.me verification is pending",
  "set up your login.gov", "login.gov verification",
  "reactivate your social security account",
  "your ssa account has been suspended", "verify your ssa account",
];

// Matched case-insensitively by the scorer, so entries are lower-case only.
// Short acronyms here ("irs", "ssa", "ice", "sec", "cms", "dhs", "fbi", "dea",
// "ftc") are matched on word boundaries by mentionsAny in scamDetector, not as
// bare substrings — otherwise "ssa" fires inside "message", "ice" inside
// "service" and "notice", and "sec" inside "security", which would flag almost
// every message as SEC impersonation. The boundary rule is automatic for entries
// of 3 characters or fewer, so they are safe to list.
const AUTHORITY_MENTIONS = [
  "irs", "internal revenue service",
  "ssa", "social security administration", "social security",
  "medicare", "medicaid", "cms", "centers for medicare",
  "uscis", "immigration and customs", "ice", "dhs", "homeland security",
  "dmv", "department of motor vehicles",
  "usps", "united states postal service", "postal service",
  "va", "veterans affairs",
  // Law enforcement and the fraud-reporting bodies — the reporting authority is
  // itself used as a lure ("we're investigating fraud on your account").
  "fbi", "dea", "us marshals", "police", "sheriff",
  "ftc", "federal trade commission",
  // Financial regulators and the deposit insurer. The SEC and FDIC never
  // cold-call consumers, and "FDIC insured" is a common false-legitimacy claim.
  "sec", "securities and exchange commission", "fdic", "cfpb", "finra",
  // E-ZPass and the state toll authorities function as the toll-lure authority
  // exactly as Linkt does for AU.
  "e-zpass", "ezpass", "sunpass", "fastrak", "txtag",
  // Fabricated IRS unit name (D4 / #181 / IRS Security Summit advisory Aug
  // 2026). No "Tax Resolution Oversight Department" exists within the IRS —
  // the advisory says so explicitly — so this is not an agency name that
  // needs verifying but an invented one that only appears in the
  // impersonation script. The campaign targets tax professionals with a
  // claim that their preparer account has been flagged, but a member of the
  // public may forward the message to check it.
  //
  // Only the full department name is listed. The roadmap also proposed the
  // bare "tax resolution oversight", but that prefix is ordinary
  // tax-industry English ("our tax resolution oversight process") and
  // "tax resolution" is a term of art among the very professionals this
  // campaign targets — matching it would flag their legitimate mail as
  // government impersonation.
  "tax resolution oversight department",
];

// US bodies that have publicly confirmed they do not initiate contact by text.
// The IRS states it never initiates contact by email, text or social media; the
// SSA and Medicare carry equivalent published guidance; and USPS states it never
// sends unsolicited texts with links (the USPS "smishing" advisory). Scoped to
// the confirmed no-link senders so the flag wording stays accurate — the DMV and
// the VA do send legitimate links in some states and programmes.
const NO_LINK_SENDERS = [
  "irs", "internal revenue service",
  "ssa", "social security administration", "social security",
  "medicare", "usps", "united states postal service",
];

// Interpol/Europol plus the shared Chinese-authority terms (see base.ts).
const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol", "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

// US-specific identifiers and schemes solicited by scammers. National terms
// (Social Security number, routing number, 401k) with no meaning in other
// markets, so they sit here rather than in the base request list.
//
// "social security" is deliberately absent: the base list already carries it,
// and requestWords is substring-matched, so listing it again would score one
// phrase twice. The longer "social security number" would collide the same way.
const REQUEST_WORDS = [
  "ssn", "routing number", "aba number",
  "driver's license number", "drivers license number",
  "medicare number", "medicaid number", "green card number",
  // Retirement-account phishing — the US counterparts to the AU super terms.
  "401k", "401(k)", "ira account", "roth ira",
  // Payment rails specific to US consumer fraud. Zelle, Venmo and Cash App are
  // the dominant irreversible-transfer instruments in US authorised-push-payment
  // fraud, and prepaid-card demands are the classic IRS-impersonation tell.
  "zelle", "venmo", "cash app", "cashapp",
  "wire transfer to", "green dot", "moneypak", "prepaid card",
];

// SEC- and FINRA-registered firms are prohibited from claiming regulator
// endorsement, and neither body endorses investments — so these are exclusively
// false-legitimacy claims. FDIC insurance covers deposits, never investments,
// which makes "FDIC guaranteed returns" a self-contradicting claim. Mirrors the
// AU "verified by asic" and GB "fca approved" entries.
const REWARD_WORDS = [
  "sec approved", "sec-approved", "sec registered", "verified by sec",
  "finra approved", "fdic guaranteed", "fdic insured returns",
  "government backed investment",
];

// Federal and agency domains. These are exact-or-subdomain matched by checkUrl,
// so "irs.gov" covers the whole estate; the specific entries below are the
// non-.gov official domains that would otherwise miss.
const LEGIT_DOMAINS = [
  "irs.gov", "ssa.gov", "usa.gov", "medicare.gov", "medicaid.gov",
  "usps.com", "uscis.gov", "dhs.gov", "va.gov",
  "ftc.gov", "consumer.ftc.gov", "reportfraud.ftc.gov", "identitytheft.gov",
  "fbi.gov", "ic3.gov",
  "sec.gov", "investor.gov", "fdic.gov", "consumerfinance.gov", "finra.org",
  "cisa.gov", "login.gov", "id.me",
];

// Cover brands for callback/TOAD phishing — US-operating additions to the base
// list. Geek Squad and Norton renewal invoices are the archetypal US TOAD lure;
// the base list already carries both, so this adds the retail and streaming
// brands that appear in fake purchase-confirmation invoices.
const CALLBACK_BRANDS = ["walmart", "target", "verizon", "at&t", "xfinity"];

// Typosquatted brands (URL checker). Matched with hostname.includes(), so
// entries must be long enough to be distinctive — short and dictionary-colliding
// names go in the word list below.
const TYPOSQUAT_BRANDS = [
  // National and regional banks — the dominant US phishing targets.
  "chase", "wellsfargo", "bankofamerica", "citibank", "capitalone",
  "usbank", "pncbank", "truist", "regions-bank", "navyfederal",
  "americanexpress", "discovercard", "schwab", "fidelity",
  // Government and agency portals.
  "irsgov", "irs-gov", "ssa-gov", "socialsecurity", "medicare-gov",
  "uscis", "dmv-gov", "usps-tracking", "uspstrack",
  // Toll authorities — the highest-volume US smishing category.
  "ezpass", "e-zpass", "sunpass", "fastrak", "txtag",
  // Payment apps and processors. These are the irreversible rails, so a
  // credential phish here converts directly to loss. PayPal is global and
  // lives in base; the rest are US rails.
  "zelle", "venmo", "cashapp", "square-cash",
  // Telcos and ISPs.
  "verizon", "xfinity", "comcast", "tmobile", "spectrum",
  // Retail and delivery. amazon/netflix moved to base.
  "walmart", "target-shop", "costco", "bestbuy",
  "fedex", "ups-delivery", "doordash", "instacart",
  // Crypto exchanges. coinbase/binance/kraken are in base; Gemini is the
  // US-specific addition.
  "gemini-exchange",
];

// Brands too short or too dictionary-colliding for substring matching. "ups"
// fires on "groups" and "startups", "att" on "attention" and "attachment", and
// "usaa" is short enough to collide inside longer strings — matched on separator
// boundaries instead, so "ups-tracking.top" hits and "startups.com" doesn't.
//
// Bare "chase" is deliberately NOT here: it is in the substring list above
// because it is long enough to be distinctive, and moving it to word matching
// would miss "chase-secure-login.top" — the hyphen splits it into a label word
// either way, but substring matching also catches "securechaseonline.top".
const TYPOSQUAT_WORD_BRANDS = ["ups", "att", "usaa", "pnc", "amex", "hsa"];

// Consumer (non-government) brands impersonated in SMS bodies.
const BRAND_MENTIONS = [
  // Delivery — the US's highest-volume smishing category after tolls.
  "usps", "fedex", "doordash", "instacart", "grubhub",
  "uber eats", "ubereats",
  // Telcos and ISPs.
  "verizon", "xfinity", "comcast", "t-mobile", "tmobile", "spectrum",
  // Retail and streaming.
  "amazon", "walmart", "target", "costco", "netflix", "best buy",
  // Payment apps — used in the "did you authorise this Zelle payment?" script,
  // which is the entry point to the US bank-impersonation tag-team scam.
  "zelle", "venmo", "cash app", "cashapp", "paypal",
  // Crypto.
  "coinbase", "binance", "kraken", "crypto exchange",
];

// Short names that need word-boundary matching in message text. "ups" as a bare
// substring fires on "groups"; "att" on "attention", which appears in almost
// every scam message.
const BRAND_MENTION_WORDS = ["ups", "att", "usaa"];

// Names whose genuine mail always comes from a .gov or the brand's own domain,
// so a mismatched sender domain is textbook impersonation. Narrower than
// brandMentions by design — only bodies whose real mail is reliably on a known
// domain, so a mismatch means something.
const OFFICIAL_SENDER_NAMES = [
  "irs", "internal revenue service", "social security administration",
  "medicare", "usps", "uscis",
  "chase", "wells fargo", "bank of america", "citibank", "capital one",
  "american express", "discover",
];

// ── Number plan (NANP) ───────────────────────────────────────────────────────
// libphonenumber handles parsing, validity, line type and country for US
// numbers correctly (verified in Phase 4 — the NANP is its best-covered plan).
// What stays ours is the scam-relevant reading: which ranges cost money and
// which get impersonated.
//
// Deliberately NO areaCodes map. The NANP has ~300 US area codes and, unlike
// the UK and AU plans, they carry almost no scam signal: number portability and
// VoIP mean an area code no longer indicates where a caller is. Attributing
// "212 → New York" would state a location we cannot actually stand behind, which
// is exactly the confident-but-wrong failure the guiding constraints warn about.
// A miss degrades to "no area attributed", which is honest.

export const US: RegionDefinition = {
  code: "US",
  name: "United States",
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

  gatedBenefitPhrases: VETERANS_BENEFIT_PHRASES,
  authorityMentions: AUTHORITY_MENTIONS,
  noLinkSenders: NO_LINK_SENDERS,
  noLinkSendersFlag:
    "The IRS, the Social Security Administration, Medicare and USPS all state they never initiate contact by text message — a text from one of these with a clickable link is a scam. The IRS in particular only initiates contact by mail. Go to the agency's .gov site directly instead.",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over US residents and never contact individuals to demand payment, and foreign police and consular officials have no jurisdiction in the United States. Report it to the FTC at reportfraud.ftc.gov.",

  bankIdentifiers: ["routing number", "aba number"],

  identityRereg: IDENTITY_REREG,
  identityReregFlag:
    "Federal sign-on re-registration lure — the IRS, the SSA, ID.me and Login.gov never send unsolicited requests to 're-verify' or 'reactivate' your account. Go to the agency's .gov site directly, never via a message link.",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the SEC and the FTC have warned that platforms of this kind are scams, and the SEC maintains a public investor alert list. Do not invest.`,

  typosquatBrands: { substring: TYPOSQUAT_BRANDS, word: TYPOSQUAT_WORD_BRANDS },
  // Restricted registries only. `.gov` requires US government status and `.mil`
  // is limited to the Department of Defense, so a brand name under either is
  // genuine.
  //
  // `.com` and `.us` are deliberately absent: both are open registrations, and
  // exempting `.com` would disable brand scoring across most of the web —
  // `chase-secure-verify.com` would score no brand signal at all. Genuine brands
  // on `.com` are handled by the registrable-label rule in checkUrl and by
  // legitDomains, not by a blanket suffix exemption.
  trustedHostSuffixes: [".gov", ".mil"],
  // The US has no second-level convention for commerce — brands are on the
  // gTLDs directly. `.gov` and `.mil` are single-label suffixes.
  //
  // `gov.us` and `state.us` are deliberately absent: neither is a public
  // suffix. The hand-written list this replaced carried both, where they
  // matched nothing — the real US state convention is `<state>.us` (`ak.us`,
  // `ca.us`), which the PSL does carry. Listing a non-suffix here is a silent
  // no-op, which is why a test asserts every entry resolves.
  brandSuffixes: ["com", "net", "org", "gov", "mil", "us", "co", "io", "me"],
  brandMentions: { substring: BRAND_MENTIONS, word: BRAND_MENTION_WORDS },
  officialSenderNames: OFFICIAL_SENDER_NAMES,

  legitDomains: LEGIT_DOMAINS,
  legitDomainFlag: "Verified US government or federal agency domain",
  legitDomainDetails:
    "This looks like a legitimate US government website. Still be cautious about what you're entering.",

  // senderIdFlag deliberately omitted. The US has no equivalent of the ACMA
  // Sender ID register — the CTIA short-code and 10DLC registration schemes
  // govern which senders may originate traffic at all rather than labelling
  // messages "Unverified", so there is no label for a scammer to explain away.
  // Asserting one would be false, and the rule is skipped where the field is
  // absent.

  reportingBody: "the FTC (reportfraud.ftc.gov)",
  reportingUrl: "https://reportfraud.ftc.gov",

  phonePlan: {
    // NANP premium-rate: 900 is the classic premium range, and 976 is the
    // legacy premium exchange still in use in some NPAs. Both are billed at a
    // premium regardless of the area code they sit behind, so they're matched on
    // the national (1-stripped) form.
    premiumPrefixes: ["1900", "900", "1976", "976"],
    premiumFlag:
      "Premium rate number — 900 and 976 numbers bill the caller at a premium rate, and a message pushing you to call one is charging you for the privilege",
    // 911 is already in the universal EMERGENCY_NUMBERS set in phoneIntel; 988
    // (Suicide & Crisis Lifeline) and 211/311 (social services and municipal
    // non-emergency) are US-specific additions.
    emergencyNumbers: ["988", "211", "311"],
    tollFreeFlag:
      "Toll-free 800/833/844/855/866/877/888 numbers are trivially spoofed and are commonly faked by scammers posing as banks, the IRS or Amazon — always verify by calling the number printed on your card or on the organisation's official website",
    // No sharedCostFlag: the NANP has no shared-cost tier equivalent to AU's
    // 13xx or the UK's 03xx, so there is nothing to describe.
  },

  callbackBrands: CALLBACK_BRANDS,
  // Domestic exchanges; binance/coinbase/kraken come from base.
  cryptoExchanges: ["gemini", "bittrex"],
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
};
