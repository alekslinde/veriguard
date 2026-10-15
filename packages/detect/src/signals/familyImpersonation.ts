// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// The "Hi Mum" family-impersonation script, as a value. Step 3's third
// composite (D2 / #251).
//
// A stranger opens as your child, explains away the unknown number, and asks
// for money — the most-reported scam text in AU, and it scored nothing at all
// before the rule existed.
//
// ## Why this one next, and what it surfaced
//
// Three gated composites remained after ClickFix and the splice rule. This is
// the first of them and the one with the least machinery around it: three
// halves, one row, no `scale`, no `supersedes`. What it did bring is the
// registry's first signal that needs the engine's *shared matcher* — the thing
// that decides whether a pack entry appears in a message — and that is a
// question the two earlier conversions never had to ask, because both match
// their own regexes against the raw text and consult no pack list at all.
//
// `mentions` is ~250 lines in `scamDetector.ts`, memoises per message, and is
// consulted by nearly every rule in the engine. A signal module cannot import it
// without a cycle. It arrives as `ctx.matches`, and the reasoning for a
// capability on the context rather than a `Reads`, a module move or a local copy
// is recorded on that field. The short version: restating the rule is the single
// most expensive pattern in this repo, and the one branch of it this gate
// happens to need today is a rule with a silent expiry date — every pretext
// entry is multi-word now, and a pack author adding a one-word entry would
// cross into a branch a copy never had.
//
// The anchor's other guard came out as `messageBody.ts`, for the reason
// `bareHost.ts` did: the gate reads the message *after* its wrappers, and that
// decision was built from measured counter-examples rather than a rule of thumb.
//
// ## Why the halves are gated, and why the pretext is required
//
// Every half is innocent alone: "mum" is ordinary address, "my phone broke" is
// ordinary news, and a family member really does sometimes ask you to transfer
// money. What is not ordinary is all three at once — an unrecognised sender
// accounting for why you don't recognise them, then asking for a payment in the
// same breath.
//
// The pretext is required, not merely one of two ways in. An earlier version
// accepted "any other signal present" as the third half, which sounds like
// corroboration and isn't: a single urgency word satisfied it, and urgency is
// ordinary in real family texts. "Mum, don't forget to pay the school fees of
// 250 before Friday, it's urgent!" scored 55 and called a parent's own child a
// scammer — the one false positive this rule must never produce, since it
// teaches the reader to distrust the verdict and the family member at once.
//
// What makes the script detectable is not that it is urgent; it is that the
// sender has to explain why they are contacting you from a number you don't
// recognise. A real family member never needs that sentence.
//
// Pinned as 96 cases in `__tests__/familyImpersonationPinned.test.ts`, written
// and committed first, and verified by injection: removing the email undiscount
// fails 17, lifting the merged body to 1.0 fails 3, a duplicate row fails 34,
// and dropping any one of the three halves fails 4, 6 or 12.

import { anchorText } from "../messageBody";
import { FAMILY_RELATION_TERMS, NEW_NUMBER_PRETEXT_PHRASES } from "../regions/base";
import type { Context, Hit, SignalDef } from "../signalRegistry";

/**
 * Opening words of the row.
 *
 * This used to be shared machinery: a handle `checkEmail` held so it could find
 * a row it had just discounted and lift it back by prefix match. With the weight
 * declared below, it is only a sentence a reader sees. Exported because it was
 * already exported from the entry point, and the conversion is meant to be
 * observationally identical at the API boundary as well as in the scores.
 */
export const FAMILY_IMPERSONATION_FLAG =
  'Reads as the "Hi Mum" family-impersonation script';

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

/**
 * Is a family relation term used to ADDRESS the reader?
 *
 * Two ways to be addressed, because neither alone covers the script.
 *
 *   · opening — the term starts the body, with or without a greeting. This is
 *     the classic shape and carries the cases with no comma at all: the corpus
 *     holds "mum send me 400 my phone broke" and "Hi Dad I dropped my phone".
 *   · vocative — the term is addressed anywhere in the message, marked by a
 *     following comma or exclamation after a sentence break.
 *
 * Position alone was scoring a live scam safe: "Just letting you know, I got a
 * new number after my phone broke. Mum, can you transfer $200 for the rego?"
 * has all three halves and went undetected purely because the term is not
 * first. That is also what the benign-padding metamorphic relation was
 * reporting — prepending prose moved the opener out of range.
 *
 * Both branches exclude the subject reading, so "Mum's phone broke" and "dad
 * said he'd transfer the 300" stay out. The remaining protection against an
 * ordinary family text is the pretext requirement, which is the half a real
 * family member never writes.
 */
function isAddressedAsFamily(anchor: string): boolean {
  return FAMILY_RELATION_TERMS.some((r) => {
    const opening = new RegExp(
      `^\\W{0,3}(?:(?:hi|hey|hello|good\\s+\\w+)[\\s,!.]*)?\\b${r}\\b(?!${RELATION_AS_SUBJECT})`,
      "i",
    );
    const vocative = new RegExp(
      `(?:^|[.!?]\\s+|\\n\\s*)(?:(?:hi|hey|hello|good\\s+\\w+)[\\s,!.]*)?\\b${r}\\b(?!${RELATION_AS_SUBJECT})\\s*[,!]`,
      "i",
    );
    return opening.test(anchor) || vocative.test(anchor);
  });
}

/**
 * Does the message ask for money?
 *
 * Five alternatives, because the script varies freely and dropping any one of
 * them loses a shape of it. The bare amount ("send me 400") is the live sample
 * the rule was written for: the script usually omits the currency symbol, and
 * requiring one missed it.
 *
 * Read against the ORIGINAL text rather than the anchor: this half is
 * positional-agnostic, and the inline version read the full text here while
 * anchoring only the relation term. Keeping that split is what makes the
 * conversion observationally identical — a money ask inside a forwarded
 * wrapper's quoted header still counted before and still counts now.
 */
function hasMoneyAsk(text: string): boolean {
  return (
    /\b(?:send|transfer|pay|lend|e-?transfer|etransfer|deposit|spot)\b[^.!?]{0,40}?(?:\b(?:me|us|it)\b[^.!?]{0,20})?[$£€]?\s?\d{2,6}\b/i.test(text) ||
    /[$£€]\s?\d{2,6}\b/.test(text) ||
    /\b(?:send|transfer|lend|pay)\s+(?:me|us)\b[^.!?]{0,30}\b(?:money|cash|funds)\b/i.test(text) ||
    /\b(?:can|could)\s+you\s+(?:please\s+)?(?:send|transfer|lend|pay)\b/i.test(text) ||
    /\bneed\s+(?:you\s+to\s+)?(?:send|transfer|pay|lend)\b/i.test(text)
  );
}

/** The reader-facing row. Wording unchanged by the conversion, deliberately. */
const FAMILY_IMPERSONATION_ROW =
  `${FAMILY_IMPERSONATION_FLAG} — an unexpected message opening as your child or parent, explaining away an unfamiliar number, and asking for money. The broken-phone or new-number line is the load-bearing part: it exists to explain why the voice and number are both wrong, and to stop you ringing the number you already have. Call your family member on their usual number before sending anything. If they don't pick up, ask them something only they could answer.`;

/**
 * The gate, at 45 on both channels it runs on.
 *
 * ## Why 45
 *
 * It lands on the `likely_scam` boundary on its own, which is deliberate and
 * unlike the +20 composites it sits among: those pair two innocent halves into a
 * suspicion, whereas this is a complete scam script end to end, and the whole
 * cost of the attack falls in the minutes before the victim thinks to ring the
 * real number. Warning quietly here would be the same as not warning. A genuine
 * family member is inconvenienced by one verification call; a victim is not made
 * whole.
 *
 * `weight: 45` as a bare number is the declaration that *replaces* this rule's
 * `UNDISCOUNTED_COMPOSITES` entry. The email body pass's 0.7 discount is right
 * for a keyword-frequency signal — a longer message has more room to use an
 * ordinary word — and wrong for a three-part gate, whose false-positive rate
 * does not rise with length. Discounted, 45 became 31: "a bit sus", for a
 * complete script, on a channel it arrives on as readily as SMS.
 *
 * ## Why these channels and no others
 *
 * `["sms", "email"]`, which is where the inline rule ran. Not `custom`, and
 * that is a fact about today's behaviour rather than a view about the channel:
 * `checkCustom` keeps its own keyword pass and never ran this gate, so the same
 * text pasted into the free-text box scores 0 from it where an SMS scores 45.
 * Widening it here would be a detection change wearing a conversion's clothes —
 * and an unmeasured one, since nothing has probed what this gate does to
 * free-text input. The pin locks the zeros, so whoever widens it does so
 * deliberately and sees it in that file's diff.
 *
 * ## Why `structural`
 *
 * It matches the shape of a script — an address, an excuse, an ask — not a claim
 * about which entities exist, so it does not go stale and needs no re-checking
 * against the world on a schedule. The two pack lists it consults are relation
 * terms and pretext phrases: vocabulary, not entities. That makes it `lexical`
 * in the failure-type sense — it encodes the language it was authored in, and a
 * speaker is what extends it — but `kind` asks a narrower question, whether the
 * inventory must re-verify the signal against reality, and the answer is no.
 *
 * ## Why one hit
 *
 * Three halves, one row. `registryScore` pays the declared weight per hit, so a
 * hit per satisfied half would score 135 for one script. There is no `scale`
 * either: the gate either fires or does not, and a message satisfying a half
 * twice is not better evidence.
 */
export const FAMILY_IMPERSONATION_SIGNALS: readonly SignalDef[] = [
  {
    id: "family.impersonation",
    // `original` and `body`: the anchor needs the text as submitted, because
    // stripping a forwarding wrapper and finding the start of a line are both
    // decisions about the text's shape, and `body` is lowercased and normalised.
    // The pretext half reads `body`, which is what the inline version matched
    // against and what `mentions` expects for a pack entry.
    //
    // `matches` is declared too, so the input gate — not this signal's own
    // body — is what keeps it from scoring on a context that cannot supply the
    // matcher. Undeclared, a caller omitting it got zero rows on a real scam
    // with every authoring check clean: coverage the inventory reported as real
    // and nothing could fire. See `Reads` in `signalRegistry.ts`.
    reads: ["original", "body", "matches"],
    channels: ["sms", "email"],
    weight: 45,
    kind: "structural",
    evaluate: (ctx: Context): Hit[] => {
      // No matcher, no match. Absent rather than stubbed, so a caller that has
      // not supplied it gets no row instead of a silent false — see the note on
      // `Context.matches`.
      //
      // Bound to a local rather than read through `ctx.matches!` below, so the
      // guard is what the type-checker relies on. With the non-null assertion
      // the guard was decoration: deleting the line type-checked perfectly, and
      // an `evaluate` that must not throw would have started throwing on any
      // context without a matcher. An assertion that makes its own guard
      // deletable is the "a rule stated in a comment" shape in type form.
      const matches = ctx.matches;
      if (!matches) return [];
      const anchor = anchorText(ctx.original, ctx.channel);
      const hasNumberPretext = NEW_NUMBER_PRETEXT_PHRASES.some((p) =>
        matches(ctx.body, p),
      );
      const fires =
        isAddressedAsFamily(anchor) && hasMoneyAsk(ctx.original) && hasNumberPretext;
      return fires ? [{ text: FAMILY_IMPERSONATION_ROW, source: "message" }] : [];
    },
  },
];
