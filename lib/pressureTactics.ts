// Pressure tactics: the persuasion techniques a message uses to make you act
// before you think.
//
// This is NOT scam detection, and it deliberately does not feed the scam score.
// The two answer different questions:
//
//   scam score      — is someone trying to take your money or your details?
//   pressure count  — is this message engineered to rush your decision?
//
// A retailer's sale email and a scam can score identically here, and that is
// the finding rather than a flaw. "Only 2 left" and "confirm within 24 hours"
// are the same lever; what differs is the stakes, not the technique. Telling
// someone which levers are being pulled is more useful than telling them a
// legitimate sale is "suspicious" — and it is the same teach-don't-just-block
// reasoning the Learn page is built on.
//
// Why this lives in lib/ and not the engine: it is a reading of a message, not
// a judgement about safety. Nothing here can change a verdict. The engine stays
// free to reword a signal without a taxonomy following it, and the extension
// (which bundles the engine) does not carry this at all.

/** One recognisable technique, with the pattern that finds it. */
export interface PressureTactic {
  id: PressureTacticId;
  /** Short name, as the reader sees it. */
  label: string;
  /** What the technique does to the reader — the teaching part. */
  explains: string;
}

export type PressureTacticId =
  | "deadline"
  | "scarcity"
  | "conditional-reward"
  | "loss-framing"
  | "social-proof"
  | "exclusivity"
  | "escalation";

interface Rule extends PressureTactic {
  pattern: RegExp;
}

/**
 * The rules, written against the phrasing rather than the intent.
 *
 * Each pattern is anchored on wording that is hard to use innocently. "Ends
 * tonight" is a deadline whoever wrote it; "limited" on its own is not, because
 * "limited edition" and "limited company" are ordinary. Where a word is
 * ambiguous the pattern requires the surrounding construction, which is why
 * several of these are longer than the phrase they are named for.
 *
 * Bounded quantifiers throughout: this runs over attacker-controlled text, and
 * an unbounded `.*` between two alternations is how a linear scan becomes a
 * quadratic one.
 */
const RULES: Rule[] = [
  {
    id: "deadline",
    label: "A deadline",
    explains:
      "A countdown gives you less time to check whether the offer is what it appears to be. Real deadlines exist, but they are also the cheapest way to stop you thinking.",
    pattern:
      /\b(?:ends?|expires?|closing)\s+(?:today|tonight|tomorrow|soon|in\s+\d{1,3}|at\s+\d|midnight|this\s+(?:week|weekend|month))\b|\b(?:sale|offer|deal|promotion)\s+(?:ends?|expires?|closes?)\b|\b(?:last\s+(?:chance|day|hours?)|final\s+(?:hours?|call|notice)|hurry|don'?t\s+miss\s+out|act\s+(?:now|fast)|today\s+only|tonight\s+only|while\s+stocks?\s+last)\b|\bwithin\s+\d{1,3}\s*(?:minutes?|hours?|days?)\b|\b\d{1,2}\s*(?:hours?|days?)\s+(?:left|remaining|to\s+go)\b/i,
  },
  {
    id: "scarcity",
    label: "Manufactured scarcity",
    explains:
      "Being told very little is left makes an item feel more valuable and the decision more urgent. The number is set by whoever sent the message, and is often not a count of anything.",
    pattern:
      /\b(?:only|just)\s+\d{1,3}\s+(?:left|remaining|in\s+stock|available|spots?|places?|seats?)\b|\b\d{1,3}\s+(?:left|remaining)\s+(?:in\s+stock|at\s+this\s+price)\b|\b(?:almost|nearly)\s+(?:sold\s+out|gone)\b|\bselling\s+(?:out\s+)?fast\b|\blow\s+stock\b|\bquantities\s+are\s+limited\b|\bwill\s+sell\s+out\b|\blimited\s+(?:quantities|stock|numbers|availability)\b/i,
  },
  {
    id: "conditional-reward",
    label: "A reward with strings attached",
    explains:
      "Something free, but only once you spend or sign up. It reframes a purchase you were not planning as a way to avoid missing out on the free part.",
    pattern:
      /\bfree\b[^.!?]{0,60}\b(?:when\s+you\s+(?:spend|buy|order|sign\s*up)|with\s+(?:any\s+)?(?:purchase|order)|over\s+\$\s?\d{1,6})|\bspend\s+\$\s?\d{1,6}[^.!?]{0,40}\b(?:get|receive|save|earn)\b|\bbonus\b[^.!?]{0,40}\bwhen\s+you\b/i,
  },
  {
    id: "loss-framing",
    label: "Framed as something you will lose",
    explains:
      "The same offer described as a loss rather than a gain. People work harder to avoid losing something than to gain the equivalent, and the wording is chosen for that.",
    pattern:
      /\b(?:don'?t\s+lose|before\s+(?:it'?s|they'?re)\s+gone|you'?ll\s+miss|miss(?:ing)?\s+out\s+on|expiring\s+(?:soon|points?|rewards?)|about\s+to\s+expire|will\s+be\s+(?:lost|forfeited|returned))\b/i,
  },
  {
    id: "social-proof",
    label: "Everyone else is doing it",
    explains:
      "Numbers about other buyers substitute someone else's judgement for yours. They are rarely verifiable and cost nothing to state.",
    pattern:
      /\b\d{1,3}(?:,\d{3})*\+?\s+(?:people|customers|members|shoppers|others)\s+(?:bought|ordered|viewed|joined|are\s+viewing)\b|\b(?:best[\s-]?sell(?:er|ing)|most\s+popular|trending\s+now|in\s+\d{1,4}\s+carts?)\b/i,
  },
  {
    id: "exclusivity",
    label: "Framed as exclusive to you",
    explains:
      "Being told an offer is private or early makes it feel like a favour worth repaying. The same message usually went to the whole list.",
    pattern:
      /\b(?:exclusive(?:ly)?\s+(?:for|to)\s+you|just\s+for\s+you|your\s+(?:private|personal|vip)\s+(?:offer|invitation|access)|early\s+access|members?[\s-]only|invitation\s+only|you'?ve\s+been\s+(?:selected|chosen))\b/i,
  },
  {
    id: "escalation",
    label: "A reminder that escalates",
    explains:
      "A second or third notice about the same thing, each more insistent. Repetition is used to convert hesitation into action.",
    pattern:
      /\b(?:final|last|second|third|3rd|2nd)\s+(?:reminder|notice|chance|call)\b|\bwe'?ve\s+(?:emailed|contacted|reminded)\s+you\b|\bstill\s+(?:in\s+your\s+(?:cart|basket)|thinking\s+about\s+it)\b|\bdid\s+you\s+forget\b/i,
  },
];

export interface PressureReport {
  /** Tactics found, in the order they are defined — stable across runs. */
  tactics: PressureTactic[];
  /** How many distinct techniques the message uses. The measure itself. */
  count: number;
}

/**
 * Which pressure techniques this message uses.
 *
 * Counts DISTINCT techniques, not occurrences. A message saying "hurry" four
 * times is using one lever, and reporting four would overstate it; a message
 * that sets a deadline, claims scarcity and adds a conditional reward is doing
 * three different things to the reader, which is the thing worth naming.
 *
 * The count is the measure, deliberately. Mapping it onto a 0-100 scale would
 * invent a precision that does not exist — there is no principled answer to
 * what makes four tactics "sixty" — and would read as a second risk score,
 * which is exactly the confusion this separation exists to avoid.
 */
export function analysePressureTactics(text: string): PressureReport {
  if (!text) return { tactics: [], count: 0 };
  // Bounded, for the same reason the engine bounds its own inputs: analysis is
  // superlinear in length and a caller can hand this an entire page.
  // Apostrophes are normalised first. Mail clients and design tools emit the
  // typographic form (U+2019) freely, and real messages mix both within one
  // body — "Don't miss out" arrived with a straight apostrophe from one sender
  // and a curly one from another. Doubling every pattern to accept both is how
  // a rule set quietly develops holes.
  const scannable = text.slice(0, 100_000).replace(/[\u2018\u2019\u02bc]/g, "'");
  const tactics = RULES.filter((r) => r.pattern.test(scannable)).map(
    ({ id, label, explains }) => ({ id, label, explains }),
  );
  return { tactics, count: tactics.length };
}

/**
 * One line summarising the finding, for surfaces with room for a sentence.
 *
 * Says what was found and stops. It deliberately does not advise — a sale email
 * using three of these is not doing anything wrong, and telling someone to be
 * careful about a shop they subscribed to is the false-positive problem in
 * another costume.
 */
export function pressureSummary(report: PressureReport): string {
  if (report.count === 0) return "";
  const names = report.tactics.map((t) => t.label.toLowerCase()).join(", ");
  return report.count === 1
    ? `This message uses one persuasion technique: ${names}.`
    : `This message uses ${report.count} persuasion techniques: ${names}.`;
}
