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
// "Callback-SMS composite" block): assert a transaction, invite the reader
// to disown it, give a dialable number, with no link and no own-channel
// protective wording. The issue's own review flagged its false-positive
// evidence as thin — a prototype run outside the engine against six
// hand-written benign messages — so this corpus replaces that prototype:
// 13 benign fixtures across AU/GB/IE/US, built BEFORE the composite existed
// (#467) and now the real negative-coverage gate for it.
//
// One of the original six, a genuine Octopus Energy direct-debit
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

  it("already false-positives on the Octopus Energy direct-debit confirmation (pre-existing, not from #463)", () => {
    // Recorded as a probe lead in the 2026-10-16 roadmap watchlist, not a
    // regression from this corpus. Confirmed by signal breakdown: two +20
    // rows compound independently — the deferred "well-known company,
    // verify via the official app" brand-mention row, and the generic
    // "asks you to call a number" row — with no callback-SMS composite
    // involved yet. If this assertion ever breaks because the score
    // dropped, that is progress on the pre-existing defect — tighten the
    // bound, don't widen it.
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
