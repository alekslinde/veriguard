// United Kingdom — region pack.
//
// Phase 5 of the internationalisation plan: the second region, chosen because
// the scam playbooks are near-identical to Australia's (agency impersonation,
// toll/parcel lures, tax refund and debt scripts) and the language is shared, so
// it tests the pack interface rather than the translation problem.
//
// Signals here are UK-specific: HMRC and the DWP, the DVLA, NHS, Royal Mail,
// TV Licensing, National Insurance, and the UK high-street banks. Anything that
// would hold true in another market belongs in ./base.ts instead.
//
// Naming: the pack code is `GB`, not `UK` — ISO 3166-1 alpha-2 has no `UK`, and
// libphonenumber resolves the invalid `"UK"` to Switzerland (a bug fixed in
// Phase 4). User-facing copy still says "United Kingdom".

import type { RegionDefinition } from "./types";
import { CHINESE_AUTHORITY_MENTIONS } from "./base";

// Road-charging smishing. The UK equivalent of the AU toll campaigns: Dart
// Charge (Dartford Crossing), the Mersey Gateway and London's congestion
// charge / ULEZ are the recurring covers, and all three genuinely do issue
// penalty notices — which is what makes the lure work. Urgency hits score +10
// each and the group caps at +35, which sits inside "suspicious" (20-44) and
// cannot reach "likely_scam" (45+) on its own — an authority mention or a bad
// link is what carries one of these over.
const URGENCY_TOLL = [
  "unpaid toll", "outstanding toll", "toll payment", "toll charge",
  "dart charge", "dartford crossing", "mersey gateway",
  "congestion charge", "unpaid congestion", "ulez charge", "unpaid ulez",
  "penalty charge notice", "pcn issued",
  // DVLA vehicle-tax variant — the UK's closest analogue to AU "rego
  // restrictions": the threat is to the vehicle's road-legal status.
  //
  // "vehicle tax is due" was listed here and is not that threat — it is what
  // the genuine DVLA renewal reminder says, and it scored one at 35/suspicious.
  // The AU and US equivalents both key on "overdue", which implies a missed
  // deadline; a date simply arriving does not. The untaxed phrasing IS the
  // threat, because a vehicle is only untaxed once the deadline has passed.
  "your vehicle is untaxed", "vehicle tax is overdue",
  "untaxed vehicle",
];

// Royal Mail / Evri / DPD parcel-redelivery lures. "Redelivery fee" and
// "insufficient address" are the dominant UK variants; a small fee (£1-£3) is
// requested to harvest card details rather than to profit.
const URGENCY_PARCEL = [
  "parcel held", "package held", "delivery failed", "couldn't be delivered",
  "redelivery fee", "reschedule your delivery", "incomplete address",
  "insufficient address", "shipping fee required", "customs fee",
  "parcel is waiting", "arrange redelivery",
];

// Utility/telco disconnection threats. Broadband providers and the energy
// retailers are the UK covers; the Ofgem energy-rebate schemes get weaponised
// the same way the AU energy rebates do.
const URGENCY_UTILITY = [
  "broadband will be disconnected", "internet will be disconnected",
  "broadband will be cut off", "service will be disconnected",
  "your line will be disconnected",
];

// Pension phishing — the UK analogue of superannuation scams. Pension freedoms
// (access from 55/57) created a large cold-calling fraud market; pension
// cold-calling has been illegal in the UK since 2019, so an unsolicited
// approach is itself the tell.
const URGENCY_PENSION = [
  "pension review", "pension health check",
  "release your pension", "unlock your pension", "pension transfer",
  "access your pension early", "pension liberation",
  "state pension underpayment", "your pension is at risk",
];

// Fake product-recall lures. Same script as the AU campaign; UK retailers
// (Argos, Currys, Tesco) don't announce recalls by SMS either.
const URGENCY_RECALL = [
  "product recall", "safety recall", "recall alert", "recall notice",
  "item has been recalled", "safety review",
];

// HMRC / DWP benefit and refund lures. Cost-of-living and Winter Fuel Payment
// schemes are real government programmes, which is exactly why they're used as
// bait. Nothing here is gated: every urgency group is flattened into one
// `urgencyWords` union (lib/regions/index.ts) and scored by hit count, +10 per
// hit capped at +35. An authority mention adds its own +25 independently. The
// cap is what keeps a lone group under "likely_scam" (45+), so these phrases
// still need a second signal to tip a verdict — by arithmetic, not by a gate.
const URGENCY_TAX = [
  "tax refund", "tax rebate", "you are eligible for a refund",
  "hmrc refund", "refund is waiting", "claim your refund",
  "cost of living payment", "cost of living support",
  "winter fuel payment", "energy bill support",
  "council tax reduction",
  "universal credit payment", "budgeting advance",
  // Generic benefit-entitlement framing (D1 / #178 / Merseyside Police and
  // Isle of Wight Trading Standards advisories, Aug 2026). The winter-fuel
  // campaign evolved away from naming a specific payment: leading with an
  // "entitlement check" instead is more durable, because it survives the
  // named scheme going out of season. DWP does not do this by SMS — it
  // writes by letter and through the UC journal.
  //
  // Bare "entitled to a benefit" is deliberately absent: it is ordinary
  // welfare-rights language ("you may be entitled to a benefit called
  // Attendance Allowance"), and advice charities do text it. The entries
  // here keep enough qualifying words to stay clear of that phrasing.
  "benefit entitlement check", "entitled to a new benefit",
  "entitled to an additional benefit", "replacement benefit payment",
  "benefit check required",
];

// HMRC debt / enforcement coercion. The threat framing reaches a different
// demographic than the refund lures — the self-employed and small-company
// directors around the 31 January Self Assessment deadline. HMRC does pursue
// genuine debts, so these are written to need corroboration: they score +10
// each into the shared urgency cap of +35, enough for "suspicious" but not for
// "likely_scam". An "hmrc" authority hit adds +25 on top, independently — the
// two are additive, not conditional, so several of these together will reach a
// "suspicious" verdict with no authority mention present at all.
//
// "arrest warrant" is deliberately absent — it lives in the foreign-authority
// group, and listing it twice would double-score. Same convention as AU.
const URGENCY_TAX_THREAT = [
  "tax debt", "outstanding tax", "overdue tax", "unpaid tax",
  "tax liability", "hmrc debt", "self assessment penalty",
  "late filing penalty", "enforcement notice", "distraint",
  "bailiffs will", "county court judgment", "ccj will be issued",
  "compliance check", "tax investigation", "under investigation by hmrc",
  "national insurance number has been suspended",
  "ni number suspended", "ni number compromised",
  "legal action will be taken", "warrant issued",
];

// Foreign-authority impersonation. The UK pattern differs from Australia's: the
// dominant script is the "Interpol / Europol / National Crime Agency" cover
// used against expatriate and student communities, plus the same Chinese-police
// script the AFP warned about (it runs in UK Chinese communities too — Action
// Fraud has issued matching alerts).
const URGENCY_FOREIGN_AUTHORITY = [
  "arrest warrant", "detention order", "deportation notice",
  "money laundering investigation", "your visa will be cancelled",
  "involved in criminal activity",
];

// Digital-identity re-registration phishing. The UK analogue of the myID
// rebrand lures: GOV.UK One Login is the live consolidation programme
// (replacing Verify), and HMRC's Government Gateway credentials are the
// long-standing target. Long multi-word phrases keep false positives low.
const IDENTITY_REREG = [
  "re-verify your identity", "verify your identity to continue",
  "your identity verification has expired", "complete your identity verification",
  "government gateway has been suspended", "government gateway user id",
  "reactivate your government gateway",
  "set up your one login", "migrate to gov.uk one login",
  "one login verification is pending", "verify your gov.uk account",
];

// Matched case-insensitively by the scorer, so entries are lower-case only.
const AUTHORITY_MENTIONS = [
  "hmrc", "hm revenue", "revenue and customs", "gov.uk", "govuk",
  "dwp", "department for work and pensions", "universal credit",
  "dvla", "dvsa", "driver and vehicle licensing",
  "nhs", "national health service", "nhs england",
  "home office", "ukvi", "uk visas and immigration", "border force",
  "hmpo", "passport office",
  "tv licensing", "tv licence",
  "council tax", "local council",
  // Law enforcement and the fraud-reporting bodies — the reporting authority is
  // itself used as a lure ("we're investigating fraud on your account").
  "police", "metropolitan police", "national crime agency", "nca",
  "action fraud", "cifas",
  // Financial regulators and the ombudsman. The FCA never cold-calls consumers,
  // and "FCA-approved" is a prohibited claim.
  "fca", "financial conduct authority", "financial ombudsman",
  "ofgem", "ofcom",
  // Royal Mail is a private company but functions as the parcel-lure authority
  // exactly as Australia Post does, and sits in the same no-link tier.
  "royal mail", "royalmail", "parcelforce",
];

// UK bodies that have publicly confirmed they do not send links in unsolicited
// SMS. HMRC states it never asks for personal or financial information by text;
// the DWP, DVLA and Royal Mail carry equivalent published guidance, and TV
// Licensing warns that it never emails about refunds unprompted. Scoped to the
// confirmed no-link senders so the flag wording stays accurate — councils and
// the NHS do legitimately send links (appointment reminders, e-billing).
const NO_LINK_SENDERS = [
  "hmrc", "hm revenue", "revenue and customs",
  "dwp", "department for work and pensions",
  "dvla", "royal mail", "royalmail", "tv licensing", "tv licence",
];

// Interpol/Europol plus the shared Chinese-authority terms (see base.ts).
const FOREIGN_AUTHORITY_MENTIONS = [
  "interpol", "europol",
  ...CHINESE_AUTHORITY_MENTIONS,
];

// UK-specific identifiers and schemes solicited by scammers. National terms
// (National Insurance number, sort code, Government Gateway) with no meaning in
// other markets, so they sit here rather than in the base request list.
const REQUEST_WORDS = [
  "national insurance number", "ni number", "nino",
  "sort code", "government gateway", "gateway user id",
  "utr number", "unique taxpayer reference",
  "driving licence number", "nhs number",
  // "new sort code" is deliberately absent: requestWords is matched by
  // substring, so it would score twice for one phrase alongside "sort code"
  // above. The bond-redirect composite reads the identifier from
  // bankIdentifiers, so the "new/updated" framing is already covered there.
  // Pension access phishing — the UK counterparts to the AU super terms.
  "pension pot", "sipp", "self invested personal pension",
  "pension release", "release pension funds",
  // Bank-transfer terminology specific to UK payments, used in APP fraud.
  "faster payment", "chaps transfer",
  // Smart-meter fee + government energy-rebate lures (#167 / My Safer Dorset,
  // 7 April 2026). GB already carries energy-supplier brand mentions for the
  // impersonation angle but no lure phrasing for the fee/rebate angle. Real
  // suppliers never charge for the mandated smart-meter rollout, and no
  // DESNZ/Ofgem rebate scheme cold-contacts by SMS with a payment link — so
  // these GB-market-specific phrases are low-FP and stay in the GB pack (the
  // IE energy phrasing differs and lives in ie.ts).
  "smart meter installation fee", "smart meter replacement charge",
  "government energy rebate", "energy bill rebate", "energy support payment",
];

// Energy allowance / price-cap lures (D1 / #270 / Action Fraud alert
// `energyrebatescam`; the Q4 Ofgem cap cycle from 1 October 2026). The
// October cap change is the one window when energy money is genuinely in the
// news, which is exactly when these land.
//
// Bare "energy rebate" used to sit in URGENCY_TAX and was removed here: it is
// ordinary supplier billing language, and a real message ("your energy rebate
// of £12 has been applied to your account balance") scored +10 with an
// "urgency language detected" flag on it. The noun is not the signal — the
// unsolicited claim/eligibility framing around it is, which is what the
// entries below encode. "government energy rebate" and "energy bill rebate"
// keep the qualifier that made them safe and stay in REQUEST_WORDS above.
//
// "ofgem rebate" is deliberately absent: Ofgem is already an authorityMention
// (+25), so the lure compounds without it, and as a flat entry it would score
// the regulator's name a second time. "energy support scheme payment" and
// "energy payment allowance" are likewise absent — "energy support payment"
// above substring-matches neither cleanly enough to justify a third near-
// duplicate, and the two below carry the campaign.
const URGENCY_ENERGY_ALLOWANCE = [
  "energy support allowance", "household energy support",
  "claim your bill rebate",
];


// FCA-authorised firms are legally prohibited from claiming regulator
// endorsement, and the FCA never endorses investments via SMS or email — so
// these are exclusively false-legitimacy claims. Mirrors the AU "verified by
// asic" entry.
const REWARD_WORDS = [
  "fca approved", "fca-approved", "verified by fca", "fca registered",
  "fscs guaranteed", "government backed investment",
];

// Crown-body and agency domains. Note these are exact-or-subdomain matched by
// checkUrl, so "gov.uk" covers the whole estate (hmrc.gov.uk,
// tax.service.gov.uk, dvla.gov.uk); the specific entries below are the
// non-gov.uk official domains that would otherwise miss.
const LEGIT_DOMAINS = [
  "gov.uk", "service.gov.uk",
  "nhs.uk", "nhs.net",
  "royalmail.com", "parcelforce.com",
  "tvlicensing.co.uk",
  "actionfraud.police.uk", "police.uk",
  "fca.org.uk", "financial-ombudsman.org.uk",
  "ofgem.gov.uk", "ofcom.org.uk",
  "bankofengland.co.uk", "fscs.org.uk",
  "ncsc.gov.uk", "cifas.org.uk",
];

// Cover brands for callback/TOAD phishing — UK-operating additions to the base
// list. Currys took over the PC World/Carphone Warehouse service brands that
// appear in fake-renewal invoices, the same role Geek Squad plays in the US.
const CALLBACK_BRANDS = ["currys", "pc world", "carphone warehouse", "sky", "bt"];

// Typosquatted brands (URL checker). Matched with hostname.includes(), so
// entries must be long enough to be distinctive — short and
// dictionary-colliding names go in the word list below.
const TYPOSQUAT_BRANDS = [
  // High-street and challenger banks — the dominant UK phishing targets.
  "barclays", "natwest", "lloyds", "halifax", "santander",
  "nationwide", "monzo", "starling", "revolut", "tsbbank",
  "royalbankofscotland", "bankofscotland", "cooperativebank",
  "virginmoney", "metrobank",
  // Government and agency portals.
  "hmrc", "govuk", "gov-uk", "dvla", "dvsa", "ukvi", "dwp",
  "universalcredit", "tvlicensing", "tvlicence",
  // Health and post.
  "nhsuk", "royalmail", "parcelforce",
  // Telcos and ISPs. The network "Three" is deliberately absent: as a substring
  // it fires on threefold.network and threema.ch, and unlike bt/ee/o2 a word
  // boundary can't save it either — "three" is an ordinary English numeral, so
  // there is no matching strategy that separates the brand from the word. Its
  // real domains (three.co.uk, three.ie) are better served by legitDomains.
  "vodafone", "giffgaff", "talktalk", "virginmedia",
  "plusnet", "skybroadband",
  // Retail, delivery and streaming — global brands still get UK-targeted
  // typosquats, and their real UK sites end in .co.uk, which the trusted-suffix
  // guard excludes.
  "paypal", "amazon", "netflix", "argos", "currys", "tesco",
  "sainsburys", "asda", "screwfix",
  "evridelivery", "yodel", "hermesparcel",
  // Energy retailers — Ofgem-era billing and rebate phishing.
  "britishgas", "octopusenergy", "ovoenergy", "scottishpower",
  // Crypto exchanges.
  "coinbase", "binance", "kraken",
];

// Brands too short or too dictionary-colliding for substring matching. "bt",
// "sky", "eon" and "ee" would fire on "bt-…" inside unrelated words, "skyline",
// "peon"/"neon" and "seed"/"three" respectively — matched on separator
// boundaries instead, so "bt-billing.com" hits and "subtle-shop.com" doesn't.
const TYPOSQUAT_WORD_BRANDS = ["bt", "ee", "o2", "sky", "eon", "tsb", "rbs", "nsandi"];

// Consumer (non-government) brands impersonated in SMS bodies.
const BRAND_MENTIONS = [
  // Delivery — the UK's highest-volume smishing category.
  "royal mail", "royalmail", "parcelforce", "evri", "hermes", "yodel",
  "dpd", "deliveroo", "just eat", "justeat", "uber eats", "ubereats",
  // Telcos and ISPs.
  "vodafone", "giffgaff", "talktalk", "virgin media", "virginmedia",
  "plusnet", "openreach",
  // Energy retailers — billing and rebate SMS scams.
  "british gas", "britishgas", "octopus energy", "octopusenergy",
  "ovo energy", "ovoenergy", "scottish power", "scottishpower",
  // Retail and streaming.
  "amazon", "argos", "currys", "tesco", "sainsburys", "netflix",
  // Crypto.
  "coinbase", "binance", "kraken", "crypto exchange",
];

// Short names that need word-boundary matching in message text — "ee" and "o2"
// as bare substrings would fire on almost any message.
//
// "three" is excluded for a different reason: a \b boundary doesn't help when
// the brand *is* a common word, so it flagged "three items in your basket" as
// brand impersonation. A false positive on ordinary English is worse than
// missing one telco, which the urgency and link signals still catch.
const BRAND_MENTION_WORDS = ["bt", "ee", "o2", "sky", "eon"];

// Names whose genuine mail always comes from a .gov.uk / .co.uk / .uk domain,
// so a mismatched sender domain is textbook impersonation. Narrower than
// brandMentions by design — only bodies whose real mail is reliably on a UK
// domain, so a mismatch means something.
const OFFICIAL_SENDER_NAMES = [
  "hmrc", "hm revenue", "dwp", "dvla", "universal credit",
  "tv licensing", "tv licence", "royal mail",
  "barclays", "natwest", "lloyds", "halifax", "santander", "nationwide",
  "monzo", "starling",
];

// ── Number plan (Ofcom) ──────────────────────────────────────────────────────
// libphonenumber handles parsing, validity, line type and country for GB
// correctly (verified in Phase 4 — UK mobiles, freephone and premium all
// classify without a pack). What stays ours is the scam-relevant reading of the
// plan: which ranges cost money and which get impersonated.

// Ofcom area codes, national (0-prefixed) form. The UK plan is far more
// granular than Australia's four STD codes — several hundred geographic codes
// exist — so this covers the major population centres rather than the whole
// plan. A miss degrades to "no area attributed", not to a wrong answer.
const GB_AREA_CODES: Record<string, string> = {
  "020": "London",
  "0113": "Leeds",
  "0114": "Sheffield",
  "0115": "Nottingham",
  "0116": "Leicester",
  "0117": "Bristol",
  "0118": "Reading",
  "0121": "Birmingham",
  "0131": "Edinburgh",
  "0141": "Glasgow",
  "0151": "Liverpool",
  "0161": "Manchester",
  "0191": "Tyneside / Durham / Sunderland",
  "028": "Northern Ireland",
  "029": "Cardiff",
};

export const GB: RegionDefinition = {
  code: "GB",
  name: "United Kingdom",
  coverage: "full",

  urgency: {
    foreignAuthority: URGENCY_FOREIGN_AUTHORITY,
    toll: URGENCY_TOLL,
    parcel: URGENCY_PARCEL,
    utility: URGENCY_UTILITY,
    pension: URGENCY_PENSION,
    recall: URGENCY_RECALL,
    tax: [...URGENCY_TAX, ...URGENCY_ENERGY_ALLOWANCE],
    taxThreat: URGENCY_TAX_THREAT,
  },

  authorityMentions: AUTHORITY_MENTIONS,
  noLinkSenders: NO_LINK_SENDERS,
  noLinkSendersFlag:
    "HMRC, the DWP, the DVLA, Royal Mail and TV Licensing all state they never ask for personal or payment details by text — a message from one of these with a clickable link is a scam. Go to gov.uk directly instead.",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign or international police authority — Interpol and Europol have no direct enforcement powers over UK residents and never contact individuals to demand payment, and foreign police and consular officials have no jurisdiction in the UK. Report it to Report Fraud at reportfraud.police.uk.",

  bankIdentifiers: ["sort code", "iban"],

  identityRereg: IDENTITY_REREG,
  identityReregFlag:
    "Government Gateway / GOV.UK One Login re-registration lure — HMRC and GOV.UK never send unsolicited requests to 're-verify' or 'reactivate' your account. Go to gov.uk directly, never via a message link.",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — the FCA has warned that platforms of this kind are scams, and it maintains a public warning list. Do not invest.`,

  typosquatBrands: { substring: TYPOSQUAT_BRANDS, word: TYPOSQUAT_WORD_BRANDS },
  // Restricted registries only. `.gov.uk` is limited to public bodies and
  // `.nhs.uk` to NHS organisations, so a brand name under either is genuine.
  //
  // `.co.uk` and `.org.uk` are deliberately absent even though they are the
  // UK's most common suffixes: both are open registrations, and exempting them
  // would suppress brand scoring on exactly the domains scammers register —
  // `barclays-secure-verify.co.uk` would score no brand signal at all. Genuine
  // brands there are covered by legitDomains, an explicit allowlist.
  trustedHostSuffixes: [".gov.uk", ".nhs.uk"],
  // UK brands sit on .co.uk and .uk as much as on .com. `.gov.uk` and `.nhs.uk`
  // are here too: they are also in trustedHostSuffixes, which is a stronger
  // statement, but listing them keeps this field readable as "where UK
  // organisations are" rather than "the leftovers".
  brandSuffixes: ["co.uk", "org.uk", "ac.uk", "gov.uk", "nhs.uk", "police.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "uk", "com", "net", "org"],
  brandMentions: { substring: BRAND_MENTIONS, word: BRAND_MENTION_WORDS },
  officialSenderNames: OFFICIAL_SENDER_NAMES,

  legitDomains: LEGIT_DOMAINS,
  legitDomainFlag: "Verified UK government or public-body domain",
  legitDomainDetails:
    "This looks like a legitimate UK government or public-body website. Still be cautious about what you're entering.",

  // senderIdFlag deliberately omitted. The UK has no equivalent of the ACMA
  // Sender ID register — Ofcom and the MEF run a voluntary SMS SenderID
  // Protection Registry that blocks unregistered senders outright rather than
  // labelling them "Unverified", so there is no label for a scammer to explain
  // away. Asserting one would be false, and the rule is skipped where the field
  // is absent.

  // Action Fraud was replaced by Report Fraud (reportfraud.police.uk, 0300 123
  // 2040) — City of London Police launched the new service on 4 December 2025
  // and completed the public switchover on 20 January 2026. Searches for Action
  // Fraud now redirect there.
  //
  // The URL is included for the same reason the US pack carries
  // reportfraud.ftc.gov: this string is the last line of a "this is almost
  // certainly a scam" verdict, and a renamed agency is exactly where someone
  // acting on that advice gets lost. Naming both forms during the transition
  // would be worse — "report it to Report Fraud (formerly Action Fraud)" reads
  // as uncertainty at the moment the user needs a clear instruction.
  //
  // Note the service covers England, Wales and Northern Ireland only; Scotland
  // reports fraud to Police Scotland on 101. That gap predates the rename —
  // Action Fraud had the same boundary — and the pack has no sub-national
  // resolution to act on it, so the copy stays with the body that covers most
  // GB users rather than asserting something wrong for Scottish ones.
  reportingBody: "Report Fraud (reportfraud.police.uk)",
  reportingUrl: "https://reportfraud.police.uk",

  phonePlan: {
    // Ofcom premium-rate ranges: 09 (premium services) and 070 (personal
    // numbering, widely used to disguise premium-rate forwarding). 084/087 are
    // service numbers that also carry an access charge but are common for
    // legitimate business lines, so they're left to libphonenumber rather than
    // flagged as premium here.
    premiumPrefixes: ["09", "070"],
    premiumFlag:
      "Premium rate number — calling or texting this costs significantly more than a standard call, and 070 'personal numbers' are often used to disguise premium-rate forwarding",
    areaCodes: GB_AREA_CODES,
    // 999 and 112 are already in the universal EMERGENCY_NUMBERS set in
    // phoneIntel; 101 (police non-emergency) and 111 (NHS non-emergency) are
    // UK-specific additions.
    emergencyNumbers: ["101", "111"],
    tollFreeFlag:
      "Freephone 0800/0808 numbers are commonly faked by scammers posing as banks, HMRC or Royal Mail — always verify by calling the number printed on your card or on the organisation's official gov.uk page",
    sharedCostFlag:
      "0300/0345 numbers are used by government bodies and charities and are commonly faked by scammers posing as HMRC or the DWP — verify by calling the number listed on gov.uk",
  },

  callbackBrands: CALLBACK_BRANDS,
  // Domestic/UK-popular exchanges; binance/coinbase/kraken come from base.
  cryptoExchanges: ["bitstamp", "coinjar"],
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
};
