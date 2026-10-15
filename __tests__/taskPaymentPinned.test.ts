// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkEmail, checkCustom } from "@veriguard/detect/scamDetector";

// Every score the task-payment gate produces today, pinned before its scoring
// moves into the signal registry.
//
// Committed in its own change, ahead of the conversion, for the reason
// `checkPhonePinned`, `clickFixPinned`, `splicedWordingPinned` and
// `familyImpersonationPinned` were: a characterisation test answers "did this
// change behaviour", a test written from intent answers "is this what I meant",
// and only the first is a refactor's safety net. Every expectation below was read
// off the running engine across all three message channels, not derived from what
// the code ought to do — including the two places where what it does today is
// not what the code reads as doing. Both of those are asymmetries a reader will
// guess wrong from one side: branch 4's money context is scoped to the whole text
// where branches 1-3 bound theirs within a sentence, and the money noun's
// currency alternative is reachable from `AU$500` but not from `$500`. Each is
// pinned on both sides, because a half-pinned asymmetry is what produced the
// wrong note this file first carried about the second one.
//
// Four properties this file exists to hold, each a way the conversion can go
// wrong while every decision still looks right:
//
//   · **Exactly 40, on email as well as SMS.** The row sits in
//     `UNDISCOUNTED_COMPOSITES` today, exempted from the email body pass's 0.7
//     by string-prefix match. All three earlier conversions hit the same defect
//     through that merge — ClickFix's declared 50 arriving as 35, the splice
//     rule's 25 as 17, the family gate's 45 as 31 — and every time it was the pin
//     that caught it, not the knowing. Discounted, 40 becomes 28, which is below
//     the 30 this rule needs to carry a message with nothing else in it past
//     `suspicious` on its own.
//   · **The surrounding body is still discounted.** The inverse error, and the
//     one a pin of the row alone cannot see: lifting the whole email body to 1.0
//     would hold this row at 40 and pass. The cases here carrying live keywords
//     alongside the gate are pinned at a *lower* email total than their SMS total
//     while their gate row is not — 52/48, 65/57, 75/64.
//   · **One row, not one per branch.** The gate is four alternatives behind one
//     `||`, and it scores once however many of them match. In the registry a
//     signal returns an array of hits and each hit is scored at the declared
//     weight, so a conversion returning a hit per matching branch would score a
//     message carrying two payment demands at 80. "two demands in one message"
//     below is that case, and it is the ordinary shape rather than a contrived
//     one: the script repeats the demand as the victim hesitates.
//   · **Silent on `custom`, and that is today's behaviour rather than a view
//     about the channel.** `checkCustom` keeps its own keyword pass and never ran
//     this gate, so the same text pasted into the free-text box scores 0 from it
//     where an SMS scores 40. Pinned as it stands, so widening it later is a
//     decision someone makes and sees in this file's diff — the conversion is not
//     the place to make it.
//
// `taskScam.test.ts` already covers what the gate decides. It asserts verdicts
// and inequalities, which is the gap this file fills: the conversion can preserve
// every decision and every verdict and still change what each one is worth.

/** How a reader identifies the row. Deliberately the prose, not an id. */
const FLAG = "Earnings held behind a task you must pay to complete";

const asEmail = (body: string) =>
  `From: Payroll <hr.team.9912@gmail.com>\nSubject: hi\n\n${body}`;

/**
 * One case per distinguishable path through the gate.
 *
 * `fires` is whether the gate's own row is present, and the three scores are the
 * whole message's rather than the signal's — a conversion that reproduces the row
 * and changes what fires around it is still a behaviour change, and the totals
 * are where that shows up.
 */
const cases: Array<{
  label: string;
  text: string;
  fires: boolean;
  sms: number;
  email: number;
  custom: number;
}> = [
  // ── Branch 1: complete a task, then withdraw what you are owed ────────────
  //
  // The branch with the most machinery in it: an action verb, the task noun, a
  // connective, an outcome verb and a money noun, each within a bounded gap and
  // none crossing a sentence boundary. One case per money noun, because the noun
  // list is the part a conversion can trim without failing anything above.
  {
    label: "complete task to withdraw earnings",
    text: "Complete the task to withdraw your earnings today.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "unlock task to release balance",
    text: "Unlock the task and release your balance now.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "money noun: salary",
    text: "Complete the task to release your salary.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "money noun: money",
    text: "Complete the task and withdraw your money.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "money noun: payment",
    text: "Unlock the tasks to release your payment.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  // Two of the cases carrying live keywords alongside the gate. Their SMS totals
  // are 52 and 65 against email totals of 48 and 57, so the body around the row
  // is still discounted — which is what separates "the signal declares 40" from
  // "the email path stopped discounting anything".
  {
    label: "money noun: commission, with reward vocabulary",
    text: "Finish your tasks before you can claim your commission.",
    fires: true,
    sms: 52,
    email: 48,
    custom: 8,
  },
  {
    label: "money noun: wages, with reward vocabulary",
    text: "Finish the tasks to claim your wages.",
    fires: true,
    sms: 52,
    email: 48,
    custom: 8,
  },
  {
    label: "the recruitment half alongside the gate",
    text: "Simple tasks, no experience required. Complete the task to withdraw your earnings.",
    fires: true,
    sms: 65,
    email: 57,
    custom: 10,
  },
  {
    label: "a sender-ID override alongside the gate",
    text: "Complete the task to withdraw your earnings. Our SMS may appear as unverified.",
    fires: true,
    sms: 75,
    email: 64,
    custom: 10,
  },

  // ── Branch 2: withdraw what you are owed, by paying first ────────────────
  {
    label: "withdraw earnings, deposit first",
    text: "To withdraw your earnings you must first deposit 200.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "release commission by topping up",
    text: "Release your commission by completing a top up of $50.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "unlock balance by recharging",
    text: "Unlock your balance — recharge the account to continue.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "withdraw funds after prepaying",
    text: "Withdraw your funds after you prepay the service fee.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },

  // ── Branch 3: pay, in order to unlock ────────────────────────────────────
  {
    label: "deposit to unlock earnings",
    text: "Deposit 100 to unlock your earnings.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "top up before withdrawing commission",
    text: "Top up before you withdraw your commission.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "recharge to continue tasks",
    text: "Recharge now to continue your tasks.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "pre-fund to release balance",
    text: "Pre-fund the wallet to release your balance.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },

  // ── Branch 4: "you have unfinished tasks", plus money context ────────────
  //
  // The one branch carrying no payment half of its own, so it needs the money
  // context the other three state outright. Both halves get a negative below:
  // the phrase without the context, and — through the three branches above — the
  // context without the phrase.
  {
    label: "unfinished tasks, withdrawal on hold",
    text: "You have 3 unfinished tasks. Your withdrawal is on hold.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "unfinished tasks, account frozen",
    text: "You have unfinished tasks and your account is frozen.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  {
    label: "unfinished tasks, payout pending",
    text: "You have unfinished tasks — payout pending.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },
  // The money context is scoped to the whole text here, not to a clause, which
  // is what this case pins: the frozen-account sentence and the unfinished-tasks
  // sentence are separate sentences and the branch still fires. Branch 1 is the
  // opposite (see "a sentence boundary separates the halves"), so a conversion
  // that unified the two scopings would move one of them.
  {
    label: "unfinished tasks, money context in another sentence",
    text: "Your account is frozen. You have unfinished tasks.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },

  // ── Two demands in one message ───────────────────────────────────────────
  //
  // This is the case that separates "one row for the gate" from "a row per
  // matching branch", and it passes a score assertion either way on every case
  // above. Branch 1 and branch 3 both match here; the result carries one row at
  // 40, not two at 40 each.
  {
    label: "two demands in one message",
    text: "Complete the task to withdraw your earnings. Deposit 100 to unlock your commission.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },

  // ── A doubled space inside the matched span ──────────────────────────────
  //
  // Pinned because this gate reads the raw text with its own regexes rather than
  // going through the engine's shared pack-entry matcher, which is what relaxes
  // whitespace for a pack entry. The bounded `[^.!?]{0,30}` gaps absorb the extra
  // space here, so the gate survives it — but it survives it for a different
  // reason than the family gate does, and a conversion that reached for the
  // matcher would be changing the rule rather than moving it.
  {
    label: "a doubled space inside the matched span",
    text: "Complete the  task to withdraw your  earnings today.",
    fires: true,
    sms: 40,
    email: 40,
    custom: 10,
  },

  // ── Silent: branch 1 with exactly one part missing ──────────────────────
  //
  // One negative per part, because a gate assembled from five parts is otherwise
  // pinned against loosening only in the directions the positives happen to
  // cover. Each of these carries every part but one.
  {
    label: "no money noun: an unlocked stage is not a payment",
    text: "Complete the task to unlock the next stage.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "'receive' is not an outcome verb",
    text: "Complete the task to receive your earnings.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  // The false positive the outcome-verb list was narrowed for. Ordinary
  // compliance-training mail measured 40 against a looser form, telling the
  // reader their money was gone.
  {
    label: "complete the task to receive your certificate",
    text: "Complete the task to receive your certificate.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "a sentence boundary separates the halves",
    text: "Complete the task. To withdraw your earnings call us.",
    fires: false,
    sms: 20,
    email: 14,
    custom: 10,
  },
  // Branch 1 has four bounded gaps and every one of them refuses to cross a
  // sentence boundary. These two isolate the FIRST gap — between the action verb
  // and the task noun — which the case above does not reach: loosening only that
  // gap failed nothing while loosening all four failed two cases, so the guard
  // was real and unpinned. Each of these is an ordinary two-sentence message
  // whose words pair into the branch only if the first gap is allowed to span
  // them.
  {
    label: "an unrelated instruction in the sentence before the task noun",
    text: "Please complete this. Your tasks must be done to withdraw your earnings.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "an exclamation before the task noun",
    text: "Activate now! The tasks need doing to claim your commission.",
    fires: false,
    sms: 12,
    email: 8,
    custom: 8,
  },
  {
    label: "too much text between the halves",
    text: "Complete the task that the supervisor assigned you last week to withdraw your earnings.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  // The money-noun group ends in `\b(…|\$\d)`, and a word boundary before `$`
  // holds only where `$` follows a word CHARACTER. So this alternative is
  // reachable from a currency-prefixed amount and not from a bare one, and both
  // sides of that boundary are pinned here — the bare form below, the prefixed
  // forms in the block that follows.
  //
  // Pinned on both sides because the asymmetry is surprising enough that a future
  // reader will reach one of two wrong conclusions from seeing only half of it:
  // that the alternative is dead (and deletable), or that it covers amounts
  // generally. The first is the mistake this file's own earlier note made.
  {
    label: "a bare amount cannot satisfy the money noun",
    text: "Complete the task to withdraw $900.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },

  // ── The money noun satisfied by a currency-prefixed amount ──────────────
  //
  // `AU$500` is the ordinary Australian written form, so in an AU-focused
  // detector this is the common shape of the alternative rather than an edge
  // case: the prefix supplies the word character the boundary needs. These are
  // the only cases here that reach the `\$\d` alternative at all, which is why
  // each currency prefix gets its own rather than one standing for the group —
  // a conversion that trimmed the alternative would otherwise fail nothing.
  //
  // Their SMS totals are 52 against email totals of 48, so they also hold the
  // "surrounding body still discounted" property on the one branch where the
  // money noun is an amount.
  {
    label: "money noun: an AU-prefixed amount",
    text: "Complete the task to withdraw AU$500.",
    fires: true,
    sms: 52,
    email: 48,
    custom: 8,
  },
  {
    label: "money noun: a US-prefixed amount",
    text: "Complete the task to withdraw US$500.",
    fires: true,
    sms: 52,
    email: 48,
    custom: 8,
  },
  {
    label: "money noun: an NZ-prefixed amount",
    text: "Complete the task to claim NZ$300 now.",
    fires: true,
    sms: 52,
    email: 48,
    custom: 8,
  },
  // Same shape in the recruitment half's vocabulary rather than this gate's: the
  // phrasing reads like branch 1 and satisfies neither the money noun nor the
  // task noun's connective, and it scores only what the reward words are worth.
  {
    label: "activate tasks to claim an amount",
    text: "Activate your tasks to claim $500 in payouts.",
    fires: false,
    sms: 24,
    email: 16,
    custom: 16,
  },

  // ── Silent: branches 2 and 3 with one half missing ──────────────────────
  {
    label: "a withdrawal with no payment demanded",
    text: "Withdraw your earnings now.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "a payment with nothing financial unlocked",
    text: "Deposit 100 to unlock the door.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "branch 2 halves split across a sentence boundary",
    text: "Withdraw your earnings. Deposit 200 first.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "branch 3 halves split across a sentence boundary",
    text: "Deposit 200. To unlock your earnings call us.",
    fires: false,
    sms: 20,
    email: 14,
    custom: 10,
  },

  // ── Silent: branch 4's phrase with no money context ─────────────────────
  //
  // The branch's own false positive, and the reason it carries a second half at
  // all: a project tracker's reminder scored 40 while this branch stood alone,
  // telling the reader their money was gone.
  {
    label: "a project tracker's unfinished-task reminder",
    text: "Reminder from Asana: you have 3 unfinished tasks.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "unfinished tasks, no money word anywhere",
    text: "You have unfinished tasks in your project tracker.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },

  // ── Silent: ordinary work and banking mail ──────────────────────────────
  {
    label: "ordinary payroll notice",
    text: "Your salary payment has been processed and will arrive Friday.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "ordinary deposit receipt",
    text: "Your deposit of $200 has been received, thank you.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "ordinary sprint wrap-up",
    text: "You have completed all your tasks for this sprint.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "ordinary withdrawal confirmation",
    text: "Your withdrawal of $120 is complete.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  // Legitimate one-time KYC, and the reason the gated nouns are what they are:
  // "verify your identity before you can withdraw funds" is ordinary regulated
  // onboarding and must stay clear of this gate.
  {
    label: "ordinary KYC before a withdrawal",
    text: "Verify your identity before you can withdraw funds.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  // The recruitment composite on its own, which is a separate rule at 25 and
  // must not be absorbed by this conversion. Its email total of 17 is the 0.7
  // discount doing what it was written to do — this one IS a keyword-frequency
  // composite and is not in the undiscounted list.
  {
    label: "the recruitment composite alone",
    text: "Rate products from home, simple tasks, earn $300 a week.",
    fires: false,
    sms: 25,
    email: 17,
    custom: 10,
  },
];

/** The gate's rows in a result, identified the way a reader would. */
const taskRows = (r: { signals?: Array<{ text: string; points: number }> }) =>
  (r.signals ?? []).filter((s) => s.text.startsWith(FLAG));

describe("task-payment scoring, pinned before the registry conversion", () => {
  it.each(cases)("$label — SMS", ({ text, fires, sms }) => {
    const r = checkSms(text, undefined, "AU");
    expect(r.score).toBe(sms);
    expectRow(r, fires);
  });

  it.each(cases)("$label — email", ({ text, fires, email }) => {
    const r = checkEmail(asEmail(text), undefined, "AU");
    expect(r.score).toBe(email);
    expectRow(r, fires);
  });

  // Every case scores 0 rows here, which is the point of running them: the
  // free-text box has its own keyword pass and has never run this gate, so the
  // channel the signal declares has to say so rather than widen by default.
  it.each(cases)("$label — custom", ({ text, custom }) => {
    const r = checkCustom(text, undefined, "AU");
    expect(r.score).toBe(custom);
    expect(taskRows(r)).toEqual([]);
  });
});

/**
 * Exactly one row carrying exactly 40, or none at all.
 *
 * The row count is asserted rather than the row's presence, because "a gate row
 * is there at 40" is also true of a result carrying two of them — which is the
 * shape a conversion scoring a hit per matching branch produces, and the shape
 * that passes a score assertion on every case where only one branch matches.
 */
function expectRow(
  r: { signals?: Array<{ text: string; points: number }> },
  fires: boolean,
): void {
  const rows = taskRows(r);
  if (!fires) {
    expect(rows).toEqual([]);
    return;
  }
  expect(rows).toHaveLength(1);
  expect(rows[0].points).toBe(40);
  // The claim that actually defeats this scam is that no employer charges you to
  // be paid, so it is pinned as something a reader sees rather than left to the
  // flag prefix above.
  expect(rows[0].text).toMatch(/deposit funds to release your own wages/i);
}
