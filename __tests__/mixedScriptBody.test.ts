import { describe, it, expect } from "vitest";
import { mixedScriptWords } from "@veriguard/engine/urlSanitizer";

// mixedScriptWords takes the host-strip as a function, because deciding what is
// a hostname is five guards in extractBareHosts rather than a TLD lookup. The
// cases about the strip therefore run through checkSms, where the engine
// injects the real guard; the cases about word splitting call it directly,
// where the default identity strip is what they want.
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

  // Greek supplies units and symbols as well as lookalikes, and those abut
  // Latin letters and digits in ordinary writing. A pharmacy dispatch note or
  // an electronics order confirmation is one word in two scripts by any
  // structural test, so the Greek half of the range is enumerated down to the
  // letters that can actually carry a homoglyph.
  it.each([
    ["a microgram dose", "Your order of 500\u03bcg supplement shipped"],
    ["a capacitor value", "The 10\u03bcF capacitor arrived"],
    ["a film thickness", "Temperature 20\u00b0C and 5\u03bcm film"],
    ["an ohm rating", "Resistance 4\u03a9 speaker cable"],
    ["a wavelength", "A 500\u03bbnm laser diode"],
    ["a delta notation", "\u0394T of 5K measured"],
  ])("does not flag %s, where the Greek character is a unit", (_label, input) => {
    expect(mixedScriptWords(input)).toEqual([]);
  });

  // …but the Greek letters that DO look Latin must still carry the rule, or
  // narrowing the range has simply removed half the detection.
  it.each([
    ["omicron for o", "Your acc\u03bfunt is locked", ["acc\u03bfunt"]],
    ["alpha for a", "PayP\u03b1l payment failed", ["PayP\u03b1l"]],
    ["iota for i", "verify your \u03b9dentity", ["\u03b9dentity"]],
    ["capital rho for P", "\u03a1aypal alert", ["\u03a1aypal"]],
    ["epsilon for e", "your account is susp\u03b5nded", ["susp\u03b5nded"]],
  ])("still flags %s", (_label, input, expected) => {
    expect(mixedScriptWords(input)).toEqual(expected);
  });

  // The strip cases run through checkSms, not mixedScriptWords directly: the
  // decision they are about lives in isBareHostMatch, which the engine injects
  // and a bare unit call does not have. Testing them with a no-op strip would
  // assert the opposite of production behaviour.
  const flagged = (t: string) =>
    checkSms(t, NO_BLOCKLIST, "AU").flags.some((f) => /Disguised wording/i.test(f));
  const splicedWord = (t: string) =>
    checkSms(t, NO_BLOCKLIST, "AU").flags.find((f) => /Disguised wording/i.test(f))?.match(/"([^"]+)"/)?.[1];

  it.each([
    ["a schemed URL", "Login at http://pаypal.com now"],
    ["a host with a path", "Go to pаypal.com/verify"],
    ["an email address", "email support@pаypal.com"],
  ])("leaves %s to the URL rule", (_label, input) => {
    expect(flagged(input)).toBe(false);
  });

  it("still reads the prose around a spliced URL", () => {
    expect(splicedWord("Login at http://pаypal.com to reаctivate your account")).toBe("reаctivate");
  });

  it("does not truncate a spliced host into a fragment", () => {
    // A hyphen before the host put the match at a later offset, so the strip
    // removed only part of the token and the leftover "pа" was reported as the
    // disguised word — a fragment no reader can act on, on a host that was also
    // being scored by the URL rule.
    const word = splicedWord("Urgent: click -pаypal.com to verify your account now");
    expect(word).not.toBe("pа");
  });

  // The strip must agree with extractBareHosts in BOTH directions. Gating on a
  // TLD set alone got each of these wrong, in opposite ways.
  it.each([
    ["a word-like TLD", "Your ассount.co has been suspended, verify now", "ассount"],
    ["another word-like TLD", "Verify your ассount.app immediately", "ассount"],
    ["an ambiguous TLD", "Your depоsit.bond is refundable", "depоsit"],
    ["a file-extension TLD", "Send the аrchive.zip file when you can", "аrchive"],
  ])("reads %s as prose, as extractBareHosts does", (_label, input, expected) => {
    expect(splicedWord(input)).toBe(expected);
  });

  it("strips nothing when given no strip function", () => {
    // The safe default is identity: a direct caller reads the whole string
    // rather than a guess at what a hostname is. Every local guess at that has
    // been wrong — twice in this rule alone.
    expect(mixedScriptWords("Go to pаypal.com/verify")).toEqual(["pаypal"]);
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

  it("applies on the email path at its full SMS weight", () => {
    // The flag being present is not enough, and asserting only that hid a real
    // defect: the email path scores the body at 0.7, which cut this signal's
    // 25 to 17 and put it under the 20 the rule is deliberately pitched at. An
    // email carrying the evasion read "safe" while the identical SMS body read
    // "suspicious" — on the channel where homoglyph phishing is commonest.
    const body = "Your ассount has been suspended";
    const sms = checkSms(body, NO_BLOCKLIST, "AU");
    const email = checkEmail(`Subject: Alert\n\n${body}`, NO_BLOCKLIST, "AU");

    expect(email.flags.some((f) => /Disguised wording/i.test(f))).toBe(true);
    expect(email.score).toBe(sms.score);
    expect(email.verdict).toBe(sms.verdict);
    expect(email.verdict).not.toBe("safe");
  });

  it("does not score a spliced hostname twice", () => {
    // The URL rule already scores a mixed-script host at 45. Counting the same
    // characters again as prose stacked the two to 60 on a message the URL
    // card had wholly covered.
    const r = checkSms("Login at http://pаypal.com now", NO_BLOCKLIST, "AU");
    expect(r.flags.some((f) => /Disguised wording/i.test(f))).toBe(false);
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
