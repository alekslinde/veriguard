// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { toPrediction, validateCase } from "@/eval/schema";
import { computeMetrics, wilson, type Outcome } from "@/eval/metrics";
import { checkThresholds } from "@/eval/report";
import { loadCorpus } from "@/eval/corpus";
import { join } from "node:path";
import type { CheckResult } from "@veriguard/detect/engineTypes";

// The harness gates detection changes, so it needs its own coverage: a bug that
// silently scores every case as correct would make the gate useless while
// looking green. These are unit tests of the harness, not of detection — the
// corpus eval itself runs via `npm run eval`, deliberately outside vitest.

const result = (over: Partial<CheckResult>): CheckResult => ({
  verdict: "safe", score: 0, flags: [], details: "", coverage: "full", ...over,
});

describe("toPrediction", () => {
  it("abstains whenever coverage is short, whatever the verdict", () => {
    for (const coverage of ["none", "partial"] as const) {
      expect(toPrediction(result({ verdict: "likely_scam", coverage }))).toBe("abstain");
      expect(toPrediction(result({ verdict: "safe", coverage }))).toBe("abstain");
    }
  });

  it("maps committed verdicts under full coverage", () => {
    expect(toPrediction(result({ verdict: "likely_scam" }))).toBe("flagged");
    expect(toPrediction(result({ verdict: "safe" }))).toBe("clean");
    expect(toPrediction(result({ verdict: "unknown" }))).toBe("abstain");
  });

  it("honours the suspicious policy", () => {
    const r = result({ verdict: "suspicious" });
    expect(toPrediction(r, "flagged")).toBe("flagged");
    expect(toPrediction(r, "clean")).toBe("clean");
    expect(toPrediction(r, "abstain")).toBe("abstain");
  });
});

const outcome = (label: "scam" | "benign", prediction: Outcome["prediction"], score = 0): Outcome => ({
  case: { id: `${label}-${Math.random()}`, type: "sms", region: "AU", content: "x", label, source: "t", addedAt: "2026-08-29" },
  prediction, score, verdict: "safe", coverage: "full",
});

describe("computeMetrics", () => {
  it("excludes abstentions from recall and FPR", () => {
    const m = computeMetrics([
      outcome("scam", "flagged"), outcome("scam", "clean"), outcome("scam", "abstain"),
      outcome("benign", "clean"), outcome("benign", "abstain"),
    ]);
    // 2 committed scam, 1 caught → 0.5, not 1/3.
    expect(m.recall).toBe(0.5);
    expect(m.fpr).toBe(0);
    expect(m.coverageRate).toBeCloseTo(3 / 5);
  });

  it("returns null rather than zero when a class has no committed cases", () => {
    const m = computeMetrics([outcome("scam", "abstain")]);
    expect(m.recall).toBeNull();
    expect(m.fpr).toBeNull();
    expect(m.precision).toBeNull();
  });

  it("reports null precision on an all-benign slice, not 0%", () => {
    // The ratio is defined (0 of 1 flagged is a true positive) but meaningless:
    // the slice holds nothing to be precise about, and "0.0%" reads as total
    // failure rather than as no data.
    const m = computeMetrics([outcome("benign", "flagged"), outcome("benign", "clean")]);
    expect(m.precision).toBeNull();
    expect(m.fpr).toBe(0.5);
  });
});

describe("wilson", () => {
  const round = (v: number) => Math.round(v * 1000) / 10;

  it("returns null for an empty denominator", () => {
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(0, -1)).toBeNull();
  });

  it("matches known values", () => {
    const r = wilson(24, 25)!;
    expect(round(r.value)).toBe(96);
    expect(round(r.low)).toBeCloseTo(80.5, 0);
    expect(round(r.high)).toBeCloseTo(99.3, 0);
    expect(r.n).toBe(25);
  });

  it("never claims certainty from a perfect small sample", () => {
    // The normal approximation gives [1, 1] here — twelve observations
    // presented as proof. Wilson is why we use it.
    const r = wilson(12, 12)!;
    expect(r.value).toBe(1);
    expect(r.low).toBeLessThan(0.8);
    expect(r.high).toBe(1);
  });

  it("stays within [0, 1] at both extremes", () => {
    for (const [k, n] of [[0, 12], [12, 12], [0, 1], [1, 1]] as const) {
      const r = wilson(k, n)!;
      expect(r.low).toBeGreaterThanOrEqual(0);
      expect(r.high).toBeLessThanOrEqual(1);
    }
  });

  it("narrows as n grows at a fixed proportion", () => {
    const widths = [10, 100, 1000].map((n) => {
      const r = wilson(n * 0.9, n)!;
      return r.high - r.low;
    });
    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[2]);
  });

  it("brackets the point estimate", () => {
    for (const [k, n] of [[3, 10], [7, 9], [50, 200]] as const) {
      const r = wilson(k, n)!;
      expect(r.low).toBeLessThanOrEqual(r.value);
      expect(r.high).toBeGreaterThanOrEqual(r.value);
    }
  });
});

describe("metric intervals", () => {
  it("attaches an interval to each rate over its own denominator", () => {
    const m = computeMetrics([
      outcome("scam", "flagged"), outcome("scam", "clean"),
      outcome("benign", "clean"), outcome("benign", "clean"), outcome("benign", "abstain"),
    ]);
    expect(m.recallCi!.n).toBe(2);     // committed scam
    expect(m.fprCi!.n).toBe(2);        // committed benign
    expect(m.coverageCi!.n).toBe(5);   // every case in the slice
    expect(m.recallCi!.value).toBe(m.recall);
    expect(m.fprCi!.value).toBe(m.fpr);
  });

  it("nulls the interval exactly where the point estimate is null", () => {
    const m = computeMetrics([outcome("scam", "abstain")]);
    expect(m.recall).toBeNull();
    expect(m.recallCi).toBeNull();
    expect(m.fpr).toBeNull();
    expect(m.fprCi).toBeNull();
    expect(m.precisionCi).toBeNull();
  });

  it("keeps precision and its interval consistent on an all-benign slice", () => {
    const m = computeMetrics([outcome("benign", "flagged")]);
    expect(m.precision).toBeNull();
    expect(m.precisionCi).toBeNull();
  });
});

describe("checkThresholds", () => {
  const t = { recall: 0.9, fpr: 0.02, coverage: 0.98 };

  it("breaches on low recall, high FPR and low coverage", () => {
    const m = computeMetrics([outcome("scam", "clean"), outcome("benign", "flagged")]);
    expect(checkThresholds("AU", m, t).map((b) => b.metric).sort()).toEqual(["fpr", "recall"]);
  });

  it("never breaches on a null metric — nothing to judge", () => {
    expect(checkThresholds("CA", computeMetrics([outcome("scam", "abstain")]), { ...t, coverage: null })).toEqual([]);
  });

  it("marks a breach inconclusive when the limit sits inside the interval", () => {
    // 1 of 2 caught against a 0.9 bar: a real breach, but the sample cannot
    // distinguish it from meeting the bar.
    const m = computeMetrics([outcome("scam", "flagged"), outcome("scam", "clean")]);
    const [breach] = checkThresholds("AU", m, { recall: 0.9, fpr: null, coverage: null });
    expect(breach.inconclusive).toBe(true);
  });

  it("does not mark a well-evidenced breach inconclusive", () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      outcome("scam", i < 50 ? "flagged" : "clean"),
    );
    const [breach] = checkThresholds("AU", computeMetrics(many), {
      recall: 0.9, fpr: null, coverage: null,
    });
    expect(breach.inconclusive).toBe(false);
  });

  it("still fails the run on an inconclusive breach", () => {
    // A gate that ignored what it could not prove would pass everything at
    // small n — the opposite of a ratchet.
    const m = computeMetrics([outcome("scam", "clean")]);
    expect(checkThresholds("AU", m, { recall: 0.9, fpr: null, coverage: null })).toHaveLength(1);
  });

  it("treats a null threshold as ungated", () => {
    const m = computeMetrics([outcome("scam", "clean")]);
    expect(checkThresholds("CA", m, { recall: null, fpr: 0.02, coverage: null })).toEqual([]);
  });
});

describe("validateCase", () => {
  const valid = { id: "a", type: "sms", region: "AU", content: "x", label: "scam", source: "t", addedAt: "2026-08-29" };

  it("accepts a well-formed case", () => {
    expect(validateCase(valid, new Set())).toEqual([]);
  });

  it("rejects duplicate ids", () => {
    expect(validateCase(valid, new Set(["a"])).join()).toContain("duplicate");
  });

  it.each([
    ["type", { type: "carrier-pigeon" }],
    ["label", { label: "probably" }],
    ["addedAt", { addedAt: "29/08/2026" }],
    ["region", { region: "" }],
  ])("rejects a bad %s", (field, over) => {
    expect(validateCase({ ...valid, ...over }, new Set()).join()).toContain(field);
  });
});

describe("piiHits span location", () => {
  // Regression cover for a real hole: spans were recovered by diffing scrubbed
  // output against the original, so two redactions closer together than the
  // anchor width merged into one blob. Declaring that blob in `identifiers`
  // whitelisted every address inside it — a victim's could ride along with a
  // scammer's into the committed corpus.
  const dir = join(process.cwd(), "eval/fixtures/adjacent-pii");

  it("reports adjacent identifiers separately, not as one merged span", () => {
    const { errors } = loadCorpus(dir);
    const line = errors.find((e) => e.includes("adjacent-0001")) ?? "";
    expect(line).toContain("a@victim.com");
    expect(line).toContain("c@evil.tk");
    expect(line).not.toContain("a@victim.com and c@evil.tk");
  });

  it("does not let a declared scam address whitelist an undeclared victim one", () => {
    const { errors, cases } = loadCorpus(dir);
    expect(cases.map((c) => c.id)).not.toContain("adjacent-0002");
    expect(errors.find((e) => e.includes("adjacent-0002"))).toContain("victim@gmail.com");
  });

  it("separates two space-spanning phone numbers on one line", () => {
    const line = loadCorpus(dir).errors.find((e) => e.includes("adjacent-0003")) ?? "";
    expect(line).toContain("0412 345 678");
    expect(line).toContain("0412 999 111");
  });

  it("still accepts a case whose identifiers are each declared", () => {
    expect(loadCorpus(dir).cases.map((c) => c.id)).toContain("adjacent-0004");
  });
});

describe("the committed corpus", () => {
  it("loads clean — no schema, duplicate or PII failures", () => {
    const { cases, errors } = loadCorpus(join(process.cwd(), "eval/corpus"));
    expect(errors).toEqual([]);
    expect(cases.length).toBeGreaterThan(0);
  });

  it("rejects content carrying reporter headers", () => {
    // Guards the privacy invariant itself: a case with the recipient's mailbox
    // in a Delivered-To header must never load, however well-formed otherwise.
    const { errors } = loadCorpus(join(process.cwd(), "eval/fixtures/bad-corpus"));
    expect(errors.join(" ")).toContain("reporter/delivery headers");
  });

  it("rejects undeclared PII-shaped content", () => {
    const { errors } = loadCorpus(join(process.cwd(), "eval/fixtures/bad-corpus"));
    expect(errors.join(" ")).toContain("undeclared PII-shaped content");
  });
});
