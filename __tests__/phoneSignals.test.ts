// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { PHONE_SIGNALS, SPOOFING_POINTS, NOTHING_FOUND_POINTS } from "@veriguard/detect/signals/phone";
import { registryScore, signalInventory, type Context } from "@veriguard/detect/signalRegistry";
import { analysePhone } from "@veriguard/detect/phoneIntel";
import { resolveRegionPack } from "@veriguard/detect/regions";

// The phone channel's signals as values — the first conversion out of
// scamDetector.ts.
//
// checkPhonePinned.test.ts already proves the conversion changed no verdict;
// this asserts the properties the registry was built to give, which the pin
// cannot see because they are about the signals rather than about the output.
// Each one corresponds to a defect class the inline shape allowed.

const ctx = (number: string, region = "AU"): Context => ({
  channel: "phone",
  pack: resolveRegionPack(region as never),
  original: number,
  body: number.toLowerCase(),
  words: [number],
  phone: analysePhone(number, region as never),
});

const idsFor = (number: string, region = "AU") =>
  registryScore(ctx(number, region), PHONE_SIGNALS).map((r) => r.id);

describe("each signal is a value with its scoring declared", () => {
  it("fires the right signal per line type", () => {
    expect(idsFor("1900 123 456")).toContain("phone.premium");
    expect(idsFor("0488 888 888")).toContain("phone.voip");
    expect(idsFor("1800 123 456")).toContain("phone.freecall");
    expect(idsFor("13 22 58")).toContain("phone.sharedCost");
    expect(idsFor("02 9374 4000")).toContain("phone.fixedLine");
    expect(idsFor("+252 61 234567")).toContain("phone.wangiri");
  });

  it("fires nothing for an ordinary mobile", () => {
    // The floor is the entry point's, not a signal's — nothing here claims a
    // clean number is evidence of anything.
    expect(idsFor("0412 345 678")).toEqual([]);
  });

  it("carries the weight the inline version scored", () => {
    const rows = registryScore(ctx("1900 123 456"), PHONE_SIGNALS);
    expect(rows.find((r) => r.id === "phone.premium")?.points).toBe(20);
    expect(registryScore(ctx("0488 888 888"), PHONE_SIGNALS)[0].points).toBe(10);
    expect(registryScore(ctx("+252 61 234567"), PHONE_SIGNALS)[0].points).toBe(20);
  });

  it("declares a zero-point row as zero rather than leaving it undeclared", () => {
    // These rows exist to be read, not to move the number. Declared zero says
    // that on purpose, where the author is choosing the number — a channel
    // listed with no weight beside it would read as a forgotten one.
    for (const number of ["1800 123 456", "13 22 58", "02 9374 4000"]) {
      const rows = registryScore(ctx(number), PHONE_SIGNALS);
      expect(rows).toHaveLength(1);
      expect(rows[0].points).toBe(0);
      expect(rows[0].text.length).toBeGreaterThan(0);
    }
  });
});

describe("the properties the inline shape could not hold", () => {
  it("cannot score on a channel it does not declare", () => {
    // Every phone signal reads a parsed number. The inline version's protection
    // was that the code sat inside checkPhone; here it is declared, so a future
    // caller cannot reach these rules with a message body.
    for (const channel of ["url", "sms", "email", "custom"] as const) {
      const wrong = { ...ctx("1900 123 456"), channel };
      expect(registryScore(wrong, PHONE_SIGNALS), `${channel} reached a phone signal`).toEqual([]);
    }
  });

  it("cannot score without the input it declares", () => {
    // `reads: ["phone"]` is enforced by registryScore, not by each evaluate
    // remembering to guard. With no intel on the context, nothing fires — so a
    // signal cannot report on a number that was never parsed.
    const { phone: _omitted, ...noPhone } = ctx("1900 123 456");
    expect(registryScore(noPhone as Context, PHONE_SIGNALS)).toEqual([]);
  });

  it("declares every read it makes, so overlap is a query not a probe", () => {
    for (const def of PHONE_SIGNALS) {
      expect(def.reads, `${def.id} declares no reads`).toContain("phone");
    }
    // All seven read the same input, which is correct and now *visible*: they
    // are seven facts about one parsed number, not two rules re-deriving each
    // other's tokens. The double-scoring defect was exactly this question being
    // unanswerable without reading both rules.
    const onPhone = PHONE_SIGNALS.filter((d) => d.reads.includes("phone"));
    expect(onPhone).toHaveLength(PHONE_SIGNALS.length);
  });

  it("separates the one claim about the world from the rules that cannot go stale", () => {
    // Which countries host scam operations is maintained data and goes stale;
    // a line type cannot. Nothing owns maintaining the epistemic half today,
    // which is why the inventory has to be able to name it.
    const epistemic = PHONE_SIGNALS.filter((d) => d.kind === "epistemic").map((d) => d.id);
    expect(epistemic).toEqual(["phone.highScamCountry"]);
  });
});

describe("the guard carried over rather than restated", () => {
  it("suppresses the country row when wangiri already said it", () => {
    // The inline condition was `highScamCountry && !wangiriRisk`, carried over
    // verbatim. Both rows would tell the reader the same thing twice, and
    // restating a guard that already exists in guarded form elsewhere is the
    // most expensive pattern in this codebase's history — eight defects across
    // three rules.
    const intel = analysePhone("+252 61 234567", "AU");
    expect(intel.wangiriRisk).toBe(true);
    expect(intel.highScamCountry).toBe(true);

    const ids = idsFor("+252 61 234567");
    expect(ids).toContain("phone.wangiri");
    expect(ids).not.toContain("phone.highScamCountry");
  });

  it("still reports a high-scam country with no wangiri risk", () => {
    // The inverse direction, so the suppression above cannot be passing by
    // never firing — an injection that passes because nothing ran is a finding,
    // not a relief.
    const fired = PHONE_SIGNALS.find((d) => d.id === "phone.highScamCountry");
    const hits = fired?.evaluate({
      ...ctx("+252 61 234567"),
      phone: { ...analysePhone("+252 61 234567", "AU"), wangiriRisk: false },
    });
    expect(hits).toHaveLength(1);
    expect(hits?.[0].text).toContain("scam operations");
  });
});

describe("the scoring constants are data, not literals", () => {
  it("keeps the spoofing rungs the inline table held", () => {
    expect(SPOOFING_POINTS).toEqual({ low: 15, medium: 30, high: 55, very_high: 75 });
  });

  it("keeps the floor at 15", () => {
    expect(NOTHING_FOUND_POINTS).toBe(15);
  });
});

describe("the inventory now reports a real surface", () => {
  it("lists every phone signal with its weight, without running anything", () => {
    const inv = signalInventory(PHONE_SIGNALS);
    expect(inv.map((e) => e.id)).toEqual([
      "phone.fixedLine",
      "phone.freecall",
      "phone.highScamCountry",
      "phone.premium",
      "phone.sharedCost",
      "phone.voip",
      "phone.wangiri",
    ]);
    // This is item 1's inventory, for one channel, generated rather than
    // maintained: the weights below were not written here, they were read off
    // the registry.
    expect(Object.fromEntries(inv.map((e) => [e.id, e.weights.phone]))).toEqual({
      "phone.fixedLine": 0,
      "phone.freecall": 0,
      "phone.highScamCountry": 0,
      "phone.premium": 20,
      "phone.sharedCost": 0,
      "phone.voip": 10,
      "phone.wangiri": 20,
    });
  });

  it("shows zero on every unconverted channel", () => {
    for (const entry of signalInventory(PHONE_SIGNALS)) {
      for (const channel of ["url", "sms", "email", "custom"] as const) {
        expect(entry.weights[channel], `${entry.id} weighs on ${channel}`).toBe(0);
      }
    }
  });
});
