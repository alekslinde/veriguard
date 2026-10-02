// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Threshold gating and terminal formatting.

import type { Metrics, Outcome, Rate } from "./metrics";

export interface Thresholds {
  recall: number | null;
  fpr: number | null;
  coverage: number | null;
}

export interface Breach {
  slice: string;
  metric: "recall" | "fpr" | "coverage";
  actual: number;
  limit: number;
  /**
   * True when the limit sits inside the metric's 95% interval — the sample is
   * consistent with the threshold being met, and the breach may be noise.
   *
   * It still fails the run. A gate that ignored breaches it could not prove
   * would pass everything at small n, which is the opposite of what a ratchet
   * is for. Flagging it tells the reader whether to investigate the detector or
   * add cases to the slice.
   */
  inconclusive: boolean;
}

/**
 * Check one slice against its gate.
 *
 * A null metric (no committed cases of that class) is never a breach — there
 * is nothing to judge. A null threshold is explicitly ungated. CA carries
 * both: recall is ungated pending a reviewer, while FPR stays gated, because
 * flagging a benign message is measurable harm regardless of whether we have
 * the language expertise to judge recall.
 */
export function checkThresholds(slice: string, m: Metrics, t: Thresholds | undefined): Breach[] {
  if (!t) return [];
  const breaches: Breach[] = [];

  // A breach is inconclusive when the limit falls inside the interval: the
  // sample cannot distinguish "we are below the bar" from "we are at it".
  const spans = (r: Rate | null, limit: number): boolean =>
    r !== null && limit >= r.low && limit <= r.high;

  if (t.recall !== null && m.recall !== null && m.recall < t.recall) {
    breaches.push({
      slice, metric: "recall", actual: m.recall, limit: t.recall,
      inconclusive: spans(m.recallCi, t.recall),
    });
  }
  if (t.fpr !== null && m.fpr !== null && m.fpr > t.fpr) {
    breaches.push({
      slice, metric: "fpr", actual: m.fpr, limit: t.fpr,
      inconclusive: spans(m.fprCi, t.fpr),
    });
  }
  if (t.coverage !== null && m.coverageRate < t.coverage) {
    breaches.push({
      slice, metric: "coverage", actual: m.coverageRate, limit: t.coverage,
      inconclusive: spans(m.coverageCi, t.coverage),
    });
  }
  return breaches;
}

const pct = (v: number | null): string => (v === null ? "  -  " : `${(v * 100).toFixed(1)}%`.padStart(6));
const num = (v: number | null): string => (v === null ? " -" : String(v).padStart(3));

/**
 * A rate as "96.0% [80.5-99.3]".
 *
 * The interval is printed beside every rate rather than behind a flag, because
 * the point estimate alone is what invites reading a 45-case smoke test as a
 * measurement. Making the width impossible to miss is the whole purpose.
 */
const rate = (r: Rate | null): string => {
  if (r === null) return "     -        ";
  const v = `${(r.value * 100).toFixed(1)}%`.padStart(6);
  return `${v} [${(r.low * 100).toFixed(0)}-${(r.high * 100).toFixed(0)}]`.padEnd(15);
};

/**
 * Headline block: each rate over its own denominator, with the interval and a
 * plain-language note on what the width supports.
 */
export function formatOverall(m: Metrics): string {
  const line = (name: string, r: Rate | null): string => {
    if (r === null) return `  ${name.padEnd(9)} -`;
    const width = (r.high - r.low) * 100;
    const ci = `[${(r.low * 100).toFixed(1)}, ${(r.high * 100).toFixed(1)}]`;
    return (
      `  ${name.padEnd(9)}${(r.value * 100).toFixed(1).padStart(5)}%` +
      `   95% CI ${ci.padEnd(14)}` +
      `n=${String(r.n).padStart(4)}   ±${(width / 2).toFixed(0)}pp`
    );
  };

  const lines = [
    "",
    "Overall",
    line("recall", m.recallCi),
    line("FPR", m.fprCi),
    line("precision", m.precisionCi),
    line("coverage", m.coverageCi),
  ];

  // The widest interval among the gated rates sets what the corpus can support.
  // Stating it in words stops a reader lifting a point estimate out of context —
  // the failure mode this whole block exists to prevent.
  const widths = [m.recallCi, m.fprCi]
    .filter((r): r is Rate => r !== null)
    .map((r) => (r.high - r.low) * 100);
  if (widths.length > 0) {
    const worst = Math.max(...widths);
    const verdict =
      worst > 20
        ? "smoke test only — too few cases to support a quantitative claim"
        : worst > 10
          ? "coarse gating only — enough to catch large regressions"
          : worst > 6
            ? "usable for thresholds, not for detecting small regressions"
            : "supports threshold gating and small-regression detection";
    lines.push(`\n  Widest gated interval: ±${(worst / 2).toFixed(0)}pp — ${verdict}.`);
  }

  return lines.join("\n");
}

export function formatSliceTable(title: string, rows: Map<string, Metrics>): string {
  const lines: string[] = [
    "",
    title,
    "  slice              n  scam  ben  recall  95% CI     FPR     95% CI       cov    p50 s/b",
    "  " + "-".repeat(88),
  ];
  for (const [slice, m] of rows) {
    lines.push(
      "  " +
        slice.padEnd(18) +
        String(m.total).padStart(2) +
        "  " +
        String(m.scam).padStart(4) +
        "  " +
        String(m.benign).padStart(3) +
        "  " +
        rate(m.recallCi) +
        " " +
        rate(m.fprCi) +
        " " +
        pct(m.coverageRate) +
        "   " +
        num(m.scoreP50.scam) +
        "/" +
        num(m.scoreP50.benign),
    );
  }
  return lines.join("\n");
}

/** Cases where the engine committed to the wrong answer. Abstentions excluded. */
export function formatMisses(outcomes: Outcome[]): string {
  const wrong = outcomes.filter(
    (o) =>
      (o.case.label === "scam" && o.prediction === "clean") ||
      (o.case.label === "benign" && o.prediction === "flagged"),
  );
  if (wrong.length === 0) return "\nNo incorrect commitments.";

  const lines = ["", `Incorrect commitments (${wrong.length}):`];
  for (const o of wrong) {
    const kind = o.case.label === "scam" ? "MISS" : "FALSE POSITIVE";
    lines.push(
      `  ${kind}  ${o.case.id}  [${o.case.region}/${o.case.type}${o.case.category ? "/" + o.case.category : ""}]  score=${o.score} verdict=${o.verdict}`,
    );
    lines.push(`         ${o.case.content.slice(0, 88).replace(/\s+/g, " ")}`);
  }
  return lines.join("\n");
}

/** Abstentions on scam cases — coverage gaps, reported apart from misses. */
export function formatAbstentions(outcomes: Outcome[]): string {
  const abstained = outcomes.filter((o) => o.prediction === "abstain");
  if (abstained.length === 0) return "";
  const byRegion = new Map<string, number>();
  for (const o of abstained) {
    byRegion.set(o.case.region, (byRegion.get(o.case.region) ?? 0) + 1);
  }
  const parts = [...byRegion.entries()].sort().map(([r, n]) => `${r}=${n}`);
  return `\nAbstained (coverage gate): ${abstained.length} — ${parts.join(" ")}`;
}
