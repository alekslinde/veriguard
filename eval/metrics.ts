// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Metric computation. Pure functions over scored outcomes — no I/O, no engine.

import type { EvalCase, Label, Prediction } from "./schema";

export interface Outcome {
  case: EvalCase;
  prediction: Prediction;
  score: number;
  verdict: string;
  coverage: string;
}

/**
 * A proportion with its 95% Wilson score interval.
 *
 * Every rate here is estimated from a sample, and at corpus sizes in the tens
 * the sampling error dwarfs the differences the thresholds try to police: 24/25
 * is a point estimate of 96% with an interval running from roughly 80% to 99%.
 * Reporting the point estimate alone invites reading a smoke test as a
 * measurement — which is exactly the mistake this harness was built to stop
 * making about the detector.
 *
 * `n` is the denominator the interval was computed from, and differs per
 * metric: recall is over committed scam cases, FPR over committed benign ones,
 * coverage over every case in the slice.
 */
export interface Rate {
  value: number;
  /** Inclusive 95% bounds, each clamped to [0, 1]. */
  low: number;
  high: number;
  n: number;
}

/**
 * 95% Wilson score interval for a binomial proportion.
 *
 * Wilson rather than the textbook normal approximation because the corpus lives
 * where the normal one breaks down: small n, and proportions near 0 or 1. At
 * 12/12 the normal interval is [1.0, 1.0] — it claims certainty from twelve
 * observations — while Wilson gives roughly [0.76, 1.0], which is the honest
 * reading. It also never escapes [0, 1], so a bound can be printed as-is.
 *
 * Returns null for n = 0: no observations, no interval. Callers that already
 * treat a null rate as "no data" get the same shape here.
 */
export function wilson(successes: number, n: number): Rate | null {
  if (n <= 0) return null;
  const z = 1.959963984540054; // 97.5th percentile of the standard normal
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const spread = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return {
    value: p,
    low: Math.max(0, centre - spread),
    high: Math.min(1, centre + spread),
    n,
  };
}

export interface Metrics {
  /** Cases in this slice, including abstentions. */
  total: number;
  scam: number;
  benign: number;
  /** Share of cases where the engine committed to an answer. */
  coverageRate: number;
  /**
   * Computed over committed predictions only. Null when the slice has no
   * committed case of the relevant class — an undefined ratio, which must not
   * be reported as 0 (that reads as total failure rather than no data).
   *
   * Point estimates. Read them with the intervals below: at these corpus sizes
   * the two can tell very different stories.
   */
  recall: number | null;
  fpr: number | null;
  precision: number | null;
  /**
   * The same three rates plus coverage, each with a 95% Wilson interval and the
   * denominator it came from. Null exactly where the point estimate is null.
   */
  recallCi: Rate | null;
  fprCi: Rate | null;
  precisionCi: Rate | null;
  coverageCi: Rate | null;
  /** Scam:benign among committed cases. Precision is meaningless without it. */
  committedScam: number;
  committedBenign: number;
  /**
   * Score medians and 90th percentiles per label. Verdicts are thresholded, so
   * a rule change can erode margin substantially with no metric movement and
   * then flip many cases at once. Watching the distribution gives warning.
   */
  scoreP50: { scam: number | null; benign: number | null };
  scoreP90: { scam: number | null; benign: number | null };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function scoresFor(outcomes: Outcome[], label: Label): number[] {
  return outcomes
    .filter((o) => o.case.label === label)
    .map((o) => o.score)
    .sort((a, b) => a - b);
}

export function computeMetrics(outcomes: Outcome[]): Metrics {
  const scam = outcomes.filter((o) => o.case.label === "scam");
  const benign = outcomes.filter((o) => o.case.label === "benign");
  const committed = outcomes.filter((o) => o.prediction !== "abstain");

  const cScam = committed.filter((o) => o.case.label === "scam");
  const cBenign = committed.filter((o) => o.case.label === "benign");

  const tp = cScam.filter((o) => o.prediction === "flagged").length;
  const fp = cBenign.filter((o) => o.prediction === "flagged").length;

  const recall = cScam.length > 0 ? tp / cScam.length : null;
  const fpr = cBenign.length > 0 ? fp / cBenign.length : null;
  // Gated on there being a committed scam case, not on tp+fp>0. An all-benign
  // slice with one false positive has a defined ratio of 0, but reporting it as
  // "0.0% precision" reads as total failure when the truth is that the slice
  // holds nothing to be precise about — the same misreading the null guards on
  // recall and FPR exist to prevent.
  const precision = cScam.length > 0 && tp + fp > 0 ? tp / (tp + fp) : null;

  const scamScores = scoresFor(outcomes, "scam");
  const benignScores = scoresFor(outcomes, "benign");

  return {
    total: outcomes.length,
    scam: scam.length,
    benign: benign.length,
    coverageRate: outcomes.length > 0 ? committed.length / outcomes.length : 0,
    recall,
    fpr,
    precision,
    recallCi: cScam.length > 0 ? wilson(tp, cScam.length) : null,
    fprCi: cBenign.length > 0 ? wilson(fp, cBenign.length) : null,
    // Denominator is everything flagged, matching the point estimate; gated on
    // there being a committed scam case for the same reason precision is.
    precisionCi: cScam.length > 0 && tp + fp > 0 ? wilson(tp, tp + fp) : null,
    coverageCi: wilson(committed.length, outcomes.length),
    committedScam: cScam.length,
    committedBenign: cBenign.length,
    scoreP50: { scam: percentile(scamScores, 0.5), benign: percentile(benignScores, 0.5) },
    scoreP90: { scam: percentile(scamScores, 0.9), benign: percentile(benignScores, 0.9) },
  };
}

/** Group outcomes by an arbitrary key, preserving a stable key order. */
export function sliceBy(outcomes: Outcome[], key: (o: Outcome) => string): Map<string, Outcome[]> {
  const out = new Map<string, Outcome[]>();
  for (const o of outcomes) {
    const k = key(o);
    const bucket = out.get(k);
    if (bucket) bucket.push(o);
    else out.set(k, [o]);
  }
  return new Map([...out.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
