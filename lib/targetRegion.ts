/**
 * Which country a scam was aimed at, as distinct from where it was reported.
 *
 * `Report.region` and the check's resolved region both record where the *user*
 * connected from. Someone in Sydney forwarding an HMRC impersonation produces
 * an AU-tagged record about a GB campaign, and today that disagreement is
 * invisible — which means cross-border campaigns are too.
 *
 * This module infers the *target* from the content's own national signals. When
 * inferred and connection region disagree, the disagreement is the finding.
 *
 * ## Why this lives in `lib/` and not the engine
 *
 * It scores nothing and changes no verdict. It reads the submitted text and
 * answers a question about provenance rather than risk — the same reason
 * `signalTactics.ts` is app-side. Keeping it out of the engine
 * also keeps the engine's no-network, no-state contract untouched.
 *
 * ## Privacy shape
 *
 * The caller aggregates the return value into a day-bucketed counter and
 * persists nothing per check. This function is pure: it holds no state, writes
 * nothing, and never sees an IP address. It deliberately returns a country
 * CODE and nothing else — no matched string, no signal list — so a caller
 * cannot accidentally persist a fragment of user content by storing "why".
 */

import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { resolveRegionPack, supportedRegions } from "@veriguard/engine/regions";

/** ISO-3166 alpha-2, or "" when no national signal was found. */
export type TargetRegion = string;

/**
 * How confident the inference is, which is the rung of the ladder that fired.
 *
 * Kept because a `phone` inference is near-certain (a country calling code is
 * unambiguous) while a `brand` inference is weak (multinationals are
 * impersonated everywhere). A consumer that publishes these can filter by rung
 * rather than treating all inferences as equal.
 */
export type TargetConfidence = "phone" | "tld" | "authority" | "brand";

export interface TargetInference {
  region: TargetRegion;
  confidence: TargetConfidence | "none";
}

const NO_INFERENCE: TargetInference = { region: "", confidence: "none" };

/**
 * National suffixes, per region, excluding any that more than one pack claims.
 *
 * `brandSuffixes` is not usable directly: every pack lists `com`, `net` and
 * `org` because its brands register there, so a naive read makes every `.com`
 * look like evidence for whichever pack was checked first. Only a suffix that
 * exactly one region claims carries national information.
 *
 * Computed once. The packs are static, so this cannot drift at runtime.
 */
/**
 * Suffixes that exactly one pack claims but which carry no national meaning.
 *
 * Uniqueness of claim is necessary but NOT sufficient, which the derivation
 * alone got wrong. The US pack lists `co`, `io` and `me` because American
 * brands register there — they are generic gTLDs sold worldwide, not markers of
 * a US target, and attributing every `.io` startup to the US would have been a
 * confident wrong answer rather than an abstention.
 *
 * `co` was the one that actually fired in testing: it matched inside
 * "news.co.ukraine-today.info" and returned US. That is two failures at once —
 * a gTLD read as national, and a match on a string that is not a suffix at all.
 *
 * `gov` and `mil` are excluded on the same grounds despite being genuinely
 * American: they appear inside `gov.uk`, `gov.au`, `govt.nz` and `gov.sg`, so
 * matching them as bare suffixes would shadow the very packs that own those.
 * The dotted forms below still resolve correctly.
 */
const NON_NATIONAL_SUFFIXES = new Set(["co", "io", "me", "gov", "mil"]);

const NATIONAL_SUFFIXES: ReadonlyMap<string, string> = (() => {
  const claims = new Map<string, string[]>();
  for (const code of supportedRegions()) {
    for (const suffix of resolveRegionPack(code).brandSuffixes) {
      claims.set(suffix, [...(claims.get(suffix) ?? []), code]);
    }
  }
  const unique = new Map<string, string>();
  for (const [suffix, codes] of claims) {
    if (codes.length === 1 && !NON_NATIONAL_SUFFIXES.has(suffix)) {
      unique.set(suffix, codes[0]);
    }
  }
  // Longest first, so `gov.uk` is tested before `uk` and `com.au` before `au`.
  // Without this the iteration order is insertion order, and a two-part suffix
  // could lose to the bare ccTLD that shares its tail — same answer here, since
  // both belong to one pack, but not a property to leave to luck.
  return new Map([...unique].sort((a, b) => b[0].length - a[0].length));
})();

/**
 * Compiled national-suffix probes, longest suffix first.
 *
 * Precompiled at module scope rather than per call. The previous version built
 * a RegExp for every suffix on every check — ~44 constructions per request on
 * a public endpoint with no content-length cap.
 */
const NATIONAL_SUFFIX_PATTERNS: readonly [string, RegExp][] = [...NATIONAL_SUFFIXES]
  .map(([suffix, code]): [string, RegExp] => [
    code,
    new RegExp(`\\.${escapeRegExp(suffix)}$`, "i"),
  ]);

/**
 * Hostnames appearing in the text.
 *
 * The TLD rung matches against these rather than the raw content, because a
 * suffix is only evidence when it terminates a host. Requiring a plausible
 * label structure — at least two dot-separated labels, no whitespace — is what
 * separates "auspost.com.au" from "confirm your details.ca", which the earlier
 * free-text scan could not tell apart.
 *
 * Structure alone is not enough, and assuming it was is what let
 * "confirm your details.ca" through: a missing space after a full stop produces
 * something indistinguishable from a real two-label domain. The engine hit the
 * same wall in `extractBareHosts` and answered it with CORROBORATION, which is
 * the rule adopted here — a candidate counts only when something other than its
 * shape says a host was meant:
 *
 *   · a scheme ("https://details.ca"), or
 *   · a "www." prefix, or
 *   · a path ("details.ca/verify"), or
 *   · three or more labels ("my.details.ca") — prose does not stack dots.
 *
 * A bare two-label token in running text is therefore ignored, which loses the
 * occasional real mention of a domain. That trade is deliberately one-sided:
 * abstaining costs a row in an aggregate that suppresses small counts anyway,
 * while a wrong attribution is permanent and silent.
 */
const HOSTNAME_CANDIDATE =
  /(?:(https?:\/\/)|(?:^|[\s<>"'(\[]))((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,24})(\/[^\s<>"')\]]*)?(?=$|[\s<>"')\]:,?!])/gi;

function hostnames(haystack: string): string[] {
  const found: string[] = [];
  for (const match of haystack.matchAll(HOSTNAME_CANDIDATE)) {
    const [, scheme, host, path] = match;
    const clean = host.toLowerCase().replace(/\.$/, "");
    const corroborated =
      Boolean(scheme)
      || Boolean(path)
      || clean.startsWith("www.")
      || clean.split(".").length >= 3;
    if (corroborated) found.push(clean);
  }
  return found;
}

/**
 * Agency and brand names that exactly one pack claims but which are ordinary
 * English, or generic across countries.
 *
 * Uniqueness of claim is necessary but NOT sufficient — the same lesson as
 * `NON_NATIONAL_SUFFIXES`, which this file learned once and did not generalise.
 * Every entry below was a real misattribution: "revenue figures are up" read as
 * Ireland, "the reserve bank said" as New Zealand, "postal service update" and
 * "the sheriff called" as the US.
 *
 * The tell is that the phrase describes a KIND of institution rather than
 * naming one. Every country has a revenue office, a central bank, a postal
 * service and local councils; only some have an "HMRC" or a "Centrelink". A
 * name that could complete the sentence "every country has a ___" carries no
 * national information no matter which pack happens to list it.
 */
/**
 * Brand names that are also ordinary English words.
 *
 * Word boundaries fix collisions INSIDE other words — "chase" no longer matches
 * "purchase" — but they cannot help when the brand *is* a word someone might
 * write on its own. "your bank is nationwide", "chase the invoice", "spark of
 * interest", "the countdown is on" are all ordinary sentences, and each was
 * attributing a check to a region.
 *
 * Only genuinely ambiguous words are listed. Distinctive names that happen to
 * be lowercase alphabetic — tesco, argos, schwab, santander — are safe once
 * bounded, and excluding them would cost real signal for nothing.
 *
 * This is the `word`-vs-`substring` judgement the engine makes per pack, which
 * this module cannot inherit because it needs the opposite default: the engine
 * can afford a loose brand hit that other rules outweigh, whereas an
 * attribution here is a permanent row.
 */
const AMBIGUOUS_BRAND_WORDS = new Set([
  "nationwide", "chase", "spark", "countdown", "discover", "truist",
  "fidelity", "regions", "target", "revenue", "interac",
]);

const GENERIC_INSTITUTION_TERMS = new Set([
  "revenue", "inland revenue", "revenue service", "central bank",
  "reserve bank", "national bank", "postal service", "post office",
  "sheriff", "council tax", "local council", "city council", "council",
  "tax office", "police", "customs", "immigration", "border force",
  "social security", "health service", "electoral commission",
  "consumer protection", "attorney general", "state police",
]);

/**
 * Agency names, per region, excluding any claimed by more than one pack and any
 * that name a kind of institution rather than a specific one.
 *
 * Matched on WORD BOUNDARIES, not as substrings. The engine gets away with
 * substring matching here because a wrong hit only adds a scored signal that
 * other rules can outweigh; a wrong hit here is a permanent row in an
 * aggregate, so it has to be right on its own.
 */
const MIN_AUTHORITY_LENGTH = 4;

function uniquelyClaimed(
  pick: (pack: ReturnType<typeof resolveRegionPack>) => readonly string[],
  exclude: ReadonlySet<string>,
): Map<string, string> {
  const claims = new Map<string, Set<string>>();
  for (const code of supportedRegions()) {
    for (const raw of pick(resolveRegionPack(code))) {
      const key = raw.toLowerCase().trim();
      if (key.length < MIN_AUTHORITY_LENGTH) continue;
      if (exclude.has(key)) continue;
      claims.set(key, (claims.get(key) ?? new Set()).add(code));
    }
  }
  const unique = new Map<string, string>();
  for (const [name, codes] of claims) {
    if (codes.size === 1) unique.set(name, [...codes][0]);
  }
  return unique;
}

/**
 * Compile a name map into longest-first regex probes, one per region.
 *
 * Longest-first ordering exists because insertion order once decided which
 * region won: NZ's "inland revenue" beat SG's "inland revenue authority", and
 * an IRAS notice was attributed to New Zealand. `NATIONAL_SUFFIXES` already
 * sorted for exactly this reason and the other two maps did not.
 *
 * **Honest note on its current reachability:** with word boundaries in place,
 * no cross-region pair in today's packs actually needs this sort — the one
 * whole-word case ("medicare" inside "centers for medicare") is claimed by both
 * AU and US, so the uniqueness filter removes it before ordering matters.
 * Removing the sort therefore does not fail the suite today.
 *
 * It is kept deliberately rather than deleted as dead code: the property it
 * guarantees ("a more specific name wins") is one a pack author would
 * reasonably assume, it costs one sort at module load, and the alternative is
 * that the next pack to add a compound agency name silently loses to a shorter
 * one elsewhere. What it must NOT have is a test implying it is exercised when
 * it is not — that is the failure mode this file has already hit twice.
 *
 * Names are grouped per region into one alternation so the ladder tests each
 * region once rather than once per name.
 */
function compileNamePatterns(names: Map<string, string>): [string, RegExp][] {
  const byRegion = new Map<string, string[]>();
  for (const [name, code] of names) {
    byRegion.set(code, [...(byRegion.get(code) ?? []), name]);
  }
  // Longest name first WITHIN a region, and regions ordered by their longest
  // name, so a more specific match always wins over a shorter one elsewhere.
  const entries: [string, string[]][] = [...byRegion].map(([code, list]) => [
    code,
    [...list].sort((a, b) => b.length - a.length),
  ]);
  entries.sort((a, b) => b[1][0].length - a[1][0].length);
  return entries.map(([code, list]) => [
    code,
    // \b on both sides: "chase" must not match inside "purchase", and
    // "nationwide" must not match inside "is nationwide,". Names can contain
    // spaces and punctuation, so each is escaped rather than assumed word-safe.
    new RegExp(`\\b(?:${list.map(escapeRegExp).join("|")})\\b`, "i"),
  ]);
}

const NATIONAL_AUTHORITY_PATTERNS: readonly [string, RegExp][] = compileNamePatterns(
  uniquelyClaimed((p) => p.authorityMentions, GENERIC_INSTITUTION_TERMS),
);

/**
 * Brands claimed by exactly one pack.
 *
 * **Only the `substring` list.** The engine splits brands into `substring` and
 * `word` precisely because the latter are short or collide with dictionary
 * words, and `scamDetector` honours that split — this module flattened the two
 * together and inherited every collision the split exists to prevent: US brand
 * "chase" matched inside "purchase confirmation", GB's "nationwide" inside
 * "your bank is nationwide".
 *
 * Word-boundary matching alone does not rescue them. "nationwide" is a real
 * English word, so `\bnationwide\b` still fires on ordinary prose; the split
 * is a judgement about which names are safe to look for at all, and it belongs
 * to the pack author rather than to this file.
 *
 * The weakest rung regardless — PayPal and Amazon are impersonated worldwide, so
 * only genuinely local brands survive the uniqueness filter.
 */
const NATIONAL_BRAND_PATTERNS: readonly [string, RegExp][] = compileNamePatterns(
  uniquelyClaimed((p) => p.typosquatBrands.substring, AMBIGUOUS_BRAND_WORDS),
);

/**
 * Infer the country a piece of content was aimed at.
 *
 * Returns `{ region: "", confidence: "none" }` when nothing national is
 * present, which is the common case and is not a failure — most scam text
 * carries no country marker at all, and guessing would be worse than
 * abstaining. The connection region is NOT used as a fallback: this function's
 * only value is disagreeing with it, so defaulting to it would make every
 * record agree by construction.
 *
 * The ladder is ordered by how much a signal can be relied on, and stops at the
 * first rung that fires.
 */
export function inferTargetRegion(content: string): TargetInference {
  // 1. Phone country code. A country calling code is unambiguous by
  //    construction — it is allocated, not inferred — so this outranks
  //    everything below it.
  //
  //    Parsed here rather than read off `phoneIntel`, for two reasons found by
  //    testing rather than by reading: `PhoneIntel.country` is a DISPLAY NAME
  //    ("United Kingdom"), not an ISO code, so a code-shaped read of it fails
  //    silently on every value; and `analyzeContent` does not propagate
  //    `phoneIntel` at all, so the field is absent on exactly the path this
  //    runs on. Parsing the text keeps the inference self-contained rather than
  //    coupling it to an engine field that is neither the right shape nor
  //    reliably present.
  const phoneTarget = phoneCountry(content);
  if (phoneTarget) return { region: phoneTarget, confidence: "phone" };

  const haystack = content.toLowerCase();

  // 2. A national TLD, matched against extracted HOSTNAMES rather than the raw
  //    text. Registration under a country's namespace is a deliberate act and a
  //    strong marker, though weaker than a calling code because a squatter can
  //    register anywhere.
  //
  //    Scanning free text was wrong and produced confident nonsense: a missing
  //    space after a full stop turns ordinary prose into an apparent domain, so
  //    "please confirm your details.ca" read as Canada and "See attachment.ie
  //    file" as Ireland. Both at `tld` confidence, the second-strongest rung.
  //    The earlier `.co` defect inside "news.co.ukraine-today.info" was the
  //    same bug seen once and patched by excluding the suffix rather than by
  //    fixing where matching happens.
  for (const host of hostnames(haystack)) {
    for (const [suffix, pattern] of NATIONAL_SUFFIX_PATTERNS) {
      if (pattern.test(host)) return { region: suffix, confidence: "tld" };
    }
  }

  // 3. A named national agency, matched on word boundaries. Strong when it
  //    fires, but it reads free text, so it sits below a structural signal.
  for (const [code, pattern] of NATIONAL_AUTHORITY_PATTERNS) {
    if (pattern.test(haystack)) return { region: code, confidence: "authority" };
  }

  // 4. A brand only one region lists. Weakest rung — see NATIONAL_BRANDS.
  for (const [code, pattern] of NATIONAL_BRAND_PATTERNS) {
    if (pattern.test(haystack)) return { region: code, confidence: "brand" };
  }

  return NO_INFERENCE;
}

/**
 * ISO country of the first international number in the text, or "".
 *
 * Only `+`-prefixed numbers are considered. A national-format number
 * ("0412 345 678") is ambiguous without knowing where it was written, and
 * assuming the connection region would make the inference agree with the
 * reporter by construction — which is the one thing it must not do.
 *
 * Territories map to their parent numbering plan, matching the engine's own
 * display behaviour: a +44 mobile resolves to Guernsey (GG) about as often as
 * to GB, and treating those as different targets would split one campaign in
 * two. NANP peers are deliberately NOT collapsed — Canada is its own target,
 * not a US one.
 */
const PLAN_PARENT: Record<string, string> = {
  GG: "GB", JE: "GB", IM: "GB",
  CC: "AU", CX: "AU",
  PR: "US", VI: "US", MP: "US", GU: "US", AS: "US",
};

function phoneCountry(content: string): string {
  for (const match of content.matchAll(/\+[\d][\d\s().-]{6,20}/g)) {
    const parsed = parsePhoneNumberFromString(match[0].trim());
    if (!parsed?.isValid() || !parsed.country) continue;
    return PLAN_PARENT[parsed.country] ?? parsed.country;
  }
  return "";
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
