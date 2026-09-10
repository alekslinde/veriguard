import { parseEmailHeaders, analyseEmailIdentities, domainOf } from "./emailHeaders";
import { extractIdentifiers, normaliseForAnalysis, defang, refang, isDefanged, normaliseUnicode, hasMixedScriptHost, displayedHyphenCount } from "./urlSanitizer";
import { registrableLabel, publicSuffix, isNationalCommercialSuffix } from "./publicSuffix";
import { findKeyboardTypo } from "./keyboardAdjacency";
import { BASE_SIGNALS } from "./regions/base";
import { detectType } from "./detectType";
import { analysePhone, PhoneIntel } from "./phoneIntel";
import { isShortened, expandUrl, type ExpandFetch } from "./urlExpander";
import { resolveRegionPack, supportedRegions, DEFAULT_REGION, type RegionInput, type RegionCoverage, type RegionPack } from "./regions";
import { KEYS_BY_POST_PHRASES, FAMILY_RELATION_TERMS, NEW_NUMBER_PRETEXT_PHRASES } from "./regions/base";
import type { CheckResult, Signal, SignalSource } from "./engineTypes";

// ScamType and CheckResult live in engineTypes.ts to break the import cycle
// with detectType (see the note there). Re-exported here so every existing
// consumer keeps importing them from the scorer.
export type { ScamType, CheckResult } from "./engineTypes";
export type { Signal, SignalSource } from "./engineTypes";
export type { PhoneIntel };

// ────────────────────────────────────────────────────────────────────────────
// Evidence collection
// ────────────────────────────────────────────────────────────────────────────
//
// Every checker below builds a Signals list rather than pushing to a bare
// string[] and mutating a separate score. The two were always meant to move
// together — a reason without its weight cannot explain a verdict — and keeping
// them in one call makes it impossible to add a reason and forget the points,
// or to change a weight and leave the wording describing the old one.
//
// `total()` is the pre-clamp sum. Clamping stays at the call sites that already
// did it, because the ceiling is part of each checker's policy, not of
// collection: see finalise(), which records the clamp as its own visible row.

/** A signal row plus, while scanning, its unresolved corroborated alternative. */
type PendingSignal = Signal & { deferred?: { corroborated: string; points: number } };

class Signals {
  private readonly list: PendingSignal[] = [];

  /** Record one reason and the points it contributes. Returns the points so a
   *  caller can still branch on what it just added. */
  add(source: SignalSource, text: string, points = 0): number {
    this.list.push({ text, points, source });
    return points;
  }

  /**
   * Fold in a sub-result (the SMS pass over an email body, the header identity
   * check). Its reasons keep their own wording, and `weight` divides the
   * sub-total across them in proportion to what each contributed, so the rows
   * still sum to the weighted score the caller adds. A sub-result that carries
   * no signals of its own falls back to one row holding the whole amount.
   */
  merge(source: SignalSource, sub: { flags: string[]; signals?: Signal[] }, weighted: number): number {
    const inner = sub.signals?.filter((x) => x.source !== "score") ?? [];
    const rawTotal = inner.reduce((n, x) => n + x.points, 0);
    if (inner.length && rawTotal > 0) {
      let handed = 0;
      inner.forEach((x, i) => {
        // Last row takes the remainder so rounding never loses or invents a point.
        const share = i === inner.length - 1 ? weighted - handed : Math.round((x.points / rawTotal) * weighted);
        handed += share;
        this.list.push({ text: x.text, points: share, source });
      });
      return weighted;
    }
    for (const text of sub.flags) this.list.push({ text, points: 0, source });
    if (weighted !== 0) {
      this.list.push({ text: sub.flags[0] ?? "Sub-check contribution", points: weighted, source });
    }
    return weighted;
  }

  /**
   * Lift one already-merged row back to its full pre-discount weight.
   *
   * Exists for signals that a channel-wide multiplier should not apply to (see
   * the family-impersonation floor in checkEmail). Deliberately narrow: it
   * raises a single row it can identify by its opening text, never the total,
   * so the evidence list still sums to the score the reader is shown.
   */
  restore(prefix: string, points: number): void {
    const row = this.list.find((s) => s.text.startsWith(prefix));
    if (row && row.points < points) row.points = points;
  }

  /**
   * Record a row whose weight depends on whether anything ELSE scores.
   *
   * The authority-mention rule needs "is this corroborated", and asking mid-scan
   * answers a different question: whether corroboration happened to be found
   * *before* this point in the function. Signals added later — the call-back
   * prompt, foreign-authority, brand and crypto rules all run afterwards — could
   * not corroborate it, so "ATO: you owe a debt. Call back now on 1800 123 456"
   * reported "nothing else unusual in the message" while a call-back signal
   * scored 20 forty lines below.
   *
   * The row is placed now, so evidence keeps the order it was found in, and
   * resolved by resolveDeferred() once every rule has run.
   */
  addDeferred(source: SignalSource, alone: string, corroborated: string, points: number): void {
    this.list.push({ text: alone, points: 0, source, deferred: { corroborated, points } });
  }

  /**
   * Settle every deferred row against the finished evidence list.
   *
   * "Corroborated" means some OTHER row scored — a deferred row cannot
   * corroborate itself, and two deferred rows cannot corroborate each other.
   */
  resolveDeferred(): void {
    const scoredElsewhere = this.list.some((s) => s.points > 0 && !s.deferred);
    for (const row of this.list) {
      if (!row.deferred) continue;
      if (scoredElsewhere) {
        row.text = row.deferred.corroborated;
        row.points = row.deferred.points;
      }
      delete row.deferred;
    }
  }

  /**
   * Pre-clamp sum of every contribution.
   *
   * Settles deferred rows first: their weight is a question about the finished
   * evidence list, and every caller reads the total exactly once, after all
   * rules have run. resolveDeferred is idempotent, so a second read is safe.
   */
  total(): number {
    this.resolveDeferred();
    return this.list.reduce((n, s) => n + s.points, 0);
  }

  get length(): number {
    return this.list.length;
  }

  /** Reader-facing sentences, in the order they were found. */
  texts(): string[] {
    return this.list.map((s) => s.text);
  }

  all(): Signal[] {
    return [...this.list];
  }

  /**
   * Close the list off at a final score, appending a "score" row whenever the
   * clamp actually bit. Without that row the evidence visibly fails to add up:
   * six signals totalling 130 above a headline reading 100 looks like a bug to
   * anyone who checks our arithmetic, and we invite them to.
   *
   * Only when the total *overshot*. A raw total below the score is not a clamp
   * — it is the shortener-expansion path, which carries both sides' rows as
   * pointless evidence and takes the worse of the two scores rather than their
   * sum. Treating that as a clamp produced "Signals total 0 — the score is
   * capped at 55", which is arithmetic nonsense in the one place we are asking
   * to be checked on our arithmetic.
   */
  finalise(score: number): Signal[] {
    const raw = this.total();
    if (raw > score) {
      this.list.push({
        text: `Signals total ${raw} — the score is capped at ${score}`,
        points: score - raw,
        source: "score",
      });
    }
    return this.all();
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Signal lists
// ────────────────────────────────────────────────────────────────────────────
//
// Signals live in region packs (lib/regions/), not here. The scoring logic below
// is shared by every region; only the data it matches against changes.
//
// Every checker takes an optional region code and resolves its pack per call.
// Resolution is memoised and falls back to DEFAULT_REGION for anything
// unrecognised, so omitting the argument preserves the original AU behaviour.

/**
 * Match a pack entry against text: word boundaries for single tokens,
 * substring for multi-word phrases.
 *
 * Agency lists (`authorityMentions`, `noLinkSenders`, `foreignAuthorityMentions`)
 * are plain string arrays rather than a BrandSet, so they have no explicit
 * substring/word split — and national agency acronyms are overwhelmingly three
 * letters. Plain `includes()` therefore fires inside ordinary English, which is
 * not a theoretical risk: it was found flagging "your account is fine" as
 * government impersonation (NZ "acc" ⊂ "account") and would have read "message"
 * as the SSA, "security" as the SEC, and "weird"/"third" as the IRD.
 *
 * That protection used to stop at 4 characters, which left the same failure
 * mode wide open one letter further up (#233): "claim" fired inside
 * "unclaimed" and "reclaiming", "prize" inside "prizewinning", "voucher"
 * inside "voucherless". "Unclaimed baggage goes to the storage room" reached
 * suspicious (24) on nothing but ordinary English. Length was never the real
 * distinction — token-ness is. A single token has boundaries to respect; a
 * multi-word phrase is already specific enough that its own spaces do the work,
 * and anchoring it would break the punctuation-tolerant matching it relies on.
 *
 * Boundary matching is *not* the same as exact matching, which is why this is
 * safe for the domain and hyphen entries the packs are full of: \b sits at any
 * non-word character, so "medicare" still matches "medicare.gov.au", "gov.au"
 * still matches "ato.gov.au", and "target" still matches "target-shop".
 *
 * What it does drop is letter-adjacent compounds — "garda" no longer fires
 * inside "gardai", nor "crypto" inside "easycrypto". Every such compound in the
 * packs today is already listed as its own entry, so this costs no coverage.
 * The one deliberate exception was AU's "mygov" ⊂ "mygovid" (see the note in
 * au.ts REQUEST_WORDS); myGovID lures are still carried by identityRereg and
 * authorityMentions, which name the rebrand explicitly.
 *
 * The rule is structural rather than a curated list because the failure mode is
 * mechanical: any token collides eventually, and a new pack should inherit the
 * protection without anyone remembering to opt in.
 */
/**
 * Inflectional endings tolerated after a long single-token entry. Deliberately
 * a closed set of grammatical suffixes rather than "any letters": the point is
 * to follow a word into its own inflections without letting it wander into a
 * different word ("voucher" must not reach "voucherless").
 */
const INFLECTION = "(?:s|es|ed|d|ing|ly)?";

/**
 * Entries this long or shorter get no inflection tolerance.
 *
 * The suffix allowance was originally unconditional, which quietly undid the
 * #196 protection from the other end: "pin" reached "pins", "free" reached
 * "freed", "cash" reached "cashed". Those stack — "The pins fell over and the
 * cheque was cashed and the prisoner freed" scored 39 (suspicious) on three
 * fragments of ordinary English, worse than the behaviour #233 set out to fix.
 *
 * The threshold is the one #196 established, kept deliberately: at four
 * characters and under, every entry across the packs is a standalone word or
 * identifier (tfn, ppsn, nino, $500, 401k, ato, pin, free, cash) whose
 * inflections are either meaningless or someone else's word. Above it, entries
 * are real words that inflect — "urgent"/"urgently", "claim"/"claiming".
 */
const INFLECTION_MIN_LEN = 4;

/**
 * How a pack entry is matched against text.
 *
 * Exported so the pack guards in __tests__ can model matching with the engine's
 * own rule instead of a hand-copied mirror — three copies of this logic drifted
 * apart once already (#233 review).
 */
/**
 * Substring match, tolerant of whitespace variation but WITHOUT word boundaries.
 *
 * For lists whose entries are meant to fire inside a longer token — brand names
 * in "amazonsupport.tk", an exchange in "coinspotsecure.com". mentions() refuses
 * exactly those, so routing these lists through it dropped a live lure from 20
 * to 0; includes() catches them but reintroduces the literal-single-space bug
 * for the multi-word entries (fakeInvestmentPlatforms is 8/8 multi-word). This
 * is the intersection: the words stay glued-matchable, the gaps between them
 * match any run of whitespace.
 */
export function containsLoose(text: string, entry: string): boolean {
  const needle = entry.toLowerCase();
  if (!/\s/.test(needle)) return text.includes(needle);
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replace(/\s+/g, "\\s+"), "i").test(text);
}

export function mentions(text: string, entry: string): boolean {
  const needle = entry.toLowerCase();
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Multi-word phrases keep substring matching — their specificity is their
  // own protection, and \b would break matching across punctuation — but the
  // gap between the words is matched as \s+ rather than the literal single
  // space the entry happens to be written with.
  //
  // An includes() here made every phrase in the packs defeatable by any
  // whitespace variation: a doubled space, a tab, a hard wrap mid-phrase, or
  // the non-breaking space a mail client leaves behind when text is pasted out
  // of Word. That is ~65% of every region pack (2,917 of 4,493 entries), and it
  // failed silently — "Hi Mum, I dropped  my phone …" dropped from likely_scam
  // to safe with no flags at all, because the family-impersonation gate needs
  // its pretext phrase and had no other way to see one. Whitespace carries no
  // meaning inside a phrase, so nothing is given up by ignoring its shape.
  //
  // Only the separators are relaxed. The words themselves stay literal, and no
  // boundary is asserted at either end, so this matches exactly what
  // includes() did on well-formed input.
  if (/\s/.test(needle)) {
    return new RegExp(escaped.replace(/\s+/g, "\\s+"), "i").test(text);
  }
  // \b is a word-character boundary, so an entry that starts or ends with a
  // non-word character (".shop", "gov.au") has no boundary to anchor on there —
  // asserting one would never match. Anchor each side only where it applies.
  const left = /^\w/.test(needle) ? "\\b" : "";
  // The start is anchored hard but the end tolerates an inflection, because the
  // two directions fail differently. A collision is almost always a PREFIX
  // one — "claim" inside "unclaimed" and "reclaiming", "prize" inside
  // "prizewinning", "free" inside "freemoney.tk" — and anchoring the start
  // kills all of those. Refusing a trailing "-ly"/"-ing"/"-ed" instead throws
  // away real hits: "urgent" is listed, and "act urgently" is the same signal
  // in the same message. An exact-match rule measured that as a live
  // regression, dropping the "claim now at freemoney.tk urgently" evasion case
  // in bareHostname.test.ts from suspicious to safe.
  // Short entries get a hard right anchor: their inflections are other words.
  const suffix = needle.length > INFLECTION_MIN_LEN ? INFLECTION : "";
  const right = /\w$/.test(needle) ? `${suffix}\\b` : "";
  return new RegExp(`${left}${escaped}${right}`, "i").test(text);
}

function mentionsAny(text: string, entries: string[]): boolean {
  return entries.some((entry) => mentions(text, entry));
}

const WIN_CLICKFIX_FLAG =
  "'Press Win+R' instruction detected — this is ClickFix social engineering: scammers trick you into running malware on your own computer disguised as a 'human verification' step";

const MAC_CLICKFIX_FLAG =
  "'Open Terminal and paste this' instruction detected — this is the macOS ClickFix variant: a fake CAPTCHA or 'browser fix' overlay talks you into running the attacker's command yourself, usually via Spotlight and Terminal. No legitimate site or verification step ever asks for this.";

/**
 * ClickFix macOS variant (D3 / #143 / ACSC ASC-2026-0809, 9 Aug 2026).
 *
 * The Windows path keys off "press Win+R", which nothing legitimate says. The
 * macOS equivalent has no such luxury: "open Terminal" and `curl … | bash` are
 * ordinary developer-documentation phrases, so matching either alone would flag
 * every install guide on the internet.
 *
 * So each branch needs two halves — the *delivery* cue (Spotlight/Terminal, or a
 * piped shell command) and the *clipboard* cue (a paste instruction, or the
 * fake-CAPTCHA framing that makes it social engineering). An install guide says
 * "run this in Terminal" and stops; the lure says "press Cmd+Space, open
 * Terminal, paste".
 *
 * Note the grouping: an unguarded `curl \| bash` alternative would fire on any
 * README, which is exactly the false positive the issue asked to avoid.
 *
 * Both cue halves are deliberately narrower than they first appear, because a
 * loose half defeats the two-half design — code review found each firing on its
 * own:
 *   - bare "copy" matched "open Terminal and copy the output into this ticket",
 *     which is content moving *out* of the shell, the opposite direction;
 *   - bare "spotlight" is an ordinary noun, so scam-awareness copy ("puts the
 *     spotlight on scam trends… copy the link") self-triggered the flag — this
 *     app publishes exactly that kind of writing.
 */
function isMacClickFix(text: string): boolean {
  const delivery =
    /\b(?:open|launch|start)\s+(?:the\s+)?terminal\b/i.test(text) ||
    /\b(?:cmd|command)\s*\+\s*space\b/i.test(text) ||
    // "spotlight" is an ordinary English noun ("puts the spotlight on scam
    // trends"), so it only counts as a delivery cue when used as the macOS
    // launcher — opening it, or searching in it.
    /\b(?:open|launch|press|hit|use|via)\s+(?:the\s+)?spotlight\b/i.test(text) ||
    /\bspotlight\s+(?:search|and\s+type|then\s+type)\b/i.test(text);
  const shellPipe = /\bcurl\b[^\n]{0,120}\|\s*(?:sudo\s+)?(?:ba|z|)sh\b/i.test(text);
  // Paste only — not bare "copy". The attack direction is content moving *into*
  // the user's shell; "copy the output into this ticket" is the opposite, and
  // matching it flagged a legitimate support instruction as likely_scam.
  // "copy" is still matched where it's explicitly paired with pasting.
  const clipboard =
    /\b(?:paste|pbpaste|ctrl\s*\+\s*v|cmd\s*\+\s*v|command\s*\+\s*v)\b/i.test(text) ||
    /\bcopy\b[^\n]{0,40}\b(?:paste|run|execute|enter|terminal)\b/i.test(text);
  // The fake-verification framing is itself a co-signal: it's what separates a
  // malicious paste instruction from a legitimate one.
  const captchaFraming =
    /\b(?:captcha|human verification|browser\s+(?:fix|repair|error))\b/i.test(text) ||
    // "…not a robot" / "…you are human", with any leading verb — the campaigns
    // vary it freely ("I'm not a robot", "confirm you are not a robot",
    // "verify you're human", "prove you are human").
    /\b(?:i'?m|i am|you'?re|you are)\s+(?:not\s+a\s+robot|(?:a\s+)?human)\b/i.test(text) ||
    /\b(?:confirm|verify|prove|check)\s+(?:that\s+)?(?:you'?re|you are|i'?m|i am)\s+(?:not\s+a\s+robot|(?:a\s+)?human)\b/i.test(text);

  return (delivery && (clipboard || captchaFraming)) ||
    (shellPipe && (clipboard || captchaFraming));
}

/** Entries matched, for the compounds that score on how many distinct hits. */
function mentionsCount(text: string, entries: string[]): number {
  return entries.filter((entry) => mentions(text, entry)).length;
}

/**
 * The MULTI-label suffixes on which a covered region's brands legitimately
 * register — `co.uk`, `com.au`, `co.nz`, `com.sg`.
 *
 * Consulted only for multi-label suffixes; single-label TLDs are exempt by
 * default, since that is where brands register worldwide and no list could
 * enumerate them (see the call site).
 *
 * The union across packs rather than a per-region lookup, because brands are
 * not confined to one country — `bankofireland.co.uk` is genuine, and `paypal`
 * is in all six full packs. What the union excludes is the case this exists
 * for: an open-registration foreign namespace like `.gov.co` or `.co.io`,
 * where a covered brand owning the label is evidence of a squat rather than of
 * ownership.
 *
 * Computed once. The packs are immutable, so this cannot go stale, and it keeps
 * the typosquat loop from rebuilding a set per URL.
 */
const BRAND_SUFFIXES: ReadonlySet<string> = new Set(
  supportedRegions().flatMap((code) => resolveRegionPack(code).brandSuffixes),
);

/**
 * The brands from the global floor, as a set for the ownership rule.
 *
 * These are the entries every pack inherits, so "is this brand global" cannot
 * be asked of the resolved pack — by then the two layers are unioned and
 * indistinguishable. Read from BASE_SIGNALS directly, which is the one place
 * that distinction survives.
 */
const GLOBAL_BRANDS: ReadonlySet<string> = new Set(BASE_SIGNALS.typosquatBrands);

// ────────────────────────────────────────────────────────────────────────────
// URL checker
// ────────────────────────────────────────────────────────────────────────────

export function checkUrl(
  raw: string,
  blocklist?: Set<string>,
  region?: RegionInput,
  /**
   * The URL as the user actually wrote it, before normaliseForAnalysis.
   *
   * Only the script-mixing check needs this. `new URL()` punycodes a non-ASCII
   * hostname on parse, so by the time a caller has normalised — which
   * analyzeContent does, and must, to close percent-encoding tricks — the
   * Cyrillic or Greek characters that make a homoglyph domain detectable are
   * gone, replaced by an all-ASCII "xn--" label.
   *
   * Optional so direct callers keep working: when omitted, `raw` is used, which
   * is correct for anyone who has not normalised first.
   */
  original?: string,
): CheckResult {
  const PACK = resolveRegionPack(region);
  const {
    shortenerDomains: SCAM_DOMAINS,
    suspiciousTlds: SUSPICIOUS_TLDS,
    ipfsGateways: IPFS_GATEWAYS,
    suspiciousHosting: SUSPICIOUS_HOSTING,
    hostingScores: HOSTING_SCORES,
    legitDomains: LEGIT_AU_DOMAINS,
    typosquatBrands: TYPOSQUAT_BRANDS,
  } = PACK;
  const sig = new Signals();
  let urlObj: URL | null = null;

  const input = raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`;

  try {
    urlObj = new URL(input);
  } catch {
    // A positive detection, so coverage doesn't gate it — but carry the value
    // through so consumers can still see which pack ran.
    return {
      verdict: "suspicious",
      score: 60,
      flags: ["Couldn't parse this as a valid URL — dodgy already"],
      details: "The link format looks off. Legit sites don't usually send malformed URLs.",
      coverage: PACK.coverage,
    };
  }

  // Trailing root dot stripped here, at the one place every hostname check in
  // this function reads from, rather than at each caller. "evil.tk." is a valid
  // FQDN for the identical host, but it survives URL parsing into `hostname`
  // and defeats every `=== d` and `endsWith("." + d)` below.
  //
  // It cuts BOTH ways, which is why this belongs at the entry point and not in
  // one matcher: a scam on "evil-login.tk./x" evaded the suspicious-TLD check
  // (55 → 25), and a real "ato.gov.au./mytax" missed the legit-domain
  // allowlist. Callers that route through normaliseForAnalysis were already
  // covered; the ones that hand checkUrl a raw regex match were not, so the
  // protection depended on which path the string arrived by.
  const hostname = urlObj.hostname.toLowerCase().replace(/\.+$/, "");
  const fullUrl = input.toLowerCase();

  // Known-legitimate domains for this region — strong positive signal. Routed
  // through the coverage gate because the allowlist is itself regional: under
  // partial coverage the list is thin, so a miss here means "not on our short
  // list", not "not legitimate".
  if (LEGIT_AU_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))) {
    return downgradeForCoverage(
      {
        verdict: "safe",
        score: 5,
        flags: [PACK.legitDomainFlag],
        details: PACK.legitDomainDetails,
        coverage: PACK.coverage,
      },
      PACK.coverage,
    );
  }

  // URLhaus live blocklist — hostname confirmed malicious by abuse.ch reporters
  if (blocklist?.has(hostname)) {
    sig.add("link", "This domain is on the URLhaus live malware/phishing blocklist — reported by security researchers as actively malicious", 70);
  }

  // Known URL shorteners
  if (SCAM_DOMAINS.some((d) => hostname === d || hostname.endsWith("." + d))) {
    sig.add("link", "URL shortener detected — hides the real destination", 40);
  }

  // Suspicious TLDs
  const tldMatch = SUSPICIOUS_TLDS.find((t) => hostname.endsWith(t));
  if (tldMatch) {
    sig.add("link", `Dodgy top-level domain (${tldMatch}) — commonly used by scammers`, 30);
  }

  // IP address instead of domain
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    sig.add("link", "IP address used instead of a domain name", 35);
  }

  // IPFS-hosted content (D9 / #56). Decentralised hosting that can't be taken
  // down — increasingly used for phishing. Match known public gateways by
  // hostname OR any host serving the /ipfs/<CID> path convention.
  if (IPFS_GATEWAYS.has(hostname) || /\/ipfs\/[A-Za-z0-9]{20,}/.test(urlObj.pathname)) {
    sig.add("link", "IPFS-hosted content — stored on a decentralised network that can't be taken down; increasingly used to host phishing pages", 40);
  }

  // Free-tier cloud dev platforms abused as phishing hosting (D1/D2 / #63).
  // These inherit a "trusted" reputation from the parent platform, so URL
  // filters wave them through. Match on the registrable suffix only.
  const hostingMatch = SUSPICIOUS_HOSTING.find((h) => hostname === h || hostname.endsWith("." + h));
  if (hostingMatch) {
    sig.add("link", `Hosted on ${hostingMatch} — a free developer platform frequently abused to host phishing pages because it inherits a trusted reputation`, HOSTING_SCORES[hostingMatch] ?? 35);
  }

  // Trusted-service redirect abuse (D16 / roadmap). A legitimate host whose
  // query string carries a full second URL is a classic open-redirect cloak.
  // Kept to a low score because legitimate tracking links do this too.
  const REDIRECT_HOSTS = ["lnkd.in", "cdn.ampproject.org"];
  const carriesNestedUrl = /[?&](url|u|redirect|dest|destination|target|continue|next)=https?(:|%3a)/i.test(urlObj.search);
  if (REDIRECT_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h)) ||
      hostname.endsWith("linkedin.com") && urlObj.pathname.includes("/slink") ||
      carriesNestedUrl) {
    sig.add("link", "Trusted service used as a redirect — the real destination is hidden in the link and may be malicious", 15);
  }

  // Typosquatted brands for this region. Which brands get impersonated is the
  // most region-specific signal we have, so the lists come from the pack.
  //
  // Two exemptions, and the distinction matters:
  //
  //  1. Eligibility-restricted suffixes (`.gov.au`, `.gov.uk`, `.nhs.uk`) —
  //     the registry vets who may register, so a brand name is genuine.
  //     Deliberately NOT `.co.uk` or `.org.uk`: those are open registrations,
  //     and exempting them would whitelist the domains scammers actually buy.
  //  2. The brand *owns the registrable label* — `barclays.co.uk` and
  //     `tesco.com` are the real sites. Typosquats bolt the brand onto
  //     something else (`barclays-secure-verify.co.uk`, `login-tesco.com`), so
  //     the brand appears in the label without being it.
  //
  // Without (2), dropping `.co.uk` from the trusted list flagged 21 of 24 real
  // UK brand sites as likely_scam. Without (1) being narrow, the UK's most
  // common suffix silently disabled brand scoring altogether.
  const onTrustedSuffix = PACK.trustedHostSuffixes.some((s) => hostname.endsWith(s));
  if (!onTrustedSuffix) {
    // The registrable label: the name the brand would own, ignoring subdomains
    // and the public suffix. "www.barclays.co.uk" → "barclays";
    // "barclays-secure.co.uk" → "barclays-secure"; "login.barclays.com.evil.top"
    // → "evil".
    //
    // Resolved against the Public Suffix List rather than a hand-kept set of
    // two-part suffixes. That set was explicitly scoped to "the ccTLDs the packs
    // actually cover", which is a rule that expires: with SG live at `minimal`,
    // "barclays.com.sg" computed its registrable label as "com", missed the
    // brand-owns-the-label exemption and scored 55/likely_scam — a false
    // positive on a real bank's own site.
    //
    // The PSL also keeps the defect the hand-written list was built to fix.
    // `.gov.co`, `.com.co` and `.co.io` are genuine public suffixes and are in
    // the list, so `chase.gov.co` still resolves to "chase.gov.co" rather than
    // letting the brand own the label and silently exempting itself.
    const registrable = registrableLabel(hostname);

    // The brand-owns-the-label exemption applies only on a suffix this region's
    // brands actually use.
    //
    // This is the half of the old hand-written suffix list that the PSL does
    // NOT replace, and dropping it silently reopened a real gap. `gov.co` is a
    // genuine public suffix, so the PSL correctly makes "barclays" the
    // registrable label of "barclays.gov.co" — at which point the brand owns
    // the label and the squat exempts itself. The old list only avoided that by
    // omitting `.gov.co` entirely, i.e. by being wrong about structure in a way
    // that happened to be right about intent.
    //
    // Separating the two questions keeps both answers: the PSL says where the
    // registration boundary is, and `brandSuffixes` says whether a UK bank
    // would be registering in Colombia's government namespace. It would not.
    // Whether owning the label proves ownership depends on the SHAPE of the
    // suffix, and the rule has to be a denylist rather than an allowlist.
    //
    // A single-label suffix — `.com`, `.de`, `.fr`, `.tv`, `.info` — is where
    // brands register worldwide. `amazon.de` is Amazon's real German site, and
    // there are far more such TLDs than any list could enumerate, so the
    // exemption applies by default. An earlier version gated on a 45-entry
    // union of the packs' own suffixes, which inverted this: every TLD outside
    // the list lost the exemption, and a sweep of US-pack brands across
    // ordinary TLDs flagged 216 of 216 real sites. That is the
    // false-positive-on-a-real-brand direction, and the costlier one.
    //
    // A MULTI-label suffix is a national namespace, and there the country
    // matters: `barclays.co.uk` is Barclays, while `barclays.gov.co` is a squat
    // under Colombia's government namespace, which is sold openly and is not
    // somewhere a UK bank registers. So for those, the suffix must be one a
    // covered region actually uses.
    const suffix = publicSuffix(hostname);
    const onBrandSuffix = !suffix.includes(".") || BRAND_SUFFIXES.has(suffix);

    // A GLOBAL brand inverts the multi-label default, and has to.
    //
    // The rule above asks "would a covered region's brands be on this suffix",
    // answered from the union of the authored packs. That reading holds only
    // while every brand is authored in the pack whose national suffixes it
    // registers under — and the global brand floor is exactly the set of brands
    // for which that is false. PayPal registers in every country's commercial
    // namespace, so `paypal.com.br`, `paypal.co.jp` and `amazon.co.za` are real
    // sites, and the union flagged all three as impersonation because no
    // authored pack lists `.com.br`, `.co.jp` or `.co.za`. A sweep of the six
    // global brands across 18 national suffixes produced 96 such flags.
    //
    // Enumerating the world's commercial namespaces is not the fix — that is
    // the "scoped to the ccTLDs the packs actually cover" mistake the PSL
    // adoption already had to unpick. So the exemption applies on any ordinary
    // NATIONAL COMMERCIAL namespace, and `isNationalCommercialSuffix` answers
    // that from the PSL's own data plus one small judgement (see there) rather
    // than from a list someone remembered to enumerate. `barclays.gov.co`,
    // `chase.co.io` and `paypal.com.np` keep scoring.
    //
    // An earlier cut DID enumerate the squat namespaces, and shipped two
    // regressions on contact — `paypal.gov.io` and `paypal.com.np`, both
    // already pinned by tests from the last time this reasoning was got wrong.
    // Same trap, one level up.
    //
    // The single-label default carries over untouched, because `onBrandSuffix`
    // already holds it: `.com`, `.de`, `.fr` are where brands register
    // worldwide. `isNationalCommercialSuffix` answers only the multi-label
    // question and returns false for a bare TLD, so it could never have carried
    // that default on its own — as the whole condition it flagged `paypal.com`
    // in every region.
    //
    // WIDENS the existing test rather than replacing it. The two answer
    // different questions — "is this an ordinary national commercial namespace"
    // and "does some authored pack put its brands here" — and a global brand
    // owning its label is genuine if EITHER says so. Writing this as a switch
    // (`global ? a : b`) instead discarded the pack union for exactly the six
    // brands, and flagged `amazon.org.uk`, `paypal.me.uk` and `netflix.org.au`
    // as impersonation at 45/likely_scam where `main` scored them 0/safe. Nine
    // of the 31 multi-label suffixes the packs author are second levels outside
    // the commercial set — `org.uk`, `ltd.uk`, `plc.uk`, `me.uk`, `org.au`,
    // `id.au`, `asn.au`, `org.nz`, `org.sg` — and a national brand on the same
    // suffix (`tesco.org.uk`) stayed clean throughout, which is what isolated
    // it to the global path.
    //
    // Widening cannot reopen the squat cases: those suffixes are in no pack's
    // `brandSuffixes` either, so the union rejects them too.
    // Written as `onBrandSuffix || extra` rather than as a ternary between two
    // whole conditions, so that the widening is visible at a glance and cannot
    // silently become a switch again.
    const brandOwnsLabel = (brand: string) =>
      registrable === brand
      && (onBrandSuffix
        || (GLOBAL_BRANDS.has(brand) && isNationalCommercialSuffix(suffix)));

    // Separator-delimited words within the registrable label, so "agl-billing"
    // yields ["agl","billing"] — that's how a short brand is matched without
    // colliding with "bagelshop".
    const labelWords = registrable.split(/[^a-z0-9]+/i).filter(Boolean);

    // "Impersonates X in the domain name" rather than "looks like it's
    // impersonating X": the reader is deciding whether to trust a link, and the
    // hedge invited them to weigh it up. Naming *where* the brand appears is
    // also the teachable part — the tell is the brand sitting somewhere other
    // than the registrable label, which is exactly what the check tests.
    for (const brand of TYPOSQUAT_BRANDS.substring) {
      // The brand owning the whole label is the real site, not a squat.
      if (hostname.includes(brand) && !brandOwnsLabel(brand)) {
        sig.add("link", `Impersonates "${brand}" in the domain name — classic phishing move`, 45);
      }
    }
    for (const brand of TYPOSQUAT_BRANDS.word) {
      if (labelWords.includes(brand) && !brandOwnsLabel(brand)) {
        sig.add("link", `Impersonates "${brand}" in the domain name — classic phishing move`, 45);
      }
    }

    // ── Keyboard-adjacency typosquat ───────────────────────────────────────
    //
    // The rules above need the brand to APPEAR in the label. A squat that
    // misspells it — "payppal.com", "wsstpac.com" — contains no brand string at
    // all and scored nothing, which is the whole point of registering one.
    //
    // Structural by construction: the check is about keystrokes, so it needs no
    // per-country research and improves every region at once, including `ZZ`.
    // The brand list still comes from the pack, so a region with no brands
    // authored simply gets no hits rather than a wrong one.
    //
    // Scored BELOW the substring rules (35 vs 45). A visible brand in a domain
    // is unambiguous; a near-miss is inference, and the shorter the brand the
    // more it is inference — hence the length floor inside the module. Enough
    // to reach `suspicious` on its own, not enough to reach `likely_scam`
    // without corroboration, which is the right failure direction for a rule
    // that can in principle land on an innocent label.
    //
    // Only ever consulted when the brand is NOT present verbatim, so a real
    // site can never be scored by both this and the substring rule.
    // Both brand lists feed this, unlike the rules above.
    //
    // The substring/word split exists to stop a SHORT brand matching inside a
    // longer unrelated word — "nib" in "nibble", "agl" in "bagel". That hazard
    // is specific to substring containment and cannot arise here: two of the
    // three shapes below preserve length exactly and the third adds one
    // character, so a candidate is always within one character of the brand.
    // "velocityglobal" — the real business that got the bare "velocity" removed
    // from the substring list — is fourteen characters against eight and is
    // rejected on length before anything else runs.
    //
    // Excluding the word list was the first cut and it was wrong for a reason
    // worth recording: it silently dropped every brand whose only listing is
    // there, so "startrackk.com" scored nothing. The six-character floor
    // already removes the genuinely short ones ("agl", "nib", "hcf"), which is
    // the same hazard handled at the right layer. Verified across all packs:
    // with the word lists included, no brand is a keyboard-typo of any other.
    const typo = findKeyboardTypo(registrable, [
      ...TYPOSQUAT_BRANDS.substring,
      ...TYPOSQUAT_BRANDS.word,
    ]);
    //
    // The suppression condition is whether the SUBSTRING RULE ALREADY SCORED
    // this brand, which is not the same as whether the hostname contains it.
    // Testing containment directly — `!hostname.includes(typo)` — silently
    // disabled the entire doubling shape: doubling a letter leaves the brand
    // intact as a substring ("startrackk" contains "startrack"), so every
    // doubled squat of a substring-listed brand suppressed itself. It survived
    // review because the worked example, "payppal", doubles a letter in the
    // MIDDLE and so happens not to contain "paypal".
    //
    // A brand that is present but exempt (the brand owning the label, or a
    // trusted suffix) scored nothing from the substring rule, so there is
    // nothing to double-score against — but those hosts are the real site and
    // must not be flagged here either. `brandOwnsLabel` is what separates
    // them, and it is the same test the substring rule uses.
    // Mirrors the two rules above exactly, rather than approximating them with
    // raw containment. `startrack` is a WORD brand, so the substring rule never
    // looked at it — but "startrackk.com" contains it, and a containment test
    // therefore suppressed a flag that nothing had actually scored.
    const scoredBySubstringRule =
      typo !== null
      && TYPOSQUAT_BRANDS.substring.includes(typo)
      && hostname.includes(typo)
      && !brandOwnsLabel(typo);
    const scoredByWordRule =
      typo !== null
      && TYPOSQUAT_BRANDS.word.includes(typo)
      && labelWords.includes(typo)
      && !brandOwnsLabel(typo);
    const isRealBrandSite = typo !== null && brandOwnsLabel(typo);

    if (typo && !scoredBySubstringRule && !scoredByWordRule && !isRealBrandSite) {
      sig.add(
        "link",
        `Domain is one mistyped letter away from "${typo}" — scammers register misspellings so a slip of the finger lands on their site instead`,
        35,
      );
    }
  }

  // ── Punycode / internationalised domain ──────────────────────────────────
  //
  // `new URL()` converts a non-ASCII hostname to its punycode form, so a
  // homoglyph domain arrives here already encoded: "commbаnk.com" with a
  // Cyrillic а becomes "xn--commbnk-6fg.com". Two consequences, both bugs
  // before this block existed.
  //
  // First, nothing scored it. urlSanitizer deliberately does NOT fold Cyrillic
  // or Greek homoglyphs to Latin — rewriting them would make the engine report
  // the real brand's hostname while describing the scammer's site — and its
  // comment says a mixed-script hostname "is a signal to raise, not a string to
  // rewrite, and that belongs in the scorer". This is the scorer, and the
  // signal was never added: a Cyrillic lookalike of a major bank scored 30.
  //
  // Second, and worse, the hyphen rule below counted hyphens in the ENCODED
  // form. Punycode uses hyphens structurally, so "commbаnk.com" — a hostname
  // displaying no hyphens at all — was reported as "Heaps of hyphens in the
  // domain (3)". A false explanation attached to a real detection is worse than
  // a miss here: the teaching layer is the product, and this taught a pattern
  // that is not there.
  //
  // An encoded label is NOT automatically an attack, and this is the line the
  // rule has to walk. "münchen.de", "bücher.de" and a wholly Japanese domain
  // are ordinary internationalised names, and scoring them as suspicious would
  // punish non-Latin scripts for being non-Latin — a false positive aimed
  // squarely at people whose language is not English, which is the worst
  // possible place for this engine to be wrong.
  //
  // What separates an attack is MIXED SCRIPT WITHIN ONE LABEL: Latin letters
  // sitting beside Cyrillic or Greek characters that render identically to
  // them. "commbаnk" (Cyrillic а) and "рaypal" (Cyrillic р) are mixed; "münchen"
  // and "bücher" are Latin throughout, and "日本語" carries no Latin at all.
  // None of the legitimate forms mix a confusable script into a Latin word,
  // because there is no reason to — the homoglyph only has value if the rest of
  // the word reads as the brand being impersonated.
  //
  // Scored against the PRE-ENCODING hostname, recovered from the raw input:
  // `new URL()` has already punycoded it by the time `hostname` is read, and
  // the encoded form has no script information left in it.
  const punycodeLabels = hostname.split(".").filter((l) => l.startsWith("xn--"));
  const isPunycode = punycodeLabels.length > 0;
  if (isPunycode) {
    // Tested against `raw`, the untouched argument — `input` has already been
    // through normaliseForAnalysis, which punycodes the hostname and destroys
    // the script information this depends on. That mismatch was a real bug: the
    // rule worked when checkUrl was called directly and silently downgraded to
    // the benign-IDN branch on the analyzeContent path the app actually uses,
    // which is how it reached the metamorphic harness as a "homoglyph makes the
    // verdict WEAKER" violation rather than as a failing unit test.
    if (hasMixedScriptHost(original ?? raw)) {
      sig.add(
        "link",
        "Mixed-script web address — this domain combines ordinary letters with Cyrillic or Greek characters that look identical to them. This is how a fake address is made to read exactly like a real one",
        45,
      );
    } else {
      // A legitimate-looking IDN. Worth naming so the reader knows the address
      // is not plain ASCII, but not an accusation on its own.
      sig.add(
        "link",
        "Internationalised domain name — this address uses non-Latin characters. That is normal for many sites, but check it against the real one if you were not expecting it",
        10,
      );
    }
  }

  // Excessive hyphens (scam site hallmark)
  //
  // Counted on the PRE-ENCODING hostname. Punycode uses hyphens structurally,
  // so counting them in `hostname` invents hyphens the reader cannot see — that
  // is what put "Heaps of hyphens in the domain (3)" on hosts displaying none.
  //
  // Skipping the rule outright for internationalised hosts was the first fix
  // and was too blunt: it also discarded the REAL hyphens in
  // "münchen-bank-secure-login.de", so a single accented letter shed a signal
  // its plain-ASCII twin still scored. Counting on the original keeps the
  // artefact out without handing evaders a way to switch the rule off.
  const hyphens = isPunycode
    ? displayedHyphenCount(original ?? raw)
    : (hostname.match(/-/g) || []).length;
  if (hyphens >= 3) {
    sig.add("link", `Heaps of hyphens in the domain (${hyphens}) — scammers love this trick`, 20);
  }

  // HTTP not HTTPS
  if (urlObj.protocol === "http:") {
    sig.add("link", "No HTTPS — your data wouldn't be encrypted", 15);
  }

  // Very long URL
  if (input.length > 200) {
    sig.add("link", "Suspiciously long URL — often used to hide the real destination", 15);
  }

  // Weird subdomains depth
  const parts = hostname.split(".");
  if (parts.length > 5) {
    sig.add("link", "Too many subdomain levels — used to make fake URLs look legit", 20);
  }

  // Legit-looking patterns but suspicious
  if (fullUrl.includes("login") || fullUrl.includes("signin") || fullUrl.includes("verify") || fullUrl.includes("secure")) {
    sig.add("link", "Contains login/verify/secure keywords — common in phishing URLs", 10);
  }

  const score = Math.min(sig.total(), 100);
  return scoreToResult(score, sig, "URL", PACK.coverage, PACK.reportingBody);
}

// ────────────────────────────────────────────────────────────────────────────
// SMS checker
// ────────────────────────────────────────────────────────────────────────────

/**
 * Options for the shared message-body scoring in checkSms.
 *
 * `channel` exists because checkEmail reuses this function for body content.
 * Almost every signal is channel-agnostic — urgency, reward bait, payment
 * requests read the same in either — but a few are specifically about SMS, and
 * firing those on an email produces a confident, wrongly-worded verdict.
 */
/**
 * Whether an email genuinely came from the organisation it talks about.
 *
 * The impersonation signals exist to catch a message that NAMES an agency while
 * arriving from somewhere else. When the sender is the agency's own domain the
 * premise fails, and the advice ("verify directly via official channels") is
 * wrong for mail that arrived through the official channel.
 *
 * Deliberately strict, because a false positive here means a real scam scores
 * lower:
 *   · email only — an SMS has no verifiable sender, and the "From" of a text is
 *     trivially spoofed, so the same reasoning does not transfer
 *   · the domain must equal an allowlisted domain or be a subdomain of one.
 *     `auspost.com.au` and `track.auspost.com.au` qualify;
 *     `auspost.com.au.evil.tk` and `notauspost.com.au` do not
 *   · it consults the region's own allowlists only, so an unrecognised domain
 *     is treated as untrusted rather than assumed fine
 *
 * NOT a claim that the sender is authentic — nothing here verifies SPF or DKIM.
 * A spoofed From would pass this check, which is why it only ever suppresses a
 * signal that would otherwise misfire, and never lowers a score by itself.
 * Header-based spoofing is caught separately by analyseEmailIdentities.
 */
/**
 * Do all the links in this message point at the region's own allowlisted
 * agency/brand domains?
 *
 * The companion to isOwnDomainSender, for the case that has no sender metadata
 * to trust. An SMS carries no verified sender domain, so the only thing the
 * engine can check is where the message actually sends you — and a link to the
 * agency's real domain is the one thing a phishing SMS cannot fake.
 *
 * Requires EVERY link to be allowlisted, not merely one: the standard evasion
 * is to pad a message with a legitimate link alongside the payload one, so a
 * .some() test here would hand attackers the exemption for free.
 *
 * Checks both allowlists the packs maintain. legitDomains is the broad
 * region-wide list; authorityOwnDomains is the narrower set of organisations
 * whose real mail demonstrably comes from a non-government domain
 * (auspost.com.au), and its comment describes precisely this case. Consulting
 * only the first left a real Australia Post tracking SMS scoring 55.
 *
 * Matching is exact-or-subdomain, identical to the allowlist branch in
 * checkUrl, so "revenue.ie.evil.tk" does not qualify. Returns false when there
 * are no links at all — the caller's rules are about links, and "no links"
 * is not "safe links".
 */
/**
 * A clause that WARNS against sharing something, rather than asking for it.
 *
 * Module-scoped because two rules need it: the verification-code harvest rule,
 * and the credential-warning filter on REQUEST_WORDS. Evaluated per clause by
 * both — scoped to the whole message it becomes a bypass, since appending one
 * reassurance sentence would disarm the signal ("Send me the code. Never share
 * it with anyone.").
 */
const NEGATED_ASK =
  /\b(never|do\s?n'?o?t|don't|no\s+one|nobody|will\s+never|would\s+never)\b[^.!?]{0,40}\b(share|forward|send|give|disclose|reveal|ask|enter|type|provide)\b/i;
const DISREGARD_NOTICE =
  /\b(if\s+you\s+did\s?n'?o?t\s+request|ignore\s+this\s+message)\b/i;

/**
 * Request phrases that name a secret so sensitive the ordinary consumer use of
 * the term is the warning never to share it. Anti-fraud advice from a wallet
 * vendor, an exchange or a bank uses the exact words a phishing message does,
 * so these are the entries where a negated clause has to suppress the hit.
 *
 * Deliberately narrow: "bank details" and "password" appear in plenty of
 * legitimate asks ("update your bank details in the portal"), so a negation
 * guard over the whole REQUEST_WORDS list would weaken real signals. These
 * three have no legitimate ask at all.
 */
const CREDENTIAL_WARNING_TERMS = ["seed phrase", "recovery phrase", "verification code"];

/**
 * Does an agency name plausibly identify this host?
 *
 * Organisations shorten their own names in domains, so a literal substring test
 * fails on exactly the cases that matter: "australia post" is auspost.com.au,
 * "an post" is anpost.com, "services australia" hosts Centrelink and Medicare.
 * Inferring identity from string overlap alone got the headline case wrong —
 * "Australia Post: track it at auspost.com.au" still scored 55.
 *
 * Three passes, cheapest first:
 *   · the whole normalised name appears in the host ("revenue" in revenue.ie)
 *   · the host contains an accepted abbreviation of a multi-word name
 *     ("auspost" from "australia post", "anpost" from "an post")
 *   · every word of the name appears in the host in order
 *     ("servicesaustralia" from "services australia")
 *
 * Deliberately no fuzzy or initialism matching: "ato" must not be satisfied by
 * an unrelated host that happens to contain those three letters.
 */
function authorityMatchesHost(authority: string, haystack: string): boolean {
  const words = authority.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length === 0) return false;
  const full = words.join("");
  if (full.length < 3) return false;
  if (haystack.includes(full)) return true;

  // Abbreviated compounds: keep the first word's leading syllable. "australia
  // post" → "auspost", "an post" → "anpost". Only tried for multi-word names,
  // where the shortening is a real naming convention rather than a guess.
  if (words.length > 1) {
    const rest = words.slice(1).join("");
    for (let n = 2; n <= Math.min(5, words[0].length); n++) {
      if (haystack.includes(words[0].slice(0, n) + rest)) return true;
    }
  }

  // All words present in order, allowing anything between them.
  let from = 0;
  for (const w of words) {
    const at = haystack.indexOf(w, from);
    if (at === -1) return false;
    from = at + w.length;
  }
  return true;
}

function allLinksOnLegitDomains(
  urls: string[] | null,
  pack: { legitDomains: string[]; authorityOwnDomains: string[]; trustedHostSuffixes: string[] },
  namedAuthorities: string[],
): boolean {
  if (!urls || urls.length === 0) return false;
  const allowed = [...pack.legitDomains, ...pack.authorityOwnDomains];
  return urls.every((u) => {
    let link: URL;
    try {
      link = new URL(u.trim().startsWith("http") ? u.trim() : `https://${u.trim()}`);
    } catch {
      return false;
    }
    // Trailing dot stripped for the same reason normaliseForAnalysis strips it:
    // "auspost.com.au." is a valid FQDN for the identical host, but it survives
    // URL parsing into `hostname` and defeats every comparison below. Left in,
    // it fails in the costly direction here — a real Australia Post tracking
    // SMS written with the root dot misses the allowlist and scores
    // 55/likely_scam, which is exactly the false positive this exemption exists
    // to prevent.
    //
    // The metamorphic host-trailing-dot relation caught THIS case, because a
    // false positive raises the worst card. It does not cover the mirror
    // direction — a dot dropping a suspicious-TLD flag lowers the message card
    // while the per-URL card (which normalises first) stays high, and the
    // harness scores the worst card. So that half is guarded by
    // urlTrailingDot.test.ts, not by the relation. Do not read a green
    // metamorphic run as coverage of the scam direction.
    const host = link.hostname.toLowerCase().replace(/\.+$/, "");
    const onAllowlist = allowed.some((d) => {
      const domain = d.toLowerCase();
      return host === domain || host.endsWith("." + domain);
    });
    if (!onAllowlist) return false;

    // An allowlisted host carrying a nested URL is an open redirect: the real
    // destination is the parameter, not the host. checkUrl already scores this
    // shape as suspicious (see carriesNestedUrl), so honouring it here would
    // let gov.ie/redirect?url=revenue-ie.top launder the exemption.
    if (/[?&](url|u|redirect|dest|destination|target|continue|next)=https?(:|%3a)/i.test(link.search)) {
      return false;
    }

    // The link must not CONTRADICT any agency the message names in its prose.
    // Testing only "is this domain allowlisted" let an impersonation launder
    // through a link to an unrelated allowlisted domain — "ATO: your tax refund
    // is pending, log in at auspost.com.au/track" was cleared to safe.
    //
    // Phrased as "no conflict" rather than "must match" on purpose. A genuine
    // notification often names its sender nowhere but the link itself ("Track
    // your parcel at auspost.com.au"), and requiring a prose match would put
    // that straight back to 55 — the exact bug this exemption exists to fix.
    // So a message naming no authority in prose keeps the exemption; one that
    // names any has to point at one of them.
    //
    // EVERY named authority must be consistent with the link, not merely one.
    // A .some() here was the mirror of the padding evasion the links loop
    // guards against: appending the single word "AusPost." to an ATO
    // impersonation pointing at auspost.com.au dropped it from 55 to 15/safe.
    if (namedAuthorities.length === 0) return true;

    // Identity is compared against the whole host, not just the registrable
    // label. A bare public-suffix allowlist entry ("gov.ie", "gov.au") has an
    // empty label, which denied the exemption for the very domain the
    // no-link-sender flag tells the reader to use — a Revenue message linking
    // gov.ie scored 55 while advising "log in at gov.ie directly instead".
    //
    // A host inside the jurisdiction's own government estate satisfies ANY
    // agency the message names. This is the same concept isOwnDomainSender
    // uses: gov.au and gov.ie host the whole estate, so an agency's real link
    // frequently lives on a domain that does not carry its name at all —
    // Centrelink and Medicare both live under servicesaustralia.gov.au, and
    // Revenue publishes under gov.ie. String matching cannot bridge a parent
    // agency relationship, and requiring one scored those genuine messages 55
    // while the emitted flag told the reader to use the very domain it flagged.
    const inGovEstate =
      pack.trustedHostSuffixes.some((suffix) => host.endsWith(suffix.toLowerCase())) ||
      pack.trustedHostSuffixes.some((suffix) => host === suffix.replace(/^\./, "").toLowerCase());
    if (inGovEstate) return true;

    const haystack = `${host}.${registrableLabel(host)}`.replace(/[^a-z0-9]/g, "");
    return namedAuthorities.every((a) => authorityMatchesHost(a, haystack));
  });
}

function isOwnDomainSender(
  channel: "sms" | "email",
  senderDomain: string | undefined,
  pack: { authorityOwnDomains: string[]; trustedHostSuffixes: string[] },
): boolean {
  if (channel !== "email" || !senderDomain) return false;
  const host = senderDomain.toLowerCase();

  const onAllowlist = pack.authorityOwnDomains.some((d) => {
    const domain = d.toLowerCase();
    return host === domain || host.endsWith("." + domain);
  });
  const onNationalSuffix = pack.trustedHostSuffixes.some((suffix) =>
    host.endsWith(suffix.toLowerCase()),
  );

  return onAllowlist || onNationalSuffix;
}

/**
 * The body of an RFC 5322-ish message, or the whole string if it has no header
 * block. Used only for signals that care WHERE in the message something sits.
 *
 * Deliberately minimal — the real MIME walk lives in lib/emailDistiller, which
 * the engine cannot import and which prepends the headers it keeps anyway. All
 * this needs to do is find the blank line that ends the header block, and only
 * when what precedes it actually looks like headers, so a plain body whose
 * second paragraph happens to follow a blank line is left alone.
 */
/**
 * Scaffolding a forwarded or quoted message carries ahead of its real body.
 *
 * Each entry matches a whole line, except the inline forms (Fwd:, a chat
 * export's timestamp) which prefix the body on the same line and are stripped
 * in place. Deliberately a closed list of recognised shapes rather than "skip
 * anything before the first blank line": arbitrary prose must NOT be skipped,
 * or the family gate's opener anchor stops meaning anything at all.
 */
/**
 * An RFC 5322-shaped header line.
 *
 * Broader than a named list, which missed "Cc:", "Bcc:" and every "X-" header a
 * client adds — and one unmatched line stops the scaffold loop, so an ordinary
 * Gmail forward left "Cc: …" in front of the body and the family anchor failed
 * on exactly the case the stripper exists for.
 *
 * Only counted after a forwarding marker, because this shape cannot be told
 * from prose: "Note: they told me to check this" matches it exactly. See the
 * guard in stripForwardingPrefix.
 */
const HEADER_LINE = /^\s*(?:[A-Za-z][A-Za-z0-9-]{1,40})\s*:\s.*$/;

const FORWARD_SCAFFOLD: RegExp[] = [
  /^\s*-{2,}\s*forwarded message\s*-{2,}\s*$/i,
  /^\s*begin forwarded message:?\s*$/i,
  /^\s*(?:fwd|fw|re)\s*:\s*/i,
  HEADER_LINE,
  /^\s*on .+ wrote:\s*$/i,
  // Chat-export line: "02/09/2026, 10:42 - Unknown: <body>"
  /^\s*\[?\d{1,2}[:/]\d{2}.*?\]?\s*[-–]\s*[^:]{0,40}:\s*/i,
];

/**
 * How many scaffold lines to skip before giving up and treating it as body.
 *
 * An ordinary Gmail forward runs to nine or more — marker, From, Date, Subject,
 * To, Cc, Reply-To, X-Mailer, Sent — and at 8 the leftovers stayed in front of
 * the body, so the family anchor failed on exactly the forwards this was built
 * to handle. Raised with room to spare; the loop stops at the first line that is
 * not recognised scaffolding, so the cap only bounds the pathological case
 * rather than deciding the common one.
 */
const MAX_SCAFFOLD_LINES = 25;

/**
 * Strip forwarding and quoting scaffolding from the front of a message.
 *
 * Forwarding is how people ask "is this real?", so a rule that anchors on the
 * start of a message has to see past the wrapper the forward added. Before
 * this, "---------- Forwarded message ----------" ahead of the "Hi Mum" script
 * took it from likely_scam to safe — the single most likely way for that text
 * to arrive here was also the one way it went unscored.
 *
 * Only leading scaffolding is removed, and only shapes on the list above. A
 * message that opens with ordinary prose is returned untouched.
 */
export function stripForwardingPrefix(text: string): string {
  // Quote markers come off first and per-line, because the two wrappers nest:
  // forwarding a message someone already forwarded you quote-marks the whole
  // thing, so the scaffold lines arrive as "> ---------- Forwarded message ---".
  // Stripping quotes only at the end left that shape unmatched, and each
  // wrapper worked alone while the pair — the commonest real case — did not.
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^[ \t]*(?:>[ \t]?)+/, ""));
  let i = 0;
  let sawForwardMarker = false;
  let headersSeen = 0;
  while (i < lines.length && i < MAX_SCAFFOLD_LINES) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    const hit = FORWARD_SCAFFOLD.find((re) => re.test(line));
    if (!hit) break;
    // A lone header-shaped line is not scaffolding. "Note: they told me to
    // check this" and "Warning: this looks dodgy" match the header pattern
    // exactly — syntax cannot separate them — so stripping on one line would let
    // any scam buy immunity by opening with a word and a colon. What a real
    // forward always has is a RUN: either an explicit marker/attribution, or
    // several consecutive headers. One line of either is ambiguous; two is not.
    if (hit === HEADER_LINE && !sawForwardMarker) {
      // Part of a run, looking either way: the last header in a block has no
      // header after it, so a forward-only test stripped every line but that
      // one and left it in front of the body.
      const next = lines[i + 1];
      const inRun =
        headersSeen > 0 || (next !== undefined && HEADER_LINE.test(next));
      if (!inRun) break;
      headersSeen++;
    }
    if (hit !== HEADER_LINE) sawForwardMarker = true;
    // An inline prefix leaves the body on the same line; a whole-line one does
    // not. Stripping in place keeps "Fwd: Hi Mum, …" anchorable.
    const remainder = line.replace(hit, "").trim();
    if (remainder) {
      lines[i] = remainder;
      break;
    }
    i++;
  }
  return lines.slice(i).join("\n").replace(/^\s+/, "");
}

export function bodyAfterHeaders(raw: string): string {
  const split = raw.search(/\r?\n\r?\n/);
  if (split === -1) return raw;
  const head = raw.slice(0, split);
  const looksLikeHeaders = head
    .split(/\r?\n/)
    .some((line) => /^[A-Za-z][A-Za-z0-9-]{1,40}:\s/.test(line));
  return looksLikeHeaders ? raw.slice(split).replace(/^\s+/, "") : raw;
}

export interface MessageCheckOptions {
  /** Where the text came from. Defaults to "sms", preserving prior behaviour. */
  channel?: "sms" | "email";
  /**
   * The From domain, when the caller has parsed headers (checkEmail does).
   *
   * Used only to suppress impersonation signals when the sender IS the
   * organisation the body mentions — a real Australia Post email naming
   * Australia Post is not impersonation. Never used to lower a score on its own.
   */
  senderDomain?: string;
}

/**
 * Opening words of the family-impersonation flag, shared so checkEmail can
 * recognise the signal in a merged sub-result without re-running the match.
 */
/**
 * Grammar that marks a relation term as the SUBJECT of a sentence rather than
 * the person being addressed.
 *
 * The opener anchor used to test position alone, which is not the same thing:
 * "Dad said he'd lend me 500 … when I get my new number sorted" satisfied it
 * and scored likely_scam (45), calling a real family message a scam. "Mother of
 * all storms", "Son of a gun" and "Mum's phone broke" satisfied it too.
 *
 * A possessive or a following verb is what separates the two readings.
 * Punctuation does not: the corpus carries "mum send me 400 my phone broke" and
 * "Hi Dad I dropped my phone" with no comma at all, and requiring one would
 * drop both.
 */
const RELATION_AS_SUBJECT = String.raw`(?:'s|s'|\s+(?:said|says|is|was|of|will|has|had|and|or|thinks|told|wants|needs))\b`;

/** Opening words of the task-payment composite, shared so checkEmail can find it. */
const TASK_PAYMENT_FLAG =
  "Earnings held behind a task you must pay to complete";

/** Opening words of the messaging-hijack composite, shared for the same reason. */
const MESSAGING_HIJACK_FLAG =
  "Claims a messaging account has been flagged or restricted";

/**
 * Entries that name a service rather than request something.
 *
 * Derived from the pack, not hardcoded: a word listed in BOTH requestWords and
 * authorityMentions is by definition the name of a body, so "asks for sensitive
 * info: mygov" is a false statement about a message that merely named it. The
 * two lists already carry that fact, and reading it beats maintaining a third
 * list — an AU-only constant here missed the US "social security", which scored
 * a genuine Social Security notice at 40/suspicious.
 *
 * The crypto entries are the exception the rule does not reach: "crypto" and
 * "bitcoin" name a subject rather than a body, so they are not in
 * authorityMentions but are equally not an ask.
 */
const SUBJECT_NOT_ASK = new Set(["crypto", "bitcoin"]);

function serviceNames(pack: RegionPack): Set<string> {
  const authorities = new Set(pack.authorityMentions.map((a) => a.toLowerCase()));
  return new Set([
    ...SUBJECT_NOT_ASK,
    ...pack.requestWords.filter((w) => authorities.has(w.toLowerCase())),
  ]);
}

export const FAMILY_IMPERSONATION_FLAG =
  'Reads as the "Hi Mum" family-impersonation script';

export function checkSms(
  text: string,
  blocklist?: Set<string>,
  region?: RegionInput,
  options?: MessageCheckOptions,
): CheckResult {
  const channel = options?.channel ?? "sms";
  const PACK = resolveRegionPack(region);
  const {
    urgencyWords: URGENCY_WORDS,
    rewardWords: REWARD_WORDS,
    requestWords: REQUEST_WORDS,
    fakeInvestmentPlatforms: FAKE_INVESTMENT_PLATFORMS,
    identityRereg: MYID_REREG_PHRASES,
    brandMentions: BRAND_MENTIONS,
    bankIdentifiers: BANK_IDENTIFIERS,
  } = PACK;
  const CRYPTO_TOAD_BRANDS = PACK.cryptoExchanges;
  const sig = new Signals();
  const lower = text.toLowerCase();

  const urgencyHits = URGENCY_WORDS.filter((w) => mentions(lower, w));
  if (urgencyHits.length > 0) {
    sig.add("message", `Urgency language detected: "${urgencyHits.slice(0, 3).join('", "')}"`, Math.min(urgencyHits.length * 10, 35));
  }

  // Small-fee payment lure. A trivial amount — a few dollars of "customs",
  // "redelivery" or "processing" fee — attached to a payment demand. The money
  // is not the point: the amount is chosen to be too small to argue with, so
  // the card details entered to pay it are the actual take.
  //
  // The size test is what carries the signal, which is why it is a rule of its
  // own rather than another urgencyWords entry. A large sum reads as a scam to
  // most people unaided and trips the existing money rules; $2.15 is the one
  // that gets paid without a second thought. Capped at $20 — above that the
  // "too trivial to question" property stops holding.
  //
  // The amount must be matched WHOLE. A pattern that reads a prefix inverts the
  // rule: "$1,250.00" matched as "$1" and "$1500" as "$15", so the largest
  // demands were the ones flagged as too small to question. Hence the boundary
  // on both ends — no thousands separator, no further digit, and no bare
  // trailing digits after a decimal group. ("$450" truncating to 45 is why the
  // first large-fee test passed while the rule was broken; it now uses figures
  // that cannot truncate into range.)
  //
  // The lookahead rejects a following digit or comma, and a period only when a
  // digit follows it — so "$3.20." ending a sentence still matches, while
  // "$1,250.00" and "$1500" do not.
  //
  // Deliberately does NOT require a currency symbol to be adjacent — "a fee of
  // 2.15" and "$2.15 customs fee" are the same lure — but it does require a
  // decimal or a symbol somewhere, since a bare "2" in prose is usually a count.
  const SMALL_FEE = /(?:[$£€]\s?(\d{1,2}(?:\.\d{2})?)|\b(\d{1,2}\.\d{2}))(?![\d,]|\.\d)/;

  // The framing must be a DEMAND, not a line item. "delivery fee $3.99" on a
  // food order and "monthly service fee" on a subscription name a cost the
  // reader has already agreed to; the lure asks them to pay something now to
  // release something they are waiting on. So the bare "<word> fee" alternative
  // is limited to the deliverable-release vocabulary, and the everyday billing
  // words (delivery, service, handling, shipping) are accepted only alongside an
  // explicit pay/release ask. Without this split a Netflix renewal notice scored
  // 20/suspicious carrying the lure flag.
  //
  // "admin(?:in)?" was a typo — it matched the nonexistent "adminin fee" and
  // missed "administration fee", which is the wording the lure actually uses.
  const RELEASE_FEE = /\b(?:customs|import|admin(?:istration)?|clearance|release|redelivery|re-?delivery|processing|small)\s+fees?\b/i;
  const BILLING_FEE = /\b(?:delivery|shipping|handling|service)\s+fees?\b/i;
  const PAYMENT_ASK = /\b(?:pay|paid|payment|settle|clear|release|unlock|confirm)\b/i;
  const feeFraming =
    RELEASE_FEE.test(lower) ||
    (BILLING_FEE.test(lower) && PAYMENT_ASK.test(lower)) ||
    /\bfees?\s+(?:of|is|due)\b/i.test(lower) ||
    /\bpay\b[^.]{0,40}\bfees?\b/i.test(lower) ||
    /\bfees?\b[^.]{0,40}\bpay\b/i.test(lower);

  const feeAmount = SMALL_FEE.exec(text);
  if (feeAmount && feeFraming) {
    const amount = parseFloat(feeAmount[1] ?? feeAmount[2] ?? "");
    if (Number.isFinite(amount) && amount > 0 && amount <= 20) {
      sig.add(
        "message",
        "Small-fee payment lure — a token amount like this is chosen to be too small to question, and the card details you enter to pay it are what the scam is actually after",
        20,
      );
    }
  }

  // Address correction presented as blocking a delivery (D1 / 2026-08-29
  // sweep). AusPost names this as the dominant live AU parcel lure, but the
  // phrases are ordinary retail commerce on their own — "please confirm your
  // address for our records before we ship" is a legitimate dispatch message.
  //
  // So the phrase never scores alone: it needs a parcel/delivery signal
  // already present, which is what turns "confirm your address" from a
  // shipping formality into the thing standing between you and your goods.
  // Same shape as the keys-by-post gate below, and for the same reason — a flat
  // urgencyWords entry cannot express a condition, since every urgency group is
  // flattened into one union and scored by hit count.
  //
  // Scored at +20 rather than the +10 an urgency hit carries: on its own the
  // pairing is the complete lure, and the delivery half has usually contributed
  // only a single generic hit. It reaches "suspicious" (20-44) without reaching
  // "likely_scam" (45+), which is the right ceiling for a signal whose
  // components are each individually innocent.
  // The context is a plain delivery noun, not a hit in the parcel urgency list.
  // Gating on the latter was the first attempt and it almost never fired: these
  // messages are engineered to sound routine, so they carry no urgency phrase
  // at all — "Your parcel is waiting. Update your address to complete delivery"
  // produces zero urgency hits. Requiring one meant the gate could only open
  // for messages that were already scoring, which is precisely backwards.
  const hasDeliveryContext = /\b(parcels?|packages?|shipments?|deliver\w*|courier|consignment|tracking)\b/i.test(text);
  const addressPhraseHit = PACK.parcelAddressPhrases.find((p) => mentions(lower, p));
  if (addressPhraseHit && hasDeliveryContext) {
    sig.add("message", 
      `Asks you to fix an address to release a delivery ("${addressPhraseHit}") — Australia Post warns this is the most common parcel scam. A real carrier tells you about a delivery problem; it doesn't need your address again to hand over goods it already has.`,
    20,
    );
  }

  // "claim" is a prize word in "claim your prize" and an ordinary noun in "your
  // claim has been processed" — a Medicare or insurance claim, which is exactly
  // what the real sender writes. Dropped only when it appears as that noun, so
  // the verb sense every reward lure uses still scores.
  // Per occurrence, not per message. A whole-text test let one appended
  // sentence defuse a live lure — "Congratulations! Claim your $1000 prize now.
  // Your claim is ready." dropped from 40 to 24, a one-sentence evasion. The
  // word only stops counting when EVERY occurrence reads as the noun.
  //
  // The determiner and verb forms above miss the COMPOUND-NOUN use, where
  // "claim" modifies another noun with nothing in front of it: "benefits claim
  // assistance", "claim status", "claim number". That is administrative
  // vocabulary — a benefits or insurance office writing about a case — and it
  // was scoring +12 on ordinary VA correspondence ("Your VA benefits claim
  // assistance appointment is confirmed for Tuesday" reached 37/suspicious
  // alongside the authority mention). The following noun is what disambiguates:
  // a reward lure says "claim your prize", never "claim assistance".
  const CLAIM_AS_NOUN =
    /\b(?:your|the|this|a|my|their|our)\s+claims?\b|\bclaims?\s+(?:has|have|was|were|is|are)\b|\bclaims?\s+(?:assistance|status|number|reference|form|history|decision|department|centre|center|processing|adjuster|handler|id)\b/gi;
  const claimIsAlwaysNoun =
    /\bclaims?\b/i.test(text) &&
    (text.match(/\bclaims?\b/gi) ?? []).length === (text.match(CLAIM_AS_NOUN) ?? []).length;
  const rewardHits = REWARD_WORDS.filter(
    (w) => mentions(lower, w) && !(w === "claim" && claimIsAlwaysNoun),
  );
  if (rewardHits.length > 0) {
    sig.add("message", `Prize/reward language: "${rewardHits.slice(0, 2).join('", "')}"`, Math.min(rewardHits.length * 12, 40));
  }

  // Service names are matched but not counted as an ask.
  //
  // "medicare", "mygov", "ato" and friends sit in requestWords because naming
  // one is part of the impersonation, not because the message asked for
  // anything. The flag said "Asks for sensitive info: mygov" about a message
  // whose whole content was "you have a new myGov message, sign in to read it",
  // which is a false statement about the text in front of the reader as well as
  // a false positive: every genuine myGov notification names myGov.
  //
  // They still contribute through the authority-mention rule below, which is
  // where "this message is about a government service" belongs. Here they are
  // separated so the remaining hits are things actually being requested.
  // A credential term inside a "never share your …" clause is anti-fraud
  // advice, not an ask. Ledger, exchanges and banks all publish exactly this
  // wording, and it scored 30/suspicious — flagging the warning that protects
  // people is worse than missing it, because it teaches them the verdict is
  // noise. Evaluated per clause, so a scam cannot buy the exemption by
  // appending a reassurance sentence to a real ask.
  //
  // Split on coordinating conjunctions as well as sentence punctuation. On
  // punctuation alone, "Enter your seed phrase to restore access but never
  // share it with anyone" was ONE clause, so the trailing negation covered the
  // ask and the message scored 0/safe — the evasion this guard exists to
  // prevent, just without a full stop. Splitting here costs nothing: a genuine
  // warning ("never share your seed phrase or recovery phrase") keeps the
  // negation and the term in the same fragment.
  const clauses = text.split(/[.!?\n]+|\b(?:but|however|though|although|and then)\b/i);
  const warnedTerms = new Set(
    CREDENTIAL_WARNING_TERMS.filter((term) =>
      clauses.some((c) => NEGATED_ASK.test(c) && mentions(c.toLowerCase(), term)) &&
      !clauses.some((c) => !NEGATED_ASK.test(c) && mentions(c.toLowerCase(), term)),
    ),
  );
  const requestHits = REQUEST_WORDS.filter((w) => mentions(lower, w) && !warnedTerms.has(w));
  const SERVICE = serviceNames(PACK);
  const genuineAsks = requestHits.filter((w) => !SERVICE.has(w));
  const namedServices = requestHits.filter((w) => SERVICE.has(w));
  if (genuineAsks.length > 0) {
    // A service name alongside a real ask still counts — "confirm your myGovID
    // and tax file number" is a stronger signal than the ask by itself, because
    // the pairing is the whole scam shape. It just cannot score on its own, so
    // it is added to the weight rather than to the count that gates the row.
    const weight = Math.min(genuineAsks.length * 15 + namedServices.length * 15, 50);
    sig.add("message", `Asks for sensitive info: "${[...genuineAsks, ...namedServices].slice(0, 2).join('", "')}"`, weight);
  }

  // Rental/property bond redirect fraud (D5 / #105). Composite: a rental
  // context plus a bank-detail ask. Neither half scores here on its own —
  // "rental bond" is ordinary tenancy language and "bsb" already sits in
  // REQUEST_WORDS — but together they're the signature of bond redirection.
  //
  // The bank-ask half draws its national identifier from the pack: "bsb" is
  // Australian and means nothing in the UK, where the equivalent ask is a sort
  // code. Hardcoding either would silently drop half the composite in the other
  // region, leaving only the generic phrasings.
  const hasRentalContext = /rental bond|holding deposit|lease agreement|property manager/i.test(text);
  const hasBankAsk = /bank details|account number|account no\b/i.test(text) ||
    mentionsAny(lower, BANK_IDENTIFIERS);
  if (hasRentalContext && hasBankAsk) {
    sig.add("message", "Property bond fraud pattern — scammers intercept rental communications to redirect bond payments. Always verify bank detail changes by calling the agency on a number from their official website, never one in the message.", 25);
  }

  // Keys-by-post, gated (D3 / #180). On its own this is an ordinary move-in
  // message, so it never scores alone. Alongside a deposit ask it completes the
  // remote-landlord script — no viewing, no handover, money up front — which is
  // the part that makes the scam work. Scored modestly: the deposit phrasing in
  // REQUEST_WORDS already carries the main weight, and this only corroborates.
  const hasDepositAsk = /deposit/i.test(text);
  if (mentionsAny(lower, KEYS_BY_POST_PHRASES) && (hasDepositAsk || hasBankAsk)) {
    sig.add("message", "Keys promised by post alongside a deposit request — in the fake-landlord script the 'landlord' is always abroad, so there's no viewing and no key handover. Never send a deposit for a property you or someone you trust hasn't physically viewed.", 15);
  }

  // Benefit-programme lures, gated (D6 / #274 / FTC consumer alert 24 Aug 2026).
  // Currently only the US pack populates gatedBenefitPhrases (veterans' benefit
  // programmes), but the rule reads it from the pack like every other list, so
  // another region can fill the same slot without touching this file — and the
  // phrases stay inside the packShadowing / entryOverlap invariants.
  //
  // Gated on a link or an information ask because the phrasing alone is shared
  // with legitimate VA and veteran-charity correspondence, which already picks
  // up +25 from the "va" authority mention. Requiring the delivery mechanism is
  // what separates "your entitlement review is pending, confirm your SSN at
  // <link>" from "your claim assistance appointment is confirmed for Tuesday".
  if (
    mentionsAny(lower, PACK.gatedBenefitPhrases) &&
    (/https?:\/\//i.test(text) || genuineAsks.length > 0 || hasBankAsk)
  ) {
    sig.add("message", "Veterans-benefit lure — scammers impersonate VA programmes to collect personal details or up-front fees. The VA never charges to file a claim and never asks for your details by text; check your claim at va.gov or call the VA on 1-800-827-1000.", 25);
  }

  // Family impersonation, the "Hi Mum" script (D2 / #251). A stranger opens as
  // your child, explains away the unknown number, and asks for money — the
  // most-reported scam text in AU, and it scored nothing at all before this.
  //
  // Gated, in the shape of the composites above, because every half is
  // innocent alone: "mum" is ordinary address, "my phone broke" is ordinary
  // news, and a family member really does sometimes ask you to transfer money.
  // What is not ordinary is all three at once — an unrecognised sender
  // accounting for why you don't recognise them, then asking for a payment in
  // the same breath.
  //
  // The relation term must open the message rather than appear anywhere in it,
  // so "I'll ask mum about the weekend" doesn't match. The money ask accepts a
  // bare amount ("send me 400") because the script usually omits the currency
  // symbol, and requiring one missed the live sample this rule was written for.
  //
  // "Opens" has to mean the start of the BODY, not of the text handed to us.
  // On the email path the caller passes the whole message, headers and all, so
  // the first line is "From:" and an anchor on the raw text can never match —
  // the rule silently did nothing for every real email until this skipped the
  // header block. Only the anchor needs the body; every other signal here is
  // positional-agnostic and reads the full text as before.
  const anchorText = stripForwardingPrefix(
    (channel === "email" ? bodyAfterHeaders(text) : text),
  ).trim();
  // Two ways to be addressed, because neither alone covers the script.
  //
  //   · opening — the term starts the body, with or without a greeting. This is
  //     the classic shape and carries the cases with no comma at all: the corpus
  //     holds "mum send me 400 my phone broke" and "Hi Dad I dropped my phone".
  //   · vocative — the term is addressed anywhere in the message, marked by a
  //     following comma or exclamation after a sentence break.
  //
  // Position alone was scoring a live scam safe: "Just letting you know, I got a
  // new number after my phone broke. Mum, can you transfer $200 for the rego?"
  // has all three halves and went undetected purely because the term is not
  // first. That is also what the benign-padding metamorphic relation was
  // reporting — prepending prose moved the opener out of range.
  //
  // Both branches exclude the subject reading, so "Mum's phone broke" and
  // "dad said he'd transfer the 300" stay out. The remaining protection against
  // an ordinary family text is the pretext requirement below, which is the half
  // a real family member never writes.
  const opensWithRelation = FAMILY_RELATION_TERMS.some((r) => {
    const opening = new RegExp(
      `^\\W{0,3}(?:(?:hi|hey|hello|good\\s+\\w+)[\\s,!.]*)?\\b${r}\\b(?!${RELATION_AS_SUBJECT})`,
      "i",
    );
    const vocative = new RegExp(
      `(?:^|[.!?]\\s+|\\n\\s*)(?:(?:hi|hey|hello|good\\s+\\w+)[\\s,!.]*)?\\b${r}\\b(?!${RELATION_AS_SUBJECT})\\s*[,!]`,
      "i",
    );
    return opening.test(anchorText) || vocative.test(anchorText);
  });
  const hasNumberPretext = NEW_NUMBER_PRETEXT_PHRASES.some((p) => mentions(lower, p));
  const hasMoneyAsk =
    /\b(?:send|transfer|pay|lend|e-?transfer|etransfer|deposit|spot)\b[^.!?]{0,40}?(?:\b(?:me|us|it)\b[^.!?]{0,20})?[$£€]?\s?\d{2,6}\b/i.test(text) ||
    /[$£€]\s?\d{2,6}\b/.test(text) ||
    /\b(?:send|transfer|lend|pay)\s+(?:me|us)\b[^.!?]{0,30}\b(?:money|cash|funds)\b/i.test(text) ||
    /\b(?:can|could)\s+you\s+(?:please\s+)?(?:send|transfer|lend|pay)\b/i.test(text) ||
    /\bneed\s+(?:you\s+to\s+)?(?:send|transfer|pay|lend)\b/i.test(text);

  // The pretext is required, not merely one of two ways in. An earlier version
  // accepted "any other signal present" as the third half, which sounds like
  // corroboration and isn't: a single urgency word satisfied it, and urgency is
  // ordinary in real family texts. "Mum, don't forget to pay the school fees of
  // 250 before Friday, it's urgent!" scored 55 and called a parent's own child
  // a scammer — the one false positive this rule must never produce, since it
  // teaches the reader to distrust the verdict and the family member at once.
  //
  // What makes the script detectable is not that it is urgent; it is that the
  // sender has to explain why they are contacting you from a number you don't
  // recognise. A real family member never needs that sentence.
  if (opensWithRelation && hasMoneyAsk && hasNumberPretext) {
    // +45 lands on the "likely_scam" boundary on its own. That is deliberate
    // and unlike the +20 composites above: those pair two innocent halves into
    // a suspicion, whereas this is a complete scam script end to end, and the
    // whole cost of the attack falls in the minutes before the victim thinks
    // to ring the real number. Warning quietly here would be the same as not
    // warning. A genuine family member is inconvenienced by one verification
    // call; a victim is not made whole.
    sig.add("message",
      `${FAMILY_IMPERSONATION_FLAG} — an unexpected message opening as your child or parent, explaining away an unfamiliar number, and asking for money. The broken-phone or new-number line is the load-bearing part: it exists to explain why the voice and number are both wrong, and to stop you ringing the number you already have. Call your family member on their usual number before sending anything. If they don't pick up, ask them something only they could answer.`,
      45,
    );
  }

  // Payment details presented as *changed* — the core of redirect fraud (D5 /
  // #105 and invoice/BEC fraud generally). Legitimate businesses rarely change
  // payment details mid-relationship and essentially never announce it by SMS.
  //
  // This is scored as its own signal rather than by listing "updated bank
  // details" in requestWords, where it overlapped the plain "bank details"
  // entry and silently double-scored one phrase. The qualifier is a real signal;
  // it just has to be matched as one instead of inflating another. Requires an
  // account-detail noun nearby so "updated your address" doesn't score.
  const changedPaymentDetails =
    /\b(updated?|new|changed|amended|revised)\s+(bank|payment|account|remittance)\s*(details|account|number|info)?/i.test(text) ||
    /\b(bank|payment|account)\s+details\s+have\s+(been\s+)?(updated|changed|amended)/i.test(text);
  if (changedPaymentDetails && hasBankAsk) {
    sig.add("message", "Payment details presented as recently changed — this is the signature of redirect fraud, where a scammer intercepts a real invoice or tenancy thread and substitutes their own account. Confirm any change by phoning the organisation on a number you already had, never one from the message.", 20);
  }

  // Contains a URL
  const urlMatch = text.match(/https?:\/\/[^\s]+/gi);
  if (urlMatch) {
    sig.add("message", `Contains link: ${urlMatch[0].slice(0, 50)}...`, 15);
    // Check the embedded URL too
    const urlCheck = checkUrl(urlMatch[0], blocklist, region);
    if (urlCheck.score > 40) {
      sig.add("message", "...and that link looks dodgy too", 20);
    }
  }

  // "Reply Y to activate" filter-bypass tactic (D3 / #54). Replying upgrades the
  // sender to a trusted contact on iOS/Android, making inert URL text tappable
  // and bypassing built-in phishing filters. The last clause catches the
  // "copy the link into your browser" variant used to dodge link scanners.
  const replyBypass =
    /reply\s*['"]?\s*[Yy](es)?\b.{0,40}(link|activat|access|proceed|view)/i.test(text) ||
    /type\s+[Yy](es)?\s+to\s+(proceed|activat|access|get\s+the)/i.test(text) ||
    /send\s+[Yy](es)?\s+to\s+(get|receive|access|activat)/i.test(text) ||
    /copy\s+(the\s+|this\s+|that\s+)?(link|url)\s+(into|to)\s+your\s+browser/i.test(text);
  if (replyBypass) {
    sig.add("message", "'Reply Y' trick detected — scammers tell you to reply first so links become tappable, bypassing your phone's spam filters", 25);
  }

  // QR-code "quishing" prompts (D11 / part of roadmap). The URL hides inside an
  // image, so the prompt language is the only text-side signal.
  if (/scan\s+(the\s+|this\s+)?(qr\s*code|code)\s*(to|and)?/i.test(text) ||
      /\bscan\s+to\s+(verify|update|claim|pay|confirm)/i.test(text) ||
      // PDF-embedded "Scanception" quishing (D7 / #113). Attackers put the QR
      // inside a PDF so email filters can't scan it, then reference it from the
      // body. The inverted phrasing ("the attachment contains a QR code") has no
      // "scan the QR code" verb phrase for the patterns above to latch onto —
      // the scan instruction comes later as a bare pronoun ("scan it") or is
      // left implicit. Requires the attachment noun and the QR mention in the
      // same clause, so a legitimate "the QR code on the attached flyer" stays
      // clean. Reuses the flag and +20 score — the existing wording already
      // describes this variant correctly.
      /\b(?:attachment|attached|(?:attached\s+)?(?:pdf|file|document|invoice))\s+(?:\w+\s+){0,2}?(?:contains?|includes?|has)\s+(?:a\s+|the\s+)?qr\s*code\b/i.test(text)) {
    sig.add("message", "QR code scan prompt — 'quishing' attacks hide malicious URLs inside QR images to dodge link scanners", 20);
  }

  // Fake voicemail notification lures (D5 / #122). Flubot-era smishing
  // (Scamwatch has a dedicated page) and the ongoing UpCrypter campaign both
  // use "you have a new voicemail" to get a click — the payload is malware or
  // a fake Microsoft 365 / Google Workspace credential page. Real voicemail
  // services deliver audio or a transcript inline, or link into the
  // authenticated app; they don't send a bare click-through in a separate SMS.
  //
  // Anchored on the *notification* shape rather than the bare word, so ordinary
  // conversational use ("I left you a voicemail", "your voicemail box is full")
  // stays clean. Scored +20 to match the QR-quishing prompt above: both are
  // click-lures that need a URL, brand or urgency signal to escalate.
  if (/you\s+have\s+(?:a|an|\d+|one|two|three)?\s*(?:new|unheard|missed|pending|urgent)?\s*voicemail/i.test(text) ||
      /\d+\s+(?:new\s+|unheard\s+|pending\s+)?voicemail/i.test(text) ||
      /listen\s+(?:to\s+)?(?:your\s+)?(?:new\s+)?voicemail/i.test(text) ||
      /voicemail\s+(?:notification|alert|waiting|received|pending)/i.test(text) ||
      /missed\s+call\s+(?:notification|alert)[\s\S]{0,30}(?:click|tap|visit|listen)/i.test(text)) {
    sig.add("message", "Fake voicemail notification — scammers send fake 'you have a new voicemail' messages to trick you into clicking a malicious link. Legitimate voicemail services never deliver audio via a separate SMS link.", 20);
  }

  // ClickFix "run a command" social engineering (D3 / #74 / ACSC advisory May
  // 2026). A fake CAPTCHA overlay tells the user to press Win+R and paste a
  // PowerShell command, running malware themselves. No legitimate entity asks
  // this, so the fuzzy match scores near-certain.
  if (/press\s+(win|windows)\s*\+?\s*r\b/i.test(text) ||
      /powershell\s+-[ec]/i.test(text)) {
    sig.add("message", WIN_CLICKFIX_FLAG, 50);
  } else if (isMacClickFix(text)) {
    sig.add("message", MAC_CLICKFIX_FLAG, 50);
  }

  // ACMA SMS Sender ID "Unverified" label override language (D7 / #78 / post-1
  // July 2026). Since the register went live, unregistered senders show as
  // "Unverified"; scammers pre-emptively explain the label away. No legitimate
  // registered sender ever needs to — the language is self-identifying.
  const unverifiedOverride =
    /may\s+appear\s+(as\s+)?unverified/i.test(text) ||
    /displayed?\s+as\s+unverified/i.test(text) ||
    /ignore\s+(the\s+)?['"]?unverified['"]?/i.test(text) ||
    /carrier\s+(has\s+not|hasn'?t)\s+updated\s+our\s+(registration|sender)/i.test(text) ||
    /unverified\s+(label|tag|display)\s+is\s+a\s+(carrier\s+)?(error|delay|bug)/i.test(text);
  // Only scored where the region actually runs a sender-ID registration
  // scheme — asserting foreign regulation to users elsewhere would be false.
  if (unverifiedOverride && PACK.senderIdFlag) {
    sig.add("message", PACK.senderIdFlag, 35);
  }

  // Fake task/job recruitment funnel for pig-butchering (D13 / #51). Composite:
  // require ≥2 distinct signals so legitimate job ads (which may use one of these
  // phrases) don't trip on their own.
  const jobSignals = [
    /\brate\s+products\b/i, /\bsimple\s+tasks?\b/i, /\bearn\s+\$?\d+/i,
    /\bno\s+experience\s+required\b/i, /\bonline\s+tasks?\b/i,
    // "work from home" (with or without a "flexible" qualifier) is one concept,
    // counted once — the qualifier must not let the same phrase score twice.
    /\bwork\s+from\s+home\b/i,
  ].filter((re) => re.test(text)).length;
  if (jobSignals >= 2) {
    sig.add("message", "Task/job recruitment pattern — a common funnel into 'pig-butchering' investment scams; real employers don't recruit this way", 25);
  }

  // The task-scam payment gate (D2 / #226 / Scamwatch alert, 7 Aug 2026).
  //
  // jobSignals above already catches the recruitment half — the e-commerce
  // assistant lure measured suspicious (25) before this, which is why the
  // issue's proposed REWARD_WORDS entries were dropped: "rate products to earn
  // commission" would have double-scored against the composite's own regex.
  //
  // What was uncovered is the step that takes the money. After some real
  // payouts the victim is told their earnings are locked behind a deposit —
  // "complete the task to withdraw", "your account is frozen, top up to
  // continue". That inverts the employment relationship, and it is scored
  // separately rather than as another jobSignal because it is the tell on its
  // own: no employer has ever required payment to release wages. Measured at
  // safe (0) before this.
  const taskPaymentGate =
    // "receive" is deliberately absent from the outcome verbs, and the outcome
    // must name money. "Complete the task to receive your certificate" is
    // ordinary compliance-training mail and measured 40 against a looser form.
    /\b(complete|finish|unlock|activate)\b[^.!?]{0,30}\btasks?\b[^.!?]{0,30}\b(to|before|and)\b[^.!?]{0,20}\b(withdraw|withdrawal|release|unlock|claim)\b[^.!?]{0,30}\b(earnings?|commission|balance|funds|payment|money|salary|wages?|\$\d)/i.test(text) ||
    /\b(withdraw|release|unlock)\b[^.!?]{0,40}\b(earnings|commission|balance|funds)\b[^.!?]{0,40}\b(complete|finish|deposit|top\s?up|recharge|prepay|pre-?fund)\b/i.test(text) ||
    /\b(deposit|top\s?up|recharge|prepay|pre-?fund)\b[^.!?]{0,40}\b(to|before)\b[^.!?]{0,30}\b(unlock|withdraw|release|continue)\b[^.!?]{0,30}\b(earnings|commission|tasks?|balance|funds)\b/i.test(text) ||
    // "You have unfinished tasks" is the scam's own phrasing, but it is also
    // exactly what a project tracker sends — "Reminder from Asana: you have 3
    // unfinished tasks" scored 40 while this branch stood alone, telling the
    // reader their money was gone. Unlike the three above it carries no payment
    // half of its own, so it needs the money context the others state outright.
    (/\byou\s+have\s+(?:\d+\s+)?unfinished\s+tasks?\b/i.test(text) &&
      /\b(withdraw|withdrawal|earnings?|commission|balance|deposit|top\s?up|recharge|unlock|frozen|payout)\b/i.test(text));
  if (taskPaymentGate) {
    sig.add("message", TASK_PAYMENT_FLAG + " — this is the moment a task-scam takes the money. A real employer never asks you to deposit funds to release your own wages, and the small payouts that came before exist to make this step feel safe. Anything sent here is gone, and the 'balance' on screen is not real.", 40);
  }

  // Verification-code harvesting — messaging-app account takeover (D3 / #227 /
  // FBI IC3 PSA260320, updated June 2026).
  //
  // The signal is not the code. Every legitimate 2FA message contains one, and
  // "your verification code is 482910" must stay silent. The signal is being
  // asked to SEND one somewhere — forward it, reply with it, share it, read it
  // out. No service that issues a code ever asks for it back through the same
  // channel; the whole point of the code is that only you see it, which is why
  // every legitimate one carries "don't share this with anyone".
  //
  // Requires the send verb and the code noun in one clause, so a delivery
  // ("123456 is your WhatsApp code") has no verb to latch onto and a bare
  // "reply STOP" has no code noun.
  // A negated ask is the opposite signal, and it is what every legitimate 2FA
  // message and bank fraud warning actually says. "Never share your
  // verification code with anyone" measured likely_scam (45) against a rule
  // that only looked for the verb — the single worst false positive available
  // here, since it flags the anti-fraud advice itself.
  //
  // The negation is evaluated PER CLAUSE, not across the message. Scoped to the
  // whole text it was a bypass: appending one reassurance sentence disarmed the
  // signal entirely, and "Send me the verification code that just arrived.
  // Never share it with anyone else." scored 0. Smishing routinely carries that
  // kind of trailing boilerplate — it is copied from the real notices it
  // imitates — so the guard has to ask whether *this* clause is a warning, not
  // whether the message contains one anywhere.
  // "confirm" is deliberately absent from the verbs: confirming a code you
  // hold is what legitimate flows ask for ("confirm the security code on
  // your statement"). The scam asks you to TRANSMIT it onward.
  //
  // The code noun must be one that only a service issues. "security code" and
  // "access code" are excluded: they are the ordinary words for a door, gate or
  // alarm code, and "forward me the security code for the gate" scored
  // likely_scam — the engine's top severity — on an entirely benign message.
  // They are still reachable via the app-context branch below.
  const CODE_ASK =
    /\b(forward|send|share|reply\s+with|text\s+(?:me|us)|give\s+(?:me|us)|read\s+(?:me|us)\s+out)\b[^.!?]{0,40}\b(?:the\s+|your\s+|that\s+|this\s+|a\s+)?(?:\d[\s-]?)?(?:verification|authentication|login|one[\s-]?time|activation|otp|6[\s-]?digit|4[\s-]?digit)\b[^.!?]{0,20}\bcode\b/i;
  const CODE_RETURN =
    /\bcode\b[^.!?]{0,30}\b(?:back\s+to\s+(?:me|us)|to\s+(?:me|us)\s+to\s+(?:verify|restore|confirm|unlock))\b/i;
  // A weaker noun ("security code", "access code") only counts where the
  // message is already about an account being verified or restored, which is
  // what separates the takeover script from a gate code.
  const WEAK_CODE_ASK =
    /\b(forward|send|share|reply\s+with|text\s+(?:me|us)|give\s+(?:me|us))\b[^.!?]{0,40}\b(?:the\s+|your\s+|that\s+)?(?:security|access|sms)\b[^.!?]{0,20}\bcode\b/i;
  const accountContext =
    /\b(account|verify|verification|restore|unlock|suspend|suspended|locked\s+out|log\s?in|sign\s?in|2fa|two[\s-]factor)\b/i.test(text);
  const codeHarvest = clauses
    .some((clause) => {
      if (NEGATED_ASK.test(clause) || DISREGARD_NOTICE.test(clause)) return false;
      if (CODE_ASK.test(clause) || CODE_RETURN.test(clause)) return true;
      return WEAK_CODE_ASK.test(clause) && accountContext;
    });
  if (codeHarvest) {
    sig.add("message", "Asks you to pass on a verification code — no legitimate service ever asks for a code it just sent you. Anyone with that code can take over the account it belongs to, which is how messaging and bank accounts are stolen. Never send it on, even to someone who seems to be a contact.", 45);
  }

  // Messaging-app account-status lures (D3 / #227). The takeover script opens
  // by claiming the account is in trouble, then steers to a QR link or a code.
  // Signal and WhatsApp do not send account-status notices by SMS, email or
  // any third-party channel at all — everything they tell you appears inside
  // the app — so naming one of them alongside a suspension claim is
  // self-identifying. Scored below the code ask: on its own it is a pretext,
  // and it is the code or QR step that does the damage.
  //
  // "signal" is a very common noun — reception, traffic lights, wifi — so it
  // only counts in the app sense: followed by an account word, or capitalised
  // mid-sentence as a proper noun. Matched bare it read "poor signal in the
  // tunnel so my phone data was restricted" and "the traffic signal at the
  // intersection is under review" as account lures, both scoring 30 on
  // completely ordinary SMS. WhatsApp and Telegram have no such ambiguity.
  const STATUS = "(?:flagged|restricted|suspended|locked|limited|deactivated|under\\s+review)";
  // WhatsApp and Telegram are unambiguous, so they match case-insensitively.
  const UNAMBIGUOUS_APP = "(?:whatsapp|telegram)";
  // "signal" only counts in the app sense: qualified by an account noun, or
  // capitalised where a proper noun is the only reading. Matched bare and
  // case-insensitively it read ordinary reception and traffic talk as lures.
  const SIGNAL_APP = "(?:[Ss]ignal\\s+(?:account|messenger|app)|Signal(?=\\s+(?:has|is|was|account)))";
  const messagingAppStatusLure =
    new RegExp(`\\b${UNAMBIGUOUS_APP}\\b[^.!?]{0,70}\\b(?:has\\s+been\\s+)?${STATUS}\\b`, "i").test(text) ||
    new RegExp(`\\b${SIGNAL_APP}\\b[^.!?]{0,70}\\b(?:has\\s+been\\s+)?${STATUS}\\b`).test(text) ||
    new RegExp(`\\b${STATUS}\\b[^.!?]{0,40}\\b(?:${UNAMBIGUOUS_APP}|signal)\\s+account\\b`, "i").test(text);
  if (messagingAppStatusLure) {
    sig.add("message", MESSAGING_HIJACK_FLAG + " — Signal, WhatsApp and Telegram never send account notices by SMS or email. Anything they need to tell you appears inside the app itself, so a message like this arriving any other way is the scam.", 30);
  }

  // Withdrawal-gate lure — fake gambling platforms, "scambling" (D1 / #225 /
  // ACCC 14 Aug 2026, NASC fusion cell to Dec 2026; 927% H1 2026 report surge).
  //
  // The campaign's tell is not the bonus offer — licensed operators promote by
  // SMS constantly, and "exclusive bonus"/"VIP access"/"free spins" measured
  // safe-to-24 in isolation, hitting a legitimate Crown registration SMS at 22.
  // Flat REWARD_WORDS entries would have scored that FP higher.
  //
  // The tell is the *withdrawal gate*: winnings exist, but releasing them
  // requires an out-of-band verification step. Real operators run KYC at signup
  // or before a payout completes; none withhold a stated balance behind an SMS
  // instruction to verify. Requires both halves — a verify/confirm instruction
  // AND the withdrawal-of-winnings framing — in the same message, so a bare
  // "verify your account" (already +10 urgency) and a plain withdrawal
  // confirmation both stay clear.
  //
  // The gated noun is deliberately "winnings"/"payout" and not "funds" or
  // "balance". Legitimate one-time KYC does say "verify your identity before
  // you can withdraw funds" — measured at 40 (suspicious) against the looser
  // form, a false positive on ordinary regulated onboarding. Winnings are the
  // distinguishing claim: the scam asserts a balance the victim has already
  // won, then gates it. An exchange or bookmaker verifying identity before a
  // first withdrawal is describing a limit, not withholding a stated prize.
  const withdrawalGate =
    /\b(verify|confirm|validate|activate)\b[^.!?]{0,60}\b(withdraw|withdrawal|release|unlock|claim)\b[^.!?]{0,40}\b(winnings|prize|jackpot|payout)\b/i.test(text) ||
    /\b(withdraw|release|unlock)\b[^.!?]{0,40}\b(winnings|prize|jackpot|payout)\b[^.!?]{0,60}\b(verify|confirm|validate)\b/i.test(text);
  if (withdrawalGate) {
    sig.add("message", "Winnings held behind a verification step — the signature of fake gambling platform scams. A licensed operator verifies your identity when you sign up or when a payout is processed; none hold a balance you can see behind an extra 'verification' fee or ID upload. Money or documents sent at this step are not recoverable.", 40);
  }

  // WhatsApp/Telegram investment-group pig-butchering funnel (D5 / #76 / ASIC
  // 26-063MR). Distinct from jobSignals: this targets the investing aspiration,
  // not the side-gig one. Require ≥2 signals, or 1 signal plus a crypto term, so
  // legitimate mentions of investment communities don't trip it on their own.
  const investmentGroupSignals = [
    /join\s+(our|the)\s+(trading|stock|investment|crypto)\s+group/i,
    /exclusive\s+(stock|trading|investment)\s+tips?/i,
    /(vip|private)\s+(trading|investment|stock)\s+(signal|group|channel)/i,
    /trading\s+signals?\s+(group|channel|community)/i,
    /we\s+(made|returned|earned)\s+\$?\d+.*\b(from\s+)?(tips?|trading)/i,
    /i'?ll?\s+add\s+you\s+(to\s+(our|the)\s+)?(whatsapp|telegram|signal)/i,
  ].filter((re) => re.test(text)).length;
  const hasCryptoSignal = ["crypto", "bitcoin", "wallet", "connect wallet", "sign transaction"]
    .some((w) => lower.includes(w));
  if (investmentGroupSignals >= 2 || (investmentGroupSignals >= 1 && hasCryptoSignal)) {
    sig.add("message", "Investment group recruitment pattern — scammers use 'private trading tip' groups as an entry point for pig-butchering investment fraud; real investment groups don't recruit via cold messages", 30);
  }

  // Sender mentions a gov agency but is a random number.
  //
  // Skipped when the message genuinely came FROM that organisation's own
  // domain. The flag says "verify directly via official channels", which is
  // wrong advice for mail that already arrived through the official channel —
  // and it was scoring a real Australia Post delivery notification as
  // suspicious. The domain is matched exactly or as a subdomain, so a lookalike
  // like `auspost.com.au.evil.tk` does not qualify (see isOwnDomainSender).
  // SMS only. An email has a verifiable sender domain, and isOwnDomainSender
  // already uses it — so for email the body link must NOT override the sender:
  // a spoofed message from auspost.com.au.evil.tk quoting the real
  // auspost.com.au/track link is an ordinary phishing shape, and treating its
  // link as proof of identity would clear it. SMS carries no sender domain at
  // all, which is exactly why the body link is the only evidence available
  // there.
  // Matched against the message text with the URLs stripped out. The link's own
  // hostname must not be what proves the message names that agency, or the test
  // is circular: "ATO: log in at auspost.com.au" would find "auspost" inside the
  // URL, call it a named authority, and clear the impersonation it was meant to
  // catch.
  const proseOnly = lower.replace(/https?:\/\/[^\s]+/gi, " ");
  const namedAuthorities = PACK.authorityMentions.filter((a) => mentions(proseOnly, a));
  const linksAreOfficial =
    channel === "sms" && allLinksOnLegitDomains(urlMatch, PACK, namedAuthorities);
  if (
    mentionsAny(lower, PACK.authorityMentions) &&
    !isOwnDomainSender(channel, options?.senderDomain, PACK) &&
    // ...and not when every link in the message goes to that agency's own
    // domain. "Verify directly via official channels" is wrong advice for a
    // message whose only link IS the official channel. A real Australia Post
    // tracking SMS scored 55/likely_scam here — the same score as an outright
    // lookalike (revenue-ie.top) — which is the failure this prevents.
    !linksAreOfficial
  ) {
    // Naming an agency is not by itself evidence of anything: every genuine
    // message from the ATO says "ATO", and the real AusPost delivery notice
    // says "AusPost". Uncorroborated, this rule scored a 25 on ordinary mail
    // and told the reader to "verify directly via official channels" about a
    // message that had already arrived through one.
    //
    // What separates the scam is never the mention — it is what the mention is
    // paired with: a link, a callback number, urgency, an actual ask. So the
    // points are held back until something else has already scored. Across
    // every AU corpus case carrying an authority mention this separates the two
    // classes exactly: the benign ones have no other positive signal, the scams
    // all do.
    //
    // The flag is still emitted at zero weight when it stands alone, because
    // the reader should see that we noticed the agency name — silence would
    // read as "nothing here", which is not what was concluded.
    sig.addDeferred(
      "message",
      "Names a government agency, with nothing else unusual in the message — on its own that is ordinary for mail from that agency. Check anything it asks you to do by going to the official app or site yourself, not through this message.",
      "Claims to be from a government agency — verify directly via official channels",
      25,
    );

    // Senders that have publicly removed links from their unsolicited SMS — a
    // link alongside one of these is a scam. Scoped to the confirmed no-link
    // senders so the flag wording stays accurate (toll operators, by contrast,
    // do use links).
    //
    // SMS ONLY. The 2024 commitment covers unsolicited text messages, not
    // email: Australia Post, myGov and the ATO all send legitimate email with
    // clickable links, so applying this to an email flags ordinary mail — and
    // the flag text ("an SMS from one of these bodies...") is then plainly
    // wrong about what was checked. Found when a genuine Australia Post
    // delivery notification scored 38/suspicious on this rule.
    // The official-link exemption applies here too — this rule's premise is
    // "these bodies do not put links in their texts", which cannot be the right
    // call for a link to the body's own domain. It is not repeated in this
    // condition because the enclosing `if` already requires !linksAreOfficial;
    // duplicating it would read as an independent guard that is really the same
    // one. If that outer condition is ever loosened, this branch needs the
    // check added back explicitly — see the officialLinkExemption tests, which
    // assert the no-link-sender flag directly rather than through the outer rule.
    if (channel === "sms" && urlMatch && mentionsAny(lower, PACK.noLinkSenders)) {
      sig.add("message", PACK.noLinkSendersFlag, 15);
    }
  }

  // Foreign-authority impersonation (D3 / #103 / AFP May 2026). Kept separate
  // from authorityMentions because the reasoning is different and stronger: an
  // authority with no enforcement jurisdiction here demanding payment is a scam
  // signal on its own, rather than a "verify via official channels" prompt.
  // Scored +35 (vs +25).
  if (mentionsAny(lower, PACK.foreignAuthorityMentions)) {
    sig.add("message", PACK.foreignAuthorityFlag, 35);
  }

  // Consumer brands impersonated in SMS but not government agencies, so they get
  // their own flag wording. Which brands these are is regional, so the lists
  // come from the pack; the `word` list is matched on boundaries because short
  // names like "agl" would otherwise fire on "bagel" and "flagship".
  const shortBrandHit = BRAND_MENTIONS.word.some((b) =>
    new RegExp(`\\b${b}\\b`, "i").test(lower));

  // containsLoose, not mentions: these entries exist to catch the GLUED form a
  // scam domain uses — "amazonsupport.tk", "coinspotsecure.com" — which is
  // exactly what a word boundary refuses. Routing them through mentions()
  // dropped "Verify at amazonsupport.tk now" from 20 to 0 with no flags at all.
  // Their protection against firing inside an innocent word is entry length,
  // not an anchor; the short ones live in BRAND_MENTIONS.word, which IS
  // boundary-matched.
  // A brand glued into a hostname is evidence on its own — "amazonsupport.tk"
  // is not something a genuine message contains, and no legitimate sender
  // writes their own name that way. A brand in prose ("Your Amazon order has
  // shipped") is what a genuine message DOES contain, so only that half is
  // deferred. Without this split "Verify at amazonsupport.tk now" scored 0.
  const brandInHostname = [...BRAND_MENTIONS.substring, ...BRAND_MENTIONS.word].some((b) => {
    const brand = b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // The brand appears inside a hostname label.
    const glued = new RegExp(`[a-z0-9-]*${brand}[a-z0-9-]*\\.[a-z]{2,}`, "i");
    // …but not as the sender's own registrable domain. The leading class admits
    // a DOT so a subdomain qualifies: "tools.usps.com" and "www.royalmail.com"
    // are the carrier's own tracking pages, and without it every legitimate
    // subdomain read as a squat — which then corroborated the deferred agency
    // row and put a genuine carrier SMS back at 45, the exact double-score this
    // split exists to remove.
    //
    // The trailing guard keeps that dot safe: the brand must end the host, so
    // "usps.com.evil.tk" and "royalmail.com.secure-pay.tk" (the real domain used
    // as a PREFIX of the attacker's) and "myusps.net" are all still caught. The
    // optional second suffix group admits a two-part public suffix —
    // "nzpost.co.nz", "auspost.com.au" — which a single-label guard rejected,
    // putting a genuine NZ Post SMS at 45.
    //
    // The lookahead rejects a further host character OR a dot that begins
    // another label, but not a bare trailing dot: "Details at www.nzpost.co.nz."
    // ends a sentence, and reading that period as part of the host scored the
    // message 45 too.
    const ownDomain = new RegExp(
      `(?:^|[\\s/@.])${brand}\\.[a-z]{2,}(?:\\.[a-z]{2,})?(?![a-z0-9-]|\\.[a-z0-9-])`,
      "i",
    );
    return glued.test(lower) && !ownDomain.test(lower);
  });
  if (shortBrandHit || BRAND_MENTIONS.substring.some((b) => containsLoose(lower, b))) {
    // Deferred for the same reason as the agency mention above: naming a brand
    // is what a genuine message from that brand does. Left scored, it also
    // became the agency mention's corroboration — postal operators sit in BOTH
    // lists in GB, US, NZ and IE (AU is the only pack where they do not
    // overlap), so one mention scored twice and each half propped up the other.
    // "USPS: your package is out for delivery today. No action needed." reached
    // likely_scam (45) while its AU twin scored 0.
    if (brandInHostname) {
      sig.add("message", "Claims to be from a well-known company — verify by logging in directly through the official app or website, not via any link in this message", 20);
    } else {
      sig.addDeferred(
        "message",
        "Names a well-known company, with nothing else unusual in the message — on its own that is ordinary for mail from that company. If it asks you to do something, go to the official app or website yourself rather than through this message.",
        "Claims to be from a well-known company — verify by logging in directly through the official app or website, not via any link in this message",
        20,
      );
    }
  }

  // Asks to call back a number
  if (/call\s+(back|now|us|this number)/i.test(text)) {
    sig.add("message", "Asks you to call a number — scammers use this to run up your phone bill or gather info", 20);
  }

  // Crypto-exchange TOAD composite (D6 / #123). An exchange name plus a phone
  // number to ring and no link is the telephone-oriented attack: the scam runs
  // on the call, where a "support agent" walks the victim through handing over
  // 2FA codes or moving funds to a "safe wallet". Real exchanges never phone
  // customers about account security. Requires an explicit number so ordinary
  // "your CoinSpot deposit cleared" texts stay unflagged.
  //
  // Brands come from the pack's callback list (base crypto names plus the
  // region's own exchanges) rather than a hardcoded AU trio, and the flag names
  // whichever brand actually matched — the old copy asserted "CoinSpot, Swyftx
  // and Binance" to every region.
  const cryptoToadHit = CRYPTO_TOAD_BRANDS.find((b) => containsLoose(lower, b));
  // Region-agnostic, but a *dialable* number only. Three shapes: international
  // `+NN…`, a national trunk-prefixed `0…`, and non-geographic service ranges
  // that carry no trunk prefix (AU 1800/1300/13xx, US/CA 1-8xx). The previous
  // AU-only pattern meant this composite could never fire outside Australia.
  //
  // Deliberately no bare-digit-run alternative. A 10-14 digit sequence with no
  // dialing prefix is far more often an order number, reference or invoice ID —
  // "suspicious login on order 1234567890123, call support" satisfied the phone
  // half with no phone number present at all. The service-number branch is
  // prefix-anchored for the same reason: `1[38]00` and `1-8xx` are real dialing
  // patterns, not any digit string that happens to be long enough.
  const hasPhoneNumber =
    /\+\d{1,3}[\s-]?(?:\d[\s-]?){6,14}\d/.test(text) ||
    /\b0\d(?:[\s-]?\d){7,10}\b/.test(text) ||
    /\b1[\s-]?(?:800|300|3\d{2}|8\d{2})(?:[\s-]?\d){5,8}\b/.test(text) ||
    /\b13[\s-]?\d{2}[\s-]?\d{2}\b/.test(text);
  const mentionsCalling = /\bcall\b|\bphone\b|\bcontact (support|us)\b|\bhelpline\b/i.test(text);
  const hasUrl = /https?:\/\/|www\.|\.[a-z]{2,}\//i.test(text);

  if (cryptoToadHit && hasPhoneNumber && mentionsCalling && !hasUrl) {
    sig.add("message", `Crypto exchange asking you to phone them — ${cryptoToadHit} and other exchanges never ring customers or ask you to call about account security. The scam happens on the call: they'll talk you through handing over 2FA codes or moving funds to a "safe wallet". Hang up and log in through the official app instead.`, 30);
  }

  // Grammar/typo signals.
  //
  // Word-boundaried, because these are short tokens matched against free text
  // and the unanchored form fired inside ordinary words: "ur account" matched
  // inside "yo|ur account| settings" and "fo|ur account|s", so every message
  // containing "your account" was flagged for typos it does not have. Same
  // collision class the pack lists guard against in __tests__/packShadowing —
  // a short needle matching inside a longer legitimate word.
  //
  // "pls"/"plz"/"ur" need the boundary most; "recieve"/"reciept" are already
  // unambiguous misspellings but are anchored too, for consistency.
  const typos = text.match(/\brecieve\b|\breciept\b|\bur\s+account\b|\bu\s+have\b|\bpls\b|\bplz\b|\bkindly\b/gi);
  if (typos && typos.length > 0) {
    sig.add("message", "Spelling/grammar patterns common in scam messages", 10);
  }

  // Named fraudulent investment platforms (D4 / #104). ASIC/Scamwatch have
  // explicitly warned against these exact names — a single match is a
  // high-confidence scam signal with essentially no legitimate use case.
  const platformHit = FAKE_INVESTMENT_PLATFORMS.find((p) => containsLoose(lower, p));
  if (platformHit) {
    sig.add("message", PACK.fakeInvestmentPlatformFlag(platformHit), 50);
  }

  // myID forced re-registration phishing (D6 / #106). Dedicated wording rather
  // than a govMentions entry, because these are "digital identity" phrases, not
  // an agency name — the govMentions "claims to be a government agency" flag
  // would read wrong here.
  if (mentionsAny(lower, MYID_REREG_PHRASES)) {
    sig.add("message", PACK.identityReregFlag, 25);
  }

  const score = Math.min(sig.total(), 100);
  return scoreToResult(score, sig, "SMS", PACK.coverage, PACK.reportingBody);
}

/**
 * Signals the email channel's 0.7 discount must not touch.
 *
 * Every entry is a composite whose gate requires two or more independent
 * conditions to hold at once. The discount exists to soften loose keyword hits,
 * whose false-positive rate really does rise with message length; a composite's
 * does not, so discounting one only moves a correct verdict down a tier.
 *
 * Adding a composite to the engine means adding it here. __tests__ asserts each
 * entry survives the email path at its SMS weight, so a forgotten one fails
 * loudly rather than quietly scoring a tier low.
 */
const UNDISCOUNTED_COMPOSITES: string[] = [
  FAMILY_IMPERSONATION_FLAG,
  TASK_PAYMENT_FLAG,
  MESSAGING_HIJACK_FLAG,
  MAC_CLICKFIX_FLAG,
  WIN_CLICKFIX_FLAG,
];

// ────────────────────────────────────────────────────────────────────────────
// Email checker
// ────────────────────────────────────────────────────────────────────────────

export function checkEmail(text: string, blocklist?: Set<string>, region?: RegionInput): CheckResult {
  const PACK = resolveRegionPack(region);
  const {
    suspiciousTlds: SUSPICIOUS_TLDS,
    callbackBrands: CALLBACK_BRANDS,
    officialSenderNames: OFFICIAL_SENDER_NAMES,
    trustedHostSuffixes: TRUSTED_HOST_SUFFIXES,
  } = PACK;
  const sig = new Signals();
  const lower = text.toLowerCase();

  // Reuse SMS signals for body content. The region must be forwarded — without
  // it every email check ran the default (AU) signal set regardless of the
  // caller's region, so a UK email was scored against Australian agencies and
  // brands while the URL and SMS checkers correctly used the UK pack.
  // Parsed up front so the shared body analysis can tell "names an agency" from
  // "actually came from that agency" — see isOwnDomainSender.
  const senderHeaders = parseEmailHeaders(text);
  const smsCheck = checkSms(text, blocklist, region, {
    channel: "email",
    senderDomain: senderHeaders.fromAddress ? domainOf(senderHeaders.fromAddress) : undefined,
  });
  // Email gets a bit more lenience than the same words in an SMS.
  sig.merge("message", smsCheck, Math.floor(smsCheck.score * 0.7));

  // …but not for the gated composites. The 0.7 discount is right for the
  // signals it was written for — urgency and reward keywords really are weaker
  // evidence in a long email than in a 160-character text, because a long
  // message has more room to say an ordinary word. That reasoning is about
  // keyword FREQUENCY, and it does not transfer to a rule that already requires
  // several independent halves to line up: those do not become more likely to
  // misfire because the message is longer, and every one of these scripts runs
  // by email as readily as by SMS.
  //
  // Left alone the discount demoted them across the verdict boundary, which is
  // the part that reaches the reader: the family script went 45 → 31, the
  // task-payment composite 52 → 36 and the messaging-hijack lure 60 → 42, each
  // landing on "something's a bit sus" — advice that reads as permission to
  // keep reading.
  //
  // A list rather than one special case, because the previous shape covered
  // only the family script and every composite added since silently inherited a
  // discount nobody decided to give it. The entry test is structural: a signal
  // belongs here when its gate requires two or more independent conditions, so
  // it is not the loose keyword hit the discount exists to soften. Keyword-count
  // signals (urgency, reward, sensitive-info, generic keywords) stay discounted.
  //
  // Each is restored by lifting the signal's OWN row back to its pre-discount
  // weight rather than adding a separate one: flags are rendered straight from
  // signal text, so a padding row would show the reader a blank bullet.
  for (const flag of UNDISCOUNTED_COMPOSITES) {
    const hit = (smsCheck.signals ?? []).find((x) => x.text.startsWith(flag));
    if (hit) sig.restore(flag, hit.points);
  }

  // Header-aware sender analysis: parse From / Reply-To / Return-Path and flag
  // display-name masking and From≠Reply-To spoofing.
  const headers = parseEmailHeaders(text);
  if (headers.fromAddress) {
    const senderDomain = domainOf(headers.fromAddress);
    const suspTlds = SUSPICIOUS_TLDS.find((t) => senderDomain.endsWith(t));
    if (suspTlds) {
      sig.add("sender", `Sender email uses a dodgy domain extension (${suspTlds})`, 30);
    }
    // Impersonation pattern: official name in the body but a mismatched domain.
    // Both the names and the domains that count as matching are regional; a
    // region with no national suffixes skips the rule rather than calling every
    // sender an impersonator.
    const onTrustedSuffix = TRUSTED_HOST_SUFFIXES.some((s) => senderDomain.endsWith(s));
    // Boundary-matched for short entries: every pack's sender list carries
    // three-letter institution names ("ato", "anz", "dwp", "irs", "cra"), and as
    // bare substrings those hit ordinary words — "cra" inside "scratch", "ird"
    // inside "third" — which would call an unrelated sender an impersonator.
    if (TRUSTED_HOST_SUFFIXES.length > 0 &&
        mentionsAny(lower, OFFICIAL_SENDER_NAMES) &&
        senderDomain && !onTrustedSuffix) {
      sig.add("sender", `Sender claims to be official but domain doesn't match — textbook impersonation`, 40);
    }
  }

  // Identity spoofing signals (display-name masking, From≠Reply-To, Return-Path)
  const identity = analyseEmailIdentities(headers);
  sig.merge("sender", identity, identity.score);

  // Generic greeting
  if (/dear (customer|user|member|valued|account holder|sir|madam)/i.test(text)) {
    sig.add("sender", "Generic greeting (e.g. 'Dear Customer') — legit orgs use your actual name", 15);
  }

  // Asks to open attachment
  const opensAttachment = /open.{0,20}(attachment|file|document|invoice)/i.test(text);
  if (opensAttachment) {
    sig.add("sender", "Prompts you to open an attachment — common malware delivery method", 25);
  }

  // SVG phishing attachment (D6 / 2026-08-09 roadmap / APWG Q2 2026, Proofpoint,
  // Any.run). SVG attachments carry embedded JavaScript that redirects to a
  // credential-harvest page, and they slip past scanners that only inspect
  // Office and PDF formats while rendering directly in the browser when opened.
  //
  // The hard part is that .svg is also an utterly ordinary asset extension: it
  // appears in the logo and tracking-pixel references at the foot of most
  // marketing email, which is precisely the mail this app is handed. Matching a
  // bare ".svg" would flag a newsletter footer.
  //
  // So the extension only counts when it is the thing being *sent*. Two
  // deliberately narrow halves, both learned from review:
  //
  //   - The cue must be attachment language proper ("attached", "attachment",
  //     "enclosed"), not a bare verb. An earlier version accepted
  //     see/open/download/view, which made "View in browser <img …/logo.svg>" —
  //     the standard marketing header — a phishing hit. Those verbs only count
  //     when they govern an attachment noun ("open the attached …").
  //   - The trailing half must not accept bare "file"/"document" as evidence
  //     either: "our logo.svg file lives in the shared drive" is ordinary
  //     office chatter. It needs an explicit attachment word, or a
  //     document-type noun that is itself the payload framing (invoice,
  //     statement, receipt, remittance).
  //
  // A footer logo reference has no such wording anywhere near it, on one line or
  // several, so it stays unflagged.
  //
  // The URL guard matters independently: an .svg inside an href/src is an asset
  // reference, not an attachment. Scheme-prefixed URLs and attribute values are
  // both excluded — quoted or not, absolute or root-relative, since
  // `<img src=/assets/logo.svg>` is as ordinary as the quoted absolute form.
  //
  // Scored below the likely_scam threshold on purpose: an SVG attachment is a
  // delivery-mechanism signal, not proof of intent — see the +25 interaction
  // note at the scoring line below.
  const ATTACH_WORD = String.raw`attach(?:ment|ments|ed|ing)?|enclosed`;
  const PAYLOAD_NOUN = String.raw`invoice|statement|receipt|remittance`;
  // .svg not sitting in a URL or an HTML attribute value. The three lookbehinds
  // cover, in order: an absolute URL; a quoted attribute value; and an unquoted
  // or root-relative attribute value (`src=/assets/logo.svg`, `src=logo.svg`),
  // which the quoted pattern alone misses.
  const svgFile = String.raw`(?<!https?:\/\/[^\s"']{0,200})(?<!(?:src|href)\s*=\s*["'][^"']{0,200})(?<!(?:src|href)\s*=\s*[^\s"'<>]{0,200})\b[\w.-]+\.svg\b`;
  const svgPatterns = [
    new RegExp(String.raw`\b(?:${ATTACH_WORD})\b[^\n]{0,40}?${svgFile}`, "i"),
    new RegExp(String.raw`${svgFile}[^\n]{0,40}?\b(?:${ATTACH_WORD})\b`, "i"),
    new RegExp(String.raw`\b(?:${PAYLOAD_NOUN})\b[^\n]{0,20}?${svgFile}`, "i"),
    new RegExp(String.raw`${svgFile}[^\n]{0,20}?\b(?:${PAYLOAD_NOUN})\b`, "i"),
  ];
  const svgMatch = svgPatterns.reduce<RegExpMatchArray | null>(
    (found, re) => found ?? text.match(re), null);
  if (svgMatch) {
    sig.add("sender", "SVG file attached — SVG attachments are a known phishing delivery trick: the file looks like an image but can carry hidden code that opens a fake login page in your browser. Legitimate invoices and statements are not sent as .svg.");
    // De-duplicated against the generic open-attachment rule above, but only
    // when both are describing the *same* attachment. "Please open the attached
    // invoice.svg" is one file and both rules match it — charging 25 + 20
    // double-counts a single fact and landed it on exactly 45, the likely_scam
    // boundary, purely by arithmetic.
    //
    // The test is locality, not a whole-text boolean: an email can legitimately
    // say "open the attached remittance advice" in one paragraph and carry a
    // separate invoice.svg in another. Those are two attachments and two
    // independent facts, so the SVG charge still applies. Keying off
    // `opensAttachment` alone suppressed it there too, which under-scored a
    // strictly worse email than the single-file case.
    //
    // Where both do describe one file, the SVG flag still replaces the generic
    // wording with the specific warning; it just doesn't stack a second charge.
    const opensSameFile =
      opensAttachment &&
      new RegExp(String.raw`open.{0,20}(?:attachment|file|document|invoice)[^\n]{0,20}?\.svg\b`, "i").test(text);
    if (!opensSameFile) sig.add("attachment", "Attachment is presented as a document to open", 20);
  }

  // Device code / OAuth token phishing (D4 / #75 / FBI PSA260521). Attackers
  // abuse Microsoft's OAuth device-code flow to steal a session token with no
  // fake login page — the victim enters the code on the real microsoft.com but
  // authorises the attacker's device. Legitimate device-code flows are
  // user-initiated (e.g. smart-TV sign-in) and don't arrive unsolicited.
  const deviceCodeHit =
    /enter\s+(this\s+)?device\s+code/i.test(text) ||
    /your\s+device\s+code\s+is/i.test(text) ||
    /microsoft\.com\/devicelogin/i.test(text) ||
    /device\s+auth(orization)?\s+code/i.test(text) ||
    /activate\s+(your\s+)?new\s+device/i.test(text) ||
    /verify\s+(your\s+)?new\s+device/i.test(text);
  if (deviceCodeHit) {
    sig.add("sender", "Device code phishing — scammers abuse Microsoft's OAuth device login flow to steal your account access without a fake login page. Do not enter any code at microsoft.com/devicelogin unless YOU initiated the login.", 30);
  }

  // TOAD / callback phishing (D2 / #102). A fake subscription or purchase
  // invoice naming a cover brand, quoting a large charge, telling you to call to
  // dispute it, and containing NO link. The four-factor compound is very
  // specific — a genuine renewal email always links back to the vendor's site,
  // so hasNoUrl alone rules most legitimate mail out. Scamwatch "Fake purchase
  // callback scam" alert (June 2026).
  // Boundary-matched for short entries: the Irish pack carries "eir", which as a
  // bare substring hits "their" and "receiving" — enough to satisfy the brand
  // half of this compound on ordinary prose.
  const callbackBrandHits = mentionsCount(lower, CALLBACK_BRANDS);
  const hasCallToDispute =
    /call\s.{0,30}(dispute|cancel|reverse|refund|unauthori[sz]ed)/i.test(text) ||
    /to\s+(dispute|cancel|reverse)\s+(this|the)\s+(charge|payment|order|invoice|subscription)/i.test(text);
  const hasLargeAmount = /\$\s*[2-9]\d{2}|\$\s*[1-9]\d{3}/.test(text);
  const hasNoUrl = !/https?:\/\//i.test(text);

  if (callbackBrandHits >= 1 && hasCallToDispute && hasLargeAmount && hasNoUrl) {
    sig.add("sender", "Fake subscription callback scam — this looks like a fraudulent invoice designed to make you call a scammer. No legitimate company sends a billing dispute this way. Do not call the number.", 45);
  } else if (callbackBrandHits >= 2 && hasCallToDispute) {
    sig.add("sender", "Possible fake invoice callback scam — multiple fake-subscription brand names combined with a call-to-dispute pattern.", 25);
  }

  const score = Math.min(sig.total(), 100);
  return scoreToResult(score, sig, "Email", PACK.coverage, PACK.reportingBody);
}

// ────────────────────────────────────────────────────────────────────────────
// Phone number checker
// ────────────────────────────────────────────────────────────────────────────

export function checkPhone(number: string, region?: RegionInput): CheckResult {
  const PACK = resolveRegionPack(region);
  const intel = analysePhone(number, region);
  const sig = new Signals();

  // Translate intel into score/flags
  const riskScores: Record<PhoneIntel["spoofingRisk"], number> = {
    low: 15, medium: 30, high: 55, very_high: 75,
  };
  const spoofPoints = riskScores[intel.spoofingRisk];

  if (intel.lineType === "premium") {
    sig.add("phone", "Premium rate number — never call or text back, you'll be charged", 20);
  }

  if (intel.lineType === "voip_likely") {
    sig.add("phone", "VoIP / virtual number — trivially easy to spoof; real caller identity is hidden", 10);
  }

  if (intel.wangiriRisk) {
    sig.add("phone", "Wangiri scam: one-ring trick from a premium-rate international number — do NOT call back", 20);
  }

  if (intel.highScamCountry && !intel.wangiriRisk) {
    sig.add("phone", `Call originates from ${intel.country} — frequently used as a base for scam operations targeting your region`);
  }

  // Toll-free and shared-cost wording is authored per region on the pack's
  // phonePlan, since the number ranges and impersonated bodies differ; it
  // reaches the user via intel.spoofingNotes below.
  if (intel.lineType === "freecall") {
    sig.add("phone", "Free-call numbers are routinely spoofed by scammers impersonating banks and government agencies");
  }

  if (intel.lineType === "shared_cost") {
    sig.add("phone", "Shared-cost numbers are commonly spoofed by scammers impersonating government agencies");
  }

  if (intel.lineType === "fixed") {
    sig.add("phone", "Fixed-line area code — easy to spoof; a local-looking number doesn't mean a local caller");
  }

  // The spoofing assessment is a property of the number itself rather than of
  // any one observation, so it rides on the first note that is not already
  // covered above. With no note to carry it, it becomes its own row: the points
  // are real and have to be visible somewhere or the evidence stops adding up.
  // Order matters and matches the original: the "nothing found" floor is
  // decided on the observations above, BEFORE spoofing notes are appended. A
  // number whose only evidence is a spoofing note still earns the floor.
  const fresh = intel.spoofingNotes.filter(
    (note) => !sig.texts().some((f) => f.includes(note.slice(0, 20))),
  );

  // The spoofing assessment belongs to the number, not to any one observation,
  // so it rides on the first row that is not already covered above. Ordering
  // matches the original: the "nothing found" floor is decided on the
  // observations, before the spoofing notes are appended, and that row absorbs
  // the spoofing points when there is no note to carry them -- the original
  // emitted exactly one flag for a clean number and this keeps that true.
  const nothingFound = sig.length === 0;
  if (nothingFound) {
    // The floor is Math.max(total, 15) against a total that already included
    // the spoofing points, so this row carries the difference and `fresh`
    // below carries the rest -- or all of it, when there is no note.
    sig.add(
      "phone",
      "No obvious red flags from the number format alone — caller ID can always be spoofed, so stay cautious",
      fresh.length ? Math.max(spoofPoints, 15) - spoofPoints : Math.max(spoofPoints, 15),
    );
  }
  if (fresh.length) {
    fresh.forEach((note, i) => sig.add("phone", note, i === 0 ? spoofPoints : 0));
  } else if (!nothingFound && spoofPoints !== 0) {
    // Points with no note of their own would otherwise leave the rows short of
    // the headline score.
    sig.add("phone", `Caller-ID spoofing risk for this number type: ${intel.spoofingRisk.replace("_", " ")}`, spoofPoints);
  }

  const score = Math.min(sig.total(), 100);
  const result = scoreToResult(score, sig, "Phone Number", PACK.coverage, PACK.reportingBody);
  result.phoneIntel = intel;
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Custom / free-text checker
// ────────────────────────────────────────────────────────────────────────────

export function checkCustom(text: string, blocklist?: Set<string>, region?: RegionInput): CheckResult {
  const PACK = resolveRegionPack(region);
  const {
    urgencyWords: URGENCY_WORDS,
    rewardWords: REWARD_WORDS,
    requestWords: REQUEST_WORDS,
    fakeInvestmentPlatforms: FAKE_INVESTMENT_PLATFORMS,
    identityRereg: MYID_REREG_PHRASES,
  } = PACK;
  const sig = new Signals();
  const lower = text.toLowerCase();

  const allSignals = [...URGENCY_WORDS, ...REWARD_WORDS, ...REQUEST_WORDS];
  // Matched through mentions() for parity with checkSms (#233). A raw
  // includes() here meant the same pasted text scored differently depending on
  // which box it was pasted into — "pin" fired inside "spins", "ato" inside
  // "atomic" — and, unlike checkSms, every list was flattened into one count,
  // so the collisions stacked: "The atomic superstore has unclaimed freebies;
  // won't last" reached suspicious (40) on four phantom hits.
  const hits = allSignals.filter((w) => mentions(lower, w));

  if (hits.length > 0) {
    sig.add("message", `Suspicious keywords found: "${hits.slice(0, 4).join('", "')}"`, Math.min(hits.length * 8, 60));
  }

  // Check for embedded URLs
  const urls = text.match(/https?:\/\/[^\s]+/gi);
  if (urls) {
    sig.add("message", `Contains ${urls.length} link(s) — checked separately`);
    const worst = urls.map((u) => checkUrl(u, blocklist, region)).sort((a, b) => b.score - a.score)[0];
    sig.merge("link", worst, Math.floor(worst.score * 0.5));
  }

  // ClickFix "run a command" social engineering (D3 / #74). Pasted fake-CAPTCHA
  // page text is the most likely input path for this here, so mirror the SMS
  // fuzzy match. No legitimate site tells you to press Win+R and paste a command.
  if (/press\s+(win|windows)\s*\+?\s*r\b/i.test(text) ||
      /powershell\s+-[ec]/i.test(text)) {
    sig.add("message", WIN_CLICKFIX_FLAG, 50);
  } else if (isMacClickFix(text)) {
    // The macOS variant matters more here than in checkSms: a pasted fake-CAPTCHA
    // page is the likeliest way this reaches us.
    sig.add("message", MAC_CLICKFIX_FLAG, 50);
  }

  // Named fraudulent investment platforms (D4 / #104) — mirror of the checkSms
  // rule so pasted ad text / recruitment messages are caught here too.
  const platformHit = FAKE_INVESTMENT_PLATFORMS.find((p) => containsLoose(lower, p));
  if (platformHit) {
    sig.add("message", PACK.fakeInvestmentPlatformFlag(platformHit), 50);
  }

  // myID forced re-registration phishing (D6 / #106) — mirror for pasted email
  // bodies routed through the free-text checker.
  if (mentionsAny(lower, MYID_REREG_PHRASES)) {
    sig.add("message", PACK.identityReregFlag, 25);
  }

  if (sig.length === 0) {
    sig.add("message", "No obvious scam signals found in the text", 10);
  }

  const score = Math.min(sig.total(), 100);
  return scoreToResult(score, sig, "Custom", PACK.coverage, PACK.reportingBody);
}

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

// Coverage honesty: a "safe" verdict asserts we looked and found nothing. That
// assertion is only true where we have rules to look with. Under partial or no
// regional coverage a low score can equally mean "no rule matched because no
// rule exists", so a clean result is downgraded to "unknown" — not enough to go
// on, rather than a confident pass.
//
// Only the clean case is touched. A positive detection is still a positive
// detection: base signals (shorteners, abused TLDs, credential asks) fire
// everywhere, so anything they caught is reported as found, regardless of
// coverage.
//
// The test is "not full" rather than a list of the tiers that downgrade, which
// is why adding `minimal` needed no change here. That is deliberate and worth
// keeping: a new tier must opt *in* to asserting safety by being `full`, never
// inherit it by being absent from an enumeration someone forgot to update.
// Defaulting a new tier to the honest behaviour is the whole point.
function downgradeForCoverage(result: CheckResult, coverage: RegionCoverage): CheckResult {
  if (coverage === "full" || result.verdict !== "safe") return result;
  return {
    ...result,
    verdict: "unknown",
    details:
      "We don't have full scam-detection rules for your region yet, so we can't give this a clean bill of health. " +
      "Nothing in our universal checks flagged it — but treat that as 'not checked', not 'safe'.",
  };
}

function scoreToResult(
  score: number,
  sig: Signals,
  category: string,
  coverage: RegionCoverage = "full",
  // Where to report a confirmed scam. Named per region — telling a UK or US
  // user to contact Scamwatch would send them to an agency with no remit
  // over their case.
  reportingBody: string = resolveRegionPack(DEFAULT_REGION).reportingBody,
): CheckResult {
  let verdict: CheckResult["verdict"];
  let details: string;

  // `details` is a one-line summary for surfaces that want one; the web sheet
  // deliberately does not render it (see VerdictBadge), because every value
  // restates copy the sheet already shows. Keep it neutral: the regional
  // register was retired in e5ee74b, and this was the last place it survived.
  if (score < 20) {
    verdict = "safe";
    details = "Nothing here matched our scam patterns — but stay alert anyway.";
  } else if (score < 45) {
    verdict = "suspicious";
    details = "Something here looks off. Don't click any links, share personal info, or send money until you've verified this yourself.";
  } else if (score < 70) {
    verdict = "likely_scam";
    details = "This has strong signs of a scam. Do not engage, click links, or provide any information.";
  } else {
    verdict = "likely_scam";
    details = `This is almost certainly a scam. Delete it, block the sender, and report it to ${reportingBody}.`;
  }

  // finalise() appends the clamp row when the raw total overshot, so signals and
  // flags are produced from the same list and cannot drift apart.
  const signals = sig.finalise(score);
  return downgradeForCoverage(
    { verdict, score, flags: signals.map((x) => x.text), details, category, coverage, signals },
    coverage,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Per-identifier orchestration
// ────────────────────────────────────────────────────────────────────────────
//
// Rather than blend everything into one verdict, pull each distinct identifier
// out of the input and assess it on its own — so a pasted email yields a
// separate card for the sender, each embedded link, and any phone number.

export interface AnalyzedIdentifier {
  kind: "url" | "email" | "phone" | "message";
  value: string;          // raw identifier (or a snippet for "message"); defanged at display
  result: CheckResult;
}

const MAX_CARDS = 5;
const URL_GLOBAL = /https?:\/\/[^\s<>"']+/gi;

// ── Schemeless hostnames ──────────────────────────────────────────────────────
//
// Scam SMS routinely omits the scheme ("Login at commbank-secure-login.tk/auth"),
// and URL_GLOBAL requires http(s)://, so those submissions produced no URL card
// at all. detectType already treats a leading "www." as a URL, so the same host
// scored 85 with the prefix and 0 without it — an inconsistency, not a policy.
//
// Matching bare hostnames generally is unsafe: "report.docx", "README.md" and
// "node.js" all look like hosts. Two rules keep this tight:
//
//   1. The TLD must be one the region packs already care about — the curated
//      suspiciousTlds list plus the mainstream TLDs real scams impersonate.
//      A file extension is only a false positive if it collides with one of
//      those, which is why .zip and .mov are excluded here despite being on
//      the suspicious list (they are file extensions far more often than hosts).
//   2. It must not be part of an email address or a file path, checked at the
//      match site rather than in the pattern.
//
// Anything outside that stays unmatched. A missed scam URL degrades to the
// message-level analysis that already runs; a false positive puts a scary URL
// card on an innocent message, so the asymmetry favours caution.
const BARE_HOST_TLDS = new Set([
  // Mainstream TLDs that legitimate brands use and scams impersonate.
  "com", "net", "org", "co", "io", "app", "info", "biz", "me", "tv", "cc",
  // Country codes for the covered regions.
  "au", "uk", "nz", "ie", "ca", "us",
]);

// Excluded from the no-corroboration shortcut below despite appearing in
// suspiciousTlds: as bare tokens these read as ordinary words far more often
// than as hostnames, so a URL card on them would fire on innocent text. They
// are still scored normally when they appear with a scheme, and still picked up
// bare when a path or a www. prefix corroborates that a host was meant.
//
//   zip, mov   file extensions — "archive.zip", "clip.mov"
//   bond       AU tenancy and finance vocabulary — "surety.bond", "the
//              deposit.bond is refundable". Rental/surety/savings bonds are
//              core subject matter for this app, so the bare form is common.
//   xin        a very common Chinese given name and pinyin syllable, which
//              collides with the Chinese-authority impersonation content this
//              app explicitly handles ("the bond.Xin will follow up").
//   icu        intensive care unit — written in caps ("Mum's in hospital.ICU
//              visiting hours are 2-4pm"), so the sentence-boundary guard below
//              cannot catch it without also letting shouty scam hosts through.
//              Health-emergency messages are exactly the context where a false
//              scam verdict does most harm.
//
// Both bond and xin are 100% maliciously registered per Interisle 2025, so the
// TLD itself is genuinely high-risk — this guard is about the BARE-TOKEN form
// in prose, not about the TLD's reputation. See docs/threat-intel/sources.yml.
const AMBIGUOUS_BARE_TLDS = new Set(["zip", "mov", "bond", "xin", "icu"]);

// English function words that turn up on the LEFT of a word-like TLD in
// ordinary prose — "tune in.live for the announcement", "order it in store
// or.online", "coordinates are in.lat and long format". These survive the
// sentence-boundary guard because they are lowercase and mid-sentence, so
// nothing about their shape distinguishes them from a real hostname.
//
// A closed list rather than a length rule: "a.tk" and "b.tk" are one character
// and are perfectly good hosts, so short does not mean prose. Only a real host
// label that IS one of these words is affected, and then only in its bare form
// with no path or www. — "evil.work/login" and "www.evil.work" are untouched.
// Kept deliberately small; the risk of a longer list is silencing a real host.
const PROSE_LEFT_LABELS = new Set([
  "a", "an", "the", "and", "or", "but", "so", "as", "at", "by", "in", "on",
  "of", "to", "up", "for", "from", "with", "is", "are", "was", "were", "be",
  "been", "it", "its", "we", "he", "she", "they", "you", "i", "my", "our",
  "your", "their", "this", "that", "these", "those", "if", "then", "than",
  "when", "while", "not", "no", "do", "does", "did", "go", "get", "got",
]);

// Label characters include the Cyrillic and Greek ranges, not just ASCII.
//
// An ASCII-only class does not merely miss an internationalised host — it
// TRUNCATES one, because the match simply starts after the offending character.
// "www.аuspost-redelivery.bond/pay" (Cyrillic а) yielded the bare host
// "uspost-redelivery.bond/pay": a different domain from the one in the message,
// scored and shown to the user as though it were the link they were sent.
//
// The ranges mirror CONFUSABLE_SCRIPTS in urlSanitizer — the scripts that
// supply Latin homoglyphs, which are the ones an evader reaches for. Kept
// narrow rather than \p{L}: this pattern also decides what counts as a host in
// ordinary prose, and matching every letter in every script would turn far more
// sentences into candidate URLs.
const HOST_LABEL_CHAR = "a-z0-9\\u0370-\\u03FF\\u0400-\\u04FF\\u0500-\\u052F";

const BARE_HOST_GLOBAL = new RegExp(
  `(?<![\\w@./\\\\-])((?:[${HOST_LABEL_CHAR}](?:[${HOST_LABEL_CHAR}-]*[${HOST_LABEL_CHAR}])?\\.)+[a-z]{2,24})(/[^\\s<>"']*)?`,
  "gi",
);

/**
 * Schemeless hostnames in free text that are worth analysing as URLs.
 *
 * `suspiciousTlds` comes from the resolved region pack, so a host is picked up
 * when its TLD is either mainstream or already flagged as abuse-prone.
 */
function extractBareHosts(text: string, suspiciousTlds: string[]): string[] {
  const flagged = new Set(
    suspiciousTlds.map((t) => t.replace(/^\./, "").toLowerCase()),
  );

  const found: string[] = [];
  for (const match of text.matchAll(BARE_HOST_GLOBAL)) {
    const [whole, hostname] = match;
    const labels = hostname.toLowerCase().split(".");
    const tld = labels[labels.length - 1];

    // Sentence boundary with the space missing after the full stop — "the
    // plumber came by.Work is done", "Mum's in hospital.ICU visiting hours".
    // Missing spaces after a full stop are routine in pasted SMS, and every
    // word-like TLD in the list (.work, .live, .online, .click, .top, .store,
    // .icu, .loan …) can end up on the right of one.
    //
    // The tell is Capitalised-Then-Lowercase on the last label: that is a new
    // sentence's first word, not a TLD. Deliberately NOT "starts uppercase" —
    // scam SMS shout in full caps ("AUSPOST-TRACK.SHOP/verify"), so an
    // all-uppercase label must still be treated as a host. Checked against the
    // RAW hostname because `labels` has already been lowercased.
    const rawTld = hostname.slice(hostname.lastIndexOf(".") + 1);
    if (/^[A-Z][a-z]/.test(rawTld)) continue;

    // Prose connective on the left ("in.live", "or.online"). Only ever skips
    // the BARE form — a path or a www. prefix means a host was meant, and both
    // are checked below.
    if (
      labels.length === 2 &&
      PROSE_LEFT_LABELS.has(labels[0]) &&
      !match[2] &&
      !/^www\./i.test(hostname)
    ) continue;

    // Sentence break with prose running on past it — "i finished early.live
    // music starts at 8", "sign up here.online registration closes friday".
    //
    // The two guards above read only the two labels either side of the dot, and
    // at that scope there is not enough information: the capitalisation tell
    // misses a lowercase new sentence, and PROSE_LEFT_LABELS is a closed list
    // that cannot hold every word an English sentence can end on ("desk.work",
    // "lunch.top"). Both are the same defect seen from two sides.
    //
    // The wider signal is what follows the match. A real bare host is the
    // message's payload and ends the clause — "Pay at secure-billing.top",
    // "claim now at freemoney.tk". Prose continuing straight after an
    // uncorroborated host is the shape of a missing space after a full stop.
    //
    // This SUPPRESSES THE URL CARD ONLY. The text still reaches message-level
    // scoring, which is what keeps the guard from becoming a bypass: appending
    // a word to evade the card ("claim now at freemoney.tk urgently") leaves
    // the urgency and call-to-action rules untouched, so the message is still
    // flagged — just without naming the link. An attacker has to drop the
    // persuasion to buy silence, which costs them the scam.
    //
    // Deliberately narrow, so a hostname that could not be a sentence is never
    // caught by it:
    //   · two labels only — a subdomain is host structure, not prose;
    //   · left label a plain word — no hyphen or digit, so "secure-billing.top
    //     now" and "mygov-verify.tk please" stay;
    //   · no path and no www. — either means a host was meant, per above.
    if (
      labels.length === 2 &&
      /^[a-z]+$/.test(labels[0]) &&
      !match[2] &&
      !/^www\./i.test(hostname) &&
      // Prose continues: whitespace then a letter. A following digit,
      // punctuation or end-of-input is not a sentence carrying on.
      /^\s+[A-Za-z]/.test(text.slice((match.index ?? 0) + whole.length))
    ) continue;

    const isFlaggedTld = flagged.has(tld);
    if (!BARE_HOST_TLDS.has(tld) && !isFlaggedTld) continue;

    // A mainstream TLD on its own is usually a mention, not a link — "send me
    // the notes.org file", "our team is dev.io". Requiring a path or a www.
    // prefix keeps those from raising a URL card on an innocent message, while
    // still catching "auspost.com.au/track". An abuse-prone TLD needs no such
    // corroboration: nobody mentions a .tk domain in passing.
    //
    // The exception is AMBIGUOUS_BARE_TLDS — TLDs that are also ordinary words
    // ("the deposit.bond is refundable", "archive.zip"). Those are high-risk as
    // domains but common as prose, so they need the same corroboration as a
    // mainstream TLD rather than the abuse-prone shortcut.
    const needsCorroboration = !isFlaggedTld || AMBIGUOUS_BARE_TLDS.has(tld);
    const hasPath = Boolean(match[2]);
    const hasWww = /^www\./i.test(hostname);
    if (needsCorroboration && !hasPath && !hasWww) continue;
    // A single label plus TLD is the minimum for a real host; "e.g" and "No.5"
    // are already excluded by the TLD check, this guards the rest.
    if (labels.length < 2 || labels.some((l) => l.length === 0)) continue;

    // Skip anything already carried by a scheme'd URL — URL_GLOBAL has it.
    const before = text.slice(0, match.index ?? 0);
    if (/https?:\/\/\S*$/i.test(before)) continue;

    found.push(whole.replace(/[.,;:!?)]+$/, ""));
  }
  return found;
}

// Expands a shortened URL and merges the destination analysis into the base result.
// If expansion fails or times out, the base result is returned unchanged.
async function applyExpansion(url: string, base: CheckResult, blocklist?: Set<string>, region?: RegionInput, fetcher?: ExpandFetch): Promise<CheckResult> {
  if (!isShortened(url)) return base;

  const { expandedUrl, rawExpandedUrl, hops } = await expandUrl(url, fetcher);
  if (!expandedUrl) {
    // Say so whenever the destination was not resolved, rather than returning a
    // verdict that reads as if it had been assessed. This covers both causes:
    // no transport ("unavailable") and a timeout, missing Location or
    // exhausted hop budget ("failed"). The shortener is all we ever saw, and a
    // silent base result would present that as a complete answer.
    const note = "Shortened URL — destination could not be checked";
    return {
      ...base,
      flags: [...base.flags, note],
      signals: [...(base.signals ?? []), { text: note, points: 0, source: "link" as const }],
    };
  }

  // `expandedUrl` passed as the original for the same reason as the call sites
  // above: normaliseForAnalysis punycodes a non-ASCII hostname, so without it
  // a shortener resolving to a homoglyph domain reads as an ordinary IDN. The
  // destination of a shortener is exactly where a hidden lookalike lands.
  // `rawExpandedUrl` is the Location header as sent, before the expander's own
  // `new URL()` resolved and punycoded it — without it the homoglyph check sees
  // an "xn--" host with no script left to inspect, and a shortener hiding a
  // lookalike domain scores as an ordinary IDN. Falls back to `expandedUrl` for
  // callers that construct an ExpandResult without the field.
  const destResult = checkUrl(
    normaliseForAnalysis(expandedUrl),
    blocklist,
    region,
    rawExpandedUrl ?? expandedUrl,
  );
  const destDefanged = defang(expandedUrl);
  // The merged score is the worse of the two, not their sum, so neither side's
  // rows can be read as adding up to it. They are carried as evidence with no
  // points rather than re-attributed to weights they did not produce here.
  const mergedScore = Math.min(Math.max(base.score, destResult.score), 100);
  const sig = new Signals();
  const carry = (from: CheckResult) => {
    const rows = from.signals?.filter((x) => x.source !== "score");
    if (rows?.length) for (const r of rows) sig.add(r.source, r.text);
    else for (const f of from.flags) sig.add("link", f);
  };
  carry(base);
  sig.add("link", `Shortened URL expanded — real destination: ${destDefanged}`);
  carry(destResult);
  if (hops.length > 1) sig.add("link", `Multi-hop chain (${hops.length} redirects) — extra suspicious`);

  const pack = resolveRegionPack(region);
  const merged = scoreToResult(mergedScore, sig, "URL", pack.coverage, pack.reportingBody);
  return { ...merged, score: mergedScore, expandedUrl: destDefanged, category: "URL" };
}

/**
 * Options for a run of the engine.
 *
 * `fetcher` is the network transport used to unshorten links. Omitting it means
 * the engine makes no network calls of any kind, and shortened URLs are
 * reported as unexpanded rather than silently assessed on the shortener alone.
 * Server callers pass fetch; see the transport contract in lib/urlExpander.ts.
 */
export interface AnalyzeOptions {
  fetcher?: ExpandFetch;
}

export async function analyzeContent(content: string, blocklist?: Set<string>, region?: RegionInput, options?: AnalyzeOptions): Promise<AnalyzedIdentifier[]> {
  const raw = content.trim();
  if (!raw) return [];

  // Refang before anything else looks at the input. Defanging ("hxxp://evil[.]tk")
  // is how security-aware people share a suspicious link without making it
  // clickable, so it is ordinary input — but every extractor here requires a
  // literal http(s)://, so those submissions previously matched nothing and fell
  // through to generic message analysis scoring 0. The people most careful with
  // a scam link got the least protection, and our own defanged verdict output
  // could not be pasted back in.
  //
  // This is a string transformation for analysis only; nothing is ever fetched.
  // Fold Unicode confusables first, on the same terms as refang below: a string
  // transformation for analysis only, nothing is ever fetched. Zero-width
  // characters and dash lookalikes split a hostname during extraction, so
  // "com<U+200B>mbank-secure-login.tk" was extracted as "mbank-…" and lost its
  // brand-impersonation flag while rendering identically to the victim.
  //
  // Before refang rather than after, because refang keys off literal ASCII
  // "[.]" and "hxxp". A defanged link written with full-width brackets
  // ("evil［.］tk") survives refang untouched if it runs first, and normalising
  // afterwards cannot recover it — the defang markers are gone from the
  // extractor's view but the dot never came back. Normalising first folds them
  // to ASCII so refang sees the form it was written for. On every other input
  // the two orders produce identical output.
  const normalised = normaliseUnicode(raw);

  const wasDefanged = isDefanged(normalised);
  const text = wasDefanged ? refang(normalised) : normalised;

  const type = detectType(text);
  const ids = extractIdentifiers(text);
  const headers = parseEmailHeaders(text);
  const out: AnalyzedIdentifier[] = [];

  // Distinct URLs found anywhere in the input (trailing punctuation trimmed),
  // plus schemeless hostnames — scam SMS routinely drops the scheme, and those
  // previously produced no URL card at all. See extractBareHosts.
  const schemed = (text.match(URL_GLOBAL) || []).map((u) => u.replace(/[.,;:!?)]+$/, ""));
  const bare = extractBareHosts(text, resolveRegionPack(region).suspiciousTlds);
  const urls = Array.from(new Set([...schemed, ...bare])).slice(0, 3);

  // Overall "message" assessment, by detected type.
  if (type === "email") {
    out.push({ kind: "email", value: headers.fromAddress || ids.scamEmail || "sender", result: checkEmail(text, blocklist, region) });
  } else if (type === "sms") {
    out.push({ kind: "message", value: text.slice(0, 80), result: checkSms(text, blocklist, region) });
  } else if (type === "phone") {
    out.push({ kind: "phone", value: text, result: checkPhone(text, region) });
  } else if (type === "url") {
    // A bare URL is assessed by the per-URL cards below; if the regex missed it
    // (e.g. a "www." host with no scheme), assess the whole string as a URL.
    if (urls.length === 0) {
      const normalised = normaliseForAnalysis(text);
      // `text` as well as the normalised form: normalisation punycodes a
      // non-ASCII hostname, and the homoglyph check needs the characters it
      // destroys. Here the whole input IS the URL, so `text` is the original.
      const base = checkUrl(normalised, blocklist, region, text);
      const result = await applyExpansion(normalised, base, blocklist, region, options?.fetcher);
      out.push({ kind: "url", value: text, result });
    }
  } else {
    out.push({ kind: "message", value: text.slice(0, 80), result: checkCustom(text, blocklist, region) });
  }

  // A card per embedded URL (normalised first to close percent-encoding tricks).
  // Expansion runs for each URL that resolves to a known shortener host.
  for (const u of urls) {
    const normalised = normaliseForAnalysis(u);
    // `u` as well as the normalised form: normalisation punycodes a non-ASCII
    // hostname, and the homoglyph check needs the characters it destroys.
    const base = checkUrl(normalised, blocklist, region, u);
    const result = await applyExpansion(normalised, base, blocklist, region, options?.fetcher);
    out.push({ kind: "url", value: u, result });
  }

  // Phone card only when the whole input is a number (extractIdentifiers is
  // deliberately conservative about in-text numbers).
  if (ids.scamPhone && type !== "phone") {
    out.push({ kind: "phone", value: ids.scamPhone, result: checkPhone(ids.scamPhone, region) });
  }

  // De-dup by kind+value, keep highest score first, always return ≥1 card.
  const seen = new Set<string>();
  const deduped = out.filter((c) => {
    const key = `${c.kind}:${c.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (deduped.length === 0) {
    deduped.push({ kind: "message", value: text.slice(0, 80), result: checkCustom(text, blocklist, region) });
  }
  return deduped.sort((a, b) => b.result.score - a.result.score).slice(0, MAX_CARDS);
}
