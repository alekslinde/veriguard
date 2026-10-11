// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { stem, sameStem } from "@veriguard/detect/stemGuess";
import { mentions } from "@veriguard/detect/scamDetector";

// mentions()'s existing INFLECTION regex tolerates six literal suffixes
// (s/es/ed/d/ing/ly) after a long single-token entry, which is itself a
// hand-rolled stemmer, candid in its own comment about what it cannot reach:
// an irregular verb (pay/paid), a -y -> -ies swap (verify/verifies), or
// consonant doubling (refer/referred). Every one is live scam vocabulary that
// currently misses mentions() entirely. stem() closes those three gaps, and
// mentions() consults it only as a second opinion once its own regex has
// already failed — never a replacement.

describe("stem", () => {
  it.each([
    ["verify", "verifies"],
    ["apply", "applies"],
    ["refer", "referred"],
    ["refer", "referring"],
    ["ship", "shipped"],
    ["ship", "shipping"],
  ])("reduces %s and %s to the same stem", (base, inflected) => {
    expect(sameStem(base, inflected)).toBe(true);
  });

  it("leaves a real double-letter word alone rather than cutting it short", () => {
    // "spelled" must not reduce to "spel" — American spelling does not
    // double a final L the way it doubles P, R, T and the rest, so a doubled
    // L in the input belongs to the base word, not to an inflection.
    expect(stem("spelled")).toBe("spelled");
    expect(stem("cancelled")).toBe("cancelled");
  });

  it("leaves a real double-S word alone rather than cutting it to a non-word", () => {
    // "crossed" must not reduce to "cros", and "passed" must not reduce to
    // "pas" — the CVC shape test alone cannot tell a real double-S base word
    // (cross, pass, miss, kiss, toss, dress) from a genuinely inflected one
    // (the rare gas/gassed, bus/bussed), so the doubling rule leaves S alone
    // the same way it already leaves L alone. A false "no match" costs
    // nothing mentions() didn't already lack; truncating a real word to one
    // that can never equal any valid stem is strictly worse.
    expect(stem("crossed")).toBe("crossed");
    expect(stem("passed")).toBe("passed");
    // Which means the base and inflected forms of a double-S word no longer
    // falsely diverge into a word and a non-word — they simply both fall
    // through unstemmed, so this fallback correctly reports no match rather
    // than inventing one.
    expect(sameStem("cross", "crossed")).toBe(false);
  });

  it("does not double a consonant that was never doubled by inflection", () => {
    // Two consonants that already belong to the stem ("spell") must not be
    // read as the doubling rule just because the CVC shape happens to match.
    expect(sameStem("spell", "spelled")).toBe(false);
  });

  it("leaves an unrelated word unchanged rather than merging it with another", () => {
    expect(sameStem("ship", "shaping")).toBe(false);
    expect(sameStem("refer", "offered")).toBe(false);
  });
});

describe("mentions() stem fallback", () => {
  it("catches verify/verifies, which the suffix regex cannot reach", () => {
    expect(mentions("Please verifies your account now", "verify")).toBe(true);
  });

  it("catches refer/referred, a consonant-doubled inflection", () => {
    expect(mentions("Your refund was referred to the fraud team", "refer")).toBe(true);
  });

  it("still matches the literal suffixes the regex already covered", () => {
    // Guards the fallback against having replaced, rather than supplemented,
    // the existing path.
    expect(mentions("act urgently now", "urgent")).toBe(true);
  });

  it("still anchors the start hard — a prefix collision is unaffected", () => {
    // "claim" inside "unclaimed" is the collision mentions() exists to avoid;
    // the stem fallback must not reopen it from the other direction.
    expect(mentions("Unclaimed baggage goes to the storage room", "claim")).toBe(false);
  });

  it("does not fall back for short entries, matching the regex's own floor", () => {
    // INFLECTION_MIN_LEN excludes entries at or under 4 characters from
    // suffix tolerance at all, because their inflections collide with
    // ordinary words ("pin"/"pins", "cash"/"cashed"). The stem fallback
    // shares that floor rather than reopening it from underneath.
    expect(mentions("Your invoice was paid in full", "pay")).toBe(false);
  });

  it("does not fall back on non-English text", () => {
    // Stemming is an English-specific operation; running it against another
    // language is the entropy trap the roadmap withdrew once already (see
    // languageGuess.ts). A German cognate must not be pulled in by an
    // English pack entry's stem.
    const german = "Ihr Paket wurde beim Zoll zurückgehalten, bitte bezahlen Sie die Gebühr sofort, um es abzuholen";
    expect(mentions(german, "pay")).toBe(false);
  });

  it("does not match an unrelated word sharing no real stem", () => {
    expect(mentions("The new shaping tool arrived", "ship")).toBe(false);
    expect(mentions("We offered a discount", "refer")).toBe(false);
  });
});
