import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/engine/scamDetector";

// Scam templates mangle words by dropping letters — "Austalsn Taxation Office",
// "Al rghts reserved", "unsubscribe from tis fst". It defeats a keyword match
// while still reading normally to a human skimming.
//
// The risk in scoring this is the opposite mistake: genuine mail contains
// genuine typos, and a spellchecker-shaped rule would score real organisations
// for clumsy proofreading. So the vocabulary is closed — the region's agency
// and brand names plus the boilerplate scam templates copy — and a token has to
// retain most of the word it corrupts. Both halves are tested here, because the
// false-positive direction is the expensive one for a scam detector: telling
// someone genuine government mail is suspicious teaches them to distrust the
// real thing.

const flagsOf = (text: string) => checkSms(text, undefined, "au").flags.join(" ");
const corrupted = (text: string) => /letters missing|dropping letters/i.test(flagsOf(text));

describe("words corrupted by dropped letters", () => {
  it("notices a mangled copyright footer", () => {
    expect(corrupted("Copyright 2024, Austalsn Taxation Office, Al rghts reserved.")).toBe(true);
  });

  it("scores when several words are mangled at once", () => {
    // One dropped-letter word is within reach of a real typo. Several in one
    // message is a template run through a mangler, and only that scores.
    const many = "Al rghts reserved. You can update you preferencs or unsubscrbe from this lst.";
    const result = checkSms(many, undefined, "au");
    const row = result.signals?.find((s) => /dropping letters/i.test(s.text));
    expect(row?.points ?? 0).toBeGreaterThan(0);
  });

  it("reports a single mangled word without scoring it", () => {
    // Visible to the reader, worth no points on its own.
    const one = "Al rghts reserved.";
    const result = checkSms(one, undefined, "au");
    const row = result.signals?.find((s) => /letters missing/i.test(s.text));
    expect(row).toBeDefined();
    expect(row?.points).toBe(0);
  });
});

describe("what it must NOT flag", () => {
  // Every case here is mail a real organisation could send. A hit on any of
  // them is the rule misfiring on the vocabulary it was built to protect.
  const legitimate: Array<[string, string]> = [
    ["correctly spelled boilerplate", "Copyright 2026, Australian Taxation Office, All rights reserved."],
    ["an unsubscribe footer", "Update your preferences or unsubscribe from this list at any time."],
    ["a genuine parcel notice", "Your Australia Post parcel is on its way. Track it in the AusPost app."],
    ["ordinary account wording", "Hi Sam, thanks for the payment. Your statement is attached."],
    ["agency mail", "The government security notification about your account reference is attached."],
    ["a Medicare claim", "Your Medicare claim has been processed. See your statement in the myGov app."],
  ];

  for (const [name, text] of legitimate) {
    it(`leaves ${name} alone`, () => {
      expect(corrupted(text)).toBe(false);
    });
  }

  it("does not treat a short word as a corruption of a longer one", () => {
    // "sent" is a subsequence of "statement", "post" of "auspost", "count" of
    // "account" — order alone is far too weak a test, and an order-only version
    // of this rule flagged all three in ordinary English.
    expect(corrupted("Sent from my iPhone.")).toBe(false);
    expect(corrupted("The post office count was wrong.")).toBe(false);
  });

  it("does not flag an ordinary misspelling outside the vocabulary", () => {
    // This is not a spellchecker. A typo in a word nobody is impersonating is
    // not evidence of anything.
    expect(corrupted("Sorry for any typos in this messge, sent in a hurry.")).toBe(false);
    expect(corrupted("I recieved the invoice and will pay it tomorow.")).toBe(false);
  });

  it("does not flag plurals or ordinary inflections", () => {
    expect(corrupted("Your payments and statements are in the account.")).toBe(false);
    expect(corrupted("Our offices are closed for the public holiday.")).toBe(false);
  });
});
