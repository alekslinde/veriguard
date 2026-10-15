// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// The task-scam payment gate, as a value. Step 3's fourth composite
// (D2 / #226 / Scamwatch alert, 7 Aug 2026).
//
// After a few real payouts the victim is told their earnings are locked behind a
// payment of their own — "complete the task to withdraw", "your account is
// frozen, top up to continue". That inverts the employment relationship, and no
// employer has ever required payment to release wages. The recruitment half of
// the funnel is a separate rule at 25; this is the step that takes the money, and
// it measured safe (0) before the rule existed.
//
// ## Why this one next, and what it surfaced
//
// Two gated composites remained after ClickFix, the splice rule and the family
// gate. This is the one with the least around it: no pack list, no shared
// matcher, no `scale`, no `supersedes` — four regexes over the raw text behind one
// `||`. It was taken next for exactly that reason. The family gate's conversion
// decided how an outside capability reaches a signal, and that answer is now
// settled; taking the capability-free composite next means the remaining one
// (messaging hijack) is the only place a new question can come from.
//
// What it did surface is an asymmetry in the money-noun group, and the first
// note written here got it wrong in a way worth recording. The group ends
// `\b(earnings?|…|\$\d)`, and a word boundary before `$` holds only where `$`
// follows a word CHARACTER. From that it is easy to conclude the alternative can
// never match — ` $5` does not — and that conclusion was written down, pinned
// against a bare `$900`, and was false: `AU$500`, `US$500` and `NZ$300` all
// reach it, because the currency prefix supplies the word character. In an
// AU-focused detector `AU$500` is the ordinary written form, so the alternative
// is not merely live but commonly so.
//
// Both sides are now pinned, which is the actual lesson rather than the regex
// trivia. **A half-pinned asymmetry reads as a rule**: one fixture showing the
// bare form silent was taken as the alternative's whole behaviour, and that note
// would have invited a later author to delete a branch that is scoring. The
// generalisable version: when a boundary condition surprises you, find the input
// on the OTHER side of it before writing down what it means — an unreachable
// branch and a branch reachable only from inputs you did not try look identical
// from one fixture.
//
// The regexes are carried across from the entry point unchanged either way, so
// no score moved; what was wrong was the reasoning about them and the coverage
// it claimed.
//
// ## Why 40, and why it declines the email discount
//
// Weighted to clear `suspicious` (20) comfortably on its own without reaching
// `likely_scam` (45) unaided. It sits between the two deliberately: the demand is
// unambiguous — there is no innocent reading of "pay to be paid" — but the rule
// fires on a single sentence, and the script's other halves (the recruitment
// opener, the urgency, the payment rails) each add their own rows when present,
// which is how a real instance of this script reaches a scam verdict.
//
// `weight: 40` as a bare number is the declaration that *replaces* this rule's
// `UNDISCOUNTED_COMPOSITES` entry. The email body pass's 0.7 discount is right
// for a keyword-frequency signal — a longer message has more room to use an
// ordinary word — and wrong for a multi-part gate, whose false-positive rate does
// not rise with length. Discounted, 40 becomes 28, under the 30 the rule needs to
// carry a message with nothing else in it past `suspicious`; the same arithmetic
// cut ClickFix's 50 to 35, the splice rule's 25 to 17 and the family gate's 45 to
// 31, and each time the pin caught it rather than the knowing.
//
// ## Why one hit
//
// Four branches, one row. `registryScore` pays the declared weight per hit, so a
// hit per matching branch would score a message carrying two payment demands at
// 80 — and that is the ordinary shape rather than a contrived one, because the
// script repeats the demand as the victim hesitates. The gate asks one question
// ("is the victim being charged to be paid"), and a message asking twice is not
// better evidence of it. No `scale` either, for the same reason.
//
// ## Why `original`
//
// The branches are case-insensitive regexes over the text as submitted, which is
// what the inline rule matched against. `body` is lowercased and normalised, and
// matching there would be a different rule: normalisation folds the characters
// these patterns step over in their bounded gaps. Keeping `original` is what
// makes the conversion observationally identical rather than nearly so.

import type { Context, Hit, SignalDef } from "../signalRegistry";

/**
 * Opening words of the row.
 *
 * This used to be shared machinery: a handle `checkEmail` held so it could find a
 * row it had just discounted and lift it back by prefix match. With the weight
 * declared below, it is only a sentence a reader sees. Exported for the tests
 * that assert the wording.
 */
export const TASK_PAYMENT_FLAG = "Earnings held behind a task you must pay to complete";

/**
 * Complete a task, then withdraw what you are owed.
 *
 * "receive" is deliberately absent from the outcome verbs, and the outcome must
 * name money. "Complete the task to receive your certificate" is ordinary
 * compliance-training mail and measured 40 against a looser form, telling the
 * reader their money was gone.
 *
 * The trailing `\$\d` alternative matches a currency-PREFIXED amount (`AU$500`)
 * and not a bare one (`$500`), because the word boundary needs a word character
 * before the symbol. Pinned on both sides — see the note at the top of this file
 * for why one side alone was read as the alternative being dead.
 */
const COMPLETE_THEN_WITHDRAW =
  /\b(complete|finish|unlock|activate)\b[^.!?]{0,30}\btasks?\b[^.!?]{0,30}\b(to|before|and)\b[^.!?]{0,20}\b(withdraw|withdrawal|release|unlock|claim)\b[^.!?]{0,30}\b(earnings?|commission|balance|funds|payment|money|salary|wages?|\$\d)/i;

/** Withdraw what you are owed, by paying first. */
const WITHDRAW_THEN_PAY =
  /\b(withdraw|release|unlock)\b[^.!?]{0,40}\b(earnings|commission|balance|funds)\b[^.!?]{0,40}\b(complete|finish|deposit|top\s?up|recharge|prepay|pre-?fund)\b/i;

/** Pay, in order to unlock. */
const PAY_THEN_UNLOCK =
  /\b(deposit|top\s?up|recharge|prepay|pre-?fund)\b[^.!?]{0,40}\b(to|before)\b[^.!?]{0,30}\b(unlock|withdraw|release|continue)\b[^.!?]{0,30}\b(earnings|commission|tasks?|balance|funds)\b/i;

/**
 * "You have unfinished tasks" — the scam's own phrasing, which is also exactly
 * what a project tracker sends.
 *
 * "Reminder from Asana: you have 3 unfinished tasks" scored 40 while this branch
 * stood alone. Unlike the three above it carries no payment half of its own, so
 * it needs the money context the others state outright.
 */
const UNFINISHED_TASKS = /\byou\s+have\s+(?:\d+\s+)?unfinished\s+tasks?\b/i;

/**
 * The money context branch 4 requires.
 *
 * **Scoped to the whole text, where the other three bound their halves within a
 * sentence** (`[^.!?]`). That asymmetry is deliberate and is pinned: "Your
 * account is frozen. You have unfinished tasks." fires, while branch 1's halves
 * split across a sentence boundary do not. Unifying the two scopings in the name
 * of tidiness would move one of them, which is a detection change wearing a
 * conversion's clothes.
 */
const MONEY_CONTEXT =
  /\b(withdraw|withdrawal|earnings?|commission|balance|deposit|top\s?up|recharge|unlock|frozen|payout)\b/i;

/** The reader-facing row. Wording unchanged by the conversion, deliberately. */
const TASK_PAYMENT_ROW =
  `${TASK_PAYMENT_FLAG} — this is the moment a task-scam takes the money. A real employer never asks you to deposit funds to release your own wages, and the small payouts that came before exist to make this step feel safe. Anything sent here is gone, and the 'balance' on screen is not real.`;

/**
 * The gate, at 40 on both channels it runs on.
 *
 * ## Why these channels and no others
 *
 * `["sms", "email"]`, which is where the inline rule ran. Not `custom`, and that
 * is a fact about today's behaviour rather than a view about the channel:
 * `checkCustom` keeps its own keyword pass and never ran this gate, so the same
 * text pasted into the free-text box scores 0 from it where an SMS scores 40.
 * Widening it here would be a detection change wearing a conversion's clothes —
 * and an unmeasured one, since nothing has probed what this gate does to
 * free-text input. The pin locks the zeros, so whoever widens it does so
 * deliberately and sees it in that file's diff.
 *
 * The declaration is enforced in both directions: narrowing it fails the pin
 * loudly, and widening it is caught structurally by the channel-call check,
 * because what decides where a signal runs is which entry point calls its helper
 * and a declaration nothing cross-checks is half a rule.
 *
 * ## Why `structural`
 *
 * It matches the shape of a demand — pay, in order to be paid — not a claim about
 * which entities exist, so it does not go stale and needs no re-checking against
 * the world on a schedule. It consults no pack list at all. That makes it
 * `lexical` in the failure-type sense, since it encodes the English it was
 * authored in and a speaker is what extends it, but `kind` asks the narrower
 * question of whether the inventory must re-verify the signal against reality,
 * and the answer is no.
 */
export const TASK_PAYMENT_SIGNALS: readonly SignalDef[] = [
  {
    id: "task.payment",
    reads: ["original"],
    channels: ["sms", "email"],
    weight: 40,
    kind: "structural",
    evaluate: (ctx: Context): Hit[] => {
      const text = ctx.original;
      const fires =
        COMPLETE_THEN_WITHDRAW.test(text) ||
        WITHDRAW_THEN_PAY.test(text) ||
        PAY_THEN_UNLOCK.test(text) ||
        (UNFINISHED_TASKS.test(text) && MONEY_CONTEXT.test(text));
      // One hit for the gate, not one per matching branch — see the note at the
      // top of this file. Four branches asking one question.
      return fires ? [{ text: TASK_PAYMENT_ROW, source: "message" }] : [];
    },
  },
];
