// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { checkSms } from "@veriguard/detect/scamDetector";
import {
  BENIGN_CALLBACK_SMS,
  CALLBACK_SMS_LURE_MINIMAL_PAIR,
  type CallbackSmsFixture,
} from "./fixtures/callbackSms";

// Issue #463 proposes a BASE composite for the "unrecognised transaction,
// call this number" SMS lure: assert a transaction, invite the reader to
// disown it, give a dialable number. The issue's own review flagged its
// false-positive evidence as thin — a prototype run outside the engine
// against six hand-written benign messages. One of those six, a genuine
// Octopus Energy direct-debit confirmation, already false-positives TODAY,
// before any composite exists, at suspicious 40 — confirmed below by
// signal breakdown, not just score, as two independent +20 rows
// (deferred brand mention, generic call-a-number) compounding.
//
// This corpus is the gate the roadmap workflow requires: every proposed
// phrase or rule is measured against the live engine before it reaches an
// issue (docs/threat-intel/README.md, "Verify against the live engine
// before filing"). It exists so the eventual composite has real negative
// coverage to be checked against, not six examples.
//
// This is a characterization suite, in the same sense as
// bulkMailFalsePositives.test.ts: it pins CURRENT behaviour so it stays
// green until #463 ships and changes it on purpose.

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
    // disown clause. The property any future composite must hold: the lure
    // scores distinctly higher than the genuine confirmation it was built
    // from, not merely "above some fixed threshold". Today both already
    // compound the same two generic rows and land equal — pinned here so
    // the gap #463 is meant to create becomes visible, and testable, the
    // moment it ships.
    const genuine = check(byId("gb-direct-debit-confirmation-octopus-energy")).score;
    const lure = check(CALLBACK_SMS_LURE_MINIMAL_PAIR).score;
    expect(lure).toBe(genuine);
  });

  it.each(BENIGN_CALLBACK_SMS)("scores $id as a real number, not a crash: $shape", (f) => {
    // Cheap guard against a fixture that silently stops exercising the
    // engine at all (e.g. a region string the pack resolver doesn't know).
    const r = check(f);
    expect(typeof r.score).toBe("number");
    expect(Number.isFinite(r.score)).toBe(true);
  });
});
