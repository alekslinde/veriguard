// Australia — region pack.
//
// Signals here are AU-specific: national agencies, toll operators, the tax and
// superannuation system, and locally-warned platforms. Anything that would hold
// true in another market belongs in ./base.ts instead.

import type { RegionDefinition } from "./types";
import { CHINESE_AUTHORITY_MENTIONS } from "./base";

// Toll-road smishing (D2 / #53) — Linkt/EastLink/E-Toll campaigns.
const URGENCY_TOLL = [
  "unpaid toll", "outstanding toll", "overdue toll", "toll payment",
  "toll fine", "toll invoice", "final toll notice",
  // Operation Road Trap escalation (D5 / #84 / Bitdefender April 2026). These
  // threaten loss of vehicle registration — "rego" is AU-specific and unique to
  // the escalated toll script, so FP risk is very low.
  "rego restrictions", "toll penalty", "vehicle registration suspended",
  "recovery action",
];

// AusPost parcel/delivery lures (D10 / #48).
const URGENCY_PARCEL = [
  "parcel held", "delivery failed", "couldn't be delivered",
  "redelivery fee", "invalid postal code",
  // Customs / import-duty framing (D2 / #142 / ABF media release 6 Aug 2026).
  // Australia Post and DHL-branded SMS demand a "customs clearance" payment to
  // release a parcel. The ABF has confirmed it never requests payment by SMS,
  // and legitimate carriers bill duty through the invoice rather than a
  // click-through link — so this framing has no clean use in a consumer SMS.
  // us.ts and ca.ts already carry "customs fee"; AU was the gap.
  "customs fee", "customs charge", "customs clearance",
  "import duty", "duty and handling", "clearance fee",
  "held at customs", "held at border", "held by customs",
  "release your parcel",
  // Address-correction framing (D1 / 2026-08-29 sweep / auspost.com.au scam
  // alerts). AusPost's own alert page names this as the dominant live AU
  // variant — six of its eight parcel alerts are address-shaped — while this
  // list, the largest of the six packs, carried nothing for it. Ten phrasings
  // taken verbatim from those alerts scored 0/safe before this.
  //
  // These are the half with no clean use in a consumer delivery SMS: a real
  // carrier reports a delivery problem, it does not ask you to fix a postcode
  // or a house number to release goods. The address phrases a legitimate
  // retailer DOES send ("confirm your address for our records") are gated
  // instead — see PARCEL_ADDRESS_PHRASES below.
  "correct address label", "verify your postcode", "missing house number",
  "shipment has been suspended", "delivery attempt was unsuccessful",
  "package held",
  // Inflected forms of "parcel held" above. Entries are matched as literal
  // substrings, so "your parcel is held" missed the existing entry entirely and
  // scored 0 — the miss that prompted this sweep. (D2)
  "parcel is held", "package is being held", "held pending payment",
  "release fee",
  // The return threat — the deadline's consequence, and the half that makes the
  // urgency bite. "Pay within 24 hours" is a deadline; "or it's returned" is
  // what the reader is being made to fear, and it is the phrasing they recall
  // afterwards. Both inflections, since the apostrophe form is what arrives in
  // real texts and literal-substring matching would miss it.
  //
  // Safe for a real carrier's vocabulary: genuine return-to-sender notices
  // report a completed outcome ("your parcel was returned to sender"), not a
  // payment deadline that will cause one.
  "or it's returned", "or it will be returned", "will be returned to sender",
  "returned to sender within",
];

// The gated half of D1 (2026-08-29 sweep). "Confirm your address" is ordinary
// commerce — a retailer checking a shipping address before dispatch says
// exactly this, and measuring confirmed it: "Please confirm your address for
// our records before we ship" is a legitimate message that a flat entry would
// flag.
//
// The scam signal is not the address request. It is the address request
// presented as the thing BLOCKING a delivery. So these score only alongside an
// existing parcel/delivery signal, following the KEYS_BY_POST_PHRASES
// precedent (D3 / #180) — a flat urgencyWords entry could not express this,
// since every urgency group is flattened into one union and scored by hit
// count.
export const PARCEL_ADDRESS_PHRASES = [
  "update your address", "confirm your address", "correct your address",
  "update your correct address", "confirm delivery address",
  "schedule redelivery", "arrange redelivery", "reschedule your delivery",
];

// NBN Co disconnection-threat smishing (D7 / #67).
const URGENCY_UTILITY = [
  "internet will be disconnected", "broadband will be cut off",
  "nbn technician", "service disconnected within",
  "internet disconnected", "broadband disconnected",
];

// Superannuation phishing urgency (D3/D4/D11 / #64).
const URGENCY_PENSION = [
  "secure your super", "your super balance", "preservation age",
  "super fund deadline",
  // "Rule change" credential lures (D5 / 2026-08-09 roadmap / ATO + ASIC
  // MoneySmart Aug 2026). The July 2026 preservation-age reforms gave scammers a
  // real policy change to point at: "a new super rule change affects your
  // balance — verify your details to avoid losing access."
  //
  // Every entry is anchored to super/superannuation rather than the bare "rule
  // change" the roadmap first suggested. Regulatory change is exactly what
  // legitimate fund and employer mail discusses, and this list feeds the
  // urgency scorer directly — a bare "rule change" would fire on the ATO's own
  // newsletters. Keeping "super" in the phrase is what holds the FP rate down
  // while still matching the lure, which always names super to land the threat.
  "super rule change", "superannuation rule change", "new super rules",
  "super law change", "changes to your super",
];

// Fake product-recall SMS lures (D1 / #80 / Amazon campaign May-June 2026).
// Amazon, eBay, Kmart and Big W all have confirmed policies against using SMS
// for product recalls, so "safety recall" in an SMS with a link is essentially
// a confirmed scam signal. "safety review" is kept because it's the softened
// variant used to widen hit-rate.
const URGENCY_RECALL = [
  "product recall", "safety recall", "recall alert", "recall notice",
  "item has been recalled", "safety review",
];

// Tax-time cost-of-living lures (D1/D2/D10 / #73 / ATO-myGov peak season).
// Scammers weaponise real government relief policies as bait. These appear in
// legitimate gov comms too, so they are written to need corroboration. Nothing
// is gated: every urgency group is flattened into one `urgencyWords` union
// (lib/regions/index.ts) and scored by hit count, +10 per hit capped at +35 —
// enough for "suspicious" (20-44), short of "likely_scam" (45+). An
// authorityMentions hit adds +25 independently. Additive, not conditional.
const URGENCY_TAX = [
  "cost of living payment", "cost of living relief", "cost-of-living supplement",
  "energy rebate", "energy bill relief", "electricity rebate",
  "tax recalculation", "your tax has been recalculated", "compensation payment",
  "government rebate", "tax refund waiting", "refund is waiting",
];

// ATO debt / audit coercion lures (D7 / #124). The threat framing is
// psychologically distinct from the refund lures above and reaches a different
// demographic (business owners, contractors, older Australians) ahead of EOFY
// and the August BAS deadline. The real ATO does contact people about genuine
// debts, so these carry the same shared urgency cap as URGENCY_TAX: +10 per
// hit, +35 maximum, with an "ato" authority hit adding +25 on top. The two are
// independent, so several of these together reach "suspicious" with no
// authority mention present — the cap, not a gate, is what holds them back.
// "arrest warrant" is deliberately absent: it already lives in
// URGENCY_FOREIGN_AUTHORITY and listing it twice would double-score.
const URGENCY_TAX_THREAT = [
  "tax debt", "outstanding tax", "overdue tax", "unpaid tax",
  "tax liability", "ato debt",
  "audit notice", "tax audit", "subject to audit",
  "tfn suspended", "tfn cancell", "tax file number suspended",
  "legal action will be taken", "warrant issued", "federal police",
  "your assets will be",
];

// Foreign-authority threat phrases (D3 / #103). AFP May 2026 and Victoria
// Police advisories describe scammers impersonating Chinese police and
// consular officials to threaten Australian residents — particularly
// international students — with arrest or deportation unless a "security
// deposit" is paid. In an AU consumer context these phrases arriving by
// unsolicited SMS have no legitimate use.
const URGENCY_FOREIGN_AUTHORITY = [
  "arrest warrant", "detention order", "deportation notice",
  "money laundering investigation", "your visa will be cancelled",
  "involved in criminal activity",
];

// myID forced re-registration phishing (D6 / #106). The myGovID → myID rebrand
// spawned a wave of "re-verify your digital identity" lures that deliberately
// omit the word "myid" — so they slip past authorityMentions. These are long,
// specific multi-word phrases, keeping false positives low even where "digital
// identity" appears in legitimate HR/tech copy. Services Australia never sends
// unsolicited re-verification requests.
const IDENTITY_REREG = [
  "re-verify your digital identity", "digital identity verification",
  "your identity verification has expired", "complete your identity verification",
  "myid has been suspended", "set up your new digital identity",
  "migrate to the new digital identity", "myid verification is pending",
];

// Matched case-insensitively by the scorer, so entries are lower-case only.
const AUTHORITY_MENTIONS = [
  // "mygovid" is listed alongside "mygov" because entries match on word
  // boundaries (#233) — "mygov" does not reach inside "mygovid".
  "ato", "mygov", "mygovid", "centrelink", "medicare", "services australia",
  "afp", "police",
  // ACSC/ASD impersonation (D7 / #55)
  "acsc", "asd", "cyber security centre", "australian signals directorate",
  "cyber.gov.au",
  // ACCC / Scamwatch / NASC impersonation (D5 / #65) — the fraud-reporting
  // authority is itself used as a lure. The ACCC never cold-calls consumers.
  "accc", "scamwatch", "national anti-scam centre", "nasc",
  "consumer watchdog", "competition and consumer commission",
  // Toll operators (D1 / #53) and AusPost parcel lures (D10 / #48)
  "linkt", "eastlink", "e-toll", "etoll", "australia post", "auspost",
  // myGov digital-identity layer rebranding to myID in 2026 (D2 / #73).
  "myid", "my id app",
  // State-government agency impersonation (D1 / #141 / ACSC ASC-2026-0807).
  // The federal entries above cover ATO/myGov/Centrelink, but the smishing kits
  // catalogued by IDCARE and the ACSC in August 2026 impersonate state bodies —
  // invariably an unpaid fine or licence-suspension threat with a payment link.
  //
  // mentions() only boundary-matches entries of 3 characters or fewer, so
  // everything here is substring-matched and must be distinctive on its own.
  // Bare "tmr" and "dot" are absent for that reason — they'd fire inside
  // ordinary English.
  //
  // "dot wa" was dropped for the same reason after code review: at 6 characters
  // it takes the substring path, so it matched "the dot was red" and "site dot
  // washington dot edu" — people do write URLs out longhand when reporting a
  // scam. The full agency name is what the lure actually uses and carries no
  // such collision.
  //
  // "vcat" is 4 characters and so also substring-matched: verified against
  // /usr/share/dict/words with zero hits, and no common word contains it.
  "vicroads", "service nsw", "servicensw", "transport nsw", "revenue nsw",
  "tmr qld", "qld transport", "department of transport wa", "vcat",
];

// ATO/myGov/Medicare/Centrelink/Australia Post removed links from their
// unsolicited SMS in 2024 (D1 / #73) — so any link alongside one of these
// senders is a scam. Scoped to the confirmed no-link senders so the flag
// wording stays accurate (toll operators, by contrast, do use links).
const NO_LINK_SENDERS = [
  "ato", "mygov", "mygovid", "myid", "medicare", "centrelink",
  "services australia", "australia post", "auspost",
];

// Shared Chinese-authority terms (see base.ts) with no additions: AU packs
// omit interpol/europol, which the other regions carry.
const FOREIGN_AUTHORITY_MENTIONS = [...CHINESE_AUTHORITY_MENTIONS];

// AU-specific identifiers and schemes solicited by scammers. These are national
// terms (tax file number, Medicare, BSB, superannuation) with no meaning in
// other markets, so they sit here rather than in the base request list.
const REQUEST_WORDS = [
  // "mygovid" is listed explicitly, and must stay that way.
  //
  // It was deliberately absent while this list was substring-matched: "mygov"
  // matched inside it, so listing both scored one phrase twice, and that alone
  // moved the verdict — "Confirm your myGovID" reached likely_scam (55) where
  // the identical "Confirm your myGov" was suspicious (40), for no detection
  // reason. Since #233 entries are matched on word boundaries, so "mygov" no
  // longer reaches inside "mygovid" and the double-score it guarded against
  // cannot happen. Without its own entry the myGovID lure scored 0.
  "medicare", "tax file number", "tfn", "mygov", "mygovid", "centrelink",
  "ato", "bsb",
  // Superannuation early-access phishing (D3/D4/D11 / #64). "smsf" and "early
  // super release" are AU-specific regulatory terms rarely seen outside a scam.
  "access your super", "unlock your super", "smsf", "self managed super",
  "early super release", "super withdrawal", "superannuation transfer",
  "early access to super",
  // Rental/property bond redirect fraud (D5 / #105) is covered by "bsb" above
  // plus the bond composite, which reads bankIdentifiers. A separate "new bsb"
  // entry would double-score one phrase, since requestWords is substring-matched.
  // AFP/ACSC dual-actor ReportCyber + cold-storage fraud (#165 / AFP-ACSC
  // joint advisory, April 2026). Criminals file a false ReportCyber report in
  // the victim's name to mint a real-looking case reference, then a fake
  // "crypto representative" quotes it as authority and tells the victim to move
  // funds to a "cold storage account". Both phrases are zero-FP in isolation:
  // genuine cold-wallet guidance says "cold storage device/wallet", never
  // "account", and ReportCyber sends no confirmation SMS/email with references.
  "cold storage account", "reportcyber reference",
];

// ASIC-regulated products are legally prohibited from being promoted as
// regulator-endorsed, and ASIC never proactively endorses platforms via
// SMS/email — so these are exclusively false-legitimacy claims (D6 / #85).
const REWARD_WORDS = [
  "verified by asic", "asic-approved",
  // Pump-and-dump group-invite recruitment (#166 / ASIC MR 26-157MR, 17 July
  // 2026 — 16 victims, $2.7M in two weeks). Unsolicited WhatsApp/Telegram
  // invites to a "stock tips group" or "investment club" manufacture social
  // proof before steering victims to fake ASX-impersonating platforms.
  // Legitimate brokers don't solicit via group invite; "investment club" only
  // appears in formal registered contexts, not cold SMS/WhatsApp. Compounds
  // with the ASIC-endorsement claims above and base's investment reward words.
  "stock tips group", "investment club", "exclusive trading group",
  "closed trading group",
  // Fake gambling platform ("scambling") bait (D1 / #225 / ACCC 14 Aug 2026,
  // NASC fusion cell to Dec 2026 — 927% H1 2026 report surge, >$40m losses).
  //
  // Only the phrases with no licensed-operator equivalent are listed. Measured
  // before adding: "exclusive bonus for new members" and "vip access - limited
  // spots" scored safe (0) alone but sit close to legitimate promotional SMS,
  // so they are deliberately NOT here — a real Sportsbet bonus-bet text would
  // have picked them up. "claim your free spins" already reaches suspicious
  // (24) on the existing "free"/"claim" reward words, so adding it would have
  // double-scored one phrase without catching anything new.
  //
  // "free spins" is deliberately absent: this list is substring-matched, and
  // base's "free" already matches it, so listing both scored one phrase twice
  // and pushed a legitimate "10 free spins added to your account" promo from
  // 12 to 24 (suspicious). Same failure mode as the mygovid and new bsb notes
  // in requestWords above.
  //
  // What is left is the phrasing with no licensed-operator equivalent. A real
  // operator states a wagering requirement; it never advertises waiving one.
  "wagering requirement waived", "wagering requirements waived",
];

// Domains of organisations in authorityMentions whose real mail does NOT come
// from a .gov.au address, so the trustedHostSuffixes rule cannot recognise them.
//
// Used ONLY to tell "this email names Australia Post" from "this email is from
// Australia Post" — without it, a genuine parcel notification scored 38 and was
// told to "verify directly via official channels", which is wrong advice for
// mail that arrived through the official channel.
//
// Kept deliberately short. Each entry weakens a scam signal for that domain, so
// the test is whether the organisation is in authorityMentions AND its real
// mail demonstrably comes from here — not whether the brand is well known.
// Matching is exact-or-subdomain (see isOwnDomainSender), so auspost.com.au and
// track.auspost.com.au qualify while auspost.com.au.evil.tk does not.
const AUTHORITY_OWN_DOMAINS = [
  // Australia Post — in authorityMentions and in noLinkSenders; its consumer
  // mail comes from auspost.com.au, not a government domain.
  "auspost.com.au",
];

const LEGIT_DOMAINS = [
  "gov.au", "ato.gov.au", "mygov.gov.au", "centrelink.gov.au",
  "myhealth.gov.au", "australia.gov.au", "afp.gov.au", "accc.gov.au",
  "scamwatch.gov.au", "cyber.gov.au", "servicesaustralia.gov.au",
  "medicare.gov.au", "abf.gov.au", "homeaffairs.gov.au",
];

// AU crypto exchanges (D6 / #123). The TOAD variant sends "account suspended,
// call support" with a phone number and no link — the same shape as the base
// coinbase/bitcoin entries, so it reuses that signal rather than adding a
// parallel one.
const CALLBACK_BRANDS = ["coinspot", "swyftx", "binance"];

// Typosquatted brands (URL checker). Matched with hostname.includes(), so
// entries must be long enough to be distinctive — see TYPOSQUAT_WORD below for
// the ones that aren't.
const TYPOSQUAT_BRANDS = [
  "commbank", "westpac", "anz", "nab", "mybank", "mygov", "centrelink",
  // paypal, amazon and netflix moved to base — every pack listed them.
  "medicare", "ebay", "telstra", "optus", "tpg",
  // Toll operators (D1 / #53) and immigration portals (D14 / #50)
  "linkt", "eastlink", "etoll", "homeaffairs", "dibp", "immi",
  // Food delivery platforms (D6 / #66)
  "doordash", "ubereats", "menulog", "deliveroo",
  // Super funds (D3/D4 / #64)
  "australiansuper", "unisuper", "sunsuper", "cbus", "hesta", "ampsuper",
  // Loyalty programs (D2 / #81) — ACCC Feb 2026 Qantas impersonation alert;
  // top-3 impersonated AU loyalty brands. Already in emailHeaders.ts
  // IMPERSONATED_BRANDS; this closes the URL-checker gap.
  //
  // Bare "velocity" was here and was wrong twice over. The comment it carried
  // claimed the real domains end in .com.au and were covered by the trusted
  // suffix — but Velocity Frequent Flyer's actual site is
  // velocityfrequentflyer.com, a .com, where no suffix exemption applies. The
  // brand also never owned that registrable label ("velocityfrequentflyer" is
  // not "velocity"), so exemption (2) missed it too: the program's own site, and
  // its business./join. subdomains, all scored likely_scam.
  //
  // Worse, "velocity" is an ordinary English word and a common company name —
  // velocityglobal.com, velocitypartners.com and velocitybank.com are unrelated
  // real businesses that were all being called likely_scam on this signal alone.
  //
  // The full program name is distinctive enough to substring-match safely, and
  // is what squats actually imitate. Bare "velocity" moves to the word list,
  // where it still catches "velocity-points-login.cyou" without firing inside
  // longer legitimate labels.
  "qantas", "velocityfrequentflyer",
  // Energy retailers (D3 / #121). AGL and Origin Energy both have documented
  // AU phishing campaigns; August is peak winter billing season. Bare "agl" is
  // deliberately absent — it lives in the word-boundary list below, because
  // substring matching would score eagle.org, flagler.com and bagelshop.io.
  "originenergy", "energyaustralia", "alintaenergy",
  // Crypto exchanges (D6 / #123). "binance" is global and now sits in base,
  // which also gives AU the coinbase/kraken coverage the other five packs had
  // and this one did not.
  "coinspot", "swyftx",
  // Private health insurers (D4 / 2026-08-09 roadmap). Credential-harvest pages
  // for the big four AU funds.
  //
  // medibank.com.au stays clean because the brand owns the registrable label,
  // not because of any suffix exemption — and squats on the same suffix
  // (medibank-renew-login.com.au) now score, since `.com.au` was removed from
  // trustedHostSuffixes. See the note there.
  //
  // "nib" and "hcf" are too short for hostname substring matching and go in the
  // word list below. "ahm" is excluded from the URL checker entirely — see the
  // note there; it stays in brandMentions, which is where the lures name it.
  "medibank", "bupa",
  // Postal / parcel delivery. AU was the only pack with no postal brand at all,
  // while every sibling carries theirs (ie: anpost, gb: royalmail,
  // ca: canadapost, nz: nzpost, us: usps/fedex/ups) — an omission, not a
  // decision: undelivered-parcel SMS is among the most-reported AU scam lures,
  // and "australia post" was already in authorityMentions and brandMentions for
  // message bodies. Only the URL checker was blind to it.
  //
  // auspost.com.au and track.auspost.com.au stay clean via the brand-owns-the-
  // registrable-label exemption (.com.au is a two-part suffix, so the label is
  // "auspost"), the same way medibank does above. Squats score:
  // auspost-redelivery.secure-track.top matches on the substring pass even
  // though the brand sits in a subdomain rather than the registrable label.
  //
  // Only the two long, distinctive spellings go in the substring list.
  // "startrack" (Australia Post's courier arm) and "aupost" (the one-character
  // elision squatters register) are NOT here: as substrings they fire inside
  // longer labels — "start"+"rack" makes mystartrack.com a +45 brand hit, and
  // aupostal-services.com the same. That is the failure mode this file already
  // documents for "velocity" and "ahm", so they go in the word list below and
  // are matched on separator boundaries instead.
  "auspost", "australiapost",
];

// Brands too short for substring matching in a hostname. Previously excluded
// from detection entirely to dodge the false positives; the word-boundary list
// lets them be caught without the collisions ("agl-billing.com" hits,
// "bagelshop.io" doesn't).
//
// The short health funds (D4) rely on the same mechanism: the checker splits the
// registrable label on separators, so "nib-renewal.com" and "hcf-login.net" hit
// while "bonnibel.com" and "ahmed-photography.com" don't.
//
// "ahm" is deliberately absent, on review. Boundary matching stops the
// substring collisions but not a hostname whose label genuinely *is* the token:
// "ahm-photography.com" and "ahm-legal.com" split to ["ahm","..."] and score the
// full +45 brand hit, which is likely_scam on that signal alone. Unlike nib (a
// pen tip) and hcf (an initialism), "ahm" is a common surname and personal
// initialism with no health-insurance meaning outside AU, so the plausible
// hostname space is dominated by unrelated small businesses. The fund is still
// covered where it matters — brandMentions carries "ahm" for message bodies,
// which is where the lures actually name it.
//
// nib and hcf are kept, but the same failure mode exists for them in a milder
// form ("nib-pens.com", "hcf-plumbing.com"), as it already did for the
// pre-existing "agl" ("agl-industries.com"). Worth revisiting for all three
// together if the URL checker ever gains a co-signal requirement for short
// brands; not worth diverging from the established pattern for one entry here.
// "velocity" joins them: an ordinary English word, so substring matching scored
// velocityglobal.com and the program's own velocityfrequentflyer.com. As a label
// word it still catches "velocity-points-login.cyou" — the shape squats use —
// while leaving longer legitimate labels alone.
// "startrack" and "aupost" are here for length-independent reasons: both are
// long enough to survive substring matching in principle, but both contain a
// shorter word boundary that longer innocent labels reproduce (mystartrack.com,
// aupostal-services.com). Boundary matching still catches the squat shape —
// "startrack-delivery.top", "aupost-redelivery.cyou" — which is what the lure
// actually registers.
const TYPOSQUAT_WORD_BRANDS = ["agl", "nib", "hcf", "velocity", "startrack", "aupost"];

// Consumer (non-government) brands impersonated in SMS bodies.
const BRAND_MENTIONS = [
  "doordash", "uber eats", "ubereats", "menulog", "deliveroo",
  "nbn co", "nbnco", "nbn", "national broadband network",
  // Fake-recruiter SMS impersonation (D3 / #82 / Scamwatch June 2026). Amazon
  // does text customers legitimately (medium FP for "amazon" alone); YouTube
  // never cold-recruits by SMS. The jobSignals composite in scamDetector is the
  // stronger signal when the recruiter pattern is present.
  "amazon", "youtube",
  // Energy retailers impersonated in billing/refund SMS scams (D3 / #121).
  // MailGuard documented multi-step Origin Energy "$150 overpayment" and
  // "billing error" campaigns; AGL warns customers about fake-site SMS.
  "origin energy", "originenergy", "energy australia", "energyaustralia",
  "alinta energy",
  // AU crypto exchanges (D6 / #123) — "suspicious login" / "account
  // suspended" credential and 2FA harvesting.
  "coinspot", "swyftx", "binance", "crypto exchange",
  // Private health insurers (D4 / 2026-08-09 roadmap / ACSC Aug 2026 advisory).
  // Credential-harvest kits impersonating the big four AU funds, framed as
  // "your policy is expiring" / "your membership is suspended". Health cover is
  // near-universal here and the funds do email members about renewals — but a
  // brand mention is scored on its own, not compounded: a bare fund name is
  // +20, which is already "suspicious". That is deliberate for a credential-
  // harvest kit, though it does mean an ordinary message naming a fund scores.
  // Keep this list to names a scam kit actually impersonates.
  //
  // Only the distinctive names are substring-matched. "medibank" and "bupa" are
  // unambiguous; "nib", "hcf" and "ahm" are in the word list below.
  //
  // No "nib health" / "hcf health" entries: the bare names in the word list
  // already match those phrases, and listing both puts one brand in both halves
  // of the BrandSet for no gain.
  "medibank", "bupa",
];

// "agl" would fire on "bagel", "eagle" and "flagship" as a bare substring.
//
// The health funds (D4) join it for the same reason. This list is explicitly
// boundary-matched at the call site, which is what these need — note the
// automatic ≤3-character rule in mentions() does NOT apply here: brandMentions
// is a BrandSet, and its `substring` half is matched with a plain
// lower.includes(), so a short name placed there gets no protection at all.
//   - "nib" appears inside 92 dictionary words (Aniba, bonnibel) and, more to
//     the point, "nibble" and any brand ending in -nib.
//   - "ahm" appears inside 41 (Ahmed, Ahmadi) — overwhelmingly personal names,
//     which arrive constantly in the forwarded emails this app parses.
//   - "hcf" has no dictionary collisions, but it is a three-letter acronym in a
//     product that already learned this lesson with NZ "acc" ⊂ "account", so it
//     gets the boundary too rather than relying on today's word list.
const BRAND_MENTION_WORDS = ["agl", "nib", "hcf", "ahm"];

// Names whose genuine mail always comes from a .gov.au / .com.au domain, so a
// mismatched sender domain is textbook impersonation.
const OFFICIAL_SENDER_NAMES = [
  "ato", "mygov", "centrelink", "medicare", "commbank", "westpac", "anz", "nab",
];

// ── Number plan (ACMA) ────────────────────────────────────────────────────────
// Moved here from phoneIntel in Phase 4. libphonenumber handles parsing,
// validity, line type and country for every region; what stays ours is the
// scam-relevant reading of the plan.

// Geographic STD codes → region names.
const AU_STD: Record<string, string> = {
  "02": "New South Wales / ACT",
  "03": "Victoria / Tasmania",
  "07": "Queensland",
  "08": "Western Australia / South Australia / Northern Territory",
};

// 04xx prefixes commonly allocated to VoIP/virtual number providers. Number
// portability makes carrier-level attribution unreliable, but these ranges are
// often used by VoIP MVNOs, burner SIM providers and virtual number services —
// all of which make spoofing trivial.
const AU_VOIP_MOBILE_PREFIXES = [
  "0480", "0481", "0482", "0483", "0484",
  "0485", "0486", "0487", "0488", "0489",
];

export const AU: RegionDefinition = {
  code: "AU",
  name: "Australia",
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
    "The ATO, myGov, Medicare, Centrelink and Australia Post removed links from their unsolicited SMS messages in 2024 — an SMS from one of these bodies with a clickable link is a scam",

  foreignAuthorityMentions: FOREIGN_AUTHORITY_MENTIONS,
  foreignAuthorityFlag:
    "Claims to be a foreign police or government authority — Chinese police, customs, embassy and consulate officials have no law-enforcement powers in Australia and never demand payments, transfers or secrecy. This is a known scam targeting the Chinese-Australian community (AFP warning, May 2026).",

  bankIdentifiers: ["bsb"],

  parcelAddressPhrases: PARCEL_ADDRESS_PHRASES,
  identityRereg: IDENTITY_REREG,
  identityReregFlag:
    "myID/digital-identity re-registration lure — Services Australia and myID never send unsolicited requests to 're-verify' or 'set up' your digital identity. Go to my.gov.au directly, never via a message link.",

  fakeInvestmentPlatformFlag: (platform: string) =>
    `Named fraudulent investment platform detected ("${platform}") — ASIC and Scamwatch have issued specific warnings that this is a scam. Do not invest.`,

  typosquatBrands: { substring: TYPOSQUAT_BRANDS, word: TYPOSQUAT_WORD_BRANDS },
  // Restricted registries only, matching every other pack.
  //
  // `.com.au` was removed after review. It was never a deliberate choice for AU:
  // git blame puts it in the commit that added the UK pack, where the field was
  // created to generalise `.co.uk` handling and simply inherited the existing
  // hardcoded behaviour. Three reasons it had to go:
  //
  //  1. It was the only commercial suffix in any pack. Every other region lists
  //     government/military-only suffixes (.gov.uk/.nhs.uk, .gov/.mil,
  //     .gc.ca/.canada.ca, .govt.nz/.mil.nz, .gov.ie).
  //  2. The ABN gate it rested on is real but is not proof of identity. auDA
  //     does require a validated ABN/ACN, yet the ACCC warns plainly that
  //     scammers register .au domains and even display stolen ABNs. An ABN is
  //     free and takes minutes; the gate raises cost, it does not verify who you
  //     are — which is what a blanket scoring exemption treats it as.
  //  3. It suppressed brand scoring on exactly the domains scammers buy.
  //     medibank-renew-login.com.au, commbank-secure-verify.com.au and
  //     mygov-verify-login.com.au all raised no impersonation flag at all.
  //
  // Removing it costs nothing measurable: a sweep of every brand in this pack
  // across .com.au/.net.au/.org.au plus www./secure./login./my. subdomains — 315
  // canonical hosts — produced zero false positives. Real brand sites are
  // already protected by the *other* exemption in checkUrl: the brand owning the
  // registrable label ("medibank" IS the label in medibank.com.au). That guard
  // is what does the real work, and it is region-agnostic.
  //
  // `.gov.au` stays: government registration is genuinely eligibility-verified,
  // and it is the suffix the impersonated agencies actually use.
  trustedHostSuffixes: [".gov.au"],
  // Where Australian brands actually register: the gated government namespace,
  // the open commercial ones, and the global gTLDs every brand also uses.
  brandSuffixes: ["com.au", "net.au", "org.au", "gov.au", "edu.au", "asn.au", "id.au", "au", "com", "net", "org"],
  brandMentions: { substring: BRAND_MENTIONS, word: BRAND_MENTION_WORDS },
  officialSenderNames: OFFICIAL_SENDER_NAMES,

  legitDomains: LEGIT_DOMAINS,
  authorityOwnDomains: AUTHORITY_OWN_DOMAINS,
  legitDomainFlag: "Verified Australian government domain",
  legitDomainDetails:
    "This looks like a legit Aussie government website. Still be cautious about what you're entering.",

  // ACMA Sender ID register (D2 / #122). Since 1 July 2026 legitimate AU
  // senders must register their SMS Sender ID, so "ignore the Unverified
  // label" is a scam tell — but only in Australia, hence its place here.
  senderIdFlag:
    "'Unverified' label override attempt — since 1 July 2026, legitimate Australian senders must register their SMS Sender ID with ACMA. A message asking you to ignore an 'Unverified' label is almost certainly a scam.",

  reportingBody: "Scamwatch",
  reportingUrl: "https://www.scamwatch.gov.au",

  phonePlan: {
    premiumPrefixes: ["0190"],
    premiumFlag:
      "Premium rate number — calling or texting this costs significantly more than a standard call",
    voipMobilePrefixes: AU_VOIP_MOBILE_PREFIXES,
    areaCodes: AU_STD,
    emergencyNumbers: ["000", "112", "106"],
    tollFreeFlag:
      "Free-call 1800 numbers are commonly faked by scammers pretending to be banks or government — always verify by calling the number from the organisation's official website",
    sharedCostFlag:
      "1300/13xx numbers are commonly faked by scammers pretending to be the ATO, myGov, or Centrelink — verify by calling the number from the government website",
  },

  callbackBrands: CALLBACK_BRANDS,
  // Domestic exchanges; binance/coinbase come from base.
  cryptoExchanges: ["coinspot", "swyftx"],
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
};
