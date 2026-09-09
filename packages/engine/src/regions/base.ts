// Universal signals — shared by every region.
//
// Nothing here should reference a specific country's agencies, brands or number
// plan. If a signal only makes sense in one country, it belongs in that
// region's pack instead. Anything added here is inherited by every region for
// free, so the bar is "would this be true in any market?".

import type { BaseSignals } from "./types";

// Generic pressure/urgency language common to nearly all scam messaging.
//
// Bare "your account" is deliberately absent. It is a noun phrase, not
// pressure language: "your account balance is available", "your account will
// renew on 3 September" and "your account is now active" are ordinary
// service messages, and it scored +10 on every one of them. Nothing about
// owning an account is a scam signal — what makes these messages scams is the
// threat or instruction attached, which the entries around it already carry
// ("account suspended", "verify now", "act now", "immediately").
//
// The verb-phrase forms below are the part that means something: an
// instruction to act on the account, rather than a mention of it. They keep
// the "verify your account now" shape scoring without flagging every
// transactional notification a bank sends.
const URGENCY_GENERIC = [
  "urgent", "immediately", "act now", "limited time", "expires today",
  "account suspended", "verify now", "confirm now", "last chance",
  "final notice", "security alert", "unusual activity",
  "verify your account", "confirm your account", "validate your account",
  "secure your account", "update your account", "reactivate your account",
  "your account has been", "your account will be",
  // The threat *state*, which is what distinguishes a scam from a service
  // notice — "your account is locked" versus "your account is now active".
  // The state word carries the signal, so it is matched rather than the bare
  // noun phrase.
  "account is locked", "account is suspended", "account is on hold",
  "account has been locked", "account has been suspended",
  "account will be closed", "account will be suspended",
  "click here", "click link", "tap here", "don't ignore", "action required",
  // "respond immediately" is deliberately absent: "immediately" above already
  // matches it, so listing both scored one phrase twice (#234).
  "within 24 hours", "within 48 hours",
];

// AI voice-clone scams. The first block is the original "Hi Mum" follow-up
// signals (D17 — watchlist); the second is the 2026 bail/kidnap/stranded
// escalation (D8 / #68), arriving as text after a cloned-voice call.
const URGENCY_VOICE_CLONE = [
  "i've been in an accident", "don't tell mum", "don't tell anyone",
  "western union", "wire transfer",
  "bail money", "need bail", "post bail", "get me out of jail",
  "stranded overseas", "stuck overseas", "stranded abroad", "wallet stolen overseas",
  "do not call police", "don't call the police", "don't contact police",
  "emergency transfer", "emergency funds needed", "we have your",
];

const REWARD_WORDS = [
  "winner", "won", "congratulations", "prize", "reward", "free",
  "gift card", "voucher", "lucky", "selected", "chosen", "claim",
  "unclaimed", "$1000", "$500", "cash", "jackpot",
  // Loyalty-points expiry phishing (D6 / #57). "loyalty points" is
  // deliberately the longer two-word phrase, not bare "points", to keep
  // legitimate transactional mail from tripping on a single word — and the
  // scorer only reaches likely_scam when these compound with a URL or urgency
  // signal. "reward points" is not listed: "reward" above already matches it,
  // so the pair scored one phrase twice (#234).
  "points will expire", "points expiring",
  "loyalty points", "points forfeited",
  // Celebrity-deepfake investment bait (D6 / #85 / WA Gov 2026). Promising
  // "guaranteed returns" or "risk-free" investment is prohibited conduct for
  // licensed financial products in every regulated market, so these phrases
  // are red flags regardless of region. Regulator-endorsement claims
  // ("verified by <regulator>") live in the region packs, since the named
  // body differs.
  // "risk-free investment" is not listed: "free" above already matches inside
  // it, so the pair scored one phrase twice (#234).
  "guaranteed returns", "guaranteed profit",
  "double your money", "exclusive investment opportunity",
  // Second-victimisation recovery-fraud bait (D2 / #179 / CAFC advisory Jul
  // 2026). Scammers target people who have already lost money to a scam,
  // offering to "recover" it for an upfront fee — the impersonated authority
  // varies by region (CAFC, IC3/FBI, ACCC, Action Fraud) but the bait
  // language is identical, so it belongs here rather than in one pack. No
  // legitimate financial-services provider describes itself as a "fund
  // recovery specialist". A lone hit scores 12 points (below the 20-point
  // "safe" threshold), so — same as the loyalty-points group above — these
  // only tip a verdict when they compound with another signal.
  "recover your lost funds", "fund recovery specialist",
  "funds recovery service", "asset recovery specialist",
  "scam recovery specialist", "we can recover your money",
  "get your money back from scammers", "recover your stolen funds",
];

const REQUEST_WORDS = [
  "bank details", "credit card", "password", "pin",
  "date of birth", "social security", "confirm identity",
  "verify identity", "personal information", "account number",
  "crypto", "bitcoin", "gift card", "itunes", "google play",
  // Remote-access-tool scams (D8 / #55)
  "teamviewer", "anydesk", "remote access", "remote desktop",
  "download software", "install software", "give us access",
  // Pig-butchering / wallet-approval phishing (D12 / #51)
  "connect wallet", "approve transaction", "wallet approval",
  "sign transaction", "recharge your account", "top up your account",
  // Bank "safe account" tag-team scam (#47). SMS primes the victim, then a
  // spoofed-number caller tells them to move money to a "safe account" — a
  // phrase real banks never use (CBA/NAB/AFP advisories confirm this, and the
  // script is used internationally).
  "safe account", "safe transfer", "safe wallet",
  "move your funds", "transfer to safe", "protect your money",
  // Physical courier cash/card collection fraud (#168). A cross-regional
  // pattern active concurrently in AU, GB and IE this cycle (AFP Feb 2026;
  // Cumbria Police 3 Aug 2026; Hertfordshire Aug 2026 — £63k; AIB IE 7 Aug
  // 2026), so it belongs in base rather than one pack. A caller posing as
  // police/bank says a courier will collect the victim's card, PIN or cash
  // "for safekeeping" — a distinct script from the digital safe-account
  // variant above. "withdraw cash and" is the weakest entry (an instruction
  // prefix) and only contributes when compounded with authority/urgency
  // signals; "collect your card" stays clear of branch pickup notices, which
  // say "pick up" or "collect from the branch", never the imperative form.
  "courier will collect", "send a courier", "collect your card",
  "hand over your card", "withdraw cash and",
  // ClickFix fake-CAPTCHA social engineering (D3 / #74 / ACSC advisory May 2026).
  // Compromised sites display a fake Cloudflare overlay telling users to press
  // Win+R, paste a PowerShell command and run it. No legitimate site asks this;
  // the dedicated regex in scamDetector scores the strongest variants higher.
  "press windows+r", "press win+r", "press windows + r",
  // ClickFix Windows Terminal variant (#164 / Microsoft Threat Intelligence,
  // SecurityWeek — Feb 2026). Instead of the Run dialog, the lure says press
  // Win+X → "I" to open Windows Terminal (wt.exe), then paste PowerShell —
  // evading RunMRU forensics and Run-launched-process controls. No legitimate
  // consumer message instructs Win+X → Windows Terminal, so FP risk is very low.
  "press windows+x", "press win+x", "open windows terminal",
  "ctrl+v then enter", "ctrl v and enter",
  "paste this command", "paste the following command", "paste the command below",
  "run this to verify", "run the following to verify", "run this fix",
  "open run dialog", "open the run dialog",
  "copy and paste this fix", "paste to fix your browser",
  // ClickFix macOS variant (D3 / #143 / ACSC ASC-2026-0809, Sophos X-Ops,
  // CrowdStrike, CISA — all 9 Aug 2026). Same tactic, different keystroke: the
  // fake overlay says press Cmd+Space, open Terminal, paste a `curl | bash`.
  //
  // These are deliberately the *weaker* half of the signal. "open terminal" and
  // "run in terminal" appear verbatim in legitimate developer documentation, so
  // they only inform the compound score — a lone hit is +15 in checkSms and +8
  // in checkCustom, both well under the 20-point "suspicious" threshold, so an
  // install guide stays "safe" on its own. The high-confidence path is
  // isMacClickFix in scamDetector, which requires a Terminal/Spotlight cue and a
  // paste instruction together.
  //
  // No `curl … | bash` entry here: this list is matched with a plain substring
  // test, and a real command has a URL between the flags and the pipe
  // ("curl -s https://… | sh"), so a literal "curl | bash" can never match. The
  // piped-shell case is handled by the shellPipe regex in isMacClickFix, which
  // can span the URL.
  "open terminal", "press cmd+space", "press command+space",
  "open spotlight", "paste in terminal", "run in terminal",
  // Rental/property bond redirect fraud (D5 / #105). Scammers impersonate or
  // intercept real estate agency comms and send "updated bank details" just
  // before the bond is due. Legitimate agencies rarely change payment details
  // and never under time pressure via SMS, so the "updated/new/changed"
  // qualifier is the distinguishing signal — bare "rental bond" doesn't score.
  //
  // "updated bank details" is deliberately absent: this list is
  // substring-matched and "bank details" above already matches it, so listing
  // both scored one phrase twice (+30 instead of +15). The qualifier did no
  // filtering — it only inflated the score. The two entries below carry no such
  // overlap ("account details" and "bank account" are not listed alone), so the
  // redirect-fraud signal is unaffected; the rental *context* is what escalates
  // it, via the bond composite in checkSms.
  "new account details", "changed bank account",
  // Fake-landlord accommodation-deposit fraud (D3 / #180 / An Garda Síochána
  // advisory Aug 2026, seasonal college-intake spike). The script: the
  // "landlord" is conveniently overseas, so no viewing and no keys in person —
  // just a deposit by bank transfer to hold a room that was never available.
  // The pattern is global; the Irish warnings were the catalyst, not the scope.
  //
  // The absent-landlord and hold-the-room phrasings carry the signal. A
  // legitimate letting agent has local staff and takes deposits through a
  // tenancy-deposit scheme, so neither is ordinary rental language.
  //
  // Not listed: "cannot view the property" / "unable to show the property"
  // (real property managers say both in maintenance contexts), and the
  // "keys will be posted" family — see KEYS_BY_POST_PHRASES below, which is
  // gated on rental context rather than scoring flat.
  "landlord is abroad", "landlord is currently overseas",
  "landlord is currently abroad",
  "pay deposit to hold the property", "send deposit to hold the property",
  "deposit to secure the room", "deposit to reserve the room",
  "transfer deposit to hold",
  // Crypto seed-phrase solicitation (D3 / #272 / NASC media release Sep 2026;
  // TechCrunch 17 Aug 2026 hardware-wallet breach coverage). The wallet-approval
  // group above covers "connect wallet" / "approve transaction", but not the
  // seed-phrase ask, which is the higher-severity request: an approval drains
  // one allowance, a seed phrase hands over the whole wallet permanently.
  //
  // FP risk is very low. No legitimate service ever asks for a seed phrase, and
  // the only ordinary consumer use of the term is the instruction never to share
  // it — which is negated phrasing ("never share your seed phrase") and so is
  // handled by the negation guard rather than by omitting the entry.
  //
  // Listed as the two shortest forms that carry the signal. "recovery seed
  // phrase", "wallet recovery phrase" and "secret recovery phrase" are all
  // deliberately absent: this list is substring-matched, and "seed phrase" /
  // "recovery phrase" already match inside every one of them, so listing them
  // would make the longer entry unreachable and score one phrase twice. Same
  // convention as the "updated bank details" note above, and enforced by the
  // pack-shadowing invariant in __tests__/packShadowing.test.ts.
  "seed phrase", "recovery phrase",
  // Money-mule recruitment (D5 / #273 / AFP media release Jul 2026; An Garda
  // Síochána advisory Aug 2026; Lloyds Bank fraud blog Aug 2026). Targets
  // under-25s via social media and SMS. The victim is the recruit, who is
  // committing an offence without knowing it — so this reaches a person the
  // other request groups do not.
  //
  // "money mule" and "financial courier" carry near-zero FP: no legitimate
  // employer uses either term to a candidate. The transfer phrasings are the
  // weaker half and only tip a verdict when compounded, which is the right
  // ceiling — payment-processing onboarding does use adjacent language.
  "money mule", "financial courier", "act as a payment agent",
  "transfer funds on our behalf",
  "receive transfers into your account",
];

// The medium-confidence half of D3 (#180). "Keys will be posted to you" is a
// perfectly ordinary letting message on its own — it only becomes a signal
// alongside the rest of the remote-landlord script. The issue left the
// fire-alone-or-gate decision to implementation; these are gated, because a
// flat REQUEST_WORDS entry would flag legitimate move-in mail. Consumed by the
// rental composite in scamDetector, never scored by themselves.
export const KEYS_BY_POST_PHRASES = [
  "keys will be sent by post", "keys will be posted to you",
  "post the keys to you",
];

const SCAM_DOMAINS = [
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "short.io",
  "rb.gy", "cutt.ly", "is.gd", "v.gd", "tiny.cc", "shorte.st",
];

const SUSPICIOUS_TLDS = [
  ".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".win",
  ".loan", ".work", ".click", ".link", ".online", ".site", ".live",
  // High-abuse 2026 TLDs (D4 / #50, #58) — Shortdot-managed + ICANN expansion
  ".cyou", ".icu", ".sbs", ".cfd", ".bar", ".beauty", ".hair", ".makeup",
  // Immigration/visa scams using .pn (Pitcairn) to look semi-official (D14 / #50)
  ".pn",
  // File-extension TLDs (Google 2023, D6 / #77) — auto-linked by some platforms
  // to look like file downloads (invoice.zip, message.mov); no legitimate
  // consumer use.
  ".zip", ".mov",
  // .lat — high phishing-abuse ratio, appearing in AU-targeting campaigns 2025-26.
  ".lat",
  // High-abuse 2026 TLDs promoted from watchlist (D1 / #101). .shop and .store
  // are top-10 globally abused TLDs (Brandsec AU 2025-2026) seen in
  // fake-retail and subscription-renewal campaigns; .vip appears in the APWG
  // top-10 and in pig-butchering funnels; .lol and .monster are cheap ICANN
  // TLDs from the same XYZ.COM stable. .shop/.store carry some legitimate
  // e-commerce use, so they lean on compound scoring rather than reaching a
  // scam verdict alone.
  //
  // Evidence re-sourced 2026-08-29 to Interisle Phishing Landscape 2025
  // (May 2024 - April 2025, ~4M reports): .LOL is 96% maliciously registered
  // (24,187 domains, 5th highest of any gTLD) and new gTLDs as a class are 87%
  // maliciously registered vs 67% for .com/.net. .shop is Top-20 most-reported
  // in all five annual studies. NB .monster and .vip are NOT individually
  // measured by Interisle — they ride on the cohort base rate, not a per-TLD
  // figure. See docs/threat-intel/sources.yml (interisle.net).
  ".shop", ".store", ".vip", ".lol", ".monster",
  // Highest-confidence additions from Interisle 2025: both 100% maliciously
  // registered, i.e. essentially no legitimate registrations observed. .BOND
  // is 3rd in the five-year malicious-phishing ranking (79,875 domains) and
  // .XIN tops the 2025 phishing-score table (42,724 domains). Neither has
  // meaningful legitimate AU consumer use.
  ".xin", ".bond",
];

// Public IPFS gateways — decentralised hosting used for takedown-resistant
// phishing. Any host serving the /ipfs/<CID> path is also caught in checkUrl.
const IPFS_GATEWAYS = new Set([
  "ipfs.io", "dweb.link", "cloudflare-ipfs.com",
  "w3s.link", "gateway.pinata.cloud", "nftstorage.link", "ipfs.fleek.co",
]);

// Free-tier cloud dev platforms used as phishing hosting infrastructure (D1/D2
// / #63). workers.dev, pages.dev (Cloudflare) and trycloudflare.com (ephemeral
// tunnels) are rated "trusted" by URL filters but are the dominant PhaaS hosting
// substrate of 2025-2026. railway.app and vercel.app are abused as
// credential-exfiltration endpoints in multi-hop chains — scored lower because
// legitimate preview sites on those two are more common.
const SUSPICIOUS_HOSTING = [
  "workers.dev", "pages.dev", "trycloudflare.com",
  "railway.app", "vercel.app",
  // Cloudflare R2 object storage (D4 / #83) — named alongside workers.dev/
  // pages.dev as a core phishing hosting layer in 2026 reporting; used to serve
  // static credential-harvest pages. Scored lower (+25) like railway/vercel
  // because R2 has legitimate public static-hosting use.
  "r2.dev",
  // ngrok ephemeral reverse-proxy tunnels (D1 / #119). Random-subdomain HTTPS
  // URLs that inherit ngrok.com's reputation and bypass URL filters exactly
  // like trycloudflare.com. No consumer service ships public ngrok URLs, so
  // these sit at the full +35 tier.
  "ngrok.io", "ngrok-free.app",
  // Static-site platforms abused for "trusted reputation" phishing (D2 / #120).
  // netlify.app matches the vercel.app FP profile (+25). github.io is scored
  // lowest (+15) because legitimate developer portfolios and project docs are
  // common there — it only matters when it compounds with another signal.
  "github.io", "netlify.app",
];

// Per-platform score overrides for SUSPICIOUS_HOSTING. Anything not listed here
// scores the default +35 (see checkUrl). Lower tiers exist where the platform
// has substantial legitimate consumer-visible use, so a bare URL shouldn't
// reach a "suspicious" verdict on hosting alone.
const HOSTING_SCORES: Record<string, number> = {
  "vercel.app": 25,
  "railway.app": 25,
  "r2.dev": 25,
  "netlify.app": 25,
  "github.io": 15,
};

// Named fraudulent AI-trading platforms (D4 / #104). These are promoted via
// deepfake celebrity video ads internationally, not to one market, and no
// legitimate financial service uses any of these names — so a bare match is
// near-zero false-positive. Regions may append their own locally-warned names.
const FAKE_INVESTMENT_PLATFORMS = [
  "quantum ai", "quantum trade ai", "quantum trade wave",
  "immediate edge", "immediate connect", "immediate x3",
  "bitcoin era", "bitcoin trader",
];

// Cover brands for TOAD / callback phishing (D2 / #102). Fake subscription or
// purchase-invoice emails naming one of these, with a phone number and NO link,
// are the core signal — the scam happens on the phone, not via a URL. These are
// the globally-operating brands; regions append their own (e.g. local crypto
// exchanges).
const CALLBACK_BRANDS = [
  "norton", "mcafee", "geek squad", "geeksquad", "best buy",
  "docusign", "coinbase", "bitcoin",
];

// Globally-operating crypto exchanges used in the "your account is suspended,
// call us" SMS script. Binance and Coinbase operate in essentially every market,
// so they sit in base; regions append their domestic exchanges.
//
// Named brands only. The TOAD flag quotes whichever entry matched, so a generic
// phrase like "crypto exchange" would render "crypto exchange and other
// exchanges never ring customers" — defeating the point of naming the brand.
// The generic phrasing is still caught as a brand mention via brandMentions.
const CRYPTO_EXCHANGES = ["binance", "coinbase", "kraken"];

/**
 * Chinese-authority impersonation terms, shared by every region pack.
 *
 * Exported rather than declared per-pack because the identical block was
 * copy-pasted into all six national packs. The scam is diaspora-targeted, not
 * country-targeted — the same script runs against Chinese communities in
 * Australia, the UK, Canada, the US, NZ and Ireland — so there was never a
 * regional reason for six copies, and six copies meant a fix had to be applied
 * six times or silently diverge. Packs spread this and append their own
 * (`interpol`/`europol` outside AU).
 *
 * WORD ORDER IS LITERAL. Matching is `\b`-delimited substring, so "embassy of
 * china" does not match "Chinese Embassy" — the natural English form, and the
 * one a scam message actually uses. Both orders are therefore listed for each
 * institution. Audited 2026-08-10; before that "Chinese Embassy" scored 0 while
 * "embassy of china" scored 31.
 *
 * Deliberately excluded, and why — each of these is a *topic* rather than an
 * institution, appearing in legitimate news, migration-law and university copy,
 * and the flag is worth +35 on its own:
 *   · "chinese immigration"  — listed as an IOC in the 2026-07-26 roadmap, but
 *                              "Chinese immigration rules changed in 2026" is
 *                              ordinary migration-agent copy.
 *   · "chinese government"   — routine in news reporting.
 *   · "china police"         — the adjectiveless form is not idiomatic English
 *                              and mostly appears in headlines about China.
 * Adding any of these needs a source showing the phrasing in a real lure.
 */
export const CHINESE_AUTHORITY_MENTIONS = [
  // Police. "Public security bureau" (公安局) is the actual name of the body
  // being impersonated, and the one a victim would be told over the phone.
  "chinese police", "beijing police", "shanghai police",
  "public security bureau",
  // Consulate / embassy, both word orders.
  "chinese consulate", "consulate of china",
  "chinese embassy", "embassy of china",
  // Customs, immigration and the catch-all.
  "chinese customs", "chinese immigration authority", "chinese authorities",
];

export const BASE_SIGNALS: BaseSignals = {
  urgency: {
    generic: URGENCY_GENERIC,
    voiceClone: URGENCY_VOICE_CLONE,
  },
  rewardWords: REWARD_WORDS,
  requestWords: REQUEST_WORDS,
  shortenerDomains: SCAM_DOMAINS,
  suspiciousTlds: SUSPICIOUS_TLDS,
  ipfsGateways: IPFS_GATEWAYS,
  suspiciousHosting: SUSPICIOUS_HOSTING,
  hostingScores: HOSTING_SCORES,
  fakeInvestmentPlatforms: FAKE_INVESTMENT_PLATFORMS,
  callbackBrands: CALLBACK_BRANDS,
  cryptoExchanges: CRYPTO_EXCHANGES,
};

// Family-impersonation opener — the "Hi Mum" / "Hi Dad" script (D2 / #251).
//
// URGENCY_VOICE_CLONE above already covers the *escalated* phrasings — bail
// money, stranded overseas, don't call the police. Those are the second or
// third message in the thread. The opener is what actually lands first, and it
// scored nothing: "mum send me 400 my phone broke, send it as quick as you
// can" produced zero signals, because every word in it is ordinary family
// texting.
//
// That is exactly why it needs to be a gated composite rather than flat
// urgencyWords entries. "mum" alone is one of the most common words in a
// legitimate SMS inbox; so is "my phone broke". Each list below is innocent by
// itself and is never scored alone — the composite in scamDetector requires a
// relation term plus a contact-change or new-number pretext plus a money ask.
// Scored there, not here: the pack stays data, never logic.

/** Family relation terms used as the opening address. */
export const FAMILY_RELATION_TERMS = [
  "mum", "mom", "mama", "mother",
  "dad", "papa", "father",
  "son", "daughter",
];

/**
 * The pretext that explains why the message comes from an unknown number —
 * the load-bearing half of the script. A real family member texting from their
 * own number has no reason to explain the number.
 */
export const NEW_NUMBER_PRETEXT_PHRASES = [
  "new number", "new phone number", "this is my new",
  "phone broke", "phone is broken", "broke my phone",
  "dropped my phone", "lost my phone", "phone got stolen",
  "phone died", "cracked my screen", "water damage",
  "using my friend's phone", "on my friend's phone",
  "text me on this number", "save this number", "delete my old number",
  "this is my temporary number", "old phone is dead",
];
