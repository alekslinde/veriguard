// The extension's checking layer.
//
// Wraps the bundled engine in the two things a client owes its user: a verdict
// collapsed the same way every other Veriguard surface collapses it, and an
// honest account of what this particular surface could not do.
//
// **Nothing here makes a network request, and that is structural rather than
// promised.** `analyzeContent` reaches for no global `fetch` — URL expansion
// takes its transport as an argument, and this call site passes none. So a
// shortened link is reported as unexpanded rather than followed, which is the
// correct behaviour for a client running on the user's machine: expanding it
// here would disclose the user's IP to the scammer's shortener.

import { analyzeContent, UNEXPANDED_SHORTENER_NOTE } from "@veriguard/engine/scamDetector";
import type { AnalyzedIdentifier } from "@veriguard/engine/scamDetector";
import { worstBy, evidenceFor } from "@veriguard/engine/verdictRank";
import type { Verdict } from "@veriguard/engine/verdictRank";
import type { Signal } from "@veriguard/engine/engineTypes";
import type { RegionCoverage } from "@veriguard/engine/regions";
import type { HostLookup } from "@veriguard/engine/engineTypes";

export interface ExtensionCheck {
  verdict: Verdict;
  /**
   * The score the popup shows — the sum of `signals`, capped at 100.
   *
   * Not the worst identifier's score. The evidence list pools every identifier,
   * so a headline taken from one of them would sit above rows that add to
   * something else, in a panel that invites the reader to check the arithmetic.
   * `verdict` is still worst-wins; only the number is recomputed, and a pooled
   * sum is always >= the worst identifier's score, so this never softens one.
   */
  score: number;
  /**
   * The evidence rows, pooled across identifiers with duplicates collapsed and
   * any clamp row last. These sum to `score` — that is the invariant.
   */
  signals: Signal[];
  /** Every identifier found, each with its own result. */
  results: AnalyzedIdentifier[];
  /** Weakest coverage across the results — drives the honesty notice. */
  coverage: RegionCoverage | null;
  /**
   * Whether any result described a shortened link this client chose not to
   * expand. The popup says so: an unexpanded shortener is a gap in the verdict,
   * and a reader who is not told will read the score as complete.
   */
  unexpandedShortener: boolean;
  /**
   * Whether a *current* malicious-host blocklist was consulted for this check.
   *
   * False means the list has never been fetched, could not be fetched, or is
   * older than the lifetime the server stated for it — not that it was
   * consulted and found nothing. A stale copy is still used (it can only raise
   * a score) but does not count as consulted: a host added to the feed since
   * that copy was taken is a host this check could not have caught, which is
   * exactly the gap the notice exists to name. The popup says so on a clean
   * verdict, where the distinction changes what the result is worth.
   */
  blocklistConsulted: boolean;
}

/**
 * Worst coverage across results, so the notice reflects the weakest claim made
 * rather than the strongest. Mirrors `overallCoverage` in `lib/verdictSummary`;
 * not imported because that module pulls in email-only app dependencies the
 * extension has no use for.
 */
const COVERAGE_RANK: Record<RegionCoverage, number> = { full: 0, partial: 1, minimal: 2, none: 3 };

function worstCoverage(results: AnalyzedIdentifier[]): RegionCoverage | null {
  let worst: RegionCoverage | null = null;
  for (const r of results) {
    const c = r.result.coverage;
    if (!c) continue;
    if (worst === null || COVERAGE_RANK[c] > COVERAGE_RANK[worst]) worst = c;
  }
  return worst;
}

/**
 * A shortened link the engine flagged but could not resolve.
 *
 * The engine emits one exact note for this case — see `applyExpansion` — and
 * this matches that note rather than guessing from shortener domains or from a
 * loose pattern over signal prose. Both alternatives were considered and are
 * worse: a domain list here would be a second copy of one the engine owns, and
 * a regex over wording would break the first time a signal is reworded or
 * translated, silently, in the direction of claiming more than was checked.
 *
 * The note is the engine's own exported constant, so there is one definition
 * and a reword cannot desynchronise the two.
 */
function hasUnexpandedShortener(results: AnalyzedIdentifier[]): boolean {
  return results.some((r) => r.result.flags.includes(UNEXPANDED_SHORTENER_NOTE));
}

/**
 * Check `content` against the bundled engine.
 *
 * `blocklist` is optional and the check is complete without it — omitting it can
 * only ever produce a *lower* score, never a higher one, so a client with no
 * list misses a blocklisted host rather than inventing one. The result records
 * which way it went, because "no blocklist entry matched" and "the blocklist was
 * not consulted" are different statements and only one of them is reassuring.
 *
 * It arrives as `{lookup, fresh}` rather than a bare lookup so that distinction
 * survives the call. A stale copy is still handed to the engine and still only
 * raises scores, but it does not let this result claim a current list was
 * consulted when hosts added since could not have been caught.
 */
export async function runCheck(
  content: string,
  region: string | undefined,
  blocklist?: { lookup: HostLookup | undefined; fresh: boolean },
): Promise<ExtensionCheck | null> {
  const results = await analyzeContent(content, blocklist?.lookup, region);
  const worst = worstBy(results, (r) => r.result.verdict);
  if (!worst) return null;

  // Verdict from the worst identifier, score from the evidence actually shown.
  // Both come from the engine, so this surface and the website cannot disagree
  // about either — see `evidenceFor`.
  const { score, signals } = evidenceFor(results);

  return {
    verdict: worst.result.verdict,
    score,
    signals,
    results,
    coverage: worstCoverage(results),
    unexpandedShortener: hasUnexpandedShortener(results),
    blocklistConsulted: blocklist?.fresh === true,
  };
}
