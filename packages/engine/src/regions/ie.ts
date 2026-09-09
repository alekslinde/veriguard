// Ireland — region pack.
//
// Signals here are Ireland-specific: Revenue and the Department of Social
// Protection, An Post, the HSE, the eFlow toll, and the Irish retail banks.
// Anything that would hold true in another market belongs in ./base.ts instead.
//
// Ireland is the region most at risk of being scored by the wrong pack: it
// shares a language and many brands with the UK, and a GB pack applied here
// would confidently score HMRC and the DVLA against a population that has
// neither. The isolation tests assert this in both directions.
//
// Phase 4 verified IE fixed-line classification specifically — it was one of the
// two cases that drove the `max` libphonenumber metadata build over `min` — so
// this is the scam layer only.

import type { RegionDefinition } from "./types";
import { CHINESE_AUTHORITY_MENTIONS } from "./base";

// Toll smishing. eFlow runs the M50 barrier-free toll, which bills after the
// fact and genuinely does issue penalty notices for unpaid passages — the same
// mechanic that makes the AU Linkt and UK Dart Charge lures work.
const URGENCY_TOLL = [
  "unpaid toll", "outstanding toll", "overdue toll", "toll payment",
  "toll charge", "toll invoice", "final toll notice",
  "eflow", "e-flow", "m50 toll", "m50 barrier-free",
  "unpaid passage", "penalty notice issued",
  // Motor tax and NCT — the Irish analogue of AU "rego": the threat is to the
  // vehicle's road-legal status, and both are genuinely enforceable.
  "motor tax is due", "your motor tax",
  "nct expired", "nct is due", "vehicle is untaxed",
];

// An Post / Fastway parcel-redelivery lures. An Post explicitly warns that it
// never requests payment by text, and the customs-fee variant surged with
// post-Brexit duty on UK parcels — which made an unexpected charge plausible to
// Irish recipients.
const URGENCY_PARCEL = [
  "parcel held", "package held", "delivery failed", "couldn't be delivered",
  "redelivery fee", "reschedule your delivery", "incomplete address",
  "insufficient address", "shipping fee required", "customs fee",
  "customs duty owing", "parcel is waiting", "arrange redelivery",
];

// Utility/telco disconnection threats. Eir and Virgin Media are the broadband
// covers; the energy retailers and Irish Water are the utility ones. A same-day
// disconnection demand is the tell — regulated suppliers cannot do this.
const URGENCY_UTILITY = [
  "broadband will be disconnected", "internet will be disconnected",
  "service will be disconnected", "electricity will be disconnected",
  "your electricity account", "disconnection notice",
];

// Pension phishing — the Irish analogue of AU superannuation and UK pension
// lures. PRSA and pension-transfer cold-calling is the recurring script, and
// the Central Bank warns that unsolicited investment approaches are themselves
// the tell.
const URGENCY_PENSION = [
  "pension review", "pension health check",
  "release your pension", "unlock your pension", "pension transfer",
  "access your pension early", "prsa transfer",
  "state pension underpayment", "your pension is at risk",
];

// Fake product-recall lures. The CCPC publishes genuine recalls; no Irish
// retailer announces them by SMS.
const URGENCY_RECALL = [
  "product recall", "safety recall", "recall alert", "recall notice",
  "item has been recalled", "safety review",
];

// Revenue refund and Department of Social Protection benefit lures. Revenue does
// issue genuine end-of-year refunds through myAccount, which is exactly what
// makes the refund lure land — so these compound with an authority mention
// rather than firing alone.
const URGENCY_TAX = [
  "tax refund", "tax rebate", "you are eligible for a refund",
  "revenue refund", "refund is waiting", "claim your refund",
  "tax credit refund", "usc refund", "cost of living payment",
  "fuel allowance", "electricity credit",
  "energy credit", "social welfare payment", "child benefit payment",
  "working family payment",
];

// Revenue debt / enforcement coercion. Revenue does pursue genuine liabilities,
// so these lean on the compound scorer — a "revenue" authority hit alongside one
// of these is what escalates. The threat framing reaches the self-employed
// around the 31 October pay-and-file deadline.
//
// "arrest warrant" is deliberately absent — it lives in the foreign-authority
// group, and listing it twice would double-score. Same convention as AU and GB.
const URGENCY_TAX_THREAT = [
  "tax debt", "outstanding tax", "overdue tax", "unpaid tax",
  "tax liability", "revenue debt", "revenue audit",
  "tax audit", "under audit", "audit notice",
  "sheriff will", "revenue sheriff", "attachment order",
  "your pps number has been suspended", "pps number suspended",
  "ppsn suspended", "ppsn compromised",
  "legal action will be taken", "warrant issued",
  "your assets will be",
];

// Foreign-authority impersonation. Ireland sees the Interpol/Europol script
// alongside the Chinese-police script aimed at student and migrant communities —
// An Garda Síochána and the Banking & Payments Federation have issued matching
// alerts. Europol is genuinely headquartered in the EU, which makes the cover
// marginally more plausible here than in AU, hence its prominence.
const URGENCY_FOREIGN_AUTHORITY = [
  "arrest warrant", "detention order", "deportation notice",
  "money laundering investigation", "your visa will be cancelled",
  "involved in criminal activity",
];

// Digital-identity re-registration phishing. MyGovID is Ireland's public-service
// identity (note: distinct from Australia's myGovID, now myID — the collision is
// real but the packs never mix, since each is only reachable from its own
// region). Revenue myAccount and ROS are the long-standing targets.
const IDENTITY_REREG = [
  "re-verify your identity", "verify your identity to continue",
  "your identity verification has expired", "complete your identity verification",
  "your mygovid account", "verify your mygovid", "reactivate your mygovid",
  "your myaccount has been suspended", "verify your revenue myaccount",
  "reactivate your ros account", "public services card verification",
];

// Matched case-insensitively by the scorer, so entries are lower-case only.
const AUTHORITY_MENTIONS = [
  "revenue", "revenue commissioners", "ros", "myaccount",
  "department of social protection", "social protection", "dsp",
  "welfare.ie", "intreo",
  "hse", "health service executive",
  "mygovid", "gov.ie",
  "rsa", "road safety authority", "motor tax office",
  "inis", "irish naturalisation", "immigration service delivery",
  // Law enforcement and the fraud-reporting bodies — the reporting authority is
  // itself used as a lure ("we're investigating fraud on your account").
  "garda", "gardai", "an garda siochana", "garda siochana", "police",
  "ncsc", "fraudsmart",
  // Financial regulators. The Central Bank never cold-calls consumers, and
  // "Central Bank approved" is a prohibited claim.
  "central bank of ireland", "central bank", "ccpc",
  "competition and consumer protection",
  // An Post is a state company and functions as the parcel-lure authority
  // exactly as Australia Post does.
  "an post", "anpost", "eflow", "e-flow",
  // NTMA / State Savings (D2 / #271 / Irish Times 29 Apr 2026; RTE News 28 May
  // 2026). The active campaign is a deepfake of Tanaiste Simon Harris promoting
  // a fake "Personal Investment Account", trading on the real planned State
  // Savings scheme.
  //
  // Note on scoring: an authority mention is +25, which clears the 20-point
  // "suspicious" threshold on its own — so these do NOT require compounding,
  // contrary to the filing issue. That is why the NTMA entries are also added
  // to NO_LINK_SENDERS below: the agency genuinely does not cold-text, so a
  // link alongside the name is the corroborating signal, and a forwarded news
  // article naming State Savings carries no link and stays at the bare mention.
  //
  // "national treasury management agency" is absent: "ntma" does not appear
  // inside it, so it would be a second scoring hit on one fact. The abbreviation
  // is what appears in lures.
  "ntma", "state savings",
];

// Irish bodies that have publicly confirmed they do not send links in
// unsolicited SMS. Revenue states it never sends links asking for personal or
// financial information; the Department of Social Protection and An Post carry
// equivalent published guidance. Scoped to the confirmed no-link senders so the
// flag wording stays accurate — the HSE does legitimately send links
// (appointment and screening reminders).
const NO_LINK_SENDERS = [
  "revenue", "revenue commissioners", "ros",
  "department of social protection", "social protection", "dsp",
  "an post", "anpost",
  // The NTMA sells State Savings through An Post and by post; it does not send
  // unsolicited SMS links (#271).
  "ntma", "state savings",
];

// Interpol/Europol plus the shared Chinese-authority terms (see base.ts).
const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol", "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

// Ireland-specific identifiers and schemes solicited by scammers. National terms
// (PPS number, Eircode, MyGovID) with no meaning in other markets, so they sit
// here rather than in the base request list.
//
// "iban" is deliberately absent from this list: it is carried by
// bankIdentifiers, and Ireland uses IBAN rather than a sort-code-style routing
// identifier for domestic transfers.
const REQUEST_WORDS = [
  "pps number", "ppsn", "personal public service number",
  "mygovid login", "myaccount login", "ros login",
  "eircode", "public services card",
  "driving licence number", "medical card number",
  // Pension access phishing — the Irish counterparts to the AU super terms.
  "prsa", "pension pot", "release pension funds", "avc pension",
  // Bank-transfer terminology used in Irish authorised-push-payment fraud.
  "sepa transfer", "instant transfer",
];

// Central Bank-authorised firms are prohibited from claiming regulator
// endorsement, and the Central Bank never endorses investments — so these are
// exclusively false-legitimacy claims. It maintains a public unauthorised-firms
// list. Mirrors the AU "verified by asic" and GB "fca approved" entries.
const REWARD_WORDS = [
  "central bank approved", "central bank registered",
  "verified by central bank", "cbi approved",
  "government backed investment",
  // The fake product name from the Harris deepfake campaign (#271). "state
  // savings scheme" is absent — "state savings" is already an authority mention
  // and substring-matches it, so listing it here would score one fact twice.
  "personal investment account",
];

// State and agency domains. These are exact-or-subdomain matched by checkUrl, so
// "gov.ie" covers the whole estate; the specific entries below are the non-gov.ie
// official domains that would otherwise miss.
const LEGIT_DOMAINS = [
  "gov.ie", "revenue.ie", "ros.ie", "welfare.ie", "mygovid.ie",
  "citizensinformation.ie",
  "hse.ie", "anpost.com", "anpost.ie",
  "garda.ie", "ncsc.gov.ie", "fraudsmart.ie",
  "centralbank.ie", "ccpc.ie", "rsa.ie", "motortax.ie",
  "eflow.ie",
  // NTMA / State Savings (#271) — the real estate behind the impersonation,
  // and the domain the no-link-sender flag tells people to go to instead.
  "ntma.ie", "statesavings.ie",
];

// Cover brands for callback/TOAD phishing — Ireland-operating additions to the
// base list. Eir and Harvey Norman appear in fake-renewal and account-suspension
// invoices, the same role Currys plays in the UK.
const CALLBACK_BRANDS = ["eir", "harvey norman", "currys ireland"];

// Typosquatted brands (URL checker). Matched with hostname.includes(), so
// entries must be long enough to be distinctive — short and dictionary-colliding
// names go in the word list below.
const TYPOSQUAT_BRANDS = [
  // Irish retail banks — the dominant phishing targets. AIB and PTSB are in the
  // word list below. Note Ulster Bank has wound down its Irish retail
  // operations, but its name is still used in legacy-account lures.
  "bankofireland", "boi365", "permanenttsb", "ulsterbank",
  "revolut", "n26bank", "creditunion",
  // Government and agency portals.
  "revenue-ie", "revenueie", "myaccount-revenue", "ros-ie",
  "mygovid", "gov-ie", "welfare-ie", "citizensinformation",
  "motortax", "rsa-ie",
  // Health and post.
  "hse-ie", "anpost", "an-post",
  // Toll.
  "eflow", "e-flow", "m50toll",
  // Telcos and ISPs.
  "vodafone", "threeireland", "virginmedia", "sky-ireland",
  // Retail and delivery — the local retailers are impersonated in refund
  // lures. paypal/amazon/netflix moved to base.
  "dunnesstores", "tescoireland",
  "supervalu", "harveynorman", "littlewoodsireland",
  "fastway", "dpdireland",
  // Energy retailers — billing and rebate phishing.
  "electricireland", "bordgais", "sseairtricity", "energia",
  // Crypto exchanges: all three global names are in base. No Ireland-only
  // exchange is impersonated often enough here to add.
];

// Brands too short or too dictionary-colliding for substring matching. "aib",
// "boi", "eir" and "hse" collide inside longer strings — "eir" fires on "their",
// "weird" and "receiving", and "boi" on "boiler" — so they are matched on
// separator boundaries instead: "eir-billing.top" hits and "their-shop.com"
// doesn't.
//
// "ptsb" is included for symmetry with the other bank abbreviations even though
// it is four characters and less collision-prone; word matching costs nothing
// and keeps the bank set consistent.
const TYPOSQUAT_WORD_BRANDS = ["aib", "boi", "ptsb", "eir", "hse", "ros", "esb"];

// Consumer (non-government) brands impersonated in SMS bodies.
const BRAND_MENTIONS = [
  // Delivery — a high-volume Irish smishing category.
  "an post", "anpost", "fastway", "dpd", "gls", "deliveroo",
  "just eat", "justeat",
  // Telcos and ISPs.
  "vodafone", "three ireland", "virgin media", "virginmedia", "sky",
  // Energy retailers — billing and rebate SMS scams.
  "electric ireland", "electricireland", "bord gais", "bordgais",
  "sse airtricity", "sseairtricity", "energia", "esb networks",
  // Retail and streaming.
  "amazon", "netflix", "dunnes stores", "dunnes", "supervalu",
  "tesco ireland", "harvey norman", "littlewoods",
  // Crypto.
  "coinbase", "binance", "kraken", "crypto exchange",
];

// Short names that need word-boundary matching in message text. "aib", "boi",
// "eir" and "esb" as bare substrings would fire inside ordinary words — "eir"
// in "their" and "receiving" is the worst offender, appearing in a large share
// of ordinary messages.
const BRAND_MENTION_WORDS = ["aib", "boi", "ptsb", "eir", "esb"];

// Names whose genuine mail always comes from a .ie / gov.ie domain, so a
// mismatched sender domain is textbook impersonation. Narrower than
// brandMentions by design — only bodies whose real mail is reliably on an Irish
// domain, so a mismatch means something.
const OFFICIAL_SENDER_NAMES = [
  "revenue", "revenue commissioners", "department of social protection",
  "an post", "hse", "mygovid", "eflow",
  "bank of ireland", "aib", "permanent tsb", "ptsb", "revolut",
];

// ── Number plan (ComReg) ─────────────────────────────────────────────────────
// libphonenumber handles parsing, validity, line type and country for IE
// correctly — Phase 4 specifically verified IE fixed-line detection, which is
// why the `max` metadata build was chosen over `min`. What stays ours is the
// scam-relevant reading of the plan.

// ComReg geographic area codes, national (0-prefixed) form. Ireland's plan is
// small enough to enumerate the main codes, and unlike the NANP the code still
// genuinely indicates a region for fixed lines.
const IE_AREA_CODES: Record<string, string> = {
  "01": "Dublin",
  "021": "Cork",
  "022": "Mallow",
  "023": "Bandon",
  "024": "Youghal",
  "025": "Fermoy",
  "026": "Macroom",
  "027": "Bantry",
  "028": "Skibbereen",
  "029": "Kanturk",
  "041": "Drogheda",
  "042": "Dundalk",
  "043": "Longford",
  "044": "Mullingar",
  "045": "Naas",
  "046": "Navan",
  "047": "Monaghan",
  "049": "Cavan",
  "051": "Waterford",
  "052": "Clonmel",
  "053": "Wexford",
  "056": "Kilkenny",
  "057": "Portlaoise",
  "058": "Dungarvan",
  "059": "Carlow",
  "061": "Limerick",
  "062": "Tipperary",
  "063": "Newcastle West",
  "064": "Killarney",
  "065": "Ennis",
  "066": "Tralee",
  "067": "Nenagh",
  "068": "Listowel",
  "069": "Rathkeale",
  "071": "Sligo",
  "074": "Letterkenny",
  "090": "Athlone",
  "091": "Galway",
  "093": "Tuam",
  "094": "Castlebar",
  "095": "Clifden",
  "096": "Ballina",
  "097": "Belmullet",
  "098": "Westport",
  "099": "Aran Islands",
};

export const IE: RegionDefinition = {
  code: "IE",
  name: "Ireland",
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
    "Revenue, the Department of Social Protection, An Post and the NTMA (State Savings) all state they never send texts with links asking for personal or payment details — a message from one of these with a clickable link is a scam. Log in at revenue.ie, gov.ie or statesavings.ie directly instead.",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over individuals in Ireland and never contact people to demand payment, and foreign police and consular officials have no jurisdiction here. Report it to your local Garda station or FraudSMART.",

  // Ireland uses IBAN for domestic transfers rather than a sort-code-style
  // routing identifier, though legacy sort codes still appear in older systems.
  bankIdentifiers: ["iban", "sort code"],

  identityRereg: IDENTITY_REREG,
  identityReregFlag:
    "MyGovID / Revenue myAccount re-registration lure — Revenue and MyGovID never send unsolicited requests to 're-verify' or 'reactivate' your account. Go to revenue.ie or mygovid.ie directly, never via a message link.",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the Central Bank of Ireland has warned that platforms of this kind are scams, and it maintains a public list of unauthorised firms. Do not invest.`,

  typosquatBrands: { substring: TYPOSQUAT_BRANDS, word: TYPOSQUAT_WORD_BRANDS },
  // Restricted registries only. `.gov.ie` is limited to government bodies, so a
  // brand name under it is genuine.
  //
  // `.ie` itself is deliberately absent. It historically required a demonstrated
  // connection to Ireland, but that requirement was relaxed in 2018 and it is now
  // effectively open — so exempting it would suppress brand scoring on exactly
  // the domains scammers register. This is the same trap the GB pack fell into
  // with `.co.uk`: a national suffix is not automatically an eligibility-gated
  // one, and the rule has to follow the registry's actual policy rather than the
  // pattern of the AU pack.
  trustedHostSuffixes: [".gov.ie"],
  // `co.ie` is deliberately absent: it is NOT a public suffix. The hand-written
  // list this replaced carried it anyway, where it silently matched nothing —
  // the PSL surfacing that is the kind of latent error an authoritative list
  // catches and a maintained-by-hand one hides.
  brandSuffixes: ["ie", "gov.ie", "com", "net", "org"],
  brandMentions: { substring: BRAND_MENTIONS, word: BRAND_MENTION_WORDS },
  officialSenderNames: OFFICIAL_SENDER_NAMES,

  legitDomains: LEGIT_DOMAINS,
  legitDomainFlag: "Verified Irish government or public-body domain",
  legitDomainDetails:
    "This looks like a legitimate Irish government website. Still be cautious about what you're entering.",

  // senderIdFlag deliberately omitted. Ireland has no equivalent of the ACMA
  // Sender ID register — ComReg introduced an SMS sender-ID registry that blocks
  // unregistered senders outright rather than labelling them "Unverified", so
  // there is no label for a scammer to explain away. Asserting one would be
  // false, and the rule is skipped where the field is absent.

  reportingBody: "An Garda Síochána (or FraudSMART)",
  // FraudSMART is the dedicated report-a-fraud portal (BPFI, linked by the
  // Garda); the Garda's own site has no stable deep reporting URL.
  reportingUrl: "https://www.fraudsmart.ie",

  phonePlan: {
    // ComReg premium-rate: 15xx is the premium services range. 076 is the VoIP
    // range and 0818 is shared-cost, both handled below rather than as premium.
    premiumPrefixes: ["15"],
    premiumFlag:
      "Premium rate number — calling or texting a 15xx number costs significantly more than a standard call",
    // 076 is ComReg's nomadic/VoIP range. Number portability makes carrier
    // attribution unreliable, so this only nudges risk rather than asserting.
    voipMobilePrefixes: ["076"],
    areaCodes: IE_AREA_CODES,
    // 112 and 999 both work in Ireland and are already in the universal
    // EMERGENCY_NUMBERS set in phoneIntel; 116117 (out-of-hours GP) and 112 are
    // covered, so only the national additions are listed here.
    emergencyNumbers: ["116117", "116000"],
    tollFreeFlag:
      "Freephone 1800 numbers are commonly faked by scammers posing as banks, Revenue or An Post — always verify by calling the number printed on your card or on the organisation's official website",
    sharedCostFlag:
      "0818 numbers are used by government bodies and businesses and are commonly faked by scammers posing as Revenue or the Department of Social Protection — verify by calling the number listed on gov.ie",
  },

  callbackBrands: CALLBACK_BRANDS,
  // No distinctly Irish exchange with meaningful share; binance/coinbase/kraken
  // come from base and cover the market.
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
};
