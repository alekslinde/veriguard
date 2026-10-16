// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms, checkEmail } from "@veriguard/detect/scamDetector";

// The email path scores an SMS pass over the body at 0.7. That is right for
// keyword-frequency signals — a longer message has more room to use an ordinary
// word, so a keyword hit really is weaker evidence — and wrong for a gated
// composite, which needs several independent halves to line up and does not
// become likelier to misfire because the text is longer.
//
// Before this, the discount demoted composites across the verdict boundary:
// the family script 45 → 31, task-payment 40 → 28, messaging-hijack 60 → 42.
// Each landed on "something's a bit sus", which reads as permission to keep
// reading. Found by the metamorphic eval's forwarded-prefix transform.

const asEmail = (body: string) =>
  `From: Someone <someone@example.invalid>\nSubject: hi\n\n${body}`;

/**
 * One case per entry in UNDISCOUNTED_COMPOSITES. A composite added to the
 * engine without being listed there scores a tier low on the email path, and
 * this is what fails when that happens.
 *
 * **ClickFix, the splice rule, the family gate and the task-payment gate are no
 * longer here, and their absence is the point.** Each left
 * `UNDISCOUNTED_COMPOSITES` when it moved into the signal registry and declared
 * its own channel weight — so there is no discount applied to it and nothing to
 * restore. ClickFix's case stayed in this table for one commit and still passed,
 * by the new mechanism, which is exactly the kind of row that makes a table lie:
 * anyone auditing this file against that list would have found an entry here with
 * no counterpart there. A converted composite leaves this table as it leaves that
 * list, and `clickFixPinned`, `splicedWordingPinned`,
 * `familyImpersonationPinned` and `taskPaymentPinned` are where their email
 * weights are asserted now.
 *
 * The family gate is worth a line of its own: it was this list's first entry and
 * the incident that turned a single special case into a list. One entry
 * (messaging hijack) stood alone for a while, with the list due to go once it
 * left; the callback-SMS composite (#463) then joined it as a second inline
 * entry rather than a registry conversion — scoped deliberately narrow, next
 * to the crypto-TOAD composite it mirrors, rather than converting an
 * unrelated existing rule in the same change. The list stays until both
 * entries convert.
 */
const composites: Array<[string, string, string]> = [
  [
    "messaging hijack",
    "WhatsApp: your account has been flagged for unusual activity and will be restricted within 24 hours.",
    "likely_scam",
  ],
  [
    "callback SMS",
    "You have been charged $1,249.00 for an Apple iPhone 17 order. If you did not make this purchase call 1800 954 112 to cancel.",
    // Deliberately pitched at suspicious (30), not likely_scam — see #463's
    // acceptance criteria. A lower-weighted composite still belongs in this
    // table: the property under test is "the same tier on both channels",
    // not "every composite reaches likely_scam".
    "suspicious",
  ],
];

describe("the table and the list it claims to mirror", () => {
  it("has one case per entry, and no case for an entry that has gone", async () => {
    // The header above says "one case per entry in UNDISCOUNTED_COMPOSITES",
    // and for one commit that sentence was false: ClickFix left the list and
    // its case stayed, still passing by a different mechanism. A claim about
    // another file that nothing checks is a comment, not a rule — this repo has
    // already paid for that — so the claim is asserted against the source.
    //
    // Read as text because the list is deliberately module-private: exporting
    // it to satisfy a test would widen the engine's API for an internal fact.
    const { readFileSync } = await import("fs");
    const src = readFileSync("packages/detect/src/scamDetector.ts", "utf8");
    const list = src.slice(
      src.indexOf("const UNDISCOUNTED_COMPOSITES"),
      src.indexOf("];", src.indexOf("const UNDISCOUNTED_COMPOSITES")),
    );
    expect(list, "UNDISCOUNTED_COMPOSITES not found — did it move or get deleted?").toBeTruthy();

    // Entries are bare constant references, one per line; comments are not.
    const entries = list
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => /^[A-Z][A-Z0-9_]*,$/.test(l))
      .map((l) => l.replace(/,$/, ""));

    expect(composites).toHaveLength(entries.length);
    // And the ones that left: an entry here for any of them would be the drift
    // this asserts. Each declares its own channel weight in the registry now, so
    // there is no discount applied to it and nothing to restore — their email
    // weights are asserted in `clickFixPinned` and `splicedWordingPinned`.
    expect(entries).not.toContain("WIN_CLICKFIX_FLAG");
    expect(entries).not.toContain("MAC_CLICKFIX_FLAG");
    expect(entries).not.toContain("SPLICED_WORDING_FLAG");
    expect(entries).not.toContain("FAMILY_IMPERSONATION_FLAG");
    expect(entries).not.toContain("TASK_PAYMENT_FLAG");
    expect(composites.map(([label]) => label).join(" ")).not.toMatch(
      /clickfix|splic|family|task/i,
    );
  });
});

describe("gated composites survive the email discount", () => {
  it.each(composites)("keeps the %s verdict on the email path", (_label, body, verdict) => {
    const sms = checkSms(body, undefined, "AU");
    const email = checkEmail(asEmail(body), undefined, "AU");

    // The composite is what the reader acts on, so the verdict must not drop a
    // tier merely because the same words arrived by email.
    expect(sms.verdict).toBe(verdict);
    expect(email.verdict).toBe(verdict);
  });

  it.each(composites)("restores the %s row to its full weight, not the total", (_label, body, _verdict) => {
    const email = checkEmail(asEmail(body), undefined, "AU");
    const summed = (email.signals ?? []).reduce((n, s) => n + s.points, 0);
    // Restoring by lifting the signal's own row keeps the evidence list summing
    // to the score shown; a separate padding row would render as a blank bullet.
    expect(summed).toBe(email.score);
    expect((email.flags ?? []).every((f) => f.trim().length > 0)).toBe(true);
  });
});

// Kept here, outside the table, because it asks a different question of the
// splice rule than `splicedWordingPinned` does. That file pins the row at 25 on
// every channel; this asserts the property the row exists for — an email and an
// SMS carrying the same spliced body reach the same VERDICT. The rule is
// deliberately pitched below likely_scam, restoring a floor rather than
// delivering a verdict the keyword layer would have had to earn, so 25 against a
// threshold of 20 is the whole margin: at 0.7 it became 17 and the email read
// "safe" where the identical SMS read "suspicious".
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

// #469: a deferred brand-mention row ("Claims to be from a well-known
// company") settles corroborated inside the SMS sub-pass whenever anything
// else there scores — a plain keyword rule is enough, no composite required.
// `merge` then discounted that row at 0.7x along with everything else, even
// though its weight already IS "something else here confirmed this": a
// verdict about the rest of the evidence, not the keyword-frequency claim the
// discount exists to soften. No entry in UNDISCOUNTED_COMPOSITES could have
// caught this — the corroborator here is "Asks you to call a number", a plain
// `sig.add`, not a composite with a row to restore by name.
describe("a deferred row corroborated by a plain keyword rule survives the email discount", () => {
  const body = "Medibank: you have recieve a refund, please call us to claim it kindly.";

  it("keeps the SMS verdict on the email path", () => {
    const sms = checkSms(body, undefined, "AU");
    const email = checkEmail(asEmail(body), undefined, "AU");

    expect(sms.verdict).toBe("likely_scam");
    expect(email.verdict).toBe("likely_scam");
  });

  it("carries the brand-mention row at full weight, not 0.7x", () => {
    const email = checkEmail(asEmail(body), undefined, "AU");
    const brandRow = (email.signals ?? []).find((s) => s.text.startsWith("Claims to be from a well-known company"));

    expect(brandRow?.points).toBe(20);
  });

  it("still sums the evidence list to the score", () => {
    const email = checkEmail(asEmail(body), undefined, "AU");
    const summed = (email.signals ?? []).reduce((n, s) => n + s.points, 0);
    expect(summed).toBe(email.score);
  });
});

// Kept here, outside the table, for the reason the splice-rule block above is:
// it asks a different question of the family gate than
// `familyImpersonationPinned` does. That file pins the row at 45 on both
// channels; this asserts the property the row exists for — forwarding is how
// this script most often reaches a checker, and the wrapper must not change the
// verdict. The gate's weight is now its own declaration, so what is at risk here
// is the anchor rather than the arithmetic.
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
