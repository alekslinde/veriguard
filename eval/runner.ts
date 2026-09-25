// Drives the detection engine over a corpus.
//
// Two deliberate constraints keep runs reproducible:
//
//   · The URLhaus blocklist is never fetched. getUrlhausBlocklist() is
//     network-backed, so including it would make results depend on what
//     abuse.ch had published that morning — a corpus regression and a feed
//     update would be indistinguishable. Every check gets an empty blocklist,
//     making a run a pure function of (corpus, region packs, engine).
//
//   · analyzeContent's fetcher is stubbed to reject. URL expansion is a
//     network call on the same footing; a case that depends on expansion
//     should say so in its notes rather than silently hitting the wire.

import { analyzeContent, type AnalyzedIdentifier } from "@veriguard/scam-detect/scamDetector";
import { toPrediction, type EvalCase, type Prediction, type SuspiciousPolicy } from "./schema";
import type { Outcome } from "./metrics";

const NO_BLOCKLIST: Set<string> = new Set();

/**
 * Never reached: every case is scored with an empty blocklist and no expansion.
 * Throwing rather than returning makes an accidental network dependency loud.
 */
const NO_FETCH = () => {
  throw new Error("eval runner must not perform network I/O");
};

/**
 * Reduce the cards analyzeContent produces to the single verdict a user acts
 * on — the worst one.
 *
 * The app renders one card per identifier: a scam SMS yields both a "message"
 * card and a "url" card for the link inside it, and those can disagree sharply.
 * "Login at commbank-secure-login.tk/auth" scores 0 as a message and 85 as a
 * URL, because the signal is entirely in the host. A user seeing one red card
 * among several treats the message as a scam, so taking the maximum is what
 * matches the decision they actually make.
 *
 * Coverage is taken from the same card, so an abstention reflects the card that
 * drove the verdict rather than an unrelated one.
 */
const RANK: Record<string, number> = { safe: 0, unknown: 1, suspicious: 2, likely_scam: 3 };

function worstCard(cards: AnalyzedIdentifier[]): AnalyzedIdentifier | undefined {
  return cards.reduce<AnalyzedIdentifier | undefined>((worst, card) => {
    if (!worst) return card;
    const a = RANK[card.result.verdict] ?? 0;
    const b = RANK[worst.result.verdict] ?? 0;
    if (a !== b) return a > b ? card : worst;
    return card.result.score > worst.result.score ? card : worst;
  }, undefined);
}

/** The scored reading of one piece of content, before it is tied to a label. */
export interface Scored {
  prediction: Prediction;
  score: number;
  verdict: string;
  coverage: string;
}

/**
 * Score one piece of content exactly as the corpus eval does.
 *
 * Exported so the metamorphic suite scores its transformed inputs through the
 * same path rather than assembling its own analyzeContent call. A second copy
 * would be free to drift on the details that decide a verdict — which card
 * wins, how an empty result reads, whether the blocklist is stubbed — and a
 * consistency checker running a different pipeline from the thing it checks
 * reports differences that belong to the harness, not the engine.
 */
export async function scoreContent(
  content: string,
  region: EvalCase["region"],
  suspiciousAs: SuspiciousPolicy,
): Promise<Scored> {
  // Same entrypoint as app/api/check/route.ts, so the eval measures what
  // users are shown rather than an internal checker they never hit directly.
  const cards = await analyzeContent(content, NO_BLOCKLIST, region, { fetcher: NO_FETCH });
  const worst = worstCard(cards);

  // No identifiers extracted at all — the engine had nothing to say.
  if (!worst) return { prediction: "abstain", score: 0, verdict: "unknown", coverage: "unknown" };

  return {
    prediction: toPrediction(worst.result, suspiciousAs),
    score: worst.result.score,
    verdict: worst.result.verdict,
    coverage: worst.result.coverage ?? "unknown",
  };
}

export async function runCorpus(
  cases: EvalCase[],
  suspiciousAs: SuspiciousPolicy,
): Promise<Outcome[]> {
  const outcomes: Outcome[] = [];
  for (const c of cases) {
    outcomes.push({ case: c, ...(await scoreContent(c.content, c.region, suspiciousAs)) });
  }
  return outcomes;
}
