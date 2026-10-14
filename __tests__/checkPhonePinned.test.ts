// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkPhone } from "@veriguard/detect/scamDetector";
import { analysePhone } from "@veriguard/detect/phoneIntel";

// Every score checkPhone produces today, pinned before its scoring moves into
// the signal registry.
//
// The conversion has to be observationally identical, and this is what says so.
// Written as a characterisation test — the expectations were read off the
// running engine, not derived from what the code ought to do — because the
// question it answers is "did this change behaviour", not "is this behaviour
// right". A pin written from intent would ratify the bug it was reasoning
// about: this repo has already paid for a test pinned in the same change as the
// fix it was meant to check, which passed only because the bug suppressed the
// real check.
//
// Scope deliberately includes the order and the per-row points, not just the
// final score. The rows are rendered to a reader invited to check that the
// evidence adds up, so "same score, different rows" is a visible regression,
// and the sequencing below is where this function's complexity actually lives:
//
//   · The "nothing found" floor is decided on the observations BEFORE spoofing
//     notes are appended, so a number whose only evidence is a spoofing note
//     still earns the floor.
//   · The spoofing points ride on the first note not already covered by an
//     observation, and become their own row only when no note can carry them.
//
// Both are properties of the whole pass rather than of any one signal, which is
// what makes this function worth converting first: it is the smallest surface
// that still has a sequencing problem to solve.

/**
 * One case per distinguishable path, harvested across every line type, all four
 * spoofing rungs, wangiri, high-scam country in **both** directions (suppressed
 * by wangiri and not), and regions with and without an authored phone plan.
 *
 * The "both directions" is load-bearing and was missing from the first version
 * of this file, whose header claimed high-scam-country coverage on the strength
 * of a single wangiri case — where that very signal is deliberately silenced.
 * **A corpus header is a claim to verify, not a summary to write**: the rule it
 * asserted coverage of had no end-to-end pin at all. Check a named path against
 * the rows a case actually produces before listing it here.
 */
const cases: Array<{
  input: string;
  region: string;
  lineType: string;
  risk: string;
  score: number;
  verdict: string;
  points: number[];
}> = [
  // Premium: the 20-point observation plus the very_high spoofing rung on a note.
  { input: "1900 123 456", region: "AU", lineType: "premium", risk: "very_high", score: 95, verdict: "likely_scam", points: [20, 75] },
  { input: "+44 909 879 2048", region: "GB", lineType: "premium", risk: "very_high", score: 95, verdict: "likely_scam", points: [20, 75] },
  { input: "0900 123 4567", region: "NL", lineType: "premium", risk: "very_high", score: 95, verdict: "likely_scam", points: [20, 75] },
  { input: "+1 900 555 0100", region: "US", lineType: "premium", risk: "very_high", score: 95, verdict: "likely_scam", points: [20, 75] },
  { input: "+65 1900 123", region: "SG", lineType: "premium", risk: "very_high", score: 95, verdict: "likely_scam", points: [20, 75] },
  { input: "+49 900 1234567", region: "DE", lineType: "premium", risk: "very_high", score: 95, verdict: "likely_scam", points: [20, 75] },

  // VoIP: the 10-point observation plus the medium rung.
  { input: "+44 56 1234 5678", region: "GB", lineType: "voip_likely", risk: "medium", score: 40, verdict: "suspicious", points: [10, 30] },
  { input: "0488 888 888", region: "AU", lineType: "voip_likely", risk: "medium", score: 40, verdict: "suspicious", points: [10, 30] },
  { input: "+27 87 123 4567", region: "ZA", lineType: "voip_likely", risk: "medium", score: 40, verdict: "suspicious", points: [10, 30] },

  // Wangiri suppresses the high-scam-country row, which is why this scores as
  // a premium-shaped 95 rather than carrying a third observation.
  { input: "+252 61 234567", region: "AU", lineType: "mobile", risk: "very_high", score: 95, verdict: "likely_scam", points: [20, 75] },

  // High-scam country WITHOUT wangiri — the unsuppressed direction, which the
  // first version of this corpus missed entirely. Its only high-scam case was
  // the wangiri number above, where the row is deliberately silenced, so the
  // channel's single epistemic signal had no end-to-end pin at all: changing
  // its weight 0 → 25 failed one assertion, and that assertion was the
  // inventory comparing against itself rather than any behaviour. The same
  // injection on `phone.fixedLine` failed 24.
  //
  // That is a coverage hole sitting exactly where the safety argument is
  // weakest — this corpus is the whole evidence that the conversion changed
  // nothing, and the untested rule is the one kind that goes stale, since
  // which countries host scam operations is maintained data rather than a
  // property of a number.
  //
  // Two shapes, because the row's position in the evidence list differs: on a
  // mobile it is the first row, and on a fixed line it follows the fixed-line
  // observation. Both are zero-point rows ahead of the spoofing note that
  // carries the score.
  { input: "+234 802 123 4567", region: "AU", lineType: "mobile", risk: "high", score: 55, verdict: "likely_scam", points: [0, 55] },
  { input: "+237 6 71 23 45 67", region: "AU", lineType: "mobile", risk: "high", score: 55, verdict: "likely_scam", points: [0, 55] },
  { input: "+381 11 123 4567", region: "AU", lineType: "fixed", risk: "high", score: 55, verdict: "likely_scam", points: [0, 0, 55] },
  { input: "+420 2 2112 3456", region: "AU", lineType: "fixed", risk: "high", score: 55, verdict: "likely_scam", points: [0, 0, 55] },
  { input: "+216 71 123 456", region: "AU", lineType: "fixed", risk: "high", score: 55, verdict: "likely_scam", points: [0, 0, 55] },
  { input: "+385 1 2345 678", region: "AU", lineType: "fixed", risk: "high", score: 55, verdict: "likely_scam", points: [0, 0, 55] },

  // Zero-point observations: the row exists to be read, and the spoofing rung
  // carries the whole score on the following note.
  { input: "1800 123 456", region: "AU", lineType: "freecall", risk: "low", score: 15, verdict: "safe", points: [0, 15] },
  { input: "+1 888 555 0100", region: "US", lineType: "freecall", risk: "low", score: 15, verdict: "safe", points: [0, 15] },
  { input: "13 22 58", region: "AU", lineType: "shared_cost", risk: "low", score: 15, verdict: "safe", points: [0, 15] },
  { input: "02 9374 4000", region: "AU", lineType: "fixed", risk: "low", score: 15, verdict: "safe", points: [0, 15] },
  { input: "+61 2 9374 4000", region: "AU", lineType: "fixed", risk: "low", score: 15, verdict: "safe", points: [0, 15] },
  { input: "+44 20 7946 0958", region: "GB", lineType: "fixed", risk: "low", score: 15, verdict: "safe", points: [0, 15] },
  { input: "+353 1 234 5678", region: "IE", lineType: "fixed", risk: "low", score: 15, verdict: "safe", points: [0, 15] },

  // The floor, carried on its own row: nothing observed and no note to ride on.
  { input: "0412 345 678", region: "AU", lineType: "mobile", risk: "low", score: 15, verdict: "safe", points: [15] },
  { input: "+1 212 555 0100", region: "US", lineType: "mobile", risk: "low", score: 15, verdict: "safe", points: [15] },
  { input: "000", region: "AU", lineType: "emergency", risk: "low", score: 15, verdict: "safe", points: [15] },

  // Partial coverage downgrades a clean result to `unknown` — the same score,
  // a different promise.
  { input: "+27 11 123 4567", region: "ZA", lineType: "fixed", risk: "low", score: 15, verdict: "unknown", points: [0, 15] },
  { input: "+81 3 1234 5678", region: "JP", lineType: "fixed", risk: "low", score: 15, verdict: "unknown", points: [0, 15] },
  { input: "+55 11 91234 5678", region: "BR", lineType: "mobile", risk: "low", score: 15, verdict: "unknown", points: [15] },
  { input: "+33 1 23 45 67 89", region: "FR", lineType: "fixed", risk: "low", score: 15, verdict: "unknown", points: [0, 15] },

  // Unparseable or unauthored: the spoofing rung is the whole verdict. G2 lives
  // here — `1-976-555-1212` is a US premium range no pack authors, so it
  // reaches the `unknown` line type and scores on spoofing risk alone.
  { input: "1-976-555-1212", region: "US", lineType: "unknown", risk: "high", score: 55, verdict: "likely_scam", points: [0, 55] },
  { input: "+44 7700 900123", region: "GB", lineType: "unknown", risk: "high", score: 55, verdict: "likely_scam", points: [0, 55] },
  { input: "+64 9 123 4567", region: "NZ", lineType: "unknown", risk: "high", score: 55, verdict: "likely_scam", points: [0, 55] },
  { input: "+91 1930", region: "IN", lineType: "unknown", risk: "high", score: 55, verdict: "likely_scam", points: [0, 55] },
  { input: "+234 1 234 5678", region: "NG", lineType: "unknown", risk: "high", score: 55, verdict: "likely_scam", points: [0, 55] },
  { input: "not a number", region: "AU", lineType: "unknown", risk: "high", score: 55, verdict: "likely_scam", points: [0, 55] },
  { input: "+risky", region: "AU", lineType: "unknown", risk: "very_high", score: 75, verdict: "likely_scam", points: [0, 75] },
  { input: "", region: "AU", lineType: "unknown", risk: "very_high", score: 75, verdict: "likely_scam", points: [0, 75] },

  // A foreign fixed line on the medium rung.
  { input: "+86 10 1234 5678", region: "AU", lineType: "fixed", risk: "medium", score: 30, verdict: "suspicious", points: [0, 30] },
];

describe("checkPhone — scores pinned before the registry conversion", () => {
  it.each(cases)(
    "$input ($region) scores $score/$verdict",
    ({ input, region, score, verdict }) => {
      const result = checkPhone(input, region as never);
      expect(result.score).toBe(score);
      expect(result.verdict).toBe(verdict);
    },
  );

  it.each(cases)(
    "$input ($region) distributes its points as $points",
    ({ input, region, points }) => {
      // Not just the total. A converted signal that scores the same number
      // through differently-weighted rows changes what the reader is shown, and
      // the evidence list is the product.
      const result = checkPhone(input, region as never);
      expect((result.signals ?? []).map((s) => s.points)).toEqual(points);
    },
  );

  it.each(cases)("$input ($region) reads as $lineType/$risk", ({ input, region, lineType, risk }) => {
    // The intel the scoring branches on, pinned separately. If a conversion
    // changes a score, this says whether the input classification moved or the
    // scoring did — which is the difference between a phoneIntel regression and
    // a registry one.
    const intel = analysePhone(input, region as never);
    expect(intel.lineType).toBe(lineType);
    expect(intel.spoofingRisk).toBe(risk);
  });

  it("emits exactly one row for a number with nothing to report", () => {
    // The original emitted one flag for a clean number, and the floor row
    // absorbing the spoofing points is what keeps that true. A conversion that
    // splits this into an observation plus a spoofing row would be a visible
    // change to the quietest, most common result.
    const result = checkPhone("0412 345 678", "AU");
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0]).toContain("No obvious red flags");
  });

  it("gives the floor to a number whose only evidence is a spoofing note", () => {
    // The ordering property: `nothingFound` is decided before the notes are
    // appended, so this still reaches 15 rather than scoring the low rung alone.
    const result = checkPhone("02 9374 4000", "AU");
    expect(result.score).toBe(15);
    expect(analysePhone("02 9374 4000", "AU").spoofingNotes.length).toBeGreaterThan(0);
  });

  it("keeps every row's points summing to the score", () => {
    // What makes the evidence list checkable by a reader. Asserted across the
    // whole table rather than per case, because a conversion that loses a point
    // somewhere will not announce which case it broke.
    for (const { input, region, score } of cases) {
      const result = checkPhone(input, region as never);
      const summed = (result.signals ?? []).reduce((n, s) => n + s.points, 0);
      expect(summed, `${input} (${region}) rows do not sum to its score`).toBe(score);
    }
  });

  it("puts the high-scam origin row first, ahead of the line type", () => {
    // The row named and positioned, not just counted. Registry order is the
    // order the reader sees, and the country signal is scored before the
    // line-type ones — so a reordering during a later conversion is a visible
    // change even when the score is identical.
    for (const number of ["+234 802 123 4567", "+381 11 123 4567"]) {
      const signals = checkPhone(number, "AU").signals ?? [];
      expect(signals[0].text, `${number} first row`).toContain("Call originates from");
      expect(signals[0].points, `${number} country row should not score`).toBe(0);
    }
    // And the fixed-line row follows it rather than preceding it.
    const fixed = (checkPhone("+381 11 123 4567", "AU").signals ?? []).map((s) => s.text);
    expect(fixed[1]).toContain("Fixed-line area code");
  });

  it("names the country it is reporting on", () => {
    // The sentence interpolates `intel.country`, and a signal reading a
    // neighbouring field would still produce a plausible-looking row. This
    // repo has shipped a guard reading a display name behind an ISO-code
    // regex, which rejected every value it ever saw — so the field's real
    // contents get pinned rather than pattern-matched.
    //
    // The whole sentence, not a substring: `intel.region` is `undefined` for
    // these numbers, so `toContain("Nigeria")` alone passes while a wrong-field
    // read emits "Call originates from undefined". Asserting the full row is
    // what makes that fail.
    expect(checkPhone("+234 802 123 4567", "AU").flags[0]).toBe(
      "Call originates from Nigeria — frequently used as a base for scam operations targeting your region",
    );
  });

  it("spells one country two ways in a single verdict", () => {
    // Pinned as found, and NOT as desirable: a +420 verdict calls the country
    // "Czechia" in the signal row and "Czech Republic" in the spoofing note
    // below it. Two labels for one country in one sheet, from two sources —
    // the signal interpolates `intel.country` (an Intl display name) and the
    // note is built from the pack's own map of dialling codes.
    //
    // Pre-existing, visible on `main`, and untouched by the registry
    // conversion — recorded here because this corpus is where a reader will
    // look for what the phone channel actually emits, and because the pair is
    // what makes the inconsistency obvious. Fixing it is a copy change with
    // its own false-positive surface (the two lists disagree for more than
    // one country), so it is not smuggled into a refactor whose whole claim is
    // that it changed nothing observable.
    const flags = checkPhone("+420 2 2112 3456", "AU").flags;
    expect(flags[0]).toContain("Czechia");
    expect(flags[2]).toContain("Czech Republic");
  });

  it("carries the intel through on the result", () => {
    const result = checkPhone("1900 123 456", "AU");
    expect(result.phoneIntel?.lineType).toBe("premium");
    expect(result.category).toBe("Phone Number");
  });

  it("never emits a row the reader cannot see", () => {
    // Points with no sentence to attach them to leave the evidence short of the
    // headline, which is the defect the spoofing-note fallback row exists to
    // prevent.
    for (const { input, region } of cases) {
      for (const signal of checkPhone(input, region as never).signals ?? []) {
        expect(signal.text.trim().length, `${input} (${region}) has an empty row`).toBeGreaterThan(0);
      }
    }
  });
});

describe("checkPhone — paths with no live example", () => {
  it("has no case producing more than one spoofing note", () => {
    // Recorded, not asserted as desirable. `fresh.forEach` weights the first
    // note and zeroes the rest, and nothing in the corpus above reaches that
    // branch — every number produces at most one note. So the multi-note
    // distribution is untested by construction, and a conversion cannot be
    // verified against it.
    //
    // This matters because the registry's `scale` would be the natural way to
    // express "one note carries the points, the others are context", and
    // choosing that shape on an unreachable branch is choosing it blind. If a
    // pack ever authors a second note, THIS is the test that should start
    // failing and force the question.
    const multi = cases.filter(
      ({ input, region }) => analysePhone(input, region as never).spoofingNotes.length > 1,
    );
    expect(multi).toEqual([]);
  });
});
