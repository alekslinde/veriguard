/**
 * Keyboard-adjacency typosquat detection.
 *
 * A structural base signal: it needs no per-country research, so it works in a
 * region we have never heard from on day one. Given the brand names a region
 * pack already lists, it asks whether a registrable label is one *mistyped
 * keystroke* away from one of them.
 *
 * This is deliberately NOT general edit distance. "commbank" is one ordinary
 * edit from "commband", "combank" and a long tail of unrelated real words, and
 * scoring all of those is how a structural rule turns into a false-positive
 * engine. A typosquat is registered to catch a *slip of the finger*, so the
 * substitution has to be a key the typist could plausibly have hit instead —
 * "cimmbank" (o→i), "wsstpac" (e→s) — which is a far smaller set than "any
 * other letter".
 *
 * Three shapes are covered, and they are the ones squatters actually register:
 *
 *   · substitution of an adjacent key   paypal → oaypal
 *   · doubled key                       paypal → payppal
 *   · transposed neighbours             paypal → payapl
 *
 * Omission and insertion are deliberately absent. Both collide far too readily
 * with ordinary words and with the OTHER brands in the same list — dropping a
 * letter from a 3-letter brand like "anz" produces a two-character string that
 * matches almost anything, and the rule has no way to know the difference.
 *
 * False positives are the costlier direction here (a scam card on a real site
 * teaches users the verdicts are noise), so every guard below fails toward
 * saying nothing.
 */

/**
 * QWERTY horizontal/vertical neighbours, lowercase letters only.
 *
 * Digits are excluded on purpose: brand labels containing digits are rare, and
 * "o"/"0" and "l"/"1" are homoglyph substitutions rather than finger slips —
 * they belong to the mixed-script/lookalike rule, not this one.
 *
 * One physical layout is assumed. AZERTY and QWERTZ move a handful of keys, but
 * a squat is registered against the layout the *target audience* types on, and
 * QWERTY is what the overwhelming majority of the reachable web uses. Getting
 * this wrong fails toward a miss, which is the safe direction.
 */
const NEIGHBOURS: Record<string, string> = {
  q: "wa", w: "qeas", e: "wrsd", r: "etdf", t: "ryfg", y: "tugh",
  u: "yihj", i: "uojk", o: "ipkl", p: "ol",
  a: "qwsz", s: "awedxz", d: "serfcx", f: "drtgvc", g: "ftyhbv",
  h: "gyujnb", j: "huikmn", k: "jiolm", l: "kop",
  z: "asx", x: "zsdc", c: "xdfv", v: "cfgb", b: "vghn", n: "bhjm", m: "njk",
};

function areNeighbours(a: string, b: string): boolean {
  return (NEIGHBOURS[a] ?? "").includes(b);
}

/**
 * The shortest brand this rule will consider.
 *
 * Short brands are where adjacency degenerates. "anz" is one adjacent
 * substitution from "abz", "amz", "snz", "wnz", "qnz" and more, several of
 * which are plausible real labels, and a 3-letter string carries too little
 * information to tell a squat from a coincidence. Six is where the collision
 * rate drops off sharply — at that length a single adjacent slip lands on a
 * real word only rarely.
 */
const MIN_BRAND_LENGTH = 6;

/**
 * Whether `candidate` is one plausible mistyping of `brand`.
 *
 * Exact equality returns false: that is the real brand, and the
 * brand-owns-the-label exemption in the URL checker is what handles it.
 */
export function isKeyboardTypo(candidate: string, brand: string): boolean {
  if (brand.length < MIN_BRAND_LENGTH) return false;
  if (candidate === brand) return false;

  // Substitution and transposition preserve length; doubling adds exactly one.
  if (candidate.length === brand.length) {
    return isAdjacentSubstitution(candidate, brand)
      || isNeighbourTransposition(candidate, brand);
  }
  if (candidate.length === brand.length + 1) {
    return isDoubledKey(candidate, brand);
  }
  return false;
}

/** Exactly one position differs, and the two characters are adjacent keys. */
function isAdjacentSubstitution(candidate: string, brand: string): boolean {
  let diff = -1;
  for (let i = 0; i < brand.length; i++) {
    if (candidate[i] === brand[i]) continue;
    if (diff !== -1) return false; // a second difference — not one slip
    diff = i;
  }
  if (diff === -1) return false;
  return areNeighbours(brand[diff], candidate[diff]);
}

/**
 * Exactly one adjacent PAIR is swapped.
 *
 * Restricted to characters that are themselves neighbours on the keyboard,
 * which is what makes this a finger slip rather than an anagram. "payapl" (p/a
 * are not neighbours) would be rejected by that reading — but transposition is
 * a ROLLOVER error, where two keys are struck out of order, and that happens
 * across the whole hand rather than only between touching keys. So the pair
 * need only be adjacent in the STRING; the keyboard is not consulted.
 *
 * Requiring keyboard adjacency here was tried and rejected: it excluded
 * "paypla" and "amaozn", which are among the most commonly registered squats
 * of those two brands.
 */
function isNeighbourTransposition(candidate: string, brand: string): boolean {
  let swap = -1;
  for (let i = 0; i < brand.length; i++) {
    if (candidate[i] === brand[i]) continue;
    swap = i;
    break;
  }
  if (swap === -1 || swap + 1 >= brand.length) return false;
  // The two characters must genuinely be a swap, not two coincidental diffs.
  if (candidate[swap] !== brand[swap + 1]) return false;
  if (candidate[swap + 1] !== brand[swap]) return false;
  // Identical letters transpose to the same string; that is not a typo.
  if (brand[swap] === brand[swap + 1]) return false;
  // Everything after the pair must match.
  return candidate.slice(swap + 2) === brand.slice(swap + 2);
}

/** One character of the brand is typed twice — "payppal", "netfllix". */
function isDoubledKey(candidate: string, brand: string): boolean {
  for (let i = 0; i < brand.length; i++) {
    const doubled = brand.slice(0, i) + brand[i] + brand.slice(i);
    if (doubled === candidate) return true;
  }
  return false;
}

/**
 * The first brand `label` appears to be a mistyping of, or null.
 *
 * `label` should be the REGISTRABLE label only — not the full hostname. A
 * hostname carries subdomains and a public suffix, and neither is where a
 * typosquat lives: "paypal.evil.tk" is an impersonation the substring rule
 * already catches, and matching it here as well would double-score it.
 */
export function findKeyboardTypo(
  label: string,
  brands: readonly string[],
): string | null {
  const candidate = label.toLowerCase();
  // Only a bare alphabetic label can be a finger slip. A label carrying hyphens
  // or digits ("paypal-secure", "paypa1") is a deliberate construction, and the
  // substring and homoglyph rules own those shapes.
  if (!/^[a-z]+$/.test(candidate)) return null;

  for (const brand of brands) {
    if (isKeyboardTypo(candidate, brand)) return brand;
  }
  return null;
}
