// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";
import {
  BENIGN_CALLBACK_SMS,
  CALLBACK_SMS_ACCEPTED_RESIDUAL_RISK,
  CALLBACK_SMS_LURE_MINIMAL_PAIR,
  type CallbackSmsFixture,
} from "./fixtures/callbackSms";

// Issue #463's callback-SMS composite, scored inline in checkSms (the
// "Callback-SMS composite" block): assert a completed transaction, invite
// the reader to disown it with real disown language, give a dialable number
// to call, with no link and no own-channel protective wording. The issue's
// own review flagged its false-positive evidence as thin — a prototype run
// outside the engine against six hand-written benign messages — and a
// post-implementation code review went further, independently reproducing
// four real false positives the prototype never caught: a first draft of
// the disown-clause condition accepted the bare words "to cancel" as a
// stand-in for actual disown language, which fired on an Origin Energy
// utility receipt, a Netflix renewal, a Fitness First membership debit and
// a World Vision charity confirmation — none of which disown anything.
//
// The disown clause was tightened to require real disown language only
// ("if this wasn't you", "if you did not authorise this"); the bare
// fallback is gone. Two of those four false positives were purely bare-
// fallback artefacts and are now clean (World Vision, Audible — see the
// "fixed by the tightened disown clause" describe block). Two survive as a
// genuine, accepted residual risk: a real subscription or membership
// cancellation notice can use the identical "X has been charged/debited. If
// you did not authorise this, call [number] to cancel" template a scam
// uses, and no text-only signal distinguishes them. Capped at suspicious
// (30), never likely_scam, for exactly this reason — see
// CALLBACK_SMS_ACCEPTED_RESIDUAL_RISK and the "documented residual risk"
// describe block below, which now covers three cases instead of one.
//
// This corpus is the real negative-coverage gate for the composite: 13
// benign fixtures across AU/GB/IE/US, built BEFORE the composite existed
// (#467). One of the original 13, a genuine Octopus Energy direct-debit
// confirmation, already false-positived before the composite existed (two
// generic rows compounding — a pre-existing defect, not something #463
// introduces). The composite's own disown-clause condition does not match
// that fixture, so it is unaffected and still carries the pre-existing
// score — asserted below alongside the new coverage.

const check = (f: CallbackSmsFixture) => checkSms(f.text, undefined, f.region);
const byId = (id: string) => {
  const f = BENIGN_CALLBACK_SMS.find((x) => x.id === id);
  if (!f) throw new Error(`no fixture ${id}`);
  return f;
};

describe("callback-SMS benign corpus: current engine behaviour", () => {
  it("does not call any genuine message in the corpus a likely scam", () => {
    const scams = BENIGN_CALLBACK_SMS.filter((f) => check(f).verdict === "likely_scam");
    expect(scams.map((f) => f.id)).toEqual([]);
  });

  it.each(BENIGN_CALLBACK_SMS.filter((f) => f.id !== "gb-direct-debit-confirmation-octopus-energy"))(
    "keeps $id below suspicious",
    (f) => {
      // The known exception is asserted on its own below, with the reason
      // recorded — lumping it in here would silently widen this assertion
      // the next time a second genuine message starts firing.
      const r = check(f);
      expect(r.score, `${f.id}: ${f.shape}`).toBeLessThan(30);
    },
  );

  it("OPEN DEFECT, pre-existing: already false-positives on the Octopus Energy direct-debit confirmation", () => {
    // Not introduced by #463, and not fixed by it either — flagged here
    // rather than quietly pinned, because this composite ships in the same
    // rule area without addressing it. Confirmed by signal breakdown: two
    // +20 rows compound independently — the deferred "well-known company,
    // verify via the official app" brand-mention row, and the generic "asks
    // you to call a number" row — with no callback-SMS composite involved.
    //
    // A code review further confirmed this is systemic, not specific to
    // Octopus Energy or to SMS: "Medibank: you have recieve a refund, call
    // us to claim it kindly." reproduces the same shape (two independently-
    // scoring generic rows corroborating a deferred brand mention) with zero
    // code from this composite, and the SAME corroborated-brand-row-escapes-
    // the-email-discount defect splits that message's SMS score (62,
    // likely_scam) from its email score (43, suspicious) across the verdict
    // boundary. Fixing it needs a change to how addDeferred corroboration
    // interacts with UNDISCOUNTED_COMPOSITES, which is out of scope here —
    // tracked as a separate issue, not papered over in this PR.
    //
    // If this assertion ever breaks because the score dropped, that is
    // progress on the defect — tighten the bound, don't widen it.
    const r = check(byId("gb-direct-debit-confirmation-octopus-energy"));
    expect(r.verdict).toBe("suspicious");
    expect(r.score).toBe(40);
    const scoring = (r.signals ?? []).filter((s) => s.points > 0);
    expect(scoring).toHaveLength(2);
    expect(scoring.every((s) => s.points === 20)).toBe(true);
  });

  it("separates the minimal-pair lure from its genuine twin by score", () => {
    // Same surface furniture as the Octopus Energy fixture, plus an explicit
    // disown clause the genuine confirmation lacks. The property the
    // composite exists to create: the lure now scores distinctly higher
    // than the confirmation it was built from, where before #463 shipped
    // they landed equal (both scoring only the two generic rows).
    const genuine = check(byId("gb-direct-debit-confirmation-octopus-energy")).score;
    const lure = check(CALLBACK_SMS_LURE_MINIMAL_PAIR).score;
    expect(lure).toBeGreaterThan(genuine);
    expect(lure).toBe(50);
    expect(genuine).toBe(40);
  });

  it("scores the accepted residual-risk fixture at exactly the issue's own number", () => {
    // #463 names this shape explicitly rather than excluding it: "a small
    // business texting 'payment processed — if this wasn't you call us on
    // 03 …'. That lands at suspicious 30, not likely_scam." A real,
    // documented trade-off, not a defect — kept out of BENIGN_CALLBACK_SMS
    // for exactly that reason, and asserted here on its own.
    const r = check(CALLBACK_SMS_ACCEPTED_RESIDUAL_RISK);
    expect(r.verdict).toBe("suspicious");
    expect(r.score).toBe(30);
  });

  it.each(BENIGN_CALLBACK_SMS)("scores $id as a real number, not a crash: $shape", (f) => {
    // Cheap guard against a fixture that silently stops exercising the
    // engine at all (e.g. a region string the pack resolver doesn't know).
    const r = check(f);
    expect(typeof r.score).toBe("number");
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe("callback-SMS composite: the issue's acceptance criteria", () => {
  const checkText = (text: string, region: string) => checkSms(text, undefined, region);

  it("GB Barclays direct-debit lure: safe 0 -> suspicious 30", () => {
    const r = checkText(
      "Barclays: A new direct debit has been set up on your account to ABC Payments Ltd for £89.99. " +
        "If you do not recognise this, call 0800 012 3456 to cancel this payment.",
      "GB",
    );
    expect(r.verdict).toBe("suspicious");
    expect(r.score).toBe(30);
  });

  it("AU PayPal $1,249.00 lure: safe 0 -> suspicious 30", () => {
    const r = checkText(
      "PayPal: You have been charged $1,249.00 for an Apple iPhone 17 order. " +
        "If you did not make this purchase call 1800 954 112 to cancel.",
      "AU",
    );
    expect(r.verdict).toBe("suspicious");
    expect(r.score).toBe(30);
  });

  it("IE AIB lure: safe 0 -> likely_scam 50, not the issue's estimated 30", () => {
    // The issue's criterion named 30; measured against the live engine it is
    // 50, because "aib" is IE's own BRAND_MENTION_WORDS entry and had been
    // sitting deferred (0 points, only scores if something else does) since
    // before this composite existed. The composite's +30 is exactly the
    // "something else" that corroborates it, turning the brand mention into
    // its own +20 row — the same mechanism addDeferred exists for, now
    // triggered by a new signal rather than an old one. Recorded as the
    // measured number rather than silently matching the written estimate.
    const r = checkText(
      "AIB: A new direct debit has been set up on your account. " +
        "If you did not authorise this please call 01 555 0199.",
      "IE",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(r.score).toBe(50);
    const scoring = (r.signals ?? []).filter((s) => s.points > 0);
    expect(scoring).toHaveLength(2);
    expect(scoring.some((s) => /Fake transaction callback scam/.test(s.text))).toBe(true);
    expect(scoring.some((s) => /Claims to be from a well-known company/.test(s.text))).toBe(true);
  });

  it("GB Currys lure also reaches likely_scam 50, for the same brand-corroboration reason as AIB", () => {
    // "currys" is a GB BRAND_MENTIONS entry, the same mechanism as AIB above.
    // Barclays, by contrast, is only in TYPOSQUAT_BRANDS (URL matching), not
    // BRAND_MENTIONS, so a Barclays-named lure stays at 30 — the two GB
    // acceptance cases differ from each other for a real, brand-specific
    // reason, not an inconsistency.
    const r = checkText(
      "A payment of £349.00 to Currys has been authorised on your account. " +
        "If you don't recognise this payment, call 0161 496 0011.",
      "GB",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(r.score).toBe(50);
  });

  it('AU "approved" purchase lure: suspicious 30 -> 40, not 60 (generic row superseded)', () => {
    const r = checkText(
      "Your $1,249.00 purchase has been approved. If this was not you, call us on 1800 954 112 immediately.",
      "AU",
    );
    expect(r.verdict).toBe("suspicious");
    expect(r.score).toBe(40);
    const scoring = (r.signals ?? []).filter((s) => s.points > 0);
    expect(scoring.some((s) => /Fake transaction callback scam/.test(s.text))).toBe(true);
    expect(scoring.some((s) => /^Asks you to call a number/.test(s.text))).toBe(false);
  });

  it("does not disturb any of the benign corpus's scores", () => {
    // Regression guard once more, phrased as the issue's own criterion:
    // "all six benign samples keep their current scores" — extended here to
    // all thirteen, now that the corpus is thirteen rather than six.
    for (const f of BENIGN_CALLBACK_SMS) {
      expect(check(f).verdict).not.toBe("likely_scam");
    }
  });
});

describe("false positives found by code review, fixed by tightening the disown clause", () => {
  const checkText = (text: string, region: string) => checkSms(text, undefined, region);

  it("no longer fires on a charity direct-debit confirmation with a bare 'cancel anytime' opt-out", () => {
    // The bare `/to\s+cancel/i` fallback this composite shipped with
    // originally treated any "to cancel" substring as disown language. This
    // opt-out line carries none: nobody is disowning a transaction.
    const r = checkText(
      "World Vision: Your monthly donation of $25.00 has been set up. " +
        "Reply STOP or call 1800 032 034 to cancel anytime.",
      "AU",
    );
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("safe");
  });

  it("no longer fires on a subscription renewal that only says 'to cancel', no disown language", () => {
    const r = checkText("Your Audible membership renewal of $16.45 has been charged. Call 1800 555 000 to cancel.", "AU");
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("safe");
  });
});

describe("documented residual risk: real disown language the composite cannot tell from a scam", () => {
  // Three genuine billing messages found by code review that use the exact
  // "X has been charged/debited. If you did not authorise this/wasn't you,
  // call [number] to cancel/update" template a scam uses — no text-only
  // signal separates them from a real callback lure. Accepted, not fixed:
  // capped at suspicious (30 or 40), never likely_scam, same trade-off
  // already accepted for CALLBACK_SMS_ACCEPTED_RESIDUAL_RISK.
  const checkText = (text: string, region: string) => checkSms(text, undefined, region);

  it("Origin Energy direct-debit receipt lands at suspicious, not likely_scam", () => {
    const r = checkText(
      "Origin Energy: Your direct debit of $142.30 was processed on 14 Oct. " +
        "If you have any questions, call us on 13 24 61 to cancel or change your payment plan.",
      "AU",
    );
    expect(r.verdict).not.toBe("likely_scam");
  });

  it("Netflix subscription receipt lands at suspicious, not likely_scam", () => {
    const r = checkText(
      "Your Netflix subscription of $19.99 has been processed. " +
        "If you did not authorise this, call 1800 123 456 to update your payment method.",
      "AU",
    );
    expect(r.verdict).not.toBe("likely_scam");
  });

  it("Fitness First membership debit lands at suspicious, not likely_scam", () => {
    const r = checkText(
      "Fitness First: Your membership payment of $59.00 was debited today. " +
        "If this wasn't you, call us on 1300 555 123 to cancel your membership.",
      "AU",
    );
    expect(r.verdict).not.toBe("likely_scam");
  });
});

describe("protective-wording and crypto-TOAD fixes found by code review", () => {
  const checkText = (text: string, region: string) => checkSms(text, undefined, region);

  it("does not fire when the reader is directed to their own internet banking", () => {
    // The original protective-wording guard recognised only "official app"
    // and "back of your card" — this is equally protective, just phrased
    // differently, and the guard is widened to catch it.
    const r = checkText(
      "Westpac: A new direct debit was set up on your account for $45.00. " +
        "If you did not authorise this, log into internet banking to check, or call 1300 655 505 to cancel.",
      "AU",
    );
    expect(r.score).toBe(0);
    expect(r.verdict).toBe("safe");
  });

  it("does not triple-stack with the crypto-exchange TOAD composite", () => {
    // Before the fix: brand mention (20) + this composite (30) + the
    // crypto-TOAD composite (30) = likely_scam 80, for one underlying
    // observation (a crypto exchange's name, a transaction claim, a call
    // verb, no link). The crypto-TOAD row is now suppressed when this
    // composite already fired.
    const r = checkText(
      "CoinSpot: Your withdrawal of $1,249.00 was processed. " +
        "If you did not authorise this, call 1800 035 544 to cancel.",
      "AU",
    );
    expect(r.verdict).toBe("likely_scam");
    expect(r.score).toBe(50);
    const scoring = (r.signals ?? []).filter((s) => s.points > 0);
    expect(scoring).toHaveLength(2);
    expect(scoring.some((s) => /Crypto exchange asking you to phone/.test(s.text))).toBe(false);
  });

  it("still catches a crypto-TOAD lure with no callback shape of its own", () => {
    // Coverage guard: the suppression must not silently remove the
    // crypto-TOAD composite's own coverage for the shape it alone catches —
    // a login/security lure with no transaction or disown clause at all.
    const r = checkText("CoinSpot: Unusual login detected. Please call us on 1800 123 456 to verify your identity.", "AU");
    expect(r.verdict).toBe("likely_scam");
    const scoring = (r.signals ?? []).filter((s) => s.points > 0);
    expect(scoring.some((s) => /Crypto exchange asking you to phone/.test(s.text))).toBe(true);
  });
});
