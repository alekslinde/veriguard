// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// The phone channel's signals, as values.
//
// First conversion out of `scamDetector.ts`: 7 of `checkPhone`'s 10 inline
// `sig.add` sites. The smallest scoring surface in the engine, chosen so the
// registry's shape is tested against real rules while a revert stays cheap.
// The other 3 are pass-level and stayed behind — see below, which is the point
// of having started here.
//
// ## What converted, and what deliberately did not
//
// The seven observations about a number — its line type, wangiri, originating
// country — are independent facts, each a weight and a sentence, so each is a
// `SignalDef` below. That is the whole of what the registry's shape claims to
// hold, and it holds it.
//
// Three things in `checkPhone` are NOT signals and stay in the entry point:
//
//   · **The spoofing assessment.** It is a property of the number rather than
//     an observation about it, and it does not get a row of its own — it rides
//     on the first note not already covered by an observation above. That is a
//     fact about the whole evidence list, not about any signal in it.
//   · **The "nothing found" floor.** Its weight is `max(spoofing, 15)` minus
//     whatever the notes will carry, decided on whether anything else fired.
//   · **The note-coverage filter.** A note is dropped when an observation
//     already said the same thing, which is a question about the rows already
//     collected.
//
// All three are *pass-level* sequencing, and forcing them into `SignalDef`
// would mean a signal whose weight depends on the rest of the list — which is
// the deferred-row shape the engine already has a separate mechanism for, and
// not something to invent a second time during a conversion that is supposed to
// change nothing observable.
//
// **This is the finding step 2 exists to produce.** The registry handles
// independent weighted observations cleanly and says nothing yet about
// order-dependent ones. `checkSms` has at least one of those (the deferred
// authority-mention rule), so the shape needs an answer before step 3 — see the
// note at the end of this file.

import type { Hit, SignalDef } from "../signalRegistry";

/**
 * Spoofing-risk rungs, in points.
 *
 * Kept here beside the signals that share the channel rather than in the entry
 * point, since it is a scoring fact and the whole point of the registry is that
 * scoring facts are data. Not a `SignalDef` because it produces no row of its
 * own: see the note above.
 */
export const SPOOFING_POINTS: Record<"low" | "medium" | "high" | "very_high", number> = {
  low: 15,
  medium: 30,
  high: 55,
  very_high: 75,
};

/** The floor a number with nothing to report still scores. */
export const NOTHING_FOUND_POINTS = 15;

/**
 * Observation signals, in the order they are scored.
 *
 * Order is preserved from the inline version and is load-bearing twice over:
 * the evidence list is rendered in the order it was found, and the
 * note-coverage filter below compares against rows already collected. A
 * reordering here is a visible change to what the reader is shown.
 *
 * Every one declares `channels: ["phone"]` and `reads: ["phone"]` — they are
 * facts about a parsed number and cannot fire anywhere else. `registryScore`
 * enforces that: with no `phone` on the context, none of them scores.
 */
export const PHONE_SIGNALS: readonly SignalDef[] = [
  {
    id: "phone.premium",
    reads: ["phone"],
    channels: ["phone"],
    weight: 20,
    kind: "structural",
    evaluate: (ctx): Hit[] =>
      ctx.phone?.lineType === "premium"
        ? [{
            text: "Premium rate number — never call or text back, you'll be charged",
            source: "phone",
          }]
        : [],
  },
  {
    id: "phone.voip",
    reads: ["phone"],
    channels: ["phone"],
    weight: 10,
    kind: "structural",
    evaluate: (ctx): Hit[] =>
      ctx.phone?.lineType === "voip_likely"
        ? [{
            text: "VoIP / virtual number — trivially easy to spoof; real caller identity is hidden",
            source: "phone",
          }]
        : [],
  },
  {
    id: "phone.wangiri",
    reads: ["phone"],
    channels: ["phone"],
    weight: 20,
    kind: "structural",
    evaluate: (ctx): Hit[] =>
      ctx.phone?.wangiriRisk
        ? [{
            text: "Wangiri scam: one-ring trick from a premium-rate international number — do NOT call back",
            source: "phone",
          }]
        : [],
  },
  {
    // Epistemic: which countries host scam operations is a claim about the
    // world, maintained in the region packs, and it goes stale. The line-type
    // rules above cannot.
    //
    // Suppressed by wangiri rather than added to it. The wangiri row already
    // says the call came from a premium-rate international range, so both rows
    // would tell the reader the same thing twice at 20 points — and the
    // condition is the inline `!intel.wangiriRisk`, carried over verbatim
    // rather than restated, since restating a guard that already exists
    // elsewhere in guarded form is the single most expensive pattern in this
    // codebase's history.
    id: "phone.highScamCountry",
    reads: ["phone"],
    channels: ["phone"],
    weight: 0,
    kind: "epistemic",
    evaluate: (ctx): Hit[] =>
      ctx.phone?.highScamCountry && !ctx.phone.wangiriRisk
        ? [{
            text: `Call originates from ${ctx.phone.country} — frequently used as a base for scam operations targeting your region`,
            source: "phone",
          }]
        : [],
  },
  {
    // Zero-weight by design, and declared as zero rather than left undeclared:
    // the row exists to be read, not to move the number. Toll-free and
    // shared-cost wording is authored per region on the pack's `phonePlan`,
    // since the ranges and impersonated bodies differ, and reaches the user
    // through the spoofing notes instead.
    id: "phone.freecall",
    reads: ["phone"],
    channels: ["phone"],
    weight: 0,
    kind: "structural",
    evaluate: (ctx): Hit[] =>
      ctx.phone?.lineType === "freecall"
        ? [{
            text: "Free-call numbers are routinely spoofed by scammers impersonating banks and government agencies",
            source: "phone",
          }]
        : [],
  },
  {
    id: "phone.sharedCost",
    reads: ["phone"],
    channels: ["phone"],
    weight: 0,
    kind: "structural",
    evaluate: (ctx): Hit[] =>
      ctx.phone?.lineType === "shared_cost"
        ? [{
            text: "Shared-cost numbers are commonly spoofed by scammers impersonating government agencies",
            source: "phone",
          }]
        : [],
  },
  {
    id: "phone.fixedLine",
    reads: ["phone"],
    channels: ["phone"],
    weight: 0,
    kind: "structural",
    evaluate: (ctx): Hit[] =>
      ctx.phone?.lineType === "fixed"
        ? [{
            text: "Fixed-line area code — easy to spoof; a local-looking number doesn't mean a local caller",
            source: "phone",
          }]
        : [],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// What step 3 had to answer first — answered, 2026-10-15
// ────────────────────────────────────────────────────────────────────────────
//
// **(b), with the criterion written down.** The three cases below stay in the
// entry point, and the line is drawn by the question a rule asks rather than by
// how hard it is to convert: a signal reports an observation about the input and
// declares its own weight; pass-level policy answers a question about the
// *finished* evidence list and owns no row of its own. The deferred
// authority-mention rule keeps `addDeferred`, which was built for exactly its
// question. The full statement, and (b)'s own risk taken seriously, is in the
// header of `signalRegistry.ts`.
//
// What step 3 then needed turned out to be narrower than the question asked
// here, and separating the two is the finding: the ClickFix variants are not
// order-dependent, they are two readings of **one fact**, where scoring both
// counts one lure twice. That is precedence — each weight still declared, each
// `evaluate` still pure — so it is the `supersedes` field, not a second kind of
// signal. The original note is kept below as the question's provenance.
//
// A signal whose weight depends on the rest of the evidence list has no shape
// here yet. Three live instances, all pass-level:
//
//   · This channel's spoofing assessment and floor, left in the entry point.
//   · `checkSms`'s deferred authority-mention rule, which asks "did anything
//     ELSE score" and is resolved after every rule has run. Asking mid-scan
//     answers a different question — whether corroboration happened to be
//     found before that point in the function — and that distinction already
//     cost a defect.
//   · The clamp, which is each entry point's policy rather than a signal's.
//
// The options, recorded now while the smallest case is in front of us rather
// than discovered mid-conversion of a larger one:
//
//   (a) A second phase: signals that read the scored rows, run after the first
//       pass. Honest about the dependency and keeps `evaluate` pure, but makes
//       "a signal" two kinds of thing.
//   (b) Keep them in the entry point, as here. Correct for genuinely
//       pass-level facts; the risk is that it becomes the default and the
//       registry ends up holding only the easy half, which is the trap this
//       page's own ordering warns about for A, 1 and 4.
//   (c) Extend `Hit` with the deferred shape the engine already has.
//
// Answered as (b) above. Recorded rather than deleted because the reason step 2
// was worth doing at the smallest surface was that it surfaced this cheaply, and
// a question that leaves no trace of having been asked gets asked again.