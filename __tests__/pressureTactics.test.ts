import { describe, it, expect } from "vitest";
import { analysePressureTactics, pressureSummary } from "@/lib/pressureTactics";

// Pressure tactics are reported separately from the scam score, and cannot
// change it. The point of the separation is that a legitimate sale and a scam
// use the SAME lever — "only 2 left" and "confirm within 24 hours" are one
// technique — so naming the technique teaches something that calling a
// retailer suspicious does not.
//
// These tests hold two properties: the rules find real pressure, and they stay
// quiet on messages that merely mention a word a rule cares about.

const count = (t: string) => analysePressureTactics(t).count;
const ids = (t: string) => analysePressureTactics(t).tactics.map((x) => x.id);

describe("finds each technique", () => {
  const cases: Array<[string, string, string]> = [
    ["deadline", "Sale ends tonight — hurry!", "deadline"],
    ["deadline by clock", "Confirm within 24 hours to keep your booking.", "deadline"],
    ["scarcity", "Only 3 left in stock at this price.", "scarcity"],
    ["scarcity by phrasing", "Quantities are limited and this will sell out quickly.", "scarcity"],
    ["conditional reward", "Free delivery when you spend $50.", "conditional-reward"],
    ["loss framing", "Your points are about to expire.", "loss-framing"],
    ["social proof", "2,400 customers bought this today.", "social-proof"],
    ["exclusivity", "Early access, exclusive for you.", "exclusivity"],
    ["escalation", "Final reminder: your basket is waiting.", "escalation"],
  ];

  for (const [name, text, expected] of cases) {
    it(`recognises ${name}`, () => {
      expect(ids(text)).toContain(expected);
    });
  }
});

describe("stays quiet on ordinary messages", () => {
  // The expensive direction. A rule that fires on any message mentioning
  // "limited" or "free" would make the finding meaningless, and would repeat
  // the false-positive problem this whole area exists to fix.
  const quiet: Array<[string, string]> = [
    ["a shipping notice", "Your order #12345 has shipped. Estimated delivery Thursday."],
    ["a newsletter", "This month we visited three farms and wrote up what we learned."],
    ["a statement", "Your statement for September is ready. Log in to view it."],
    ["limited edition", "Our limited edition print run is available in the gallery."],
    ["a limited company", "Registered as a limited company in New South Wales."],
    ["free as a plain adjective", "Feel free to reply if you have any questions."],
    ["a final paragraph", "Finally, thank you for reading this far."],
    ["an ordinary deadline word", "The report ends with a summary of the findings."],
  ];

  for (const [name, text] of quiet) {
    it(`says nothing about ${name}`, () => {
      expect(count(text)).toBe(0);
    });
  }
});

describe("counting", () => {
  it("counts distinct techniques, not repetitions", () => {
    // A message shouting "hurry" four times is pulling one lever. Counting the
    // occurrences would overstate what is happening to the reader.
    const repeated = "Hurry! Hurry — act now. Act fast, hurry, sale ends tonight.";
    expect(count(repeated)).toBe(1);
    expect(ids(repeated)).toEqual(["deadline"]);
  });

  it("counts a message using several levers as several", () => {
    const heavy =
      "FINAL HOURS! Only 3 left in stock. Free delivery when you spend $50. " +
      "2,400 customers bought this. Exclusive for you.";
    expect(count(heavy)).toBeGreaterThanOrEqual(4);
  });

  it("returns nothing for empty input", () => {
    expect(analysePressureTactics("")).toEqual({ tactics: [], count: 0 });
  });

  it("reports tactics in a stable order regardless of where they appear", () => {
    // Order follows the rule definitions, not the text, so two messages using
    // the same techniques read the same way round.
    const a = "Only 2 left. Sale ends tonight.";
    const b = "Sale ends tonight. Only 2 left.";
    expect(ids(a)).toEqual(ids(b));
  });
});

describe("apostrophes", () => {
  it("reads the typographic form as well as the straight one", () => {
    // Real messages mix both, sometimes within one body — mail clients and
    // design tools substitute U+2019 freely. Measured on real mail: one sender
    // used a straight apostrophe and another a curly one for the same phrase.
    expect(ids("Don't miss out!")).toContain("deadline");
    expect(ids("Don’t miss out!")).toContain("deadline");
  });
});

describe("the summary line", () => {
  it("is empty when nothing was found, so a caller can render nothing", () => {
    expect(pressureSummary({ tactics: [], count: 0 })).toBe("");
  });

  it("says how many and which", () => {
    const report = analysePressureTactics("Only 3 left. Sale ends tonight.");
    const summary = pressureSummary(report);
    expect(summary).toContain("2 persuasion techniques");
    expect(summary.toLowerCase()).toContain("deadline");
  });

  it("uses the singular for one", () => {
    expect(pressureSummary(analysePressureTactics("Sale ends tonight."))).toContain(
      "one persuasion technique",
    );
  });

  it("does not tell the reader what to do about it", () => {
    // A sale using three of these is not doing anything wrong. Advising caution
    // about a shop someone subscribed to is the false-positive problem wearing
    // a different hat.
    const summary = pressureSummary(analysePressureTactics("Only 3 left. Ends tonight."));
    expect(summary).not.toMatch(/careful|caution|beware|do not|don't|verify|scam/i);
  });
});

describe("handling hostile input", () => {
  it("bounds very long input", () => {
    // Runs over attacker-controlled text. A caller can hand this an entire
    // page, and the scan must stay linear.
    const huge = "word ".repeat(200_000) + "only 2 left in stock";
    const started = Date.now();
    analysePressureTactics(huge);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does not degrade on repeated near-matches", () => {
    const adversarial = "free ".repeat(20_000);
    const started = Date.now();
    analysePressureTactics(adversarial);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
