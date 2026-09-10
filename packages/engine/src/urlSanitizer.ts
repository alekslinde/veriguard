// URL sanitization for safe handling of untrusted/suspicious links.
//
// Three concerns:
//   1. Display safety  — never render a live clickable link; defang instead
//   2. Analysis safety — normalise to close bypass tricks before pattern matching
//   3. Storage safety  — strip tracking params that could fingerprint the reporter

// ── Tracking parameters to strip before storage ──────────────────────────────
// Keeping these would let the scammer know which of their campaigns got reported
// and which tracking pixel fired.
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "utm_id", "utm_creative_format", "utm_marketing_tactic",
  "fbclid", "gclid", "msclkid", "dclid", "gbraid", "wbraid",
  "twclid", "igshid", "ttclid", "li_fat_id",
  "mc_cid", "mc_eid",                              // Mailchimp
  "ref", "referral", "source", "src",              // Generic referral trackers
  "affiliate", "aff", "partner",
  "click_id", "clickid",
  "zanpid", "s_kwcid",                             // Amazon / Adobe
]);

// ── Defanging ─────────────────────────────────────────────────────────────────
// Standard infosec convention for displaying malicious URLs safely.
// Replaces protocol and dots so the string looks like a URL but isn't clickable
// and won't be treated as a hyperlink by email clients or chat apps.
//
// https://malicious.tk/phish → hxxps://malicious[.]tk/phish
export function defang(url: string): string {
  return url
    // http → hxxp, https → hxxps. Both t's, which is the actual convention —
    // this replaced only the first, emitting the non-standard "hxtps://".
    // Case is preserved per character so "HTTPS" defangs to "HXXPS".
    .replace(/^https?/i, (p) =>
      p.replace(/t/gi, (t) => (t === "T" ? "X" : "x")),
    )
    .replace(/^ftp/i, "fxp")
    .replace(/\./g, "[.]");
}

// ── Refanging ─────────────────────────────────────────────────────────────────
// The inverse of defang: turn a neutralised URL back into a parseable one for
// ANALYSIS ONLY. Nothing here makes a request — the result is scored as a
// string, exactly like any other input.
//
// Why this is needed: defanging is how security-aware people share suspicious
// links without making them clickable, so "hxxp://evil[.]tk" is a completely
// ordinary thing for someone to paste. Before this, none of those forms were
// recognised as URLs at all — they fell through to generic message analysis and
// scored 0, meaning the users most careful about handling a scam link got the
// least protection. Our own defang() output had the same problem: a verdict
// copied out of the UI and pasted back in returned nothing.
//
// Conventions handled (all seen in the wild, and all case-insensitive):
//   hxxp:// hxxps:// hxtp:// h**p:// fxp://   → http:// https:// ftp://
//   [.]  (.)  {.}  [dot]  (dot)  {dot}          → .
//   [:]  [://]                                  → : ://
//   [@]                                         → @
// Not anchored: a defanged link is usually pasted inside a sentence ("someone
// sent me hxxps://evil[.]tk — is it real?"), so anchoring to the start of the
// string would leave the common case unrefanged.
const REFANG_SCHEME = /\bh(?:xx|xt|\*\*)(ps?|tps?)?:\/\//gi;
const REFANG_FTP = /\bfxp:\/\//gi;

export function refang(text: string): string {
  return text
    // Scheme first, so a mangled scheme does not survive dot-replacement.
    .replace(REFANG_SCHEME, (m) => (/s/i.test(m) ? "https://" : "http://"))
    .replace(REFANG_FTP, "ftp://")
    // Bracketed separators. The spaced "dot" form needs its own pass because
    // the surrounding whitespace is part of the obfuscation.
    .replace(/\s*[[({]\s*(?:\.|dot)\s*[\])}]\s*/gi, ".")
    // Deliberately NOT handling the unbracketed " dot " form: it rewrites
    // ordinary English ("I dot my i" → "I.my i"). Bracketed forms are
    // unambiguous obfuscation; a bare "dot" between words is usually a word.
    .replace(/\s*[[({]\s*:\s*\/\s*\/\s*[\])}]\s*/g, "://")
    .replace(/\s*[[({]\s*:\s*[\])}]\s*/g, ":")
    .replace(/\s*[[({]\s*(?:@|at)\s*[\])}]\s*/gi, "@");
}

/**
 * Whether refanging changed anything — i.e. the input was defanged.
 *
 * Callers use this to decide whether to re-run extraction on the refanged text,
 * so ordinary input costs nothing.
 */
export function isDefanged(text: string): boolean {
  return refang(text) !== text;
}

// ── Strip tracking parameters ────────────────────────────────────────────────
// Returns the URL with all known tracking/analytics query params removed.
// Falls back to the original string if parsing fails.
export function stripTrackingParams(raw: string): string {
  const input = raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`;
  try {
    const u = new URL(input);
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    // Preserve the original protocol if the input didn't have one
    const result = u.toString();
    return raw.trim().startsWith("http") ? result : result.replace(/^https?:\/\//, "");
  } catch {
    return raw;
  }
}

// ── Unicode normalisation ────────────────────────────────────────────────────
//
// Runs before extraction, so every downstream checker sees one spelling of a
// character rather than the dozen Unicode offers for it. Without this the
// packs' keyword lists and the URL extractor are both defeatable by characters
// that render identically to what they replace:
//
//   "com<U+200B>mbank-secure-login.tk"  → extractor keeps only "mbank-…",
//                                         so the brand-impersonation flag is
//                                         correctly absent from a host that is
//                                         genuinely no longer commbank
//   "commbank–secure–login.tk"          → en-dash is not a URL character, so
//                                         extraction starts at "login.tk"
//
// Both scored likely_scam (85) → suspicious (40) with the brand flag gone.
// Found by the metamorphic eval, which asserts an obfuscated input may score
// higher but never lower.
//
// Three passes, because no single one is sufficient:
//
//   1. Strip invisibles. NFKC does NOT remove zero-width characters — it
//      preserves U+200B/200C/200D/2060/FEFF and the soft hyphen unchanged —
//      and they carry no meaning in any input we score, so they go first.
//   2. NFKC. Folds full-width forms ("ｃｏｍｍｂａｎｋ" → "commbank",
//      "０４１２" → "0412"), most exotic spaces, and compatibility variants.
//   3. Fold the separator families NFKC leaves alone. It maps U+FF0D to "-"
//      but leaves the en-dash, em-dash, figure dash and minus sign as
//      themselves, and those are what a hostname evasion actually uses.
//
// What this deliberately does NOT do is fold Cyrillic or Greek homoglyphs to
// Latin. "commbаnk.tk" with a Cyrillic а is a genuinely different domain that
// resolves elsewhere, and rewriting it to the Latin spelling would make the
// engine report the real CommBank's hostname while describing the scammer's
// site — telling the reader the wrong thing about which domain they visited.
// A mixed-script hostname is a signal to raise, not a string to rewrite, and
// that belongs in the scorer rather than here.

/** Invisible characters: zero-width, joiners, BOM, soft hyphen, Mongolian vowel separator. */
const INVISIBLE = /[\u00AD\u180E\u200B-\u200F\u2060-\u2064\u206A-\u206F\uFEFF]/g;

/** Dash-like characters NFKC leaves as themselves, folded to ASCII hyphen. */
const DASHES = /[\u2010-\u2015\u2212\u2043]/g;

/** Dot-like characters used in IDN-style host evasion, folded to ASCII full stop. */
const DOTS = /[\u3002\uFF61\u2024]/g;

/** Slash-like characters, folded to ASCII solidus. */
const SLASHES = /[\u2044\u2215]/g;

/**
 * Apostrophe- and quote-like characters, folded to their ASCII forms.
 *
 * NFKC leaves U+2019 alone, and phones substitute it for a typed apostrophe by
 * default — so "or it's returned" arrives as "or it\u2019s returned" and every
 * pack phrase spelled with an ASCII apostrophe silently fails to match. That is
 * 49 phrases across the six region packs, all of them written the way a
 * keyboard produces them rather than the way a handset sends them.
 *
 * Folded centrally rather than per-phrase: the alternative is spelling every
 * entry twice and remembering to do so forever.
 */
const QUOTES = /[\u2018\u2019\u201B\u02BC\u02B9\u2032]/g;
const DQUOTES = /[\u201C\u201D\u201F\u2033]/g;

/**
 * Fold a string to one canonical spelling before any pattern matching.
 *
 * Length is not preserved — invisibles are removed and NFKC can expand a
 * character — so this must not be used to compute offsets into the original
 * text. Every caller here re-extracts from the normalised string instead.
 */
export function normaliseUnicode(text: string): string {
  return text
    .replace(INVISIBLE, "")
    .normalize("NFKC")
    .replace(DASHES, "-")
    .replace(DOTS, ".")
    .replace(SLASHES, "/")
    .replace(QUOTES, "'")
    .replace(DQUOTES, '"');
}

/** Whether normalisation changes anything — i.e. the input carried confusables. */
export function hasConfusables(text: string): boolean {
  return normaliseUnicode(text) !== text;
}

/**
 * Cyrillic and Greek ranges — the two scripts that supply Latin homoglyphs.
 *
 * Deliberately narrow. These are the scripts whose letters render identically
 * to Latin ones in common fonts: Cyrillic а/е/о/р/с/х and Greek ο/ν/α do the
 * work in homoglyph phishing. Widening this to "any non-Latin script" would
 * flag ordinary Japanese, Arabic or Thai domains, which is both wrong and
 * discriminatory — those scripts share no shapes with Latin, so a reader cannot
 * be misled by them the way this guards against.
 */
const CONFUSABLE_SCRIPTS = /[\u0370-\u03FF\u0400-\u04FF\u0500-\u052F]/;

/**
 * The hostname as written, before `new URL()` punycodes it.
 *
 * Shared by the mixed-script check and the hyphen counter, which both need the
 * pre-encoding form for the same reason: punycode is all-ASCII and uses hyphens
 * structurally, so the encoded string answers neither "what script is this" nor
 * "how many hyphens did the registrant choose".
 *
 * Returns "" when no host can be recovered, which every caller treats as "no
 * signal" rather than as evidence either way.
 */
function rawHostname(raw: string): string {
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^/?#@\s]*@)?([^/?#\s:]+)/i.exec(raw.trim());
  return m?.[1] ?? "";
}

/**
 * How many hyphens the hostname actually shows, counted before encoding.
 *
 * Punycode uses hyphens as structure — "münchen.de" encodes to "xn--mnchen-3ya"
 * — so counting them in the encoded form invents hyphens the reader cannot see.
 * That produced a "Heaps of hyphens in the domain (3)" flag on hosts displaying
 * none, which is a false explanation attached to a real detection.
 *
 * Skipping the rule for internationalised hosts was the first fix and was too
 * blunt: it also discarded the *real* hyphens in "münchen-bank-secure-login.de",
 * so one accented letter shed the signal its ASCII twin still scored. Counting
 * on the pre-encoding string keeps both halves honest.
 */
export function displayedHyphenCount(raw: string): number {
  return (rawHostname(raw).match(/-/g) ?? []).length;
}

/**
 * Whether a URL's hostname mixes Latin letters with Cyrillic or Greek ones
 * inside a single label — the homoglyph attack, as distinct from an ordinary
 * internationalised domain.
 *
 * **Must be called on the RAW input, before normaliseForAnalysis.** `new URL()`
 * punycodes a non-ASCII hostname on parse, and the encoded form carries no
 * script information: "аuspost-redelivery.bond" (Cyrillic а) becomes
 * "xn--uspost-redelivery-r4n.bond", in which nothing is Cyrillic any more.
 * Decoding it back would need a punycode implementation, and the engine has no
 * `node:` imports by design — it has to bundle for a browser — so the signal is
 * taken from the string while it still exists.
 *
 * The mixing is what matters, not the presence of non-Latin characters.
 * "münchen.de", "bücher.de" and a wholly Japanese domain are ordinary names;
 * none mixes a confusable script into a Latin word, because a homoglyph only
 * has value when the rest of the word still reads as the brand being
 * impersonated. Scoring plain IDNs as attacks would penalise people for their
 * language, which is the worst place for this engine to be wrong.
 */
export function hasMixedScriptHost(raw: string): boolean {
  return rawHostname(raw)
    .split(".")
    .some((label) => /[a-z]/i.test(label) && CONFUSABLE_SCRIPTS.test(label));
}

/**
 * The subset of CONFUSABLE_SCRIPTS that can actually deceive in free text.
 *
 * Cyrillic passes through whole — it supplies a lookalike for most Latin
 * letters and has no symbol use in English prose. Greek does not: μ, Ω, π, λ,
 * Δ, φ and their neighbours are *units and symbols*, and they abut Latin
 * letters and digits in ordinary writing. "500μg", "10μF" and "5μm" are one
 * word in two scripts by any structural test, and a pharmacy dispatch note or
 * an electronics order confirmation is exactly the message this rule must not
 * accuse of being "written to slip past filters".
 *
 * So the Greek half is enumerated rather than taken as a range, and the
 * enumeration sits on the side that is bounded: the letters that render close
 * enough to a Latin one to carry a homoglyph. A symbol that looks like nothing
 * in Latin cannot be used to disguise a Latin word, so excluding it costs no
 * detection. Ranges were the first attempt and swept in Δ, which is the tell —
 * the set is a judgement about shapes, not a contiguous block of the alphabet.
 *
 * Hostnames keep the wider CONFUSABLE_SCRIPTS: unit symbols do not appear in
 * domain names, so the ambiguity this resolves does not arise there.
 */
const TEXT_CONFUSABLES = /[\u0400-\u04FF\u0500-\u052F]|[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧαεηικνορστυχ]/;

/**
 * Words in free text that splice a confusable script into a Latin word.
 *
 * The body-text counterpart of hasMixedScriptHost, and it exists because the
 * keyword layer is defeated by one character. "Your account has been
 * suspended" scores 30; swapping two Latin letters for their Cyrillic
 * lookalikes renders identically and scores 0, because every keyword list is
 * matched as literal Latin text. Five of seven sampled scam messages evaded
 * entirely this way, three of them dropping to zero.
 *
 * The unit is the WORD, not the message. A message that merely *contains* two
 * scripts is ordinary — bilingual texting, a Latin brand name inside Greek
 * prose, a signature line — and flagging it would tax people for writing in
 * their own language, which is the failure mode that withdrew character
 * entropy. Mixing within a single word is different in kind: there is no
 * reason to write one, because the homoglyph only has value if the rest of the
 * word still reads as the Latin word being impersonated.
 *
 * Scoped to Cyrillic and Greek, and within Greek to the letters that actually
 * look Latin — see TEXT_CONFUSABLES. Thai, Arabic, Hebrew, Han and Kana share
 * no shapes with Latin, so a reader cannot be misled by them and their
 * presence is not evidence of anything.
 *
 * Returns the offending words so the flag can quote them: the teaching value
 * is in showing the reader a word that looks ordinary and is not.
 */
export function mixedScriptWords(text: string): string[] {
  const out: string[] = [];
  // URLs and email addresses are removed before splitting, because a spliced
  // hostname is already the URL checker's finding — hasMixedScriptHost scores
  // it at 45, and the two rules are counterparts rather than a stack. Without
  // this the word splitter shreds "http://pаypal.com" into the bare label
  // "pаypal" and scores the same character twice, once as prose and once as a
  // host, for 60 on a message the URL rule had already handled.
  //
  // Stripping rather than skipping matched words: the surrounding prose in the
  // same message still gets read, so "Login at http://pаypal.com to reаctivate"
  // reports the prose splice and leaves the host to the URL card.
  const prose = text
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .replace(/\S+@\S+/g, " ")
    // Schemeless hosts: a dot-separated run ending in a plausible TLD. Scam SMS
    // routinely drops the scheme, and extractBareHosts exists for exactly that,
    // so leaving them here would reopen the double-count on the commoner shape.
    .replace(/\S+\.[a-z]{2,}(?:\/\S*)?/gi, " ");
  for (const word of prose.split(/[^\p{L}\p{M}\p{N}]+/u)) {
    // Latin letters only — \p{L} would count the confusable characters
    // themselves as "letters" and make every wholly-Cyrillic word qualify.
    if (/[a-z]/i.test(word) && TEXT_CONFUSABLES.test(word)) out.push(word);
  }
  return out;
}

// ── Normalise for analysis ────────────────────────────────────────────────────
// Closes common evasion tricks before pattern matching:
//   - Lowercase hostname (checkers are case-insensitive but lists are lowercase)
//   - Decode percent-encoding in the host (e.g. %61to.gov.au → ato.gov.au)
//   - Collapse repeated slashes in the path
export function normaliseForAnalysis(raw: string): string {
  const input = raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`;
  try {
    const u = new URL(input);
    // Trailing dot is a valid FQDN form ("ato.gov.au.") that resolves to the
    // same host, but it survives URL parsing into `hostname` and defeats every
    // endsWith() comparison downstream. Left in place it cuts both ways: a
    // scam on "evil.tk./x" evades the suspicious-TLD check (100 → 70), and a
    // real "ato.gov.au./mytax" misses the legit-domain allowlist and scores 0
    // with no flags at all. Stripped here so both compare against the host the
    // browser will actually visit.
    u.hostname = decodeURIComponent(u.hostname).toLowerCase().replace(/\.+$/, "");
    u.pathname = u.pathname.replace(/\/+/g, "/");
    return u.toString();
  } catch {
    return raw.toLowerCase();
  }
}

// ── Safe display string ───────────────────────────────────────────────────────
// Strips tracking params then defangs. Use this whenever a URL is shown in the UI.
export function safeDisplayUrl(raw: string): string {
  return defang(stripTrackingParams(raw));
}

// ── Defang URLs embedded in free text ────────────────────────────────────────
// Finds all http/https URLs in a block of text and applies safeDisplayUrl to each.
export function defangText(text: string): string {
  return text.replace(/https?:\/\/[^\s"'>]+/gi, (u) => safeDisplayUrl(u));
}

// ── Defang email addresses ────────────────────────────────────────────────────
// user@domain.com → user[@]domain[.]com
export function defangEmail(email: string): string {
  return email.replace("@", "[@]").replace(/\./g, "[.]");
}

// ── Defang phone numbers ──────────────────────────────────────────────────────
// Inserts zero-width joiners (U+2060) between consecutive digit pairs so
// browsers and OS text-detection don't auto-link the number as a tel: URI,
// while keeping the display visually identical to the original.
export function defangPhone(phone: string): string {
  return phone.replace(/(\d)(?=\d)/g, "$1⁠");
}

// ── Extract scam identifiers from free text ───────────────────────────────────
// Pulls out the first URL, the first email address, and (only if the entire
// trimmed string is a phone number) the phone number.  Intentionally conservative
// — in-text phone extraction produces too many false positives.
export function extractIdentifiers(text: string): { scamUrl: string; scamEmail: string; scamPhone: string } {
  const t = text.trim();
  const urlMatch   = t.match(/https?:\/\/[^\s<>"']+/i);
  const emailMatch = t.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/);
  const isPhone    = /^[\+\d][\d\s\-().]{5,25}[\d]$/.test(t);
  return {
    scamUrl:   urlMatch   ? urlMatch[0].replace(/[.,;:!?)]+$/, "") : "",
    scamEmail: emailMatch ? emailMatch[0] : "",
    scamPhone: isPhone    ? t : "",
  };
}
