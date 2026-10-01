// Turning a CheckResult into what an assistant reads back to a person.
//
// An MCP tool result is consumed twice: the model reads it to decide what to
// say, and the person often sees it verbatim in a tool-call panel. Both
// audiences want the same thing — the verdict, the evidence behind it, and
// enough framing that "suspicious" is not mistaken for "safe".
//
// Two properties this has to get right, and both are about not overclaiming:
//
//  1. Coverage. A low score from a region pack with partial or no coverage
//     means "no rules matched", not "nothing is wrong". The engine already
//     downgrades the verdict for this; the text has to say it too, because a
//     model summarising a 10/100 as "looks fine" is the failure mode.
//  2. Shortened links. A shortener that could not be expanded is a gap in the
//     analysis, not an absence of risk. `status` distinguishes "we looked and
//     found nothing" from "we were unable to look", and the reader needs that.
//
// Structured JSON goes out alongside this text, so a client that wants fields
// is not reduced to parsing prose.

import type { CheckResult } from "@veriguard/scam-detect/engineTypes";
import type { AnalyzedIdentifier } from "@veriguard/scam-detect/scamDetector";
// The teaching taxonomy is app-side on purpose (see lib/signalTactics.ts), and
// it is pure — one type-only engine import, no React, no I/O. The bundler
// inlines it into dist/, the same way the extension takes lib/reportPrefill.ts,
// so the published package carries no path outside its own directory while the
// six tactic names still live in exactly one file.
import { matchedTactics, TACTIC_TITLES } from "../../../lib/signalTactics.js";

/** Reader-facing names for the engine's verdict values. */
const VERDICT_LABEL: Record<CheckResult["verdict"], string> = {
  safe: "Safe",
  suspicious: "Suspicious",
  likely_scam: "Likely scam",
  unknown: "Unknown",
};

/**
 * What the reader should do, per verdict.
 *
 * Phrased as an action rather than a reassurance. "Safe" is the one that needs
 * care: the engine means "no rules matched", which is not a guarantee, and a
 * model relaying it as one is exactly what this line exists to prevent.
 */
const VERDICT_GUIDANCE: Record<CheckResult["verdict"], string> = {
  safe: "No scam signals matched. This is not a guarantee — judge the context too.",
  suspicious: "Treat with caution. Do not act on it until you have verified the sender independently.",
  likely_scam: "Do not click, reply, or pay. Verify through a number or address you already had.",
  unknown: "Not enough signal to judge. Verify the sender independently before acting.",
};

function coverageNote(coverage: CheckResult["coverage"]): string | null {
  if (coverage === "partial") {
    return "Coverage for this region is partial — a low score here can mean no rules matched rather than nothing is wrong.";
  }
  if (coverage === "none") {
    return "There are no detection rules for this region — this result reflects generic signals only, and a low score says very little.";
  }
  return null;
}

/** The evidence rows, weights included, worst first. */
function formatSignals(result: CheckResult): string[] {
  const rows = result.signals?.filter((s) => s.source !== "score");
  if (rows?.length) {
    return [...rows]
      .sort((a, b) => b.points - a.points)
      .map((s) => {
        const weight = s.points > 0 ? ` (+${s.points})` : s.points < 0 ? ` (${s.points})` : "";
        return `- [${s.source}] ${s.text}${weight}`;
      });
  }
  // A hand-built result, or one from a path that predates signals.
  return result.flags.map((f) => `- ${f}`);
}

/**
 * The tactics this result demonstrates, named as the Learn page names them.
 *
 * This is the teaching half of the product: a person who learns to recognise
 * "manufactured urgency" is protected against the next message too, which a
 * verdict on this one cannot do.
 */
function formatTactics(result: CheckResult): string | null {
  const ids = [...matchedTactics(result.signals)].sort((a, b) => a - b);
  if (!ids.length) return null;
  const names = ids.map((id) => TACTIC_TITLES[id]);
  return `Tactics used: ${names.join(", ")}`;
}

/** One result, rendered for a reader. */
export function formatResult(result: CheckResult, subject?: string): string {
  const lines: string[] = [];

  const head = `${VERDICT_LABEL[result.verdict]} — ${result.score}/100`;
  lines.push(subject ? `${head}  ·  ${subject}` : head);
  lines.push("");
  lines.push(VERDICT_GUIDANCE[result.verdict]);

  const coverage = coverageNote(result.coverage);
  if (coverage) {
    lines.push("");
    lines.push(coverage);
  }

  if (result.expandedUrl) {
    lines.push("");
    // Defanged by the engine, and left that way: a real destination rendered
    // live in a chat transcript is a link somebody can click by accident.
    lines.push(`Shortened link resolves to: ${result.expandedUrl}`);
  }

  const signals = formatSignals(result);
  if (signals.length) {
    lines.push("");
    lines.push("Evidence:");
    lines.push(...signals);
  }

  const tactics = formatTactics(result);
  if (tactics) {
    lines.push("");
    lines.push(tactics);
  }

  if (result.details) {
    lines.push("");
    lines.push(result.details);
  }

  if (result.phoneIntel) {
    const intel = result.phoneIntel;
    lines.push("");
    lines.push(
      `Number: ${[intel.country, intel.lineType, intel.carrierHint]
        .filter(Boolean)
        .join(" · ")}`,
    );
    // Spoofing risk is reported even when low. A caller ID that merely *can* be
    // forged is the premise behind most impersonation calls, and omitting the
    // low case would let a reader infer that its absence means verified.
    lines.push(`Caller ID spoofing risk: ${intel.spoofingRisk.replace("_", " ")}`);

    // Only the notes the evidence rows did not already carry.
    //
    // phoneIntel's notes and the scorer's phone signals overlap by design — the
    // same observation justifies a score and explains a risk rating — so
    // printing both verbatim repeated whole sentences a few lines apart. That
    // reads as two findings rather than one, which inflates how much the
    // engine actually found.
    const alreadyShown = new Set(
      (result.signals ?? []).map((s) => s.text.trim()),
    );
    for (const note of intel.spoofingNotes) {
      if (!alreadyShown.has(note.trim())) lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

/**
 * Several results from one input, rendered together.
 *
 * analyzeContent returns one card per identifier it found, so a single SMS can
 * yield a URL verdict and a phone verdict that disagree. The summary line
 * leads with the worst of them, because that is the one that governs what the
 * person should do — burying it under a per-identifier list invites a model to
 * average them into something reassuring.
 */
export function formatAnalysis(cards: AnalyzedIdentifier[]): string {
  if (!cards.length) {
    return "Nothing to check — no link, address, phone number or message content was found in the input.";
  }

  const worst = cards.reduce((a, b) => (b.result.score > a.result.score ? b : a));

  const lines: string[] = [
    `Worst verdict: ${VERDICT_LABEL[worst.result.verdict]} — ${worst.result.score}/100`,
    VERDICT_GUIDANCE[worst.result.verdict],
    "",
    `Found ${cards.length} thing${cards.length === 1 ? "" : "s"} to check:`,
  ];

  for (const card of cards) {
    lines.push("");
    lines.push("---");
    lines.push("");
    lines.push(formatResult(card.result, `${card.kind}: ${card.value}`));
  }

  return lines.join("\n");
}
