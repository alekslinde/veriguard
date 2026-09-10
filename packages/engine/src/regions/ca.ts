// Canada — region pack.
//
// Signals here are Canada-specific: the CRA and Service Canada, Canada Post,
// the provincial health and licensing bodies, and the Big Five banks. Anything
// that would hold true in another market belongs in ./base.ts instead.
//
// **Coverage is deliberately "partial", not "full"** — the one place these four
// follow-up packs diverge from AU/GB/US/NZ. Canada is officially bilingual and
// roughly a fifth of the population speaks French at home, but every keyword
// here is English. A French-language smish scored against this pack would match
// almost nothing and, without the partial declaration, would return a
// confident-looking clean verdict. That is exactly the "silent quality collapse"
// the plan's guiding constraints name as the main risk of this project, so the
// pack tells the truth instead: the coverage gate in scoreToResult downgrades a
// clean verdict to "unknown", while positive detections still report normally.
//
// Promoting this to "full" is Phase 6 work — it needs French keyword sets and,
// per the plan, a native-speaker review before shipping.

import type { RegionDefinition } from "./types";
import { CHINESE_AUTHORITY_MENTIONS } from "./base";

// Toll smishing. Canada's tolled infrastructure is concentrated — Highway 407
// ETR in Ontario is by far the dominant cover, with the Confederation Bridge and
// a handful of others behind it. The 407 bills by mail after the fact, which is
// what makes "you have an unpaid toll" plausible.
const URGENCY_TOLL = [
  "unpaid toll", "outstanding toll", "overdue toll", "toll payment",
  "toll invoice", "final toll notice",
  "407 etr", "highway 407", "confederation bridge",
  // Provincial licence-plate and registration renewal — the CA analogue of AU
  // "rego": the threat is to the vehicle's road-legal status.
  "licence plate renewal", "license plate renewal",
  "vehicle registration will be suspended", "your plates will be",
];

// Canada Post / Purolator redelivery lures. Canada Post explicitly warns that
// it never requests payment by text for redelivery, which makes the customs-fee
// variant a strong signal.
const URGENCY_PARCEL = [
  "parcel held", "package held", "delivery failed", "couldn't be delivered",
  "redelivery fee", "reschedule your delivery", "incomplete address",
  "insufficient address", "shipping fee required", "customs fee",
  "duty and taxes owing", "parcel is waiting", "arrange redelivery",
];

// Utility/telco disconnection threats. The Canadian telcos (Bell, Rogers,
// Telus) and the provincial hydro utilities are the covers; a same-day
// disconnection demand is the tell, since regulated utilities cannot do this.
const URGENCY_UTILITY = [
  "internet will be disconnected", "service will be disconnected",
  "hydro will be disconnected", "power will be disconnected",
  "your hydro account", "disconnection notice",
  "past due utility",
];

// Retirement-account phishing — the Canadian analogue of AU superannuation.
// RRSP/RRIF and the CPP/OAS benefit streams are the recurring scripts.
const URGENCY_PENSION = [
  "rrsp review", "rrsp transfer", "rrif transfer", "unlock your rrsp",
  "access your rrsp early", "pension transfer", "retirement account review",
  "cpp benefits suspended", "oas payment", "old age security",
  "your pension is at risk",
];

// Fake product-recall lures. Health Canada publishes genuine recalls; no
// Canadian retailer announces them by SMS.
const URGENCY_RECALL = [
  "product recall", "safety recall", "recall alert", "recall notice",
  "item has been recalled", "safety review", "health canada recall",
];

// CRA refund and federal benefit lures. The GST/HST credit, the Canada Child
// Benefit and the carbon rebate are real quarterly deposits, which is precisely
// why they work as bait — so these compound with an authority mention rather
// than firing alone.
const URGENCY_TAX = [
  "tax refund", "tax rebate", "you are eligible for a refund",
  "cra refund", "refund is waiting", "claim your refund",
  "gst credit", "gst/hst credit", "hst rebate",
  "canada child benefit", "ccb payment",
  "climate action incentive", "carbon rebate",
  "cost of living payment", "grocery rebate",
  "ei payment", "employment insurance payment",
];

// CRA collection / enforcement coercion. The CRA does pursue genuine debts, so
// these lean on the compound scorer — a "cra" authority hit alongside one of
// these is what escalates. The CRA never demands payment by gift card, e-transfer
// or crypto, and never threatens immediate arrest.
//
// "arrest warrant" is deliberately absent — it lives in the foreign-authority
// group, and listing it twice would double-score. Same convention as AU and GB.
const URGENCY_TAX_THREAT = [
  "tax debt", "outstanding tax", "overdue tax", "unpaid tax",
  "tax liability", "cra debt", "back taxes",
  "cra audit", "tax audit", "under audit", "audit notice",
  "garnish your wages", "wage garnishment", "requirement to pay",
  "your sin has been suspended", "sin suspended", "sin compromised",
  "social insurance number has been suspended",
  "legal action will be taken", "warrant issued",
  "your assets will be frozen",
];

// Foreign-authority impersonation. The Canadian pattern mirrors Australia's —
// the same Chinese-police script aimed at student and immigrant communities,
// which the RCMP and the Canadian Anti-Fraud Centre have both warned about.
const URGENCY_FOREIGN_AUTHORITY = [
  "arrest warrant", "detention order", "deportation notice",
  "money laundering investigation", "your visa will be cancelled",
  "involved in criminal activity", "immigration violation",
];

// Digital-identity re-registration phishing. Canada's federal analogue is the
// CRA My Account / My Service Canada Account sign-in, plus the provincial
// digital IDs. Long multi-word phrases keep false positives low.
const IDENTITY_REREG = [
  "re-verify your identity", "verify your identity to continue",
  "your identity verification has expired", "complete your identity verification",
  "your cra account has been suspended", "verify your cra account",
  "reactivate your cra my account", "cra my account is locked",
  "my service canada account", "verify your service canada account",
  "set up your new digital identity",
];

// Matched case-insensitively by the scorer, so entries are lower-case only.
const AUTHORITY_MENTIONS = [
  "cra", "canada revenue agency", "revenue canada",
  "service canada", "employment insurance", "esdc",
  "ircc", "immigration refugees and citizenship", "cbsa", "border services",
  "servicecanada", "canada.ca",
  "ohip", "provincial health", "health canada",
  "servicecontario", "serviceontario", "icbc", "saaq",
  // Law enforcement and the fraud-reporting bodies — the reporting authority is
  // itself used as a lure ("we're investigating fraud on your account").
  "rcmp", "royal canadian mounted police", "police",
  "canadian anti-fraud centre", "anti-fraud centre", "cafc",
  // Financial regulators and the deposit insurer. "CDIC insured" is a common
  // false-legitimacy claim, and the OSC never cold-calls consumers.
  "osc", "ontario securities commission", "iiroc", "ciro",
  "cdic", "fcac", "fintrac",
  // Canada Post is a Crown corporation and functions as the parcel-lure
  // authority exactly as Australia Post does.
  "canada post", "canadapost", "postes canada", "purolator",
];

// Canadian bodies that have publicly confirmed they do not send links in
// unsolicited messages. The CRA states it never sends emails or texts with links
// asking for personal or financial information; Service Canada and Canada Post
// carry equivalent published guidance. Scoped to the confirmed no-link senders so
// the flag wording stays accurate — the provincial services do send legitimate
// links (appointment and renewal reminders).
const NO_LINK_SENDERS = [
  "cra", "canada revenue agency", "revenue canada",
  "service canada", "servicecanada",
  "canada post", "canadapost", "postes canada",
];

// Interpol/Europol plus the shared Chinese-authority terms (see base.ts).
const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol", "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

// Canada-specific identifiers and schemes solicited by scammers. National terms
// (SIN, transit number, RRSP, Interac) with no meaning in other markets, so they
// sit here rather than in the base request list.
//
// "social insurance number" is deliberately absent: the base list carries
// "social security", which does not match it, but "sin number" below would
// collide with a longer entry — so the short form is listed once only.
const REQUEST_WORDS = [
  "sin number", "social insurance",
  "transit number", "institution number",
  "health card number", "ohip number", "driver's licence number",
  // Retirement-account phishing — the Canadian counterparts to the AU super
  // terms.
  "rrsp", "rrif", "tfsa", "resp account",
  // Payment rails specific to Canadian consumer fraud. Interac e-Transfer is
  // the dominant irreversible instrument in Canadian APP fraud.
  //
  // "interac e-transfer" is deliberately absent: this list is substring-matched
  // and both halves are already listed, so the full phrase would score three
  // times for one mention.
  "interac", "e-transfer", "etransfer",
];

// Securities regulators in Canada are provincial, and registered firms are
// prohibited from claiming regulator endorsement. CDIC insures deposits, never
// investments, which makes "CDIC guaranteed returns" self-contradicting. Mirrors
// the AU "verified by asic" and GB "fca approved" entries.
const REWARD_WORDS = [
  "osc approved", "osc-approved", "iiroc approved", "ciro registered",
  "cdic guaranteed", "cdic insured returns",
  "government backed investment",
];

// Federal and agency domains. These are exact-or-subdomain matched by checkUrl,
// so "canada.ca" covers the federal estate; the specific entries below are the
// official domains that would otherwise miss.
const LEGIT_DOMAINS = [
  "canada.ca", "cra-arc.gc.ca", "servicecanada.gc.ca", "gc.ca",
  "ircc.canada.ca", "cbsa-asfc.gc.ca",
  "canadapost-postescanada.ca", "canadapost.ca",
  "rcmp-grc.gc.ca", "antifraudcentre-centreantifraude.ca",
  "cdic.ca", "fcac-acfc.gc.ca", "ciro.ca", "osc.ca",
  "healthcanada.gc.ca", "cyber.gc.ca",
];

// Cover brands for callback/TOAD phishing — Canada-operating additions to the
// base list. Bell and Rogers appear in fake-renewal and account-suspension
// invoices, the same role Currys plays in the UK.
const CALLBACK_BRANDS = ["bell canada", "rogers", "telus", "best buy canada"];

// Typosquatted brands (URL checker). Matched with hostname.includes(), so
// entries must be long enough to be distinctive — short and dictionary-colliding
// names go in the word list below.
const TYPOSQUAT_BRANDS = [
  // The Big Five banks plus the major credit unions — the dominant Canadian
  // phishing targets. "rbc", "bmo", "cibc" and "td" are in the word list below.
  "scotiabank", "royalbank", "bankofmontreal", "tdcanadatrust",
  "tdbank", "desjardins", "tangerine", "simplii", "nationalbank",
  "vancity", "meridiancu",
  // Government and agency portals.
  "cra-arc", "craarc", "canadarevenue", "revenuecanada",
  "servicecanada", "canada-ca", "canadaca", "ircc", "cbsa",
  "serviceontario", "servicecontario",
  // Post and delivery.
  "canadapost", "postescanada", "purolator",
  // Telcos and ISPs.
  "rogers", "telus", "bellcanada", "shawcable", "videotron", "freedommobile",
  // Retail — the local retailers are impersonated in refund lures.
  // paypal/amazon/netflix moved to base.
  "canadiantire", "loblaws",
  "shoppersdrugmart", "walmartca",
  // Payment rails.
  "interac", "e-transfer",
  // Crypto exchanges. The three global names are in base; these are the
  // Canadian platforms.
  "wealthsimple", "shakepay", "netcoins",
];

// Brands too short or too dictionary-colliding for substring matching. "rbc",
// "bmo", "td" and "cra" collide inside longer strings — "td" in particular
// appears inside countless words, and "cra" fires on "craft", "crash" and
// "scratch" — so they are matched on separator boundaries instead:
// "cra-refund.top" hits and "craftshop.com" doesn't.
const TYPOSQUAT_WORD_BRANDS = ["rbc", "bmo", "cibc", "td", "cra", "sin", "ei"];

// Consumer (non-government) brands impersonated in SMS bodies.
const BRAND_MENTIONS = [
  // Delivery — a high-volume Canadian smishing category.
  "canada post", "canadapost", "postes canada", "purolator",
  "uber eats", "ubereats", "skipthedishes", "doordash",
  // Telcos and ISPs.
  "rogers", "telus", "bell", "shaw", "videotron", "freedom mobile", "koodo",
  // Retail and streaming.
  "amazon", "netflix", "canadian tire", "canadiantire", "loblaws",
  "shoppers drug mart", "walmart", "costco",
  // Payment rails — used in the "you have received an Interac e-Transfer"
  // script, the dominant Canadian phishing entry point.
  "interac", "e-transfer", "etransfer",
  // Crypto.
  "coinbase", "binance", "kraken", "wealthsimple", "shakepay",
  "crypto exchange",
];

// Short names that need word-boundary matching in message text. "rbc", "bmo",
// "td" and "cibc" as bare substrings would fire inside ordinary words — "td"
// especially, which appears in countless English strings.
const BRAND_MENTION_WORDS = ["rbc", "bmo", "cibc", "td"];

// Names whose genuine mail always comes from a .gc.ca / .ca domain, so a
// mismatched sender domain is textbook impersonation. Narrower than
// brandMentions by design — only bodies whose real mail is reliably on a
// Canadian domain, so a mismatch means something.
const OFFICIAL_SENDER_NAMES = [
  "cra", "canada revenue agency", "service canada", "canada post",
  "ircc", "interac",
  "rbc", "td canada trust", "scotiabank", "bmo", "cibc",
  "tangerine", "desjardins",
];

// ── Number plan (NANP) ───────────────────────────────────────────────────────
// Canada shares the NANP with the US, which libphonenumber covers thoroughly.
// The same reasoning as the US pack applies to area codes: portability and VoIP
// mean a Canadian area code no longer indicates where a caller is, so no
// areaCodes map is authored rather than asserting a location we can't stand
// behind.

export const CA: RegionDefinition = {
  code: "CA",
  // "Canada" reads correctly in both official languages, so the display name
  // needs no qualification even though the keyword sets are English-only.
  name: "Canada",
  // Partial, not full — see the file header. English-only keywords against an
  // officially bilingual population is a real gap, and the coverage gate is
  // what stops it becoming a confident-looking wrong answer.
  coverage: "partial",

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
    "The CRA, Service Canada and Canada Post all state they never send texts or emails with links asking for personal or financial information — a message from one of these with a clickable link is a scam. Sign in at canada.ca directly instead.",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over Canadian residents and never contact individuals to demand payment, and foreign police and consular officials have no jurisdiction in Canada. Report it to the Canadian Anti-Fraud Centre.",

  bankIdentifiers: ["transit number", "institution number"],

  identityRereg: IDENTITY_REREG,
  identityReregFlag:
    "CRA My Account / Service Canada re-registration lure — the CRA and Service Canada never send unsolicited requests to 're-verify' or 'reactivate' your account. Go to canada.ca directly, never via a message link.",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the Canadian securities regulators and the Canadian Anti-Fraud Centre have warned that platforms of this kind are scams, and the provincial commissions maintain public warning lists. Do not invest.`,

  typosquatBrands: { substring: TYPOSQUAT_BRANDS, word: TYPOSQUAT_WORD_BRANDS },
  // Restricted registries only. `.gc.ca` is limited to the Government of Canada
  // and `.canada.ca` is the federal service domain, so a brand name under either
  // is genuine.
  //
  // `.ca` is deliberately absent: it has residency requirements but is otherwise
  // open to any Canadian person or business, so exempting it would suppress
  // brand scoring on exactly the domains scammers register —
  // `cra-refund-secure.ca` would score no brand signal at all. Residency is not
  // the same eligibility bar as government status.
  trustedHostSuffixes: [".gc.ca", ".canada.ca"],
  // `.ca` is open to any Canadian registrant; `.gc.ca` is the federal
  // government. Canadian brands use `.com` at least as often as `.ca`.
  brandSuffixes: ["ca", "gc.ca", "com", "net", "org"],
  brandMentions: { substring: BRAND_MENTIONS, word: BRAND_MENTION_WORDS },
  officialSenderNames: OFFICIAL_SENDER_NAMES,

  legitDomains: LEGIT_DOMAINS,
  legitDomainFlag: "Verified Canadian government domain",
  legitDomainDetails:
    "This looks like a legitimate Canadian government website. Still be cautious about what you're entering.",

  // senderIdFlag deliberately omitted. Canada has no equivalent of the ACMA
  // Sender ID register — the CRTC regulates originating traffic rather than
  // labelling messages "Unverified", so there is no label for a scammer to
  // explain away. Asserting one would be false, and the rule is skipped where
  // the field is absent.

  reportingBody: "the Canadian Anti-Fraud Centre",
  reportingUrl: "https://antifraudcentre-centreantifraude.ca",

  phonePlan: {
    // NANP premium-rate, shared with the US: 900 is the premium range and 976
    // the legacy premium exchange.
    premiumPrefixes: ["1900", "900", "1976", "976"],
    premiumFlag:
      "Premium rate number — 900 and 976 numbers bill the caller at a premium rate, and a message pushing you to call one is charging you for the privilege",
    // 911 is already in the universal EMERGENCY_NUMBERS set in phoneIntel; 988
    // (Suicide Crisis Helpline) and 211/311 (social services and municipal
    // non-emergency) are Canadian additions, matching the US numbering.
    emergencyNumbers: ["988", "211", "311"],
    tollFreeFlag:
      "Toll-free 800/833/844/855/866/877/888 numbers are trivially spoofed and are commonly faked by scammers posing as banks, the CRA or Amazon — always verify by calling the number printed on your card or on the organisation's official website",
    // No sharedCostFlag: the NANP has no shared-cost tier equivalent to AU's
    // 13xx or the UK's 03xx, so there is nothing to describe.
  },

  callbackBrands: CALLBACK_BRANDS,
  // Domestic exchanges; binance/coinbase/kraken come from base.
  cryptoExchanges: ["wealthsimple", "shakepay", "netcoins"],
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
};
