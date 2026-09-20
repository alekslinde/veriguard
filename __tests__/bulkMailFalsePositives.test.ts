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

  it("the VERP bounce-subdomain shape trips the sender check", () => {
    const sender = signalsOf(byId("retailer-verp-bounce-subdomain").raw).filter(
      (s) => s.source === "sender",
    );
    expect(sender.length).toBeGreaterThan(0);
    expect(sender.some((s) => /Return-Path/.test(s.text))).toBe(true);
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

  it("the small-business shape scores on nothing the message says", () => {
    // Its points come from the sender check and from a link rule that reads
    // the List-Unsubscribe HEADER (see below). The body contributes one row
    // worth zero — the missing-letters rule — so "nothing from the body" has
    // to be stated as nothing the body CONTRIBUTES, not as no body rows at all.
    const rows = signalsOf(byId("small-business-platform-esp").raw);
    const bodyScored = rows.filter(
      (s) => s.source === "message" && s.points > 0 && !/^Contains link/.test(s.text),
    );
    expect(bodyScored).toHaveLength(0);

    // And the body row that does exist is a defect of its own, not a finding.
    const zeroWeight = rows.filter((s) => s.source === "message" && s.points === 0);
    expect(zeroWeight.some((s) => /letters missing/.test(s.text))).toBe(true);

    expect(check(byId("small-business-platform-esp").raw).score).toBeGreaterThan(0);
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

describe("what the fix has to change", () => {
  // The verdicts real people would see for mail they subscribed to. Each
  // states its target so the fix inverts these deliberately rather than by
  // editing whatever turns red.

  it("flags four of five legitimate bulk senders", () => {
    // TARGET: every fixture here scores below the suspicious threshold (20),
    // with the aligned-domain control unchanged.
    const flagged = BULK_FIXTURES.filter((f) => check(f.raw).score >= 20);
    expect(flagged.map((f) => f.id)).toEqual([
      "retailer-verp-bounce-subdomain",
      "retailer-nav-menu-body",
      "small-business-platform-esp",
      "loyalty-reward-vocabulary",
    ]);
  });

  it("calls two of them likely scams", () => {
    // TARGET: none. A reader who subscribed to a shop's mailing list and is
    // told it is a scam learns to distrust the verdict, not the sender.
    const scams = BULK_FIXTURES.filter((f) => check(f.raw).verdict === "likely_scam");
    expect(scams.map((f) => f.id)).toEqual([
      "retailer-verp-bounce-subdomain",
      "loyalty-reward-vocabulary",
    ]);
  });

  it("emits the sender signal twice, once weightless and once scoring", () => {
    // TARGET: once. Two rows for one observation double-count in the evidence
    // the reader is invited to check.
    const returnPath = signalsOf(byId("retailer-verp-bounce-subdomain").raw).filter((s) =>
      /Return-Path/.test(s.text),
    );
    expect(returnPath).toHaveLength(2);
    expect(returnPath.map((s) => s.points).sort((a, b) => a - b)).toEqual([0, 20]);
  });

  it("truncates a VERP bounce address at the encoded recipient", () => {
    // TARGET: the whole bounce address, so the domain comparison is made
    // against the domain the message actually used.
    //
    // MECHANISM: addressIn (emailHeaders.ts) matches ADDRESS_RE against the
    // bracketed value, and that pattern is UNANCHORED. VERP puts the recipient
    // in the local part separated by "=", which is not in the local-part
    // character class, so the match starts after it:
    //
    //   <bounces+1a2b3c-subscriber=mailbox.test@bounce.example-retail.test>
    //                              ^ match starts here
    //
    // domainOf is NOT the bug — it takes everything after the LAST "@", which
    // is right. A fix aimed there would change nothing; the address is already
    // truncated before it arrives.
    const row = signalsOf(byId("retailer-verp-bounce-subdomain").raw).find((s) =>
      /Return-Path/.test(s.text),
    );
    expect(row?.text).toContain("mailbox.test@bounce.example-retail.test");
    expect(row?.text).not.toContain("bounces+1a2b3c");
  });

  it("scores a URL found in the List-Unsubscribe HEADER as a link in the message", () => {
    // TARGET: not scored. An unsubscribe link is required of bulk mail by
    // convention and by law in several places; scoring it penalises a sender
    // for complying.
    //
    // MECHANISM: checkEmail passes the FULL RAW MESSAGE to checkSms, so the
    // link rule scans headers as well as the body. This fixture has no link in
    // its body at all — the row comes entirely from List-Unsubscribe, and the
    // trailing ">" in the signal text is the header's own angle bracket.
    // Suppressing unsubscribe links in the BODY would not move this score.
    const link = signalsOf(byId("small-business-platform-esp").raw).find((s) =>
      /^Contains link/.test(s.text),
    );
    expect(link?.points ?? 0).toBeGreaterThan(0);
    expect(link?.text).toContain("unsub");

    // The tell that the URL came from a header value rather than the body: the
    // header's own closing angle bracket is carried into the signal text. Read
    // from a fixture whose URL is short enough that the bracket survives the
    // rule's own truncation — the mechanism is shared, the display is not.
    const bracketed = signalsOf(byId("loyalty-reward-vocabulary").raw).find((s) =>
      /^Contains link/.test(s.text),
    );
    expect(bracketed?.text).toContain(">");
  });

  it("finds a link in every fixture, including the ones whose body has none", () => {
    // The header-scanning defect is the widest of the set: it contributes to
    // all five, and for the small-business shape it is half the score.
    for (const f of BULK_FIXTURES) {
      const link = scoring(f.raw).find((s) => /^Contains link/.test(s.text));
      expect(link, `${f.id} should currently score a link`).toBeDefined();
    }
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
