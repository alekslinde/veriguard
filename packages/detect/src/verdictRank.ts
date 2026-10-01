// Severity ordering for verdicts, and the worst-wins collapse built on it.
//
// This lived in `lib/verdictSummary.ts`, which is the right home for everything
// *around* it — tracking pixels, report prefills, evidence pooling — but not for
// the ordering itself. The ordering is a claim about what the engine's own four
// verdicts mean relative to each other, and it now has a second consumer that
// cannot reach `lib/`: the WebExtension bundles the engine and nothing else.
//
// Moved rather than copied, deliberately. A duplicated rank table is the defect
// shape this codebase has paid for repeatedly — two pieces of code that must
// agree, kept in agreement by a comment. `lib/verdictSummary.ts` imports these,
// so the app and the extension cannot drift: there is one table.
//
// Scope: the ordering and the collapse over already-scored results. Anything
// that needs to know what a tracking pixel is, or how to prefill a report, is
// app-side and stays there.

import type { CheckResult, Signal } from "./engineTypes";

export type Verdict = CheckResult["verdict"];

/**
 * Severity ordering — higher wins when collapsing many identifiers into one
 * overall verdict.
 *
 * `unknown` sits just above `safe`: it is not a clean pass, but it is not a
 * positive signal of a scam either. That placement is load-bearing for coverage
 * honesty — a `minimal` region that downgrades a clean result to `unknown` must
 * not have that result outrank a real `suspicious` finding from another
 * identifier in the same message.
 */
export const VERDICT_RANK: Record<Verdict, number> = {
  safe: 0,
  unknown: 1,
  suspicious: 2,
  likely_scam: 3,
};

/** Whether `a` is a more severe verdict than `b`. */
export function isWorse(a: Verdict, b: Verdict): boolean {
  return VERDICT_RANK[a] > VERDICT_RANK[b];
}

/**
 * Collapse scored results to the worst one: its verdict AND its score, together.
 *
 * Returns the winning result rather than a `{verdict, score}` pair so the caller
 * keeps whatever else it was carrying. The pairing is the point — reporting the
 * worst verdict beside the *highest* score would mix two different identifiers'
 * findings into one headline that describes neither.
 */
export function worstBy<T>(items: readonly T[], verdictOf: (item: T) => Verdict): T | null {
  if (items.length === 0) return null;
  return items.reduce((acc, item) => (isWorse(verdictOf(item), verdictOf(acc)) ? item : acc));
}

/**
 * Pool every identifier's signals into one evidence list.
 *
 * Ordering: findings first in identifier order, then clamp rows (`source:
 * "score"`) last — a clamp is arithmetic about the total, so it belongs at the
 * bottom of the column it explains rather than interleaved with observations.
 *
 * Duplicate texts are collapsed. The same URL appearing in both the message
 * scan and its own scan produces the same sentence twice, and one observation
 * listed twice reads as two independent findings.
 */
export function pooledSignals(results: readonly { result: { signals?: Signal[] } }[]): Signal[] {
  const seen = new Set<string>();
  const findings: Signal[] = [];
  const clamps: Signal[] = [];
  for (const r of results) {
    for (const s of r.result.signals ?? []) {
      if (seen.has(s.text)) continue;
      seen.add(s.text);
      (s.source === "score" ? clamps : findings).push(s);
    }
  }
  return [...findings, ...clamps];
}

/**
 * The evidence rows to show, and the score they add up to.
 *
 * **The invariant: the rows on screen sum to the number above them.** A verdict
 * collapse returns the WORST identifier's score, while pooled evidence covers
 * EVERY identifier — pairing the two directly puts a headline of 75 above six
 * rows totalling 120, in a panel whose own copy invites the reader to check the
 * arithmetic. So the score shown is the sum of the evidence shown, capped at
 * 100 like every per-identifier score, with a clamp row when the cap bites.
 *
 * Only the arithmetic is recomputed; the verdict still comes from `worstBy`,
 * because worst-identifier-wins is the severity rule. A pooled sum is always
 * >= the worst identifier's score, so this can never soften a verdict.
 *
 * `floor` lets a caller keep a score that no signal accounts for — an app-side
 * nudge that moved the verdict without any identifier scoring it. The gap is
 * emitted as its own row with the caller's wording, so the panel never shows a
 * meter above rows that do not explain it.
 */
export function evidenceFor(
  results: readonly { result: { signals?: Signal[] } }[],
  floor?: { score: number; text: string; source?: Signal["source"] },
): { score: number; signals: Signal[] } {
  const findings = pooledSignals(results).filter((s) => s.source !== "score");
  let signals = findings;
  let score = Math.min(
    findings.reduce((n, s) => n + s.points, 0),
    100,
  );

  if (floor && score < floor.score) {
    signals = [...findings, { text: floor.text, points: floor.score - score, source: floor.source ?? "message" }];
    score = floor.score;
  }

  const raw = signals.reduce((n, s) => n + s.points, 0);
  if (raw > score) {
    signals = [
      ...signals,
      { text: `Signals total ${raw} — the score is capped at ${score}`, points: score - raw, source: "score" },
    ];
  }

  return { score, signals };
}
