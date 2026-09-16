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

import type { CheckResult } from "./engineTypes";

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
