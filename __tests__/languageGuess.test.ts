// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { looksNonEnglish } from "@veriguard/detect/languageGuess";
import { checkSms, checkCustom, checkEmail } from "@veriguard/detect/scamDetector";

// The coverage-honesty gap item 4b measured directly: a non-English message
// scores 0/"unknown" with no rule to blame it on, because every keyword list
// is English regardless of region. looksNonEnglish is the missing input to
// the fix the roadmap already names — "let the coverage tier express a
// language gap separately from depth" — and it is deliberately an ABSTENTION
// signal, never a detection one: its only power is to turn a confident "safe"
// into "unknown". It must never add a point and must never fire on English.

describe("looksNonEnglish", () => {
  it.each([
    ["plain English scam wording", "Your account has been suspended, verify now to avoid closure"],
    ["terse English SMS", "URGENT: Your parcel is held, pay $4.99 customs fee now: bit.ly/x"],
    ["English with mostly punctuation and a URL", "Click here 👉 http://evil.tk to claim your prize now!!!"],
    ["English brand names strung together", "PayPal Amazon Netflix Microsoft account alert now"],
  ])("does not flag %s", (_label, text) => {
    expect(looksNonEnglish(text)).toBe(false);
  });

  it.each([
    ["wholly Russian", "Ваша посылка задержана на таможне, оплатите сбор немедленно, чтобы получить посылку обратно"],
    ["wholly Greek", "Το δέμα σας κρατείται στο τελωνείο, πληρώστε το τέλος για να το παραλάβετε αμέσως"],
    ["wholly Chinese", "您的包裹被海关扣留，请立即支付关税以便领取包裹，否则将被退回原寄地"],
    ["German, long enough to judge", "Ihr Paket wurde beim Zoll zurückgehalten, bitte bezahlen Sie die Gebühr sofort, um es abzuholen"],
    ["French, long enough to judge", "Votre colis est retenu à la douane, payez les frais maintenant pour le récupérer immédiatement"],
    ["Japanese", "本日中にお荷物の配送手続きを完了してください。期限を過ぎると返送されます。必ずご確認ください。"],
  ])("flags %s", (_label, text) => {
    expect(looksNonEnglish(text)).toBe(true);
  });

  // Constraint 1: short text must return "can't tell" (false), never
  // "downgrade harder". Below the length floor there is not enough signal in
  // either direction, so the safe default — treat as English — applies.
  it.each([
    ["a short Russian greeting", "Привет!"],
    ["a short German phrase", "Hallo da"],
    ["digits only", "123 456 7890"],
    ["mostly a URL, little prose", "http://totally-legit-bank-secure-login-verify.tk/account/verify/now"],
  ])("does not flag %s — too short to judge", (_label, text) => {
    expect(looksNonEnglish(text)).toBe(false);
  });

  it("does not flag bilingual text carrying real English words", () => {
    // Mixed-language texting is ordinary, and the stopword ratio is deliberately
    // forgiving: a message is judged on whether English function words turn up
    // at all, not on what fraction of it is English.
    expect(looksNonEnglish("Привет! Your account verify now пожалуйста click link немедленно")).toBe(false);
  });
});

describe("looksNonEnglish feeds the coverage downgrade, never the score", () => {
  const NO_BLOCKLIST = new Set<string>();
  const NON_ENGLISH = "Ihr Paket wurde beim Zoll zurückgehalten, bitte bezahlen Sie die Gebühr sofort, um es abzuholen";

  it("downgrades a clean non-English SMS to unknown even under full coverage", () => {
    // AU is a `full` pack. Without the language signal this reads as a
    // confident "safe" — the exact gap item 4b measured.
    const r = checkSms(NON_ENGLISH, NO_BLOCKLIST, "AU");
    expect(r.coverage).toBe("full");
    expect(r.verdict).toBe("unknown");
    expect(r.details).toContain("doesn't read as English");
  });

  it("applies on checkCustom and checkEmail too", () => {
    expect(checkCustom(NON_ENGLISH, NO_BLOCKLIST, "AU").verdict).toBe("unknown");
    expect(checkEmail(`Subject: Hinweis\n\n${NON_ENGLISH}`, NO_BLOCKLIST, "AU").verdict).toBe("unknown");
  });

  it("never adds a point — a positive detection is unaffected", () => {
    // The downgrade only touches a "safe" verdict. A message with real signal
    // in it must score and flag identically whether or not it also reads as
    // non-English — this guards against the language input leaking into sig.
    const scamEnglish = "Your account has been suspended, verify now to avoid closure http://bit.ly/x";
    const withEnglish = checkSms(scamEnglish, NO_BLOCKLIST, "AU");
    expect(withEnglish.verdict).not.toBe("unknown");

    // A non-English message that still trips a base signal (a shortener) must
    // keep that score — the downgrade must not suppress a real finding, only
    // soften an otherwise-clean one.
    const scamNonEnglish = `${NON_ENGLISH} http://bit.ly/x`;
    const r = checkSms(scamNonEnglish, NO_BLOCKLIST, "AU");
    expect(r.verdict).not.toBe("unknown");
    expect(r.flags.join(" ")).toContain("dodgy too");
  });

  it("does not downgrade a clean English message", () => {
    // The regression that matters most: a false "not English" on English text
    // would suppress a working "safe" verdict.
    const r = checkSms("Hey, are we still on for coffee tomorrow morning?", NO_BLOCKLIST, "AU");
    expect(r.verdict).toBe("safe");
  });

  it("still downgrades under no coverage, and names both reasons", () => {
    // Under `none` coverage every clean result already downgrades on coverage
    // alone, and this text also reads as non-English — two independent
    // grounds to withhold "safe". Neither may silently eclipse the other:
    // dropping the coverage reason because language already downgraded (or
    // vice versa) is the same false-confidence failure this mechanism exists
    // to prevent, just hidden one level down in which caveat the reader sees.
    const r = checkSms(NON_ENGLISH, NO_BLOCKLIST, "ZZ");
    expect(r.verdict).toBe("unknown");
    expect(r.details).toContain("doesn't read as English");
    expect(r.details).toContain("don't have full scam-detection rules for your region");
  });
});
