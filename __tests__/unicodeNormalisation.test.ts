// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { normaliseUnicode, hasConfusables } from "@veriguard/detect/urlSanitizer";
import { analyzeContent } from "@veriguard/detect/scamDetector";

// Unicode confusables let a hostname render identically to the victim while
// extracting as a different string. Found by the metamorphic eval, which
// asserts an obfuscated input may score higher than its plain form but never
// lower.

const NO_BLOCKLIST = new Set<string>();
const NO_FETCH = () => {
  throw new Error("tests must not perform network I/O");
};

const worst = async (content: string) => {
  const cards = await analyzeContent(content, NO_BLOCKLIST, "AU", { fetcher: NO_FETCH });
  return cards.reduce(
    (acc, c) => (c.result.score > acc.score ? { score: c.result.score, verdict: c.result.verdict } : acc),
    { score: 0, verdict: "safe" as string },
  );
};

describe("normaliseUnicode", () => {
  it.each([
    ["zero-width space", "com​mbank", "commbank"],
    ["zero-width non-joiner", "com‌mbank", "commbank"],
    ["soft hyphen", "com­mbank", "commbank"],
    ["byte-order mark", "com﻿mbank", "commbank"],
    ["word joiner", "com⁠mbank", "commbank"],
  ])("strips the %s NFKC leaves behind", (_label, input, expected) => {
    // NFKC preserves every one of these, so stripping them is a separate pass
    // and not something normalize() would have done on its own.
    expect(input.normalize("NFKC")).toBe(input);
    expect(normaliseUnicode(input)).toBe(expected);
  });

  it.each([
    ["en-dash", "commbank–secure"],
    ["em-dash", "commbank—secure"],
    ["figure dash", "commbank‒secure"],
    ["non-breaking hyphen", "commbank‑secure"],
    ["minus sign", "commbank−secure"],
  ])("folds the %s to an ASCII hyphen", (_label, input) => {
    expect(normaliseUnicode(input)).toBe("commbank-secure");
  });

  it("folds full-width forms via NFKC", () => {
    expect(normaliseUnicode("ｃｏｍｍｂａｎｋ")).toBe("commbank");
    expect(normaliseUnicode("０４１２")).toBe("0412");
    expect(normaliseUnicode("ｈｔｔｐｓ：／／ａ．ｃｏｍ")).toBe("https://a.com");
  });

  it("folds ideographic and one-dot-leader stops to a full stop", () => {
    expect(normaliseUnicode("evil。tk")).toBe("evil.tk");
    expect(normaliseUnicode("evil․tk")).toBe("evil.tk");
  });

  it("leaves ordinary text untouched", () => {
    const plain = "AusPost: your parcel is on board for delivery today. No action needed.";
    expect(normaliseUnicode(plain)).toBe(plain);
    expect(hasConfusables(plain)).toBe(false);
  });

  it("does NOT fold Cyrillic or Greek homoglyphs to Latin", () => {
    // "commbаnk.tk" with a Cyrillic а is a genuinely different domain that
    // resolves elsewhere. Rewriting it to the Latin spelling would make the
    // engine name the real CommBank's hostname while describing the scammer's
    // site — telling the reader the wrong thing about where they went. A
    // mixed-script host is a signal to raise, not a string to rewrite.
    expect(normaliseUnicode("commbаnk.tk")).toBe("commbаnk.tk");
    expect(normaliseUnicode("cοmmbank.tk")).toBe("cοmmbank.tk");
  });

  it("reports whether anything was folded", () => {
    expect(hasConfusables("com​mbank")).toBe(true);
    expect(hasConfusables("commbank")).toBe(false);
  });
});

describe("confusables no longer split a hostname during extraction", () => {
  const PLAIN = "Login at commbank-secure-login.tk/auth to restore access to your suspended account.";

  it.each([
    ["zero-width space", "Login at com​mbank-secure-login.tk/auth to restore access to your suspended account."],
    ["soft hyphen", "Login at comm­bank-secure-login.tk/auth to restore access to your suspended account."],
    ["en-dash separators", "Login at commbank–secure–login.tk/auth to restore access to your suspended account."],
    ["full-width brand", "Login at ｃｏｍｍｂａｎｋ-secure-login.tk/auth to restore access to your suspended account."],
  ])("scores a %s variant no lower than the plain form", async (_label, obfuscated) => {
    const plain = await worst(PLAIN);
    const other = await worst(obfuscated);
    expect(plain.verdict).toBe("likely_scam");
    expect(other.score).toBeGreaterThanOrEqual(plain.score);
  });
});

describe("normalisation runs before refang", () => {
  it("recovers a defanged link written with full-width brackets", async () => {
    // refang keys off literal ASCII "[.]", so this survived it untouched when
    // normalisation ran second — the defang markers were gone from the
    // extractor's view but the dot never came back.
    const ascii = await worst("hxxps://auspost-clearance[.]cyou/pay");
    const wide = await worst("hxxps://auspost-clearance［.］cyou/pay");
    expect(wide.verdict).toBe(ascii.verdict);
    expect(wide.score).toBe(ascii.score);
  });

  it("still refangs an ordinary defanged link", async () => {
    const r = await worst("hxxps://evil-login[.]tk/verify");
    expect(r.verdict).not.toBe("safe");
  });
});

describe("benign content is unaffected", () => {
  it.each([
    "AusPost: your parcel is on board for delivery today between 9am and 5pm. No action needed.",
    "Your myGov Inbox has a new message. Sign in at my.gov.au to read it.",
    "Linkt: your account balance is low. Top up at linkt.com.au or in the Linkt app.",
    "Hey, are we still on for coffee tomorrow morning?",
  ])("does not raise the score of %s", async (text) => {
    // Normalisation must not invent signal. These are the corpus's benign
    // cases; a fold that changed any of them would be a false-positive source.
    const before = await worst(text);
    const after = await worst(normaliseUnicode(text));
    expect(after.score).toBe(before.score);
    expect(after.verdict).toBe(before.verdict);
  });
});
