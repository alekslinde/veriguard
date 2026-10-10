// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// A minimal English stemmer, built to close three specific leaks in the
// mentions() suffix allowance (scamDetector.ts) rather than as a general
// morphological analyser.
//
// mentions() already tolerates "(?:s|es|ed|d|ing|ly)?" after a long entry —
// a hand-rolled, six-suffix stemmer, candid about why in its own comment: a
// collision is almost always a PREFIX one, so the start is anchored hard, but
// refusing a trailing inflection threw away real hits (measured as a live
// regression in bareHostname.test.ts). That regex has three failure modes a
// real stemmer does not:
//
//   - irregulars:        pay/paid, freeze/frozen — not a suffix operation
//   - -y -> -ies:        verify/verifies         — deletes a stem letter
//   - consonant doubling: refer/referred, ship/shipped — inserts one
//
// Every one is live scam vocabulary that currently misses. This module closes
// all three with a stem-equality comparison, used as a SECOND OPINION behind
// a flag (STEM_FALLBACK_ENABLED) — never a replacement for the regex, and
// never consulted unless the regex already failed to match. See the call site
// in mentions() for why: stemming is more aggressive than a fixed suffix list
// and can introduce new false positives, so it earns its place only by
// reading the eval ratchet's flip list, not by assertion.
//
// Deliberately NOT a general stemmer and NOT Porter/Snowball. The off-the-
// shelf option (snowball-stemmers) bundles all fifteen-odd supported
// languages behind one dispatch function with no way to import just English,
// which a bundler cannot tree-shake — 848KB of source for one language's
// worth of use, against an engine that is currently a few hundred KB in
// total. Hand-rolling the narrow slice this project actually needs keeps the
// bundle honest, which is also why this file stays English-only: applying it
// to any other language is the entropy trap the roadmap withdrew once
// already (see the sibling note on looksNonEnglish in languageGuess.ts) —
// gate every caller on English before trusting this.

/**
 * Closed table of English irregular verbs whose past/participle forms are
 * not a suffix of the base word at all — "pay"/"paid" share no stem under
 * any strip-a-suffix rule, "freeze"/"frozen" change their vowel. A general
 * stemmer cannot derive these; they must be named.
 *
 * Scoped to verbs that plausibly appear in scam or legitimate wording near
 * the pack entries this exists for (claim, pay, send, give, take…), not an
 * exhaustive list of English irregulars — anything missing here simply falls
 * through to "no stem match", the same as before this module existed.
 */
const IRREGULAR_FORMS: Record<string, string> = {
  paid: "pay",
  froze: "freeze",
  frozen: "freeze",
  sent: "send",
  gave: "give",
  given: "give",
  took: "take",
  taken: "take",
  held: "hold",
  told: "tell",
  sold: "sell",
  bought: "buy",
  caught: "catch",
  spent: "spend",
  lost: "lose",
  stolen: "steal",
  stole: "steal",
  won: "win",
  sought: "seek",
};

/**
 * Reduces a word to a comparable stem, folding the three gaps named above —
 * but ONLY those three, plus the irregular table. Not a full Porter
 * algorithm: no step for "-ational" -> "-ate" or the other multi-stage
 * suffix-replacement rules, because mentions()'s existing INFLECTION regex
 * already carries the common case (s/es/ed/d/ing/ly) and this only needs to
 * reach what that regex cannot.
 *
 * Order matters: the irregular lookup runs first because "paid" would
 * otherwise fall through every suffix rule unchanged (it ends in neither a
 * doubled consonant nor "-ies"), and a word that IS irregular must never also
 * be run through the mechanical rules below it.
 */
export function stem(word: string): string {
  const lower = word.toLowerCase();
  const irregular = IRREGULAR_FORMS[lower];
  if (irregular) return irregular;

  // verify/verifies, apply/applies: trailing "-ies" on a stem that would end
  // in a consonant + y. Checked before "-ing"/"-ed" doubling, because "-ies"
  // is unambiguous (no English verb both doubles a consonant AND takes -ies)
  // and must not be mistaken for a doubled-consonant "-es" (e.g. none exists,
  // but keeping the check order explicit is cheaper than reasoning about it).
  if (/[^aeiou]ies$/.test(lower)) return lower.slice(0, -3) + "y";

  // refer/referred, ship/shipped, ship/shipping: a doubled final consonant
  // immediately before -ed or -ing is the doubling rule, not two consonants
  // that already belong to the stem. The test is the classic Porter
  // condition: the candidate stem's last three letters must be
  // consonant-vowel-consonant (CVC) — "ship" ends "-hip" and "refer" ends
  // "-fer", both CVC, so both qualify.
  //
  // "l" is excluded from the doubled letter itself, not from the CVC test:
  // "spell"/"spelled" passes CVC on "-pel" exactly like "ship" passes it on
  // "-hip", so CVC alone cannot tell a real double-L word from an inflected
  // one. American spelling does not double a final L before -ed/-ing the way
  // it doubles P, R, T and the rest ("travel" -> "traveling", not
  // "travelling"), so a doubled L in the input is already part of the base
  // word rather than something inflection added, and undoing it would turn
  // "spelled" into "spel" — one L short of a real word.
  const doubled = /([a-z])\1(?:ed|ing)$/.exec(lower);
  if (doubled && doubled[1] !== "l") {
    const candidateStem = lower.slice(0, doubled.index + 1);
    if (/[^aeiou][aeiou][^aeiou]$/.test(candidateStem)) return candidateStem;
  }

  return lower;
}

/**
 * Whether `needle` and a word found in `text` share a stem — the "second
 * opinion" mentions() falls back to only when its own regex already missed.
 * Not a search primitive: callers supply the specific candidate word already
 * isolated from the surrounding text (mentions() has one from its own
 * tokenisation), because stemming every word in a message against every
 * pack entry is the wrong shape for a check that runs per-entry already.
 */
export function sameStem(needle: string, candidate: string): boolean {
  return stem(needle) === stem(candidate);
}
