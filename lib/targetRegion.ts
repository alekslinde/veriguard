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
 * Agency names, per region, excluding any claimed by more than one pack.
 *
 * Same reasoning as the suffixes, and it matters more here: packs list each
 * other's agencies in `foreignAuthorityMentions`, and some names genuinely
 * recur. A name two packs claim is not evidence for either.
 *
 * Lowercased for matching. Short names are dropped — a two- or three-letter
 * agency acronym matches inside ordinary words far too readily, and this is a
 * substring match over free text rather than a scored signal with word
 * boundaries behind it.
 */
const MIN_AUTHORITY_LENGTH = 4;

const NATIONAL_AUTHORITIES: ReadonlyMap<string, string> = (() => {
  const claims = new Map<string, Set<string>>();
  for (const code of supportedRegions()) {
    for (const name of resolveRegionPack(code).authorityMentions) {
      const key = name.toLowerCase();
      if (key.length < MIN_AUTHORITY_LENGTH) continue;
      claims.set(key, (claims.get(key) ?? new Set()).add(code));
    }
  }
  const unique = new Map<string, string>();
  for (const [name, codes] of claims) {
    if (codes.size === 1) unique.set(name, [...codes][0]);
  }
  return unique;
})();

/**
 * Brands claimed by exactly one pack.
 *
 * The weakest rung by some distance, and the reason it sits last. PayPal,
 * Amazon and Netflix are impersonated worldwide, so a brand only carries
 * national information when no other pack lists it — which leaves the genuinely
 * local ones (Centrelink, HMRC, Revenue) doing the work.
 */
const NATIONAL_BRANDS: ReadonlyMap<string, string> = (() => {
  const claims = new Map<string, Set<string>>();
  for (const code of supportedRegions()) {
    const pack = resolveRegionPack(code);
    for (const brand of [...pack.typosquatBrands.substring, ...pack.typosquatBrands.word]) {
      const key = brand.toLowerCase();
      if (key.length < MIN_AUTHORITY_LENGTH) continue;
      claims.set(key, (claims.get(key) ?? new Set()).add(code));
    }
  }
  const unique = new Map<string, string>();
  for (const [brand, codes] of claims) {
    if (codes.size === 1) unique.set(brand, [...codes][0]);
  }
  return unique;
})();

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

  // 2. A national TLD. Registration under a country's namespace is a
  //    deliberate act and a strong marker, though weaker than a calling code
  //    because a squatter can register anywhere.
  for (const [suffix, code] of NATIONAL_SUFFIXES) {
    // Bounded on the left by a dot so "gov.au" does not match inside
    // "notgov.au", and on the right by a non-label character so "co.uk" does
    // not match "co.ukraine".
    if (new RegExp(`\\.${escapeRegExp(suffix)}(?![a-z0-9-])`, "i").test(haystack)) {
      return { region: code, confidence: "tld" };
    }
  }

  // 3. A named national agency. Strong when it fires, but a substring match
  //    over free text, so it sits below a structural signal.
  for (const [name, code] of NATIONAL_AUTHORITIES) {
    if (haystack.includes(name)) return { region: code, confidence: "authority" };
  }

  // 4. A brand only one region lists. Weakest rung — see NATIONAL_BRANDS.
  for (const [brand, code] of NATIONAL_BRANDS) {
    if (haystack.includes(brand)) return { region: code, confidence: "brand" };
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
