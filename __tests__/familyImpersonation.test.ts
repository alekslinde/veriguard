import { describe, expect, it } from "vitest";
import { checkEmail, checkSms, stripForwardingPrefix } from "@veriguard/scam-detect/scamDetector";

// The "Hi Mum" script (D2 / #251). Before this rule every message below scored
// zero and rendered as "Looks pretty right to us" — the worst possible answer
// for the most-reported scam text in AU.
describe("family impersonation (Hi Mum)", () => {
  const scams = [
    "mum send me 400 my phone broke, send it as quick as you can",
    "Hi Mum, this is my new number, my phone broke. Can you send $400?",
    "Hi Dad I dropped my phone, text me on this number. I need you to transfer 1200 today please",
    "Hello mum, lost my phone. Could you please send me money urgently",
    "Hi Mum, using my friend's phone. Can you transfer $850 to this account today?",
  ];

  it.each(scams)("flags the script: %s", (text) => {
    const r = checkSms(text);
    expect(r.score).toBeGreaterThanOrEqual(45);
    expect(r.verdict).toBe("likely_scam");
  });

  it("names the pretext in the advice, not just the verdict", () => {
    const r = checkSms("Hi Mum, this is my new number, my phone broke. Can you send $400?");
    const evidence = (r.signals ?? []).map((s) => s.text).join(" ");
    expect(evidence).toMatch(/new number|broken-phone/i);
    // The advice has to give the reader the out-of-band check, since that is
    // the only thing that actually defeats this scam.
    expect(evidence).toMatch(/usual number|number you already have/i);
  });

  // Each half is ordinary family texting. The composite only fires on all of
  // them at once, and these guard that it stays that way.
  const legit = [
    "Mum can you pick me up at 5",
    "Hi Mum, happy birthday! Love you",
    "Dad my phone broke, I'll call you from the landline later",
    "Mum I'll send you the 40 dollars I owe you tomorrow",
    "Hey mate, send me 400 for the tickets when you can",
    "Mum, dinner at 7? I'll pay for the 200 dollar booking",
    "I'll ask mum about the weekend and send you 50 for petrol",
  ];

  it.each(legit)("leaves ordinary family texts alone: %s", (text) => {
    expect(checkSms(text).verdict).toBe("safe");
  });

  // The script runs by email as readily as by SMS, and the email path very
  // nearly missed it twice: the anchor was testing the "From:" line rather than
  // the body, and the blanket 0.7 email discount then demoted a 45 to a 31.
  describe("over email", () => {
    const body = "Hi Mum, this is my new number, my phone broke. Can you send $400?";
    const withHeaders = `From: Sarah <sarah.j.9912@gmail.com>\nSubject: hi\n\n${body}`;

    it("fires through the header block, not just on a bare body", () => {
      expect(checkEmail(withHeaders).verdict).toBe("likely_scam");
    });

    it("does not let the email discount demote the script to 'suspicious'", () => {
      const r = checkEmail(withHeaders);
      expect(r.score).toBeGreaterThanOrEqual(45);
      // Same conclusion the SMS path reaches for the same words.
      expect(r.verdict).toBe(checkSms(body).verdict);
    });

    it("keeps the evidence adding up to the score it shows", () => {
      const r = checkEmail(withHeaders);
      const summed = (r.signals ?? []).reduce((n, s) => n + s.points, 0);
      expect(summed).toBe(r.score);
      // The floor must not reach the score by padding in a blank row.
      expect((r.flags ?? []).every((f) => f.trim().length > 0)).toBe(true);
    });

    it("a body that merely contains a blank line is not treated as headers", () => {
      expect(checkEmail(`Hi Mum\n\n${body}`).verdict).toBe("likely_scam");
    });

    it("leaves an ordinary family email alone", () => {
      const r = checkEmail(
        "From: Sarah <sarah@work.com>\nSubject: dinner\n\nHi Mum, dinner at 7 tomorrow? I'll pay for the booking.",
      );
      expect(r.verdict).toBe("safe");
    });
  });

  // Forwarding is how the script most often reaches a checker — "is this real?"
  // is the whole reason someone forwards it — and the opener anchor stopped
  // firing the moment a mail client wrapped the text.
  describe("survives being forwarded", () => {
    const core = "Hi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?";

    it.each([
      ["a forwarded-message marker", `---------- Forwarded message ----------\n\n${core}`],
      ["a Fwd: subject prefix", `Fwd: ${core}`],
      ["an FW: subject prefix", `FW: ${core}`],
      ["Begin forwarded message:", `Begin forwarded message:\n\n${core}`],
      ["a header block", `From: +61 400 000 000\nDate: 2 Sep 2026\nSubject: hi\n\n${core}`],
      ["an on-wrote attribution", `On Tue, 2 Sep 2026 at 10:42, Unknown wrote:\n\n${core}`],
      ["a chat export line", `02/09/2026, 10:42 - Unknown: ${core}`],
      ["quote markers", `> ${core}`],
    ])("fires through %s", (_label, text) => {
      expect(checkSms(text, undefined, "AU").verdict).toBe("likely_scam");
    });

    it("does not skip ordinary prose", () => {
      // Only recognised scaffolding is stripped — a closed list of shapes, not
      // "anything before the first blank line".
      //
      // Asserted on the stripper, not the verdict: the anchor now also matches
      // a vocative anywhere in the body, so a padded script is caught either
      // way. That is deliberate — burying the script in prose was a live false
      // negative — and it means the verdict can no longer tell us whether the
      // prefix was stripped.
      const padded = `Hi there, hope you had a good weekend.\n\n${core}`;
      expect(stripForwardingPrefix(padded)).toContain("hope you had a good weekend");
    });

    it("still catches the script when it is buried in prose", () => {
      const padded = `Hi there, hope you had a good weekend.\n\n${core}\n\nThanks again.`;
      expect(checkSms(padded, undefined, "AU").verdict).toBe("likely_scam");
    });
  });

  describe("catches the script when the term is not first", () => {
    // Position and address are different things. These carry all three halves —
    // relation term, money ask, number pretext — and scored safe (0) purely
    // because the term is not at the start. Found by the benign-padding
    // metamorphic relation, which was reporting the same gap as a violation.
    it.each([
      "Just letting you know, I got a new number after my phone broke. Mum, can you transfer $200 for the rego?",
      "Hope you're well. I dropped my phone and this is my new number. Mum, can you send $300 for the car?",
      "Hi! Long time. My phone broke so this is my new number. Dad, could you send me 500 when you get a chance?",
    ])("flags a mid-message vocative: %s", (text) => {
      expect(checkSms(text, undefined, "AU").verdict).toBe("likely_scam");
    });

    it.each([
      "Tell mum I got a new number and I'll send her the 200 I owe her tomorrow.",
      "I'll ask mum about the weekend and send you 50 for petrol",
      "Just letting you know, dad said he'd transfer the 300 for the car tomorrow",
      "Mum's phone broke, can you send her $200 on this new number?",
    ])("does not widen to a bare mention: %s", (text) => {
      // A vocative is ADDRESSED — marked by a following comma or exclamation.
      // Merely naming a relation mid-sentence is ordinary family talk.
      expect(checkSms(text, undefined, "AU").verdict).not.toBe("likely_scam");
    });
  });

  // The anchor tested position, which is not the same as being addressed.
  describe("distinguishes address from subject", () => {
    it.each([
      "Dad said he'd lend me 500 for the car, I'll pay you back when I get my new number sorted.",
      "Mum's phone broke, can you send her $200 on this new number?",
      "Daughter's birthday is Friday, can you transfer $200 for the cake? New number btw",
      "Mother of all storms out there, my phone died, send $100 when you can on my new number",
    ])("does not fire when the relation term is the subject: %s", (text) => {
      expect(checkSms(text, undefined, "AU").verdict).not.toBe("likely_scam");
    });

    it.each([
      "mum send me 400 my phone broke, send it as quick as you can",
      "Hi Dad I dropped my phone, text me on this number. I need you to transfer 1200 today please",
    ])("still fires without a comma after the term: %s", (text) => {
      // Punctuation is not the discriminator — the script often omits it.
      expect(checkSms(text, undefined, "AU").verdict).toBe("likely_scam");
    });
  });

  // The gate briefly accepted "any other signal present" instead of requiring
  // the pretext, which let a single urgency word open a +45. These are the
  // messages a real family member sends.
  describe("requires the pretext, not merely another signal", () => {
    const innocentButUrgent = [
      "Mum, don't forget to pay the school fees of 250 before Friday, it's urgent!",
      "Mum can you pay the 300 rego before Friday, urgent!",
      "Dad, urgent — can you transfer $200 for the flights today?",
    ];

    it.each(innocentButUrgent)("does not call a real family member a scammer: %s", (text) => {
      expect(checkSms(text).verdict).not.toBe("likely_scam");
    });
  });
});
