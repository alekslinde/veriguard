import { describe, it, expect } from "vitest";
import { checkEmail } from "@veriguard/engine/scamDetector";
import type { Signal } from "@veriguard/engine/engineTypes";
import { BULK_FIXTURES, MARKETING_LOOKALIKE_SCAM } from "./fixtures/bulkMail";

// Legitimate marketing mail is scored as a scam, and the reasons are structural
// rather than anything the messages say. Measured against five real senders on
// five independent platforms: four of the five were flagged, two of them as
// likely scams. The one that passed did so because its bounce path happened to
// sit on the same domain as its From — the same words, the same discounts, a
// verdict 43 points apart on infrastructure alone.
//
// See __tests__/fixtures/bulkMail.ts for why these are synthetic reconstructions
// rather than the real messages.
//
// This is a characterization suite: it pins the CURRENT behaviour, defects
// included, so the suite is green until the fix lands. The comments are the
// deliverable — each names the mechanism it pinned and where that mechanism
// lives, so the fix is aimed at the right code. A comment that names the wrong
// function sends the fix somewhere it changes nothing, which is why each claim
// below was verified against the engine rather than inferred from the output.

const check = (raw: string) => checkEmail(raw, undefined, "au");
const byId = (id: string) => {
  const f = BULK_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};
const signalsOf = (raw: string): Signal[] => check(raw).signals ?? [];
/** Rows a rule actually contributed, ignoring context rows worth nothing. */
const scoring = (raw: string) => signalsOf(raw).filter((s) => s.points > 0);

describe("bulk mail fixtures reproduce what real senders trigger", () => {
  // A fixture abstracted past the point of triggering its own case is
  // decoration: it would pass whatever the engine did, and let the defect back
  // in silently. Each one is held to the behaviour it was built from.

  it("no longer faults a platform bounce subdomain", () => {
    // The bounce path is a different subdomain from the From, which is how
    // essentially all platform-sent mail works. It shares an organisational
    // domain and DMARC passes, so neither rescue condition is hypothetical.
    const sender = signalsOf(byId("retailer-verp-bounce-subdomain").raw).filter(
      (s) => s.source === "sender",
    );
    expect(sender.filter((s) => /Return-Path/.test(s.text))).toHaveLength(0);
  });

  it("the nav-menu body trips BOTH rules its shop categories collide with", () => {
    // "Gift Cards" is a department in a menu. It scores once as reward
    // vocabulary and again as a request for sensitive information — two
    // independent rules, so the two are asserted separately. Matching
    // /gift card/ across the joined evidence would stay green with only one of
    // them fixed.
    const rows = scoring(byId("retailer-nav-menu-body").raw);
    expect(rows.some((s) => /^Prize\/reward language/.test(s.text))).toBe(true);
    expect(rows.some((s) => /^Asks for sensitive info/.test(s.text))).toBe(true);
  });

  it("scores the small-business shape at nothing at all", () => {
    // Every point it used to carry came from infrastructure: a bounce
    // subdomain, and a link rule reading its own List-Unsubscribe header. Its
    // body says nothing scoreable, so the honest score is zero.
    const r = check(byId("small-business-platform-esp").raw);
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("safe");
  });

  it("the loyalty shape scores its points statement as prize language", () => {
    // Asserted on the RULE, not the words. The signal echoes whichever
    // keywords matched, so a regex over its text matches the fixture's own
    // vocabulary and would pass however the rule behaved.
    const rows = scoring(byId("loyalty-reward-vocabulary").raw);
    const reward = rows.find((s) => /^Prize\/reward language/.test(s.text));
    expect(reward).toBeDefined();
    expect(reward!.points).toBeGreaterThan(0);
  });
});

describe("what the fix changed", () => {
  it("calls no legitimate bulk sender a scam", () => {
    // Two of five used to land here. A reader who subscribed to a shop's
    // mailing list and is told it is a scam learns to distrust the verdict,
    // not the sender.
    const scams = BULK_FIXTURES.filter((f) => check(f.raw).verdict === "likely_scam");
    expect(scams.map((f) => f.id)).toEqual([]);
  });

  it("stops scoring on the sender for any of them", () => {
    // The Return-Path rule now requires an unrelated bounce domain AND no
    // passing DMARC. Platform mail satisfies neither condition for firing.
    for (const f of BULK_FIXTURES) {
      const sender = scoring(f.raw).filter((s) => s.source === "sender");
      expect(sender, `${f.id} should score nothing on its envelope`).toHaveLength(0);
    }
  });

  it("emits the sender signal once, carrying its own weight", () => {
    // It used to appear twice — every reason at zero, then the first reason
    // again with the whole total. The evidence is offered for checking, and a
    // duplicate makes it visibly not add up.
    const spoofed = [
      "From: Example Bank <security@example-bank.test>",
      "Return-Path: <noreply@unrelated-host.test>",
      "Authentication-Results: mx.receiver.test; dmarc=fail header.from=example-bank.test",
      "Subject: Verify your account",
      "Content-Type: text/plain",
      "",
      "Confirm your details.",
    ].join("\n");
    const returnPath = signalsOf(spoofed).filter((s) => /Return-Path/.test(s.text));
    expect(returnPath).toHaveLength(1);
    expect(returnPath[0].points).toBeGreaterThan(0);
  });

  it("reads a VERP bounce address whole", () => {
    // addressIn matches an anchored pattern inside angle brackets now. The
    // unanchored one started after the "=" that VERP uses to encode the
    // recipient, and the comparison that followed used a domain the message
    // never sent from. domainOf was never the bug.
    const spoofed = [
      "From: Example Bank <security@example-bank.test>",
      "Return-Path: <bounces+abc-subscriber=reader=mailbox.test@unrelated-host.test>",
      "Authentication-Results: mx.receiver.test; dmarc=fail header.from=example-bank.test",
      "Subject: Verify your account",
      "Content-Type: text/plain",
      "",
      "Confirm your details.",
    ].join("\n");
    const row = signalsOf(spoofed).find((s) => /Return-Path/.test(s.text));
    expect(row?.text).toContain("bounces+abc-subscriber");
    expect(row?.text).toContain("@unrelated-host.test");
  });

  it("does not score a URL that appears only in a list-management header", () => {
    // An unsubscribe link is required of bulk mail by convention and by law in
    // several places. Scoring it penalised a sender for complying, and for one
    // real sender it was the entire finding — its body held no link at all.
    const headerOnly = [
      "From: Example Shop <news@mail.example-shop.test>",
      "Subject: Our latest range",
      "List-Unsubscribe: <https://links.example-shop.test/unsub/AbCd>",
      "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
      "Content-Type: text/plain",
      "",
      "Our new range has landed. Come and see it in store.",
    ].join("\n");
    expect(scoring(headerOnly).filter((s) => /^Contains link/.test(s.text))).toHaveLength(0);
  });

  it("still scores a URL in the body of the same message", () => {
    // Only the named headers are dropped, and by line. A link the sender is
    // actually asking the reader to click is unaffected.
    const withBody = [
      "From: Example Shop <news@mail.example-shop.test>",
      "Subject: Our latest range",
      "List-Unsubscribe: <https://links.example-shop.test/unsub/AbCd>",
      "Content-Type: text/plain",
      "",
      "Our new range has landed: https://links.example-shop.test/c/Zz01",
    ].join("\n");
    expect(scoring(withBody).some((s) => /^Contains link/.test(s.text))).toBe(true);
  });

  it("keeps reading the headers it did not drop", () => {
    // The body analysis is handed the whole raw message on purpose — a Subject
    // naming an agency is evidence like any other. Only list plumbing is
    // removed, not the header block.
    const subjectScam = [
      "From: Someone <a@unrelated-host.test>",
      "Subject: ATO refund: confirm your bank details within 24 hours",
      "Content-Type: text/plain",
      "",
      "See attached.",
    ].join("\n");
    expect(scoring(subjectScam).length).toBeGreaterThan(0);
  });
});

describe("the separation that any fix must preserve", () => {
  it("keeps the aligned-domain control clean", () => {
    // The control. Same vocabulary and structure as the flagged fixtures, but
    // an aligned bounce path — which is why it passes today, and why it must
    // still pass after the fix rather than passing for a new reason.
    const r = check(byId("aligned-domain-sender").raw);
    expect(r.verdict).toBe("safe");
    expect(r.score).toBeLessThan(20);
  });

  it("still calls a scam wearing marketing clothes a scam", () => {
    // The reason none of this can be fixed by scoring bulk mail lower. This
    // one borrows the furniture and keeps the substance: an unaligned sender,
    // no DMARC, a deadline, and a demand for card details.
    const r = check(MARKETING_LOOKALIKE_SCAM.raw);
    expect(r.verdict).toBe("likely_scam");
    expect(r.score).toBeGreaterThanOrEqual(70);
  });

  it("separates the lookalike from every legitimate fixture by a wide margin", () => {
    // The property worth holding onto through any change: the gap, not the
    // absolute numbers.
    const scam = check(MARKETING_LOOKALIKE_SCAM.raw).score;
    const worstLegit = Math.max(...BULK_FIXTURES.map((f) => check(f.raw).score));
    expect(scam - worstLegit).toBeGreaterThan(30);
  });

  it("scores the lookalike on its body, not on its envelope", () => {
    // The distinction the fix turns on. The legitimate fixtures score on
    // infrastructure — a bounce subdomain, a header URL — while this one
    // scores on what it asks the reader to do. Removing the infrastructure
    // signals must not touch it.
    const rows = scoring(MARKETING_LOOKALIKE_SCAM.raw);
    const fromBody = rows.filter((s) => s.source === "message" && !/^Contains link/.test(s.text));
    expect(fromBody.length).toBeGreaterThanOrEqual(3);
    expect(fromBody.reduce((n, s) => n + s.points, 0)).toBeGreaterThanOrEqual(40);
  });
});
