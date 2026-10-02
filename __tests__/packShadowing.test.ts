// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { resolveRegionPack, supportedRegions } from "@veriguard/detect/regions";
import { checkSms, mentions } from "@veriguard/detect/scamDetector";

// Guards the substring-collision failure mode for multi-word entries (#196).
//
// scamDetector's mentions() matches single tokens on word boundaries, so
// "acc" can't fire inside "account" and — since #233 — "claim" can't fire
// inside "unclaimed". Multi-word phrases still match as substrings, and the
// membership tests all use .some()/.filter() — which short-circuit. So when one
// phrase is a substring of another, the longer one is unreachable: it can never
// be the matching entry.
//
// Most shadowing is harmless. "metropolitan police" is unreachable because
// "police" matches first, but both live in authorityMentions and score the
// same, so the verdict is identical and the dead entry is merely redundant.
//
// The harmful case is when the *shadowing* entry is broader than intended, so
// it fires on text the longer entry never would. That is what shipped and was
// caught in review on #189: "tax resolution oversight" shadowed the fabricated
// "tax resolution oversight department" and, being ordinary tax-industry
// English, flagged legitimate mail as government impersonation.
//
// This test can't tell those two apart — that judgement is the author's. What
// it does is make the collision visible at authoring time, so a new one is a
// decision rather than an accident. KNOWN_SHADOWING is the baseline as it
// stood when the guard was added; a new pair fails until it is either fixed or
// added here with a reason.

// The engine's own matcher, not a mirror of it. This guard models which entries
// can shadow which, so a hand-copied rule that drifts from mentions() reports
// pairs the engine does not have — or hides ones it does.
const matches = (needle: string, hay: string) => mentions(hay, needle);

/** The scoring lists matched by substring against message text. */
const SCORED_LISTS = [
  "urgencyWords",
  "rewardWords",
  "requestWords",
  "authorityMentions",
  "noLinkSenders",
  "foreignAuthorityMentions",
] as const;

/**
 * Shadowed pairs accepted as they stand, `"shadowed" <- "shadowing"`.
 *
 * Keyed on the phrase pair rather than the pack, because the base lists merge
 * into all six regions and would otherwise be listed six times over.
 *
 * Every entry here is the harmless class: the shadowing phrase is itself a
 * legitimate member of the same list, scoring the same weight, so the dead
 * entry changes no verdict. They are kept for readability — "an garda
 * siochana" documents the campaign better than "garda" alone.
 *
 * Both of the pairs this note once flagged for a closer look are gone:
 * "unclaimed" <- "claim" stopped being a pair when #233 made single tokens
 * match on word boundaries, and "risk-free investment" <- "free" was deleted
 * in #234 along with the other 21 entries that only duplicated a shorter one.
 * See #196 for the guard's origin.
 */
const KNOWN_SHADOWING = new Set([
  // base — reward
  // base — urgency
  // AU
  // CA
  "canadian anti-fraud centre <- anti-fraud centre",
  "royal canadian mounted police <- police",
  // GB
  "metropolitan police <- police",
  "nhs england <- nhs",
  // IE
  "an garda siochana <- garda",
  "an garda siochana <- garda siochana",
  "garda siochana <- garda",
  "central bank of ireland <- central bank",
  "department of social protection <- social protection",
  "revenue commissioners <- revenue",
  // NZ
  "new zealand police <- police",
  "nz police <- police",
  // US
  "centers for medicare <- medicare",
  "social security administration <- social security",
  "united states postal service <- postal service",
  // US. "final notice" is broad, but it scores +10 and leaves an ordinary
  // message ("Final notice: our newsletter is moving") at 10 / safe, which is
  // the intended weak-signal behaviour — it needs corroboration to matter.
  // The bare "your account" pair that used to sit here is gone: that entry was
  // removed, since a noun phrase is not pressure language. See the note on
  // URGENCY_GENERIC in lib/regions/base.ts.
]);

// Two pairs left this allowlist with #233: "unclaimed <- claim" and
// "gardai <- garda". Both were single tokens reaching inside a longer entry,
// which word-boundary matching makes impossible — the longer entry is now
// reachable on its own.
//
// "meter reading required urgently <- urgent" stays: mentions() tolerates an
// inflectional suffix, so "urgent" still matches "urgently" by design.

describe("region pack substring shadowing", () => {
  it("has no unreviewed shadowed entries in any scoring list", () => {
    const found = new Set<string>();

    for (const code of supportedRegions()) {
      const pack = resolveRegionPack(code) as unknown as Record<string, unknown>;
      for (const key of SCORED_LISTS) {
        const list = pack[key];
        if (!Array.isArray(list)) continue;
        const entries = (list as string[]).map((e) => e.toLowerCase());
        for (const shadowing of entries) {
          for (const shadowed of entries) {
            if (shadowing === shadowed) continue;
            if (matches(shadowing, shadowed)) {
              found.add(`${shadowed} <- ${shadowing}`);
            }
          }
        }
      }
    }

    const unreviewed = [...found].filter((p) => !KNOWN_SHADOWING.has(p)).sort();
    expect(
      unreviewed,
      "New shadowed entries. The longer phrase is unreachable — .some() " +
        "short-circuits on the shorter one. Either drop the redundant entry, " +
        "or add the pair to KNOWN_SHADOWING with a reason. If the SHORTER " +
        "phrase is broad enough to match ordinary English, drop that one " +
        "instead — see #189.",
    ).toEqual([]);
  });

  it("keeps the allowlist free of pairs that no longer exist", () => {
    const found = new Set<string>();
    for (const code of supportedRegions()) {
      const pack = resolveRegionPack(code) as unknown as Record<string, unknown>;
      for (const key of SCORED_LISTS) {
        const list = pack[key];
        if (!Array.isArray(list)) continue;
        const entries = (list as string[]).map((e) => e.toLowerCase());
        for (const a of entries) {
          for (const b of entries) {
            if (a !== b && matches(a, b)) found.add(`${b} <- ${a}`);
          }
        }
      }
    }
    const stale = [...KNOWN_SHADOWING].filter((p) => !found.has(p)).sort();
    expect(stale, "Allowlist entries with no matching pair — remove them.").toEqual([]);
  });
});

// ── Short scored entries must match on word boundaries ────────────────────────
//
// urgencyWords, rewardWords and requestWords were matched with a bare
// `includes()`, so short entries fired inside ordinary English: "pin" in
// "Pinned", "free" in "Freedom", "ato" in "atomic". Each added 12–15 points to
// innocuous text, and the flag then quoted the fragment as evidence — "Asks for
// sensitive info: 'pin'" on a message about a pinned document.
//
// scamDetector's `mentions()` already solved this for the authority lists;
// these lists simply never adopted it. #196 extended the protection to entries
// of 4 characters or fewer, which covered "pin", "free" and "ato" but stopped
// one letter short of "claim", "prize" and "voucher" — see #233 and the
// regression cover in keywordWordBoundaries.test.ts. The rule is now
// token-based rather than length-based: every single-token entry is anchored.

describe("short scored entries do not fire inside longer words", () => {
  const INNOCUOUS = [
    ["Pinned the document to the top of the channel.", "pin"],
    ["Freedom of information request received.", "free"],
    ["The atomic clock experiment is precise.", "ato"],
    ["Shipping is included on every order.", "pin"],
    ["Please review the attached information.", "ato"],
  ] as const;

  for (const [text, fragment] of INNOCUOUS) {
    it(`does not flag "${fragment}" inside: ${text.slice(0, 34)}…`, () => {
      const result = checkSms(text, undefined, "AU");
      expect(result.flags.some((f) => f.includes(`"${fragment}"`)), result.flags.join(" | ")).toBe(false);
      expect(result.verdict).toBe("safe");
    });
  }

  it("still matches those same entries as whole words", () => {
    // The entries exist for a reason — this is the behaviour being preserved.
    const scam = "ATO: confirm your TFN and PIN to release your refund";
    const result = checkSms(scam, undefined, "AU");
    expect(result.flags.some((f) => /Asks for sensitive info/i.test(f))).toBe(true);
    expect(result.score).toBeGreaterThan(0);
  });

  it("keeps scoring a real scam at full strength", () => {
    const scam = "ATO: your tax refund is pending, confirm your TFN at http://ato-refund.xyz";
    expect(checkSms(scam, undefined, "AU").verdict).toBe("likely_scam");
  });

  it("still catches a free-prize lure", () => {
    const scam = "You have won a free prize! Claim now at http://prize.tk";
    const result = checkSms(scam, undefined, "AU");
    expect(result.flags.some((f) => /Prize\/reward language/i.test(f))).toBe(true);
  });
});
