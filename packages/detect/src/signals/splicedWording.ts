// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// Homoglyph splicing in the message body, as a value. Step 3's second composite.
//
// The keyword lists are matched as literal Latin text, so one Cyrillic character
// inside a word removes that word from detection while rendering identically to
// the reader. Measured before the rule existed: five of seven sampled scam
// messages evaded, three of them dropping to a score of 0.
//
// ## Why this one next, and what it was expected to surface
//
// ClickFix went first as the smallest composite. This one is the smallest of
// what is left and was chosen for a different reason: it is the composite whose
// scoring shape does NOT fit the registry's default. The other three remaining
// composites are gates that either fire or do not, so a hit maps one-to-one onto
// a row. This rule finds a *set* — every spliced word in the message — and
// scores the set once, naming up to three of them in one sentence.
//
// `registryScore` scores each hit at the declared weight, so the obvious
// conversion (a hit per spliced word) turns a three-word splice into 75 points.
// That is not a hypothetical: a real evasion splices every keyword it needs to
// hide, so the multi-word case is the ordinary one and the single-word case is
// the exception. The `scale` field exists for a signal whose strength varies
// with what it found, and this is the opposite — a signal whose strength is
// deliberately flat across however much it found, because it cannot see WHAT was
// evaded. So it returns **one hit**, and the word list is part of the hit's
// prose rather than its arithmetic. Pinned as 81 cases in
// `__tests__/splicedWordingPinned.test.ts`, written and committed first.
//
// ## Why the weight is flat, and why it is 25
//
// Weighted to reach `suspicious` alone but not `likely_scam`. The splice is
// deliberate — there is no innocent reason to write one word in two scripts —
// but this rule cannot see what the splice was hiding, so it must not deliver
// the verdict the keyword layer would have had to earn. It restores a floor, not
// a conviction. Two spliced words are not stronger evidence of that than one.
//
// `weight: 25` as a bare number is the declaration that *replaces* this rule's
// `UNDISCOUNTED_COMPOSITES` entry. The email body pass's 0.7 discount is right
// for a keyword-frequency signal — a longer message has more room to use an
// ordinary word — and wrong here: script-mixing inside a word does not become
// likelier in a longer email. Discounted, 25 became 17, under the 20 this rule
// is pitched at, so an email carrying the evasion read "safe" while the identical
// SMS read "suspicious" — on the channel where homoglyph phishing is commonest.
//
// ## What it reads, and the overlap it must not have
//
// `original`, not `body`. The whole rule is about character identity, and
// normalisation is what destroys it: by the time a caller has folded confusables
// to close other evasions, there is no splice left to find.
//
// The overlap with the hostname rule is the reason `reads` exists as a field.
// This rule and `hasMixedScriptHost` were written as counterparts — prose and
// host — and double-scored a single Cyrillic character, because the word
// splitter shredded a URL into bare labels and handed the same token to both.
// The overlap was in neither rule; it was in what they shared. The fix is the
// strip, which removes everything the URL checker owns before a word is read,
// and it is a *call* to the bare-host guard rather than a local approximation of
// it — see `bareHost.ts` for the two times approximating it was wrong.

import { stripUrlOwnedText } from "../bareHost";
import type { Hit, SignalDef } from "../signalRegistry";
import { mixedScriptWords } from "../urlSanitizer";

/**
 * The opening words of the row.
 *
 * This used to be shared machinery: a handle `checkEmail` held so it could find
 * a row it had just discounted and lift it back by prefix match. With the weight
 * declared below, it is only a sentence a reader sees. Exported for the tests
 * that assert the wording.
 */
export const SPLICED_WORDING_FLAG = "Disguised wording";

/** How many spliced words the row names before it stops listing them. */
const NAMED_LIMIT = 3;

/**
 * One row for the whole message, naming up to three spliced words.
 *
 * Wording unchanged by the conversion, deliberately: one change at a time is
 * what makes "observationally identical" checkable. The singular/plural
 * agreement is derived from the count, which makes it the one piece of the
 * sentence a conversion can get wrong without changing a number — so the pin
 * asserts it.
 */
function spliceRow(spliced: string[]): string {
  const many = spliced.length > 1;
  return `${SPLICED_WORDING_FLAG} — ${many ? "the words" : "the word"} "${spliced.slice(0, NAMED_LIMIT).join('", "')}" mix${many ? "" : "es"} ordinary letters with Cyrillic or Greek lookalikes. It reads normally but is written to slip past filters that check the wording`;
}

/**
 * The splice rule, at 25 on every channel it runs on.
 *
 * `structural`: it matches the shape of a character, not a claim about which
 * entities exist, so it cannot go stale and needs no re-checking against the
 * world on a schedule. This is the failure type that generalises across every
 * language, because it operates below meaning — which is also why it is the one
 * kind of rule that is safe to apply in a language nobody here reads.
 *
 * Not on the `url` or `phone` channels. A hostname's splicing is
 * `hasMixedScriptHost`'s to score — that is the counterpart this rule must not
 * double with — and a phone number is not prose.
 */
export const SPLICED_WORDING_SIGNALS: readonly SignalDef[] = [
  {
    id: "splice.wording",
    reads: ["original"],
    channels: ["sms", "email", "custom"],
    weight: 25,
    kind: "structural",
    evaluate: (ctx): Hit[] => {
      const spliced = mixedScriptWords(ctx.original, (t) =>
        stripUrlOwnedText(t, ctx.pack.suspiciousTlds),
      );
      // One hit for the set, not one per word — see the note at the top of this
      // file. An empty set is no hit at all, which is what keeps the signal out
      // of the evidence list rather than in it at zero points.
      return spliced.length === 0 ? [] : [{ text: spliceRow(spliced), source: "message" }];
    },
  },
];
