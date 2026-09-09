// Public Suffix List lookup — which part of a hostname a registrant owns.
//
// The question this answers is "what is the registrable domain", and it is the
// hinge of the typosquat rule: "barclays.co.uk" is Barclays' own site, while
// "barclays-secure.co.uk" is a squat, and the two are distinguished entirely by
// whether the brand IS the registrable label or merely appears inside it.
//
// This replaces a hand-maintained set of two-part suffixes. That list was
// explicitly "scoped to the ccTLDs the packs actually cover", which stopped
// being true the moment a region shipped outside it: with SG live at `minimal`,
// "barclays.com.sg" computed its registrable label as "com", missed the
// brand-owns-the-label exemption, and scored 55/likely_scam — a false positive
// on a real bank's own site, and on the exact axis the project cares most about
// getting right.
//
// The list is generated and committed (see scripts/generate-psl.mjs); nothing
// here touches the network.

import { PSL_RULES, PSL_WILDCARDS, PSL_EXCEPTIONS } from "./publicSuffixList";

/**
 * The public suffix of a hostname — the part no single registrant controls.
 *
 * Implements the publicsuffix.org matching algorithm, in its stated priority
 * order:
 *
 *   1. An exception rule wins outright, and yields the suffix MINUS its first
 *      label. "!city.kawasaki.jp" means city.kawasaki.jp is registrable, so the
 *      suffix there is "kawasaki.jp".
 *   2. Otherwise the longest matching rule wins — "nsw.edu.au" beats "edu.au"
 *      beats "au".
 *   3. A wildcard rule matches any single label in that position.
 *   4. With no rule at all, the suffix is the final label. That is the PSL's
 *      own default for unknown TLDs, and it is also what the previous
 *      hand-written implementation assumed whenever its list missed.
 *
 * Only multi-label rules are carried (see the generator), so the single-label
 * case falls out of rule 4 rather than needing ~1,500 entries to restate it.
 */
export function publicSuffix(hostname: string): string {
  const labels = hostname.toLowerCase().replace(/\.+$/, "").split(".");
  if (labels.length <= 1) return labels.join(".");

  // Rule 1. Checked first and independently: an exception must beat a longer
  // wildcard match, so it cannot be folded into the length loop below.
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join(".");
    if (PSL_EXCEPTIONS.has(candidate)) {
      return labels.slice(i + 1).join(".");
    }
  }

  // Rules 2 and 3. Walk from the longest candidate to the shortest and take the
  // first hit, which is the longest match by construction.
  for (let i = 0; i < labels.length - 1; i++) {
    const candidate = labels.slice(i).join(".");
    if (PSL_RULES.has(candidate)) return candidate;

    // A wildcard "*.ck" is stored as "ck": it matches when the candidate's
    // PARENT is the stored value and the candidate has exactly one more label.
    const parent = labels.slice(i + 1).join(".");
    if (parent && PSL_WILDCARDS.has(parent)) return candidate;
  }

  // Rule 4.
  return labels[labels.length - 1] ?? "";
}

/**
 * The registrable domain — the public suffix plus the one label to its left.
 *
 * "www.barclays.co.uk" → "barclays.co.uk"; "evil.top" → "evil.top". Returns ""
 * when the hostname is nothing but a public suffix ("co.uk" alone), since there
 * is no registrant to name.
 */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  const suffix = publicSuffix(host);
  if (host === suffix) return "";

  const suffixLabels = suffix ? suffix.split(".").length : 0;
  const labels = host.split(".");
  if (labels.length <= suffixLabels) return "";
  return labels.slice(labels.length - suffixLabels - 1).join(".");
}

/**
 * The registrable LABEL — the name a registrant actually chose.
 *
 * "www.barclays.co.uk" → "barclays"; "barclays-secure.co.uk" →
 * "barclays-secure"; "login.barclays.com.evil.top" → "evil". This is what the
 * typosquat rule compares a brand against: a brand that IS this label owns the
 * site, and a brand that merely appears elsewhere in the hostname is squatting.
 */
export function registrableLabel(hostname: string): string {
  const domain = registrableDomain(hostname);
  return domain ? domain.split(".")[0] ?? "" : "";
}

/**
 * TLDs whose second-level namespaces are sold internationally as `.com`
 * lookalikes rather than serving a national registrant base.
 *
 * The one genuinely curated input to `isNationalCommercialSuffix` below, and
 * deliberately tiny. Everything else that rule needs it can read off the PSL;
 * this cannot be, because `com.co` and `com.br` are indistinguishable as data —
 * both are ordinary `com.<cc>` entries. What separates them is a fact about how
 * the registry sells: `.co` and `.io` are marketed worldwide off their
 * resemblance to `.com` and `.io`-the-tech-suffix, to registrants with no
 * connection to Colombia or the Indian Ocean Territory. A brand name under one
 * is not that brand's local presence, because there is no locality involved.
 *
 * The bar for adding a TLD here is that its second-levels are sold as generics.
 * It is NOT "the registry is open" — `.co.uk` and `.com.au` are open too, which
 * is exactly why they are absent from `trustedHostSuffixes`, and they are still
 * where a brand's genuine local site lives.
 */
const GENERIC_SOLD_TLDS = new Set(["co", "io"]);

/**
 * Whether a multi-label public suffix is a country's ordinary COMMERCIAL
 * namespace — the place a global brand's genuine local site lives.
 *
 * Gates the "the brand owns the registrable label, so it is the real site"
 * exemption for globally-impersonated brands. Those brands register in every
 * country, so an allowlist of suffixes cannot serve them: `paypal.com.br`,
 * `amazon.co.jp` and `netflix.co.za` are all real, and no region pack lists any
 * of those suffixes. The default therefore inverts — an ordinary national
 * commercial namespace grants the exemption, and this function is what says
 * which ones are not.
 *
 * Three disqualifying shapes, two of them read straight off the PSL:
 *
 *   1. **A non-commercial second level.** `gov.co`, `gov.io` — a government
 *      namespace is not where a retailer registers, whatever the country, so
 *      the shape alone settles it without knowing anything about `.co`.
 *   2. **A wildcard registry.** `com.np` exists only via the PSL's `*.np` rule,
 *      meaning the registry publishes no enumerated second levels. There is no
 *      established commercial namespace to be the real site of.
 *   3. **A TLD sold as a generic.** See GENERIC_SOLD_TLDS — the judgement case.
 *
 * Single-label suffixes never reach this: `.com`, `.de`, `.fr` are where brands
 * register worldwide and are exempt by default at the call site.
 */
export function isNationalCommercialSuffix(suffix: string): boolean {
  const labels = suffix.split(".");
  if (labels.length !== 2) return false;
  const [second, tld] = labels;

  // (1) Only genuinely commercial second levels. Listed positively rather than
  // excluding "gov": these are the handful of forms registries actually use for
  // general registration, and an unrecognised one should fail closed.
  if (!["com", "co", "net", "or", "ne", "gr", "biz"].includes(second)) return false;

  // (2) A wildcard registry publishes no enumerated second level, so `com.np`
  // is not an established namespace — it is whatever label was asked for.
  if (PSL_WILDCARDS.has(tld)) return false;

  // (3) The judgement case.
  if (GENERIC_SOLD_TLDS.has(tld)) return false;

  return true;
}
