import { describe, it, expect } from "vitest";
import { mixedScriptWords } from "@veriguard/engine/urlSanitizer";
import { checkSms, checkCustom, checkEmail } from "@veriguard/engine/scamDetector";

// Homoglyph splicing in the MESSAGE BODY, as distinct from the hostname case
// covered by unicodeNormalisation.test.ts and punycodeDomains.test.ts.
//
// The keyword lists are matched as literal Latin text, so one Cyrillic
// character inside a word removes that word from detection. Measured before
// the rule existed: five of seven sampled scam messages evaded, three of them
// dropping to a score of 0 while rendering identically to the reader.

const NO_BLOCKLIST = new Set<string>();

describe("mixedScriptWords", () => {
  it.each([
    ["Cyrillic а spliced into a Latin word", "Your ассount has been suspended", ["ассount"]],
    ["a brand name with one Cyrillic а", "Your PayPаl payment failed", ["PayPаl"]],
    ["splicing across a hyphen", "re-аctivate your account", ["аctivate"]],
    ["Greek omicron in a Latin word", "Your accοunt is locked", ["accοunt"]],
  ])("flags %s", (_label, input, expected) => {
    expect(mixedScriptWords(input)).toEqual(expected);
  });

  // The false-positive direction. Every case here is ordinary writing, and the
  // rule exists in this narrow shape *because* the broad version — "the message
  // contains a non-Latin script" — flags all of them. That broader signal was
  // measured and rejected: it promoted more benign messages than scams at every
  // weight tried, taxing people for not writing in Latin script.
  it.each([
    ["plain English", "Your account has been suspended"],
    ["wholly Russian text", "Ваша посылка задержана. Оплатите сбор."],
    ["wholly Greek text", "Το δέμα σας κρατείται"],
    ["bilingual text with no word mixing", "Привет! Meeting at 10am. Спасибо!"],
    ["a Latin brand inside Greek prose", "Δείτε το Google Drive εδώ"],
    ["Chinese", "您的包裹被扣留"],
    ["Thai", "พัสดุของคุณถูกระงับ"],
    ["Arabic", "طردك محتجز"],
    ["Hebrew", "היי, שלחתי לך את הקובץ"],
    ["German umlauts", "Überweisung für München"],
    ["French accents", "Votre colis est retenu à la douane"],
  ])("does not flag %s", (_label, input) => {
    expect(mixedScriptWords(input)).toEqual([]);
  });

  // These reach the SCRIPT guard specifically, which the cases above do not:
  // a pure-Thai or pure-Chinese message has no Latin letter, so it is rejected
  // before CONFUSABLE_SCRIPTS is ever consulted and proves nothing about which
  // scripts are listed there. Here a non-confusable script sits *inside* a
  // Latin word — ordinary writing in CJK, Arabic and Indic text — so widening
  // the range to "any non-Latin script" flags all of them.
  it.each([
    ["Japanese attached to a Latin brand", "iPhoneを買いました"],
    ["a Chinese compound on a Latin brand", "Google地图"],
    ["Thai attached to a Latin brand", "สั่งซื้อทาง Lazadaแล้ว"],
    ["Korean attached to a Latin brand", "Netflix에서 봤어요"],
    ["Arabic attached to a Latin brand", "حسابك على WhatsAppمغلق"],
    ["Hebrew attached to a Latin brand", "שלחתי בWhatsApp"],
    ["Devanagari attached to a Latin brand", "मैंने Amazonसे मंगवाया"],
  ])("does not flag %s, which shares no shapes with Latin", (_label, input) => {
    expect(mixedScriptWords(input)).toEqual([]);
  });

  it("does not treat a wholly-Cyrillic word as mixed", () => {
    // The guard that makes this work is testing for [a-z] rather than \p{L}:
    // the confusable characters are themselves letters, so a Unicode-letter
    // test would make every Cyrillic word qualify as "mixed".
    expect(mixedScriptWords("посылка задержана")).toEqual([]);
  });
});

describe("splicing no longer removes a message from detection", () => {
  it("keeps a spliced scam above unknown where the plain form scored 30", () => {
    const plain = checkSms("Your account has been suspended, verify now to avoid closure", NO_BLOCKLIST, "AU");
    const spliced = checkSms("Your aсcount has been susрended, vеrify now to avоid clоsure", NO_BLOCKLIST, "AU");

    // The plain form is detected on its keywords.
    expect(plain.score).toBeGreaterThanOrEqual(20);
    // The spliced form matches none of them — that is the evasion, and it is
    // why the rule cannot be written as "the keyword layer will catch it".
    expect(spliced.flags.some((f) => /urgency/i.test(f))).toBe(false);
    // But it no longer falls to nothing.
    expect(spliced.score).toBeGreaterThanOrEqual(20);
    expect(spliced.verdict).not.toBe("unknown");
  });

  it("scores a spliced message that scored zero before", () => {
    const spliced = checkSms("Your Nеtflix subsсription is abоut to eхpire, rеnew now", NO_BLOCKLIST, "AU");
    expect(spliced.score).toBeGreaterThanOrEqual(20);
    expect(spliced.flags.some((f) => /Disguised wording/i.test(f))).toBe(true);
  });

  it("names the offending word in the flag", () => {
    const r = checkSms("Your ассount has been suspended", NO_BLOCKLIST, "AU");
    expect(r.flags.some((f) => f.includes("ассount"))).toBe(true);
  });

  it("applies on the pasted-text path too", () => {
    // checkCustom keeps its own keyword pass rather than delegating to
    // checkSms, so it inherits the evasion independently.
    const r = checkCustom("Your ассount has been suspended", NO_BLOCKLIST, "AU");
    expect(r.flags.some((f) => /Disguised wording/i.test(f))).toBe(true);
  });

  it("applies on the email path via the merged SMS pass", () => {
    const r = checkEmail("Subject: Alert\n\nYour ассount has been suspended", NO_BLOCKLIST, "AU");
    expect(r.flags.some((f) => /Disguised wording/i.test(f))).toBe(true);
  });

  it("stays below likely_scam on the splice alone", () => {
    // The rule restores a floor, not a conviction: it cannot see what was
    // evaded, so it must not deliver the verdict the keyword layer would have
    // had to earn.
    const r = checkSms("Hеllo thеre", NO_BLOCKLIST, "AU");
    expect(r.verdict).toBe("suspicious");
    expect(r.score).toBeLessThan(45);
  });

  it("leaves ordinary non-Latin messages alone", () => {
    // The regression this rule must never become: scoring someone for writing
    // in their own language.
    for (const text of ["Ваша посылка задержана", "您的包裹被扣留", "Το δέμα σας κρατείται"]) {
      const r = checkSms(text, NO_BLOCKLIST, "ZZ");
      expect(r.flags.some((f) => /Disguised wording/i.test(f))).toBe(false);
    }
  });
});
