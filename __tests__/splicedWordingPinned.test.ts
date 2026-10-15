// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkEmail, checkCustom } from "@veriguard/detect/scamDetector";

// Every score the splice rule produces today, pinned before its scoring moves
// into the signal registry.
//
// Committed in its own change, ahead of the conversion, for the reason
// `checkPhonePinned` and `clickFixPinned` were: a characterisation test answers
// "did this change behaviour", a test written from intent answers "is this what
// I meant", and only the first is a refactor's safety net. Every expectation
// below was read off the running engine across the three channels that score
// this rule, not derived from what the code ought to do.
//
// `mixedScriptBody.test.ts` already covers what the rule decides — which words
// are spliced, which scripts count, what the strip removes. It asserts almost
// no scores, which is the gap this file fills: the conversion can preserve every
// decision and still change what each one is worth.
//
// Four properties this file exists to hold, each a way the conversion can go
// wrong while every decision still looks right:
//
//   · **One row per message, not one per word.** The rule names up to three
//     spliced words in a single 25-point row. In the registry a signal returns
//     an array of hits and each hit is scored at the declared weight, so the
//     natural shape — a hit per word — turns a three-word splice into 75. That
//     is the single likeliest way this conversion goes wrong, and the message
//     it goes wrong on is the ordinary one: a real evasion splices every
//     keyword, not one.
//   · **Exactly 25, on every channel including email.** The row sits in
//     `UNDISCOUNTED_COMPOSITES` today, exempted from the body pass's 0.7 by
//     string-prefix match. It is in that list because the discount once cut it
//     to 17, under the 20 the rule is deliberately pitched at, on the channel
//     where homoglyph phishing is commonest. Converted, the signal declares 25
//     itself; 25 on email is what says the declaration replaced the exemption
//     rather than losing it.
//   · **The surrounding body is still discounted.** The inverse error, and the
//     one a pin of the row alone cannot see: lifting the whole email body to
//     1.0 would also hold the row at 25 and pass. The mixed cases below carry
//     live keywords for exactly this, and their email totals are *lower* than
//     their SMS totals while the splice row itself is not.
//   · **The strip still agrees with the URL rule.** A token the splice rule
//     strips is exactly a token the bare-host extractor raises a URL card for.
//     This conversion moves that shared guard into its own module, so both
//     directions are pinned: URL-owned text scores no splice row, and prose
//     that merely looks host-shaped still does.

/** How a reader identifies the row. Deliberately the prose, not an id. */
const FLAG = "Disguised wording";

const asEmail = (body: string) =>
  `From: Someone <someone@example.invalid>\nSubject: hi\n\n${body}`;

/**
 * One case per distinguishable path through the rule.
 *
 * `words` is the spliced words the row names, in order, which is what makes the
 * single-row property checkable rather than merely plausible: a conversion that
 * scored one hit per word would still name the same three words, and only the
 * row count and the points separate the two outcomes.
 *
 * `score` is the whole message's score, not the signal's. A conversion that
 * reproduces the row and changes what fires around it is still a behaviour
 * change, and the totals are where that shows up.
 */
const cases: Array<{
  label: string;
  text: string;
  words: string[];
  sms: number;
  email: number;
  custom: number;
}> = [
  // ── The row fires: one hit, 25 points, up to three words named ───────────
  {
    label: "one Cyrillic a in a Latin word",
    text: "Your аccount has been suspended",
    words: ["аccount"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "three Cyrillic characters in one word",
    text: "Your ассount has been suspended",
    words: ["ассount"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "a spliced brand name",
    text: "Your PayPаl payment failed",
    words: ["PayPаl"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "Greek omicron rather than Cyrillic",
    text: "Your accοunt is locked",
    words: ["accοunt"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "splicing across a hyphen",
    text: "re-аctivate your account",
    words: ["аctivate"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  // The multi-word cases are the single-row property. Each is still 25.
  {
    label: "two spliced words",
    text: "Your аccount is suspеnded",
    words: ["аccount", "suspеnded"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "three spliced words",
    text: "Your аccount is suspеnded, vеrify now",
    words: ["аccount", "suspеnded", "vеrify"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "four spliced words, only the first three named",
    text: "Yпur аccount is suspеnded, vеrify now",
    words: ["Yпur", "аccount", "suspеnded"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "the splice alone, with no keyword to corroborate it",
    text: "Hеllo thеre",
    words: ["Hеllo", "thеre"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "the full evasion that scored nothing before the rule existed",
    text: "Your Nеtflix subsсription is abпut to eхpire, rеnew now",
    words: ["Nеtflix", "subsсription", "abпut"],
    sms: 25,
    email: 25,
    custom: 25,
  },

  // ── The row fires alongside live keywords ────────────────────────────────
  //
  // These are what hold the second half of the undiscount property. The splice
  // row is 25 on all three channels while the TOTAL is lower on email, so a
  // conversion that lifted the whole body pass to 1.0 — preserving this row by
  // removing the discount entirely — fails here rather than in a probe later.
  {
    label: "splice plus live urgency and request keywords",
    text: "URGENT: your аccount has been suspended, verify now to avoid closure",
    words: ["аccount"],
    sms: 45,
    email: 39,
    custom: 41,
  },
  {
    label: "prose spliced around a URL the link rule owns",
    text: "Login at http://pаypal.com to reаctivate your account",
    words: ["reаctivate"],
    sms: 60,
    email: 49,
    custom: 55,
  },

  // ── The strip: text the URL rule owns is not prose ───────────────────────
  //
  // Pinned in both directions because this conversion moves the shared bare-host
  // guard into its own module. Approximating that guard locally has been wrong
  // twice in this rule alone, each time in both directions at once.
  {
    label: "a schemed URL and nothing else",
    text: "Login at http://pаypal.com now",
    words: [],
    sms: 35,
    email: 24,
    custom: 30,
  },
  {
    label: "a bare host with a path",
    text: "Go to pаypal.com/verify",
    words: [],
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "an email address",
    text: "email support@pаypal.com",
    words: [],
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "a hyphen immediately before a spliced host",
    // The host sits at a later offset, which once made the strip remove only
    // part of the token and report the fragment "p<cyrillic a>" as the
    // disguised word. The word named here is the whole token.
    text: "Urgent: click -pаypal.com to verify your account now",
    words: ["pаypal"],
    sms: 45,
    email: 39,
    custom: 41,
  },
  // The other direction: host-shaped prose the URL rule declines, so the splice
  // rule must read it. A TLD-set-only strip got each of these wrong.
  {
    label: "a word-like TLD, read as prose",
    text: "Your ассount.co has been suspended, verify now",
    words: ["ассount"],
    sms: 35,
    email: 32,
    custom: 33,
  },
  {
    label: "another word-like TLD",
    text: "Verify your ассount.app immediately",
    words: ["ассount"],
    sms: 35,
    email: 32,
    custom: 33,
  },
  {
    label: "an ambiguous TLD that is also an ordinary word",
    text: "Your depпsit.bond is refundable",
    words: ["depпsit"],
    sms: 25,
    email: 25,
    custom: 25,
  },
  {
    label: "a file-extension TLD",
    text: "Send the аrchive.zip file when you can",
    words: ["аrchive"],
    sms: 25,
    email: 25,
    custom: 25,
  },

  // ── Silent: ordinary writing in any script ──────────────────────────────
  //
  // The regression this rule must never become. The broad version of it — "the
  // message contains a non-Latin script" — flags every one of these, and was
  // measured and rejected for taxing people for not writing in Latin.
  {
    label: "plain English with no splice",
    text: "Your account has been suspended",
    words: [],
    sms: 20,
    email: 14,
    custom: 16,
  },
  {
    label: "wholly Russian text",
    text: "Ваша посылка задержана",
    words: [],
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "wholly Greek text",
    text: "Το δέμα σας κρατείται",
    words: [],
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "bilingual text with no mixing inside a word",
    text: "Привет! Meeting at 10am.",
    words: [],
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "a Greek letter used as a unit, abutting a digit",
    text: "Your order of 500μg supplement shipped",
    words: [],
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "Japanese attached to a Latin brand",
    text: "iPhoneを買いました",
    words: [],
    sms: 0,
    email: 0,
    custom: 10,
  },
  {
    label: "no splice and no keyword",
    text: "Your parcel is waiting for delivery confirmation.",
    words: [],
    sms: 0,
    email: 0,
    custom: 10,
  },
];

/** The splice rows a result carries, identified the way a reader would. */
const spliceRows = (r: { signals?: Array<{ text: string; points: number }> }) =>
  (r.signals ?? []).filter((s) => s.text.startsWith(FLAG));

describe("spliced-wording scoring, pinned before the registry conversion", () => {
  it.each(cases)("$label — SMS", ({ text, words, sms }) => {
    const r = checkSms(text, undefined, "AU");
    expect(r.score).toBe(sms);
    expectRow(r, words);
  });

  it.each(cases)("$label — email", ({ text, words, email }) => {
    const r = checkEmail(asEmail(text), undefined, "AU");
    expect(r.score).toBe(email);
    expectRow(r, words);
  });

  it.each(cases)("$label — custom", ({ text, words, custom }) => {
    const r = checkCustom(text, undefined, "AU");
    expect(r.score).toBe(custom);
    expectRow(r, words);
  });
});

/**
 * Exactly one row, carrying exactly 25, naming exactly these words — or none.
 *
 * The row count is asserted rather than the row's presence, because "a splice
 * row is there at 25" is also true of a result carrying three of them. And the
 * words are read out of the prose the reader is shown, so a conversion that
 * reproduces the score while reporting a fragment, a different word, or the
 * fourth word instead of the first three fails here too.
 */
function expectRow(
  r: { signals?: Array<{ text: string; points: number }> },
  words: string[],
): void {
  const rows = spliceRows(r);
  if (words.length === 0) {
    expect(rows).toEqual([]);
    return;
  }
  expect(rows).toHaveLength(1);
  expect(rows[0].points).toBe(25);
  // Quoted words, in the order the row names them.
  const named = [...rows[0].text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  expect(named).toEqual(words);
  // The singular/plural agreement is part of what a reader sees, and it is
  // derived from the count — so it is the one piece of the wording that a
  // conversion can get wrong without changing a number.
  expect(rows[0].text).toContain(words.length > 1 ? "the words" : "the word");
}
