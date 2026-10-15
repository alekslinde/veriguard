// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkEmail, checkCustom } from "@veriguard/detect/scamDetector";

// Every score the family-impersonation gate produces today, pinned before its
// scoring moves into the signal registry.
//
// Committed in its own change, ahead of the conversion, for the reason
// `checkPhonePinned`, `clickFixPinned` and `splicedWordingPinned` were: a
// characterisation test answers "did this change behaviour", a test written from
// intent answers "is this what I meant", and only the first is a refactor's
// safety net. Every expectation below was read off the running engine across all
// three message channels, not derived from what the code ought to do.
//
// `familyImpersonation.test.ts` already covers what the gate decides — which
// openers count as address rather than subject, which pretexts and money asks
// satisfy their halves, what survives forwarding. It asserts verdicts and
// inequalities (`toBeGreaterThanOrEqual(45)`, `not.toBe("likely_scam")`), which
// is the gap this file fills: the conversion can preserve every decision and
// every verdict and still change what each one is worth. A rule pitched at 45
// arriving as 44 keeps the verdict and loses the pin.
//
// Four properties this file exists to hold, each a way the conversion can go
// wrong while every decision still looks right:
//
//   · **Exactly 45, on email as well as SMS.** The row sits in
//     `UNDISCOUNTED_COMPOSITES` today, exempted from the email body pass's 0.7
//     by string-prefix match. Both earlier conversions hit the same defect
//     through that merge — ClickFix's declared 50 arriving as 35, the splice
//     rule's 25 as 17 — and both times it was the pin that caught it, not the
//     knowing. Discounted, 45 becomes 31: "a bit sus" for a complete scam
//     script, on the channel the script also arrives on.
//   · **The surrounding body is still discounted.** The inverse error, and the
//     one a pin of the row alone cannot see: lifting the whole email body to 1.0
//     would hold this row at 45 and pass. The one case here carrying live
//     keywords alongside the gate is pinned at a *lower* email total than its
//     SMS total while its gate row is not.
//   · **One row, not one per half.** The gate reads three independent halves and
//     scores them once. In the registry a signal returns an array of hits and
//     each hit is scored at the declared weight, so a conversion that returned a
//     hit per satisfied half would score 135.
//   · **Silent on `custom`, and that is today's behaviour rather than a view
//     about the channel.** `checkCustom` keeps its own keyword pass and never
//     ran this gate, so the same text pasted into the free-text box scores 0
//     from it where an SMS scores 45. Pinned as it stands, so widening it later
//     is a decision someone makes and sees in this file's diff — the conversion
//     is not the place to make it.
//   · **The pretext half goes through the engine's shared pack-entry matcher.**
//     Added after an injection measured that nothing held it there: swapping the
//     matcher for a bare `includes()` changed no score and failed no test,
//     because every pretext phrase is multi-word with single spaces and every
//     other fixture here is well-formed prose. The whitespace block below is the
//     one that separates them, and it is the case the matcher was written for.

/** How a reader identifies the row. Deliberately the prose, not an id. */
const FLAG = 'Reads as the "Hi Mum" family-impersonation script';

const asEmail = (body: string) =>
  `From: Sarah <sarah.j.9912@gmail.com>\nSubject: hi\n\n${body}`;

/**
 * One case per distinguishable path through the gate.
 *
 * `fires` is whether the gate's own row is present, and `score` is the whole
 * message's score rather than the signal's — a conversion that reproduces the
 * row and changes what fires around it is still a behaviour change, and the
 * totals are where that shows up.
 */
const cases: Array<{
  label: string;
  text: string;
  fires: boolean;
  sms: number;
  email: number;
  custom: number;
}> = [
  // ── The gate fires: all three halves, the classic opening shape ───────────
  {
    label: "bare opener, no comma",
    text: "mum send me 400 my phone broke, send it as quick as you can",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "greeting, new number, dollar ask",
    text: "Hi Mum, this is my new number, my phone broke. Can you send $400?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "dad, dropped phone, transfer today",
    text: "Hi Dad I dropped my phone, text me on this number. I need you to transfer 1200 today please",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "friend's phone, transfer to account",
    text: "Hi Mum, using my friend's phone. Can you transfer $850 to this account today?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  // The one case carrying live keywords alongside the gate. Its SMS total is
  // 55 and its email total 52, so the body around the row is still discounted
  // — which is what separates "the signal declares 45" from "the email path
  // stopped discounting anything".
  {
    label: "urgency vocabulary alongside the gate",
    text: "Hello mum, lost my phone. Could you please send me money urgently",
    fires: true,
    sms: 55,
    email: 52,
    custom: 8,
  },

  // ── The gate fires: addressed mid-message rather than first ───────────────
  //
  // Position and address are different things, and the vocative branch is what
  // separates them. Both halves of the anchor are pinned because a conversion
  // that reproduced only the opening branch would still pass every case above.
  {
    label: "mid-message vocative, mum",
    text: "Just letting you know, I got a new number after my phone broke. Mum, can you transfer $200 for the rego?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "mid-message vocative, dad",
    text: "Hi! Long time. My phone broke so this is my new number. Dad, could you send me 500 when you get a chance?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },

  // ── The gate fires through a forwarding wrapper ───────────────────────────
  //
  // Forwarding is how the script most often reaches a checker, and the anchor
  // reads the body *after* the scaffolding. The conversion moves that anchor
  // into a signal module, so each recognised wrapper shape is pinned rather
  // than trusted to the one that motivated the stripper.
  {
    label: "a forwarded-message marker",
    text: "---------- Forwarded message ----------\n\nHi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "a Fwd: subject prefix",
    text: "Fwd: Hi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "a chat-export line",
    text: "02/09/2026, 10:42 - Unknown: Hi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "quote markers",
    text: "> Hi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "buried in ordinary prose",
    text: "Hi there, hope you had a good weekend.\n\nHi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?\n\nThanks again.",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },

  // ── The gate fires: each way the money half can be satisfied ─────────────
  //
  // Five alternatives in one predicate, and a conversion only has to drop one
  // to lose a shape of the script. The bare-amount case is the live sample the
  // rule was written for: the script usually omits the currency symbol.
  {
    label: "bare amount, no currency symbol",
    text: "Mum, my phone broke so this is my new number, send me 400",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "can you please send, no amount",
    text: "Mum, this is my new number — phone broke. Can you please send some money?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "need you to transfer, no amount",
    text: "Mum, lost my phone, new number. I need you to transfer money today",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "e-transfer spelling",
    text: "Mum, dropped my phone, this is my new number, can you e-transfer 300",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "a currency amount with no verb",
    text: "Mum, phone broke, new number. $450 would really help",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },

  // ── The gate fires: the pretext phrase with its whitespace varied ────────
  //
  // These are what make the shared pack-entry matcher load-bearing rather than
  // merely preferred, and they were added after an injection measured that it
  // was not: replacing the matcher with a bare `includes()` changed no score and
  // failed no test, because every pretext phrase is multi-word with single
  // spaces and every fixture above is well-formed prose.
  //
  // `includes()` misses all four. The matcher relaxes the gap between a phrase's
  // words to any run of whitespace, which is the fix for a silent failure
  // measured across ~65% of every region pack: a doubled space, a tab, a hard
  // wrap mid-phrase, or the non-breaking space a mail client leaves behind when
  // text is pasted out of Word. The family gate is the rule that found it —
  // "Hi Mum, I dropped  my phone …" dropped from likely_scam to safe with no
  // flags at all, because the gate needs its pretext and had no other way to
  // see one.
  {
    label: "a doubled space inside the pretext",
    text: "Hi Mum, I dropped  my phone and this is my new number. Can you transfer $850 today?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "a hard wrap inside the pretext",
    text: "Hi Mum, this is my new\nnumber. Can you send $400?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "a non-breaking space inside the pretext",
    text: "Hi Mum, I dropped my phone. Can you send $400?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },
  {
    label: "a tab inside the pretext",
    text: "Hi Mum, this is my\tnew number. Can you send $400?",
    fires: true,
    sms: 45,
    email: 45,
    custom: 10,
  },

  // ── Silent: exactly one half missing, nothing else wrong ─────────────────
  //
  // Each of these three carries two halves cleanly and fails the third and only
  // the third, so dropping any one half from the gate flips that case. Added
  // after an injection measured the gap: deleting the money-ask requirement
  // outright failed only two cases, because every other negative here fails
  // some *other* half too and so stays silent either way. A gate of three
  // conditions needs one negative per condition, or it is pinned against
  // loosening in only the directions the examples happen to cover.
  {
    label: "relation and pretext, no money ask",
    text: "Hi Mum, my phone broke so this is my new number",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "relation and money ask, no pretext",
    text: "Hi Mum, can you transfer $400 for the rego today?",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "pretext and money ask, no relation term",
    text: "My phone broke so this is my new number. Can you transfer $400?",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },

  // ── Silent: a half is missing ────────────────────────────────────────────
  //
  // The pretext is required, not merely one of two ways in. An earlier version
  // accepted "any other signal present", and a single urgency word opened a 45
  // against a parent's own child — the one false positive this rule must never
  // produce, since it teaches the reader to distrust the verdict and the family
  // member at once. The first two cases are that version's output.
  {
    label: "no pretext, urgent school fees",
    text: "Mum, don't forget to pay the school fees of 250 before Friday, it's urgent!",
    fires: false,
    sms: 10,
    email: 7,
    custom: 8,
  },
  {
    label: "no pretext, urgent transfer",
    text: "Dad, urgent — can you transfer $200 for the flights today?",
    fires: false,
    sms: 10,
    email: 7,
    custom: 8,
  },
  {
    label: "pretext but no money ask",
    text: "Dad my phone broke, I'll call you from the landline later",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "all three halves but no relation term",
    text: "Hi, I got a new number after my phone broke. Can you transfer $200?",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },

  // ── Silent: the relation term is the subject, not the person addressed ───
  //
  // Position alone satisfied the anchor once, and these are what it scored.
  // Each is a real family message, and each carries all three halves on a
  // reading that tests position rather than address.
  {
    label: "relation term possessive",
    text: "Mum's phone broke, can you send her $200 on this new number?",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "relation term followed by a verb",
    text: "Dad said he'd lend me 500 for the car, I'll pay you back when I get my new number sorted.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "relation term inside an idiom",
    text: "Mother of all storms out there, my phone died, send $100 when you can on my new number",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "bare mention, told to tell mum",
    text: "Tell mum I got a new number and I'll send her the 200 I owe her tomorrow.",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "bare mention, will ask mum",
    text: "I'll ask mum about the weekend and send you 50 for petrol",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },

  // ── Silent: ordinary family texting ─────────────────────────────────────
  {
    label: "ordinary pickup request",
    text: "Mum can you pick me up at 5",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "ordinary birthday message",
    text: "Hi Mum, happy birthday! Love you",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "a money ask from someone who is not family",
    text: "Hey mate, send me 400 for the tickets when you can",
    fires: false,
    sms: 0,
    email: 0,
    custom: 10,
  },
];

/** The gate's rows in a result, identified the way a reader would. */
const familyRows = (r: { signals?: Array<{ text: string; points: number }> }) =>
  (r.signals ?? []).filter((s) => s.text.startsWith(FLAG));

describe("family-impersonation scoring, pinned before the registry conversion", () => {
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
    expect(familyRows(r)).toEqual([]);
  });
});

/**
 * Exactly one row carrying exactly 45, or none at all.
 *
 * The row count is asserted rather than the row's presence, because "a gate row
 * is there at 45" is also true of a result carrying three of them — which is the
 * shape a conversion scoring a hit per satisfied half produces, and the shape
 * that passes a score assertion on any case where nothing else fires.
 */
function expectRow(
  r: { signals?: Array<{ text: string; points: number }> },
  fires: boolean,
): void {
  const rows = familyRows(r);
  if (!fires) {
    expect(rows).toEqual([]);
    return;
  }
  expect(rows).toHaveLength(1);
  expect(rows[0].points).toBe(45);
  // The advice is the part that actually defeats this scam, so it is pinned as
  // something a reader sees rather than left to the flag prefix above.
  expect(rows[0].text).toMatch(/usual number|number you already have/i);
}
