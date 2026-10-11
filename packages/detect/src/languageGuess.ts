// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// A minimal, dependency-free signal for "can the keyword layer read this at
// all" — not a language identifier in the general sense, and it must never be
// mistaken for one.
//
// Every keyword list in every region pack is English (see LanguageCode's
// comment in regions/types.ts: the `languages` field names what a region's
// readers write in, never what the engine can score). A message in any other
// language scores low not because it is safe, but because nothing in it can
// match an English list. That gap was measured directly: non-English text
// returns 0/"unknown" with no rule to blame it on, and the roadmap names the
// fix as letting the coverage tier express a language gap separately from
// depth — which needs something that knows what language the text is in.
//
// This supplies only that: a coarse "this doesn't read as English" signal fed
// to downgradeForCoverage as a SECOND reason to withhold "safe", never as a
// detection. It cannot add a point and cannot accuse anyone of anything — its
// only effect is to turn a confident clean result into "unknown", which is
// strictly more honest than the confident pass the engine would otherwise
// give a message it cannot read a word of.
//
// The asymmetry that shapes every threshold below: a false "not English" on
// real English text suppresses a working verdict, which is the one regression
// that matters. A false "English" on genuinely foreign text just leaves the
// existing gap exactly where it already was. So every guard here is biased
// hard toward "assume English" — short text, mixed text and borderline text
// all fall back to "can't tell", which downgradeForCoverage treats as nothing
// to add.

/**
 * The length floor below which there is not enough text to judge by — used
 * both ways. Below this many Latin letters, a stopword ratio is noise: a
 * handful of words can't be scored against a list with any confidence. Below
 * this many non-Latin script characters, the opposite risk applies: a short
 * foreign-looking fragment (a name, a brand, a greeting) is not the same
 * claim as a message written in that language. SMS is commonly under 160
 * characters and language identifiers are known to degrade badly below
 * roughly this length, so both directions return "can't tell" under it
 * rather than risk misjudging a short, perfectly ordinary message.
 */
const MIN_LATIN_CHARS = 30;

/**
 * The fraction of words that must match ENGLISH_STOPWORDS before text counts
 * as English. Deliberately low: scam SMS is short, not grammatical ("verify
 * now to avoid suspension" has four stopword-free content words and one hit
 * — "to"), and a strict ratio would misjudge exactly the terse phrasing this
 * engine spends the rest of its rules detecting. The floor exists only to
 * separate "a few English function words turned up" from "none did".
 */
const MIN_STOPWORD_RATIO = 0.08;

/**
 * High-frequency English function words — articles, pronouns, prepositions,
 * auxiliaries — chosen because they appear in almost any English sentence
 * regardless of topic or register, including terse scam phrasing, and because
 * they have no reason to appear by coincidence in running text from another
 * language. This is a closed, inspectable list rather than a statistical
 * model: every word in it is nameable, and so is every miss.
 */
const ENGLISH_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "so", "to", "of", "in", "on",
  "at", "by", "for", "with", "from", "up", "out", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did", "will",
  "would", "can", "could", "should", "must", "not", "no", "yes", "you",
  "your", "yours", "we", "our", "i", "me", "my", "it", "its", "this", "that",
  "these", "those", "please", "now", "as", "about", "into", "than", "then",
  "just", "click", "link", "account", "need",
]);

/**
 * Latin-script letters only — the alphabet every ENGLISH_STOPWORDS entry is
 * written in. Counted separately from total length because a message can be
 * mostly digits, punctuation or emoji and still be unambiguously English
 * ("Your parcel: $4.99 due, pay now: bit.ly/x"), and because non-Latin script
 * must not dilute this count into a false MIN_LATIN_CHARS pass — that would
 * let a wholly Cyrillic message borrow length from a short Latin fragment.
 */
const LATIN_LETTERS = /[a-zA-Z]/g;

/** A script outside Latin, numerals and common punctuation — evidence this is not English, independent of word frequency. */
const NON_LATIN_SCRIPT = /[^\u0000-\u024F\s0-9!-/:-@[-`{-~]/;

/**
 * Whether `text` gives enough evidence to say it is probably not English —
 * never whether it IS some other specific language, and never a basis to add
 * points. See the module comment for why every threshold here leans toward
 * "can't tell" rather than "not English".
 *
 * Intended caller: downgradeForCoverage, as a second, independent reason to
 * withhold a "safe" verdict — on the same honesty logic as RegionCoverage,
 * applied to an axis coverage does not see. A `false` result means "treat as
 * English" (including every case this function is simply unsure about), not
 * "confirmed English".
 */
export function looksNonEnglish(text: string): boolean {
  const latinChars = text.match(LATIN_LETTERS)?.length ?? 0;
  const nonLatinHits = text.match(new RegExp(NON_LATIN_SCRIPT, "g"))?.length ?? 0;

  // A message built mostly from a non-Latin script is the clearest case, and
  // needs no stopword ratio: Cyrillic, CJK, Arabic, Devanagari text with a
  // Latin brand name or URL spliced in is still not English prose. Checked
  // ahead of MIN_LATIN_CHARS deliberately — a wholly non-Latin message has no
  // Latin characters to clear that floor with, so gating on it first would
  // make every unambiguous case here fall through as "too short to tell".
  if (nonLatinHits >= MIN_LATIN_CHARS && nonLatinHits > latinChars) return true;

  if (latinChars < MIN_LATIN_CHARS) return false;

  const words = text
    .toLowerCase()
    .split(/[^a-z']+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return false;

  const stopwordHits = words.filter((w) => ENGLISH_STOPWORDS.has(w)).length;
  return stopwordHits / words.length < MIN_STOPWORD_RATIO;
}
