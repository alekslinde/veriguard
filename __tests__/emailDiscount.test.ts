import { describe, it, expect } from "vitest";
import { checkSms, checkEmail } from "@veriguard/engine/scamDetector";

// The email path scores an SMS pass over the body at 0.7. That is right for
// keyword-frequency signals — a longer message has more room to use an ordinary
// word, so a keyword hit really is weaker evidence — and wrong for a gated
// composite, which needs several independent halves to line up and does not
// become likelier to misfire because the text is longer.
//
// Before this, the discount demoted composites across the verdict boundary:
// the family script 45 → 31, task-payment 52 → 36, messaging-hijack 60 → 42.
// Each landed on "something's a bit sus", which reads as permission to keep
// reading. Found by the metamorphic eval's forwarded-prefix transform.

const asEmail = (body: string) =>
  `From: Someone <someone@example.invalid>\nSubject: hi\n\n${body}`;

/**
 * One case per entry in UNDISCOUNTED_COMPOSITES. A composite added to the
 * engine without being listed there scores a tier low on the email path, and
 * this is what fails when that happens.
 */
const composites: Array<[string, string]> = [
  [
    "family impersonation",
    "Hi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?",
  ],
  [
    "task payment",
    "Congratulations, your account has earned $340. To withdraw your commission you must first complete a $50 deposit task.",
  ],
  [
    "messaging hijack",
    "WhatsApp: your account has been flagged for unusual activity and will be restricted within 24 hours.",
  ],
  [
    "ClickFix (Windows)",
    "Your browser needs a security fix. Press Win+R, paste the command below and hit Enter to verify you are human.",
  ],
];

describe("gated composites survive the email discount", () => {
  it.each(composites)("keeps the %s verdict on the email path", (_label, body) => {
    const sms = checkSms(body, undefined, "AU");
    const email = checkEmail(asEmail(body), undefined, "AU");

    // The composite is what the reader acts on, so the verdict must not drop a
    // tier merely because the same words arrived by email.
    expect(sms.verdict).toBe("likely_scam");
    expect(email.verdict).toBe("likely_scam");
  });

  it.each(composites)("restores the %s row to its full weight, not the total", (_label, body) => {
    const email = checkEmail(asEmail(body), undefined, "AU");
    const summed = (email.signals ?? []).reduce((n, s) => n + s.points, 0);
    // Restoring by lifting the signal's own row keeps the evidence list summing
    // to the score shown; a separate padding row would render as a blank bullet.
    expect(summed).toBe(email.score);
    expect((email.flags ?? []).every((f) => f.trim().length > 0)).toBe(true);
  });
});

// Listed separately from the table above because it is the one undiscounted
// entry deliberately pitched BELOW likely_scam: the rule restores a floor
// rather than delivering a verdict the keyword layer would have had to earn.
// The discount still must not touch it — at 0.7 its 25 became 17, under the 20
// it is pitched at, so the email read "safe" where the same SMS body read
// "suspicious".
describe("the spliced-wording signal survives the email discount", () => {
  const body = "Your ассount has been suspended";

  it("keeps its SMS score and verdict on the email path", () => {
    const sms = checkSms(body, undefined, "AU");
    const email = checkEmail(asEmail(body), undefined, "AU");
    expect(sms.verdict).toBe("suspicious");
    expect(email.score).toBe(sms.score);
    expect(email.verdict).toBe("suspicious");
  });

  it("restores the row rather than adding a padding one", () => {
    const email = checkEmail(asEmail(body), undefined, "AU");
    const summed = (email.signals ?? []).reduce((n, s) => n + s.points, 0);
    expect(summed).toBe(email.score);
    expect((email.flags ?? []).every((f) => f.trim().length > 0)).toBe(true);
  });
});

describe("keyword signals stay discounted", () => {
  it("still softens a message scored by keyword frequency", () => {
    // The discount's actual purpose. This must keep working, or the fix above
    // has simply removed it.
    const body =
      "URGENT: act now, your account is suspended, verify immediately, claim your refund before it expires.";
    const sms = checkSms(body, undefined, "AU");
    const email = checkEmail(asEmail(body), undefined, "AU");

    expect(sms.score).toBeGreaterThan(email.score);
  });
});

describe("forwarding does not defuse a composite", () => {
  const core =
    "Hi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?";
  const forwarded = `---------- Forwarded message ----------\nFrom: Unknown\nSubject: Fwd: hi\n\n${core}`;

  it.each([
    ["forwarded once", forwarded],
    ["forwarded then quoted", forwarded.split("\n").map((l) => `> ${l}`).join("\n")],
    ["forwarded then double-quoted", forwarded.split("\n").map((l) => `>> ${l}`).join("\n")],
  ])("holds the verdict through %s", (_label, text) => {
    // The two wrappers nest: forwarding a message someone already forwarded you
    // quote-marks the whole thing, scaffold lines included. Each worked alone
    // while the pair — the commonest real case — did not.
    expect(checkSms(text, undefined, "AU").verdict).toBe("likely_scam");
  });
});
