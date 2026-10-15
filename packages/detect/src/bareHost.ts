// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// Where a hostname ends in ordinary prose — the one guard, in one place.
//
// Deciding whether "ассount.co" is a host or a spliced word is five guards, not
// a TLD lookup, and two rules need the same answer: the bare-host extractor,
// which raises a URL card, and the splice rule, which strips URL-owned text
// before reading the prose that is left. The invariant between them is that a
// token one strips is exactly a token the other raises a card for, so nothing is
// scored twice and nothing falls between them.
//
// It lived in `scamDetector.ts` while both callers did. The splice rule's move
// into the signal registry is what separated them, and the choice at that point
// was to re-export the guard from the entry point — which a signal module
// importing the scorer would make a cycle — or to give it the module it should
// always have had. Approximating it instead is the move this repo has paid for
// twice in this one rule: a strip gated on "a dot and two letters" deleted prose,
// and the next one gated on the TLD set alone, which is only the LAST of the
// checks below, so it was too loose for word-like TLDs and too strict for the
// ambiguous ones at the same time.
//
// Sharing the guard is what makes the invariant true rather than merely stated,
// which is this repo's own rule: if two pieces of code must agree, make one call
// the other.

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
// The ranges cover the same SCRIPTS as urlSanitizer's confusable sets —
// Cyrillic and Greek, the ones that supply Latin homoglyphs — but deliberately
// at block granularity, where `CONFUSABLE_LETTERS` enumerates Greek down to the
// individual lookalikes. Not a mirror, and must not become one: the two answer
// opposite questions. That one asks "is this character a disguise", so a
// non-confusable letter is correctly excluded; this asks "where does the
// hostname end", and excluding one would TRUNCATE the host rather than decline
// it — narrowing to the enumerated set extracts "elta-billing.bond" from
// "Δelta-billing.bond", a different domain from the one in the message, which
// is the defect described above. Over-inclusion here is safe because the prose
// guard below rejects the false candidates ("Θ.Then we stopped").
//
// Still kept to these scripts rather than \p{L}: this pattern also decides what
// counts as a host in ordinary prose, and matching every letter in every script
// would turn far more sentences into candidate URLs.
const HOST_LABEL_CHAR = "a-z0-9\\u0370-\\u03FF\\u0400-\\u04FF\\u0500-\\u052F";

const BARE_HOST_GLOBAL = new RegExp(
  `(?<![\\w@./\\\\-])((?:[${HOST_LABEL_CHAR}](?:[${HOST_LABEL_CHAR}-]*[${HOST_LABEL_CHAR}])?\\.)+[a-z]{2,24})(/[^\\s<>"']*)?`,
  "gi",
);

/**
 * Whether one BARE_HOST_GLOBAL match is a hostname rather than prose.
 *
 * Extracted so `extractBareHosts` and `stripUrlOwnedText` answer this the SAME
 * way, instead of each carrying its own approximation of it.
 *
 * They previously did not. The strip gated on the TLD set alone — which is the
 * *last* of the checks below — and the guards above it are the ones that
 * actually separate a hostname from a missing space after a full stop. That
 * left it wrong in both directions at once: too loose for word-like TLDs
 * (`ассount.co`, `ассount.app` read as hosts, so the spliced word was deleted
 * and the message went back to scoring nothing), and too strict for the
 * ambiguous ones (`depоsit.bond`, `аrchive.zip` stripped where this function
 * would first have required a path or a `www.`).
 *
 * `text` is needed as well as the match: two guards read what follows and what
 * precedes the match, not just the host itself.
 */
function isBareHostMatch(
  match: RegExpMatchArray,
  text: string,
  flagged: ReadonlySet<string>,
): boolean {
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
  if (/^[A-Z][a-z]/.test(rawTld)) return false;

  // Prose connective on the left ("in.live", "or.online"). Only ever skips
  // the BARE form — a path or a www. prefix means a host was meant, and both
  // are checked below.
  if (
    labels.length === 2 &&
    PROSE_LEFT_LABELS.has(labels[0]) &&
    !match[2] &&
    !/^www\./i.test(hostname)
  ) return false;

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
  ) return false;

  const isFlaggedTld = flagged.has(tld);
  if (!BARE_HOST_TLDS.has(tld) && !isFlaggedTld) return false;

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
  if (needsCorroboration && !hasPath && !hasWww) return false;
  // A single label plus TLD is the minimum for a real host; "e.g" and "No.5"
  // are already excluded by the TLD check, this guards the rest.
  if (labels.length < 2 || labels.some((l) => l.length === 0)) return false;

  // Skip anything already carried by a scheme'd URL — URL_GLOBAL has it.
  const before = text.slice(0, match.index ?? 0);
  if (/https?:\/\/\S*$/i.test(before)) return false;

  return true;
}

/**
 * Schemeless hostnames in free text that are worth analysing as URLs.
 *
 * `suspiciousTlds` comes from the resolved region pack, so a host is picked up
 * when its TLD is either mainstream or already flagged as abuse-prone.
 */
export function extractBareHosts(text: string, suspiciousTlds: string[]): string[] {
  const flagged = bareHostFlaggedTlds(suspiciousTlds);
  const found: string[] = [];
  for (const match of text.matchAll(BARE_HOST_GLOBAL)) {
    if (!isBareHostMatch(match, text, flagged)) continue;
    found.push(match[0].replace(/[.,;:!?)]+$/, ""));
  }
  return found;
}

/** The pack's abuse-prone TLDs, normalised for the guards above. */
function bareHostFlaggedTlds(suspiciousTlds: string[]): ReadonlySet<string> {
  return new Set(suspiciousTlds.map((t) => t.replace(/^\./, "").toLowerCase()));
}

/**
 * Remove everything the URL checker owns, leaving the prose a body rule reads:
 * schemed URLs, email addresses, and schemeless hostnames.
 *
 * The last of those is the whole difficulty, and it is answered by
 * `isBareHostMatch` — the SAME guard `extractBareHosts` uses, which is why both
 * live here. Two earlier versions approximated it and both were wrong: one gated
 * on "a dot and two letters" and deleted prose (`ассount.has`), the next gated on
 * the TLD set alone, which is only the last of that guard's five checks, and was
 * too loose for word-like TLDs (`ассount.co`) and too strict for the ambiguous
 * ones (`depоsit.bond`) at the same time.
 *
 * Sharing the guard is also what makes the invariant true rather than merely
 * stated: a token this strips is exactly a token `extractBareHosts` raises a
 * URL card for, so nothing is scored twice and nothing falls between them.
 */
export function stripUrlOwnedText(text: string, suspiciousTlds: string[]): string {
  const flagged = bareHostFlaggedTlds(suspiciousTlds);
  // Scheme capped at 30 chars (real ones are a handful): an unbounded `*`
  // before a required `://` rescans to the end from every start position,
  // which is quadratic on a long run with no `://` in it.
  return text
    .replace(/[a-z][a-z0-9+.-]{0,30}:\/\/\S+/gi, " ")
    // Starts only at a token boundary. The leftmost match always begins there
    // anyway, but unanchored, every position in a long token with no `@`
    // rescanned to its end — the same quadratic shape as the scheme above.
    .replace(/(?<!\S)\S+@\S+/g, " ")
    .replace(BARE_HOST_GLOBAL, (...args) => {
      const groups = args.slice(0, -2) as string[];
      const index = args[args.length - 2] as number;
      const input = args[args.length - 1] as string;
      const match = Object.assign(groups.slice(), { index, input }) as RegExpMatchArray;
      return isBareHostMatch(match, input, flagged) ? " " : groups[0];
    });
}
