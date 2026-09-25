import { describe, it, expect } from "vitest";
import { checkSms, containsLoose, stripForwardingPrefix } from "@veriguard/scam-detect/scamDetector";

// Regressions found reviewing this branch. Each was a false NEGATIVE introduced
// or left by the false-positive work above, which is the trade that pass was
// making — so each gets a test rather than a note.

const au = (t: string) => checkSms(t, undefined, "AU");
const CORE =
  "Hi Mum, I dropped my phone in the sink and this is my new number. Can you transfer $850 today?";

describe("corroboration is judged on the finished evidence, not scan order", () => {
  it("counts a signal that fires after the authority mention", () => {
    // sig.total() mid-scan answered "was corroboration found BEFORE this line",
    // so the call-back rule 40 lines below could not corroborate. The message
    // reported "nothing else unusual" while scoring 20 for exactly that.
    const r = au("ATO: you owe a debt. Call back now on 1800 123 456");
    expect(r.verdict).toBe("likely_scam");
    expect((r.flags ?? []).join(" ")).toMatch(/claims to be from a government agency/i);
  });

  it("still stands down when nothing else scores", () => {
    const r = au("You have a new message in your myGov Inbox. Sign in to myGov to read it.");
    expect(r.verdict).toBe("safe");
    expect((r.flags ?? []).join(" ")).toMatch(/names a government agency/i);
  });

  it("does not let two deferred rows corroborate each other", () => {
    // Only a row that is not itself deferred can corroborate one.
    expect(au("AusPost: your parcel is on board for delivery today. No action needed.").score).toBe(0);
  });
});

describe("substring lists still match glued forms", () => {
  it.each([
    ["brand inside a hostname", "Verify at amazonsupport.tk now"],
    ["exchange inside a hostname", "Your coinspotsecure.com account is locked, call support"],
  ])("scores a %s", (_label, text) => {
    // These lists exist to catch the glued form. Routing them through
    // mentions() added word boundaries and dropped both to zero.
    expect(au(text).score).toBeGreaterThan(0);
  });

  it("keeps whitespace tolerance for their multi-word entries", () => {
    // fakeInvestmentPlatforms is 8/8 multi-word, so a plain includes() would
    // reintroduce the literal-single-space bug for it.
    expect(containsLoose("your digital  identity  verification", "digital identity verification")).toBe(true);
    expect(containsLoose("visit amazonsupport.tk", "amazonsupport")).toBe(true);
  });
});

describe("forwarding scaffolding covers a real client's headers", () => {
  it("sees past a full Gmail forward", () => {
    // Cc:, Reply-To: and X-Mailer: were not in the named header list, and one
    // unmatched line stops the loop.
    const gmail = [
      "---------- Forwarded message ----------",
      "From: Unknown <u@example.invalid>",
      "Date: Tue, 2 Sep 2026",
      "Subject: Fwd: hi",
      "To: me@example.invalid",
      "Cc: other@example.invalid",
      "Reply-To: u@example.invalid",
      "X-Mailer: Gmail",
      "Sent: 2 Sep",
    ].join("\n");
    expect(au(`${gmail}\n\n${CORE}`).verdict).toBe("likely_scam");
  });

  it("still handles a bare header block with no marker line", () => {
    expect(au(`From: +61 400 000 000\nDate: 2 Sep 2026\nSubject: hi\n\n${CORE}`).verdict).toBe("likely_scam");
  });

  it.each([
    ["Note: they told me to check this"],
    ["Warning: this looks dodgy"],
    ["Reminder: the rent is due"],
  ])("does not mistake a lone prose line for a header: %s", (prefix) => {
    // These match the header pattern exactly — syntax cannot separate them.
    // What a real forward has is a RUN of headers, or an explicit marker.
    //
    // Asserted on the stripper rather than the verdict: the family anchor now
    // also matches a vocative anywhere in the body, so the score no longer
    // distinguishes "prefix was stripped" from "prefix was kept". The stripper
    // is what this test is about.
    expect(stripForwardingPrefix(`${prefix}\n\n${CORE}`)).toContain(prefix);
  });
});

describe("'claim' is judged per occurrence", () => {
  it("does not let one appended sentence defuse a live lure", () => {
    // A whole-text noun test dropped this from 40 to 24 — a one-sentence
    // evasion anyone could write.
    const lure = "Congratulations! Claim your $1000 prize now.";
    expect(au(`${lure} Your claim is ready.`).score).toBe(au(lure).score);
  });

  it("still ignores the word when every use reads as the noun", () => {
    expect((au("Medicare: your claim has been processed. The claim was approved.").flags ?? []).join(" "))
      .not.toMatch(/prize\/reward language/i);
  });
});
