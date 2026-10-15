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
// the family script 45 → 31, task-payment 52 → 36, messaging-hijack 60 → 42.
// Each landed on "something's a bit sus", which reads as permission to keep
// reading. Found by the metamorphic eval's forwarded-prefix transform.

const asEmail = (body: string) =>
  `From: Someone <someone@example.invalid>\nSubject: hi\n\n${body}`;

/**
 * One case per entry in UNDISCOUNTED_COMPOSITES. A composite added to the
 * engine without being listed there scores a tier low on the email path, and
 * this is what fails when that happens.
 *
 * **ClickFix is no longer here, and its absence is the point.** It left
 * `UNDISCOUNTED_COMPOSITES` when it moved into the signal registry and declared
 * `weight: 50` on every channel it runs on — so there is no discount applied to
 * it and nothing to restore. Its case stayed in this table for one commit and
 * still passed, by the new mechanism, which is exactly the kind of row that
 * makes a table lie: anyone auditing this file against that list would have
 * found an entry here with no counterpart there. A converted composite leaves
 * this table as it leaves that list, and `clickFixPinned.test.ts` is where its
 * email weight is asserted now.
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
    // The splice entry is carried as a named constant like the others, so the
    // count below is the number of entries, not of composites in the engine.
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

    // The splice rule is tested in its own describe below, pitched deliberately
    // under likely_scam, so it is an entry without a row in `composites`.
    expect(entries).toContain("SPLICED_WORDING_FLAG");
    expect(composites).toHaveLength(entries.length - 1);
    // And the one that left: a case for it here would be the drift this asserts.
    expect(entries).not.toContain("WIN_CLICKFIX_FLAG");
    expect(entries).not.toContain("MAC_CLICKFIX_FLAG");
    expect(composites.map(([label]) => label).join(" ")).not.toMatch(/clickfix/i);
  });
});

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
