import { describe, it, expect } from "vitest";
import { matchedTactics, TACTIC_IDS , TACTIC_TITLES } from "@/lib/signalTactics";
import enNormal from "@/messages/en.normal.json";
import { checkSms, checkUrl } from "@veriguard/engine/scamDetector";
import type { Signal } from "@veriguard/engine/engineTypes";

const sig = (text: string, source: Signal["source"] = "message"): Signal => ({ text, points: 10, source });

describe("matchedTactics", () => {
  it("returns nothing for no signals", () => {
    expect(matchedTactics(undefined).size).toBe(0);
    expect(matchedTactics([]).size).toBe(0);
  });

  it("ignores the clamp row", () => {
    // The clamp is arithmetic about our own ceiling, not an observation about
    // the message — matching it would attribute a tactic to the score cap.
    const clamp: Signal = { text: "Signals total 130 — the score is capped at 100", points: -30, source: "score" };
    expect(matchedTactics([clamp]).size).toBe(0);
  });

  it.each([
    ["urgency", "Urgency language detected: \"account suspended\", \"verify now\"", 1],
    ["impersonation", 'Looks like it\'s Impersonates "mygov" — classic phishing move', 2],
    ["reward", 'Prize/reward language: "you have won"', 3],
    ["authority", "Claims to be from a government agency — verify directly via official channels", 4],
    ["payment", "Asks you to pay a small customs fee to release the parcel", 5],
    ["rapport", "Hi Mum, I dropped my phone and this is my new number", 6],
  ])("recognises %s", (_name, text, id) => {
    expect(matchedTactics([sig(text)]).has(id as 1)).toBe(true);
  });

  it("reports several tactics from one set of signals", () => {
    const found = matchedTactics([
      sig('Urgency language detected: "within 24 hours"'),
      sig('Looks like it\'s Impersonates "Australia Post" — classic phishing move'),
    ]);
    expect(found.has(1)).toBe(true);
    expect(found.has(2)).toBe(true);
  });

  it("finds real tactics in a real scam", () => {
    // The end-to-end case: a message a user would actually paste.
    const r = checkSms(
      "AusPost: your parcel is held pending a $2.15 customs fee. Pay within 24 hours or it's returned: http://auspost-r.tk",
    );
    const found = matchedTactics(r.signals);
    expect(found.size).toBeGreaterThanOrEqual(2);
  });

  it("stays quiet on a benign message", () => {
    const r = checkSms("Hey, are we still on for lunch tomorrow?");
    expect(matchedTactics(r.signals).size).toBe(0);
  });

  it("never returns an id outside the six the Learn page defines", () => {
    const r = checkUrl("http://auspost-redelivery.tk/verify");
    for (const id of matchedTactics(r.signals)) {
      expect(TACTIC_IDS).toContain(id);
    }
  });
});

describe("TACTIC_TITLES", () => {
  it("matches the Learn page's own wording", () => {
    // The emailed verdict has no translator and carries these literals, while
    // the web reads learn.tactics.N.title from the bundle. Two copies of the
    // same six names will drift the moment one is reworded, and the continuity
    // the tactics layer exists for is exactly what drift destroys.
    for (const id of TACTIC_IDS) {
      const fromBundle = (enNormal as Record<string, string>)[`learn.tactics.${id}.title`];
      expect(TACTIC_TITLES[id]).toBe(fromBundle);
    }
  });

  it("names every tactic", () => {
    for (const id of TACTIC_IDS) {
      expect(TACTIC_TITLES[id]).toBeTypeOf("string");
      expect(TACTIC_TITLES[id].length).toBeGreaterThan(0);
    }
  });
});
