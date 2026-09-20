import type { Signal } from "@veriguard/engine/engineTypes";

// Maps detection signals onto the six tactics the Learn page teaches.
//
// The point is continuity: someone who has read "how scammers operate" should
// see the same six names on their own result, so the lesson and the verdict
// reinforce each other instead of being two separate vocabularies.
//
// This lives here rather than in the engine on purpose. Tactics are a teaching
// frame layered over detection, not an input to it — nothing here can change a
// score, and the engine stays free to add or reword a signal without anyone
// having to keep a taxonomy in step. The cost is that matching is textual, so
// the patterns are written against the stable part of each signal's wording and
// a miss degrades to "not matched" rather than to a wrong answer.

/** Indexes into learn.tactics.{n}.title / .desc — the Learn page's own order. */
export type TacticId = 1 | 2 | 3 | 4 | 5 | 6;

export const TACTIC_IDS: readonly TacticId[] = [1, 2, 3, 4, 5, 6];

/**
 * The tactic names in English, for surfaces with no translator.
 *
 * The web reads these from the message bundle (`learn.tactics.N.title`) so they
 * translate with everything else. The emailed verdict is a pure server-side
 * artifact with no i18n context and is English-only for v1, and it must name
 * the same six things as the Learn page or the continuity this layer exists for
 * is lost. Kept beside the patterns so a renamed tactic is renamed once.
 *
 * A test asserts these match the bundle, so the two cannot drift.
 */
export const TACTIC_TITLES: Record<TacticId, string> = {
  1: "Urgency & fear",
  2: "Impersonation",
  3: "Too good to be true",
  4: "Borrowed authority",
  5: "Unusual payment",
  6: "Building rapport",
};

const PATTERNS: Record<TacticId, RegExp> = {
  // Urgency & fear — deadlines, suspension, threatened loss.
  1: /urgency|urgent|immediat|suspend|within \d+ hours?|expir|deadline|act now|final notice|overdue|held at customs|will be returned/i,
  // Impersonation — evidence the sender is not who it appears to be. This needs
  // a mismatch we actually observed, not merely a claim of identity: "claims to
  // be from a government agency" is the *authority* tactic below, and matching
  // it here too would report one observation as two independent tactics.
  2: /impersonat|poses? as|spoof|sender name claims|doesn't match|domain doesn't|typosquat|look-?alike|new number|different domain/i,
  // Too good to be true — prizes, refunds, returns.
  3: /prize|reward|refund|won|winner|unclaimed|inherit|compensation|cash ?back|guaranteed returns?|investment/i,
  // Borrowed authority — the trappings of legitimacy.
  4: /government agency|well-known company|official|authorit|logo|verified badge|caller ID|government body|bank|police/i,
  // Unusual payment — how the money is asked for.
  5: /gift ?card|crypto|bitcoin|wire transfer|safe account|bank transfer|(?:customs|import|admin(?:in)?|release|delivery|redelivery|small|processing)\s+fee|pay\b[^.]{0,40}\bfee|top ?up|remote access|install/i,
  // Building rapport — the long con.
  6: /romance|relationship|new number|hi mum|hi dad|dropped my phone|friend|trust|weeks/i,
};

/**
 * Which of the six tactics this evidence shows.
 *
 * The clamp row is skipped: it is arithmetic about the score, not an
 * observation about the message, and matching it would attribute a tactic to
 * our own ceiling.
 */
export function matchedTactics(signals: readonly Signal[] | undefined): Set<TacticId> {
  const found = new Set<TacticId>();
  if (!signals?.length) return found;
  for (const s of signals) {
    if (s.source === "score") continue;
    for (const id of TACTIC_IDS) {
      if (PATTERNS[id].test(s.text)) found.add(id);
    }
  }
  return found;
}
