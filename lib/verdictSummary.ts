// Shared verdict composition + defang helpers.
//
// The Check results page and the forward-to-us email reply must reach the SAME
// overall verdict for the same content — so the collapse-many-identifiers-into-
// one logic lives here, as a pure function, instead of inline in the UI. Both
// the React component (components/CheckFlow.tsx) and the inbound webhook
// (app/api/inbound/route.ts) call composeVerdict; neither owns the rules.
//
// Pure module: no React, no I/O. Safe to unit test and to import from a route.

import { AnalyzedIdentifier } from "@veriguard/engine/scamDetector";
import { isWorse, worstBy, evidenceFor } from "@veriguard/engine/verdictRank";
import type { Verdict } from "@veriguard/engine/verdictRank";
import type { RegionCoverage } from "@veriguard/engine/regions";
import type { Signal } from "@veriguard/engine/engineTypes";
import { TrackingPixelReport } from "@/lib/trackingPixel";
import { TrackingFinding } from "@/lib/emailTracking";
import { defang, defangEmail, defangPhone, defangText } from "@veriguard/engine/urlSanitizer";
import { buildReportQuery, ReportPrefill } from "@/lib/reportPrefill";
import { matchedTactics, TACTIC_IDS, TACTIC_TITLES } from "@/lib/signalTactics";
import type { PressureReport } from "@/lib/pressureTactics";
import { formatBytes, type PartialCheck } from "@/lib/partialCheck";
// Read rather than retyped: the sheet renders these same four strings through
// the translator, and a hand-copied version already drifted once (a trailing
// sentence was dropped silently). The email is English-only, so reading the
// base bundle directly is both correct and the only copy that can be wrong.
import enNormal from "@/messages/en.normal.json";

// Severity ordering lives in the engine now: the WebExtension bundles the
// engine and cannot reach `lib/`, and two rank tables that must agree is the
// defect shape this codebase has paid for more than once. Re-exported here so
// existing app-side call sites keep their import unchanged.
export { VERDICT_RANK } from "@veriguard/engine/verdictRank";
export type { Verdict } from "@veriguard/engine/verdictRank";

// Defang an identifier for display, per its kind. Mirrors how every value on
// the Check page is shown — nothing live or clickable ever surfaces.
export function defangValue(kind: AnalyzedIdentifier["kind"], value: string): string {
  if (kind === "url")   return defang(value);
  if (kind === "email") return defangEmail(value);
  if (kind === "phone") return defangPhone(value);
  return defangText(value);
}

// The identity-analysis flags embed raw email addresses and bare domains as
// plain text. Defang both so a flag can never surface a live, clickable address
// — matching how every other value is shown.
export function defangFlag(flag: string): string {
  // defangText first, so a full URL loses its scheme (hxxp://) as well as its
  // dots — the domain-level pass below neutralises the dots but leaves
  // "http://" live and clickable in clients that autolink. Applying only one of
  // the two leaves a hole: defangText alone misses bare domains and email
  // addresses, defangFlag alone misses the scheme. Signal text carries all
  // three shapes, so it needs both.
  return defangText(flag)
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, (a) => defangEmail(a))
    .replace(/\b[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+\b/g, (d) => d.replace(/\./g, "[.]"));
}

export interface OverallVerdict {
  verdict: Verdict;
  score: number;
}

// Collapse the per-identifier results into one overall verdict: the worst
// identifier wins, then a tracking pixel nudges an otherwise-clean result up to
// "suspicious" (being silently tracked is itself a red flag). Returns null when
// there are no scored identifiers — callers decide what to show in that case
// (email sender analysis can still carry the payoff).
//
// This is the exact rule the Check results page applies; keep them in lockstep.
export function composeVerdict(
  results: AnalyzedIdentifier[],
  pixelReport: TrackingPixelReport | null,
): OverallVerdict | null {
  const worst = worstBy(results, (r) => r.result.verdict);
  if (!worst) return null;
  let verdict = worst.result.verdict;
  let score = worst.result.score;
  if (pixelReport && isWorse("suspicious", verdict)) {
    verdict = "suspicious";
    score = Math.max(score, 40);
  }
  return { verdict, score };
}

// The single severity decision for a whole email, including the case where no
// URL/phone/email identifier was scored (a header-only forward). Sender-spoofing
// flags, a tracking pixel, or any other tracking each imply at least
// "suspicious"; absent all of those an unscored email is "unknown". Both the
// Check UI and the email reply call this so they can't disagree.
export function overallVerdict(
  results: AnalyzedIdentifier[],
  pixelReport: TrackingPixelReport | null,
  emailFlags: string[] = [],
  hasOtherTracking = false,
): OverallVerdict {
  const composed = composeVerdict(results, pixelReport);
  if (composed) return composed;
  if (emailFlags.length > 0 || pixelReport || hasOtherTracking) {
    return { verdict: "suspicious", score: 40 };
  }
  return { verdict: "unknown", score: 0 };
}

// "Clean" means nothing flagged it — every identifier safe AND no tracking
// pixel (a pixel pushes the overall verdict to suspicious). Mirrors the CTA
// gating on the Check page.
//
// Under partial/no regional coverage the checkers already downgrade "safe" to
// "unknown", so an incompletely-covered result can never satisfy this.
export function isClean(
  results: AnalyzedIdentifier[],
  pixelReport: TrackingPixelReport | null,
  emailFlags: string[] = [],
): boolean {
  return (
    results.length > 0 &&
    results.every((r) => r.result.verdict === "safe") &&
    !pixelReport &&
    emailFlags.length === 0
  );
}

// The weakest coverage across all scored identifiers — the honest level to
// report for the check as a whole, since one uncovered identifier means the
// overall picture is incomplete. Absent coverage is treated as "full" so
// results predating the field (and non-region paths) read as they always did.
//
// `minimal` ranks BELOW `partial`, which is the opposite of what the names
// suggest and is the one thing to get right here. A `partial` pack (CA) has
// brands, agencies and a number plan and is missing only a language's
// keywords; a `minimal` pack has agencies and a reporting body and no brand
// knowledge whatsoever. Ranking them the other way round would report the
// stronger pack as the weakest link. Pinned by test in coverage.test.ts.
export function overallCoverage(results: AnalyzedIdentifier[]): RegionCoverage {
  const RANK: Record<RegionCoverage, number> = { full: 0, partial: 1, minimal: 2, none: 3 };
  return results.reduce<RegionCoverage>((worst, r) => {
    const c = r.result.coverage ?? "full";
    return RANK[c] > RANK[worst] ? c : worst;
  }, "full");
}

// ── Email reply formatting ─────────────────────────────────────────────────────
// Plain-English verdict for the forward-to-us reply. Runs server-side with no
// React/i18n context, so the copy is fixed English here (the email channel is
// English-only for v1). Every identifier and flag is defanged before it reaches
// the body — the reply must never contain a live link back to the scam.

// One plain-English verdict per outcome, written for someone with no technical
// background who just wants to know "is this a scam, and what do I do?".
//   • emoji + line — the headline the reply leads with (some clients render the
//     emoji inconsistently, so the words never depend on it).
//   • label — two or three words that ARE the verdict, shown large in the banner
//     so it reads at a glance without parsing a sentence. The HTML banner leads
//     with this; the plain-text reply leads with `line` (a fuller sentence reads
//     better without the banner's visual weight). Both say the same thing.
//   • meaning — one sentence saying what that verdict means in everyday terms.
//   • accent / tint — the verdict colour and its pale wash. The banner is the
//     tint behind an accent left-border with the label in the accent colour, so
//     the meaning sentence stays dark-on-pale and readable (white-on-accent at
//     body size fails AA for the amber/green verdicts — the exact low-vision
//     readers this reply is for).
const VERDICT_HEADLINE: Record<Verdict, {
  emoji: string; line: string; label: string; meaning: string; accent: string; tint: string;
}> = {
  likely_scam: {
    emoji: "🚨", line: "This looks like a scam.",
    label: "Likely a scam",
    meaning: "The warning signs here are the kind scammers use. Treat it as dangerous.",
    accent: "#c0392b", tint: "#fdeceb",
  },
  suspicious: {
    emoji: "⚠️", line: "This looks suspicious — treat it with caution.",
    label: "Be careful",
    meaning: "Some things here don't look right. It may be a scam, so don't act on it yet.",
    accent: "#b9770e", tint: "#fdf6e3",
  },
  unknown: {
    emoji: "❓", line: "We couldn't confirm this either way — stay cautious.",
    label: "We're not sure",
    meaning: "We couldn't find clear proof either way. Stay careful until you know it's genuine.",
    accent: "#5f6a6a", tint: "#f4f6f6",
  },
  safe: {
    emoji: "✅", line: "We didn't find scam signals in this — but stay alert.",
    label: "No scam signs found",
    meaning: "We didn't spot the tricks scammers usually use — but it still pays to stay alert.",
    accent: "#1e8449", tint: "#eafaf1",
  },
};

// A one-word status shown next to each part of the email in the breakdown, so a
// reader sees "Dangerous" / "Risky" rather than the engine's "likely_scam".
const VERDICT_STATUS: Record<Verdict, string> = {
  likely_scam: "Dangerous",
  suspicious: "Risky",
  unknown: "Couldn't verify",
  safe: "Looks OK",
};

// The single most important thing for a non-technical reader: what to actually
// do now. Kept concrete (don't click, don't reply, don't call, verify yourself)
// and matched to how worried they should be.
function actionAdvice(verdict: Verdict): string {
  if (verdict === "safe") {
    return "We didn't find scam signs, so this is likely fine. Even so, only act on it if you're " +
      "sure who sent it. If anything feels off, contact the company yourself using details from " +
      "their official website — not the ones in this email.";
  }
  if (verdict === "unknown") {
    return "Until you're sure it's genuine, don't click any links, reply, or share any details. If it " +
      "claims to be from a company you use, check with them using contact details you find yourself — " +
      "not the ones in this email.";
  }
  // likely_scam or suspicious — the strong version.
  return "Don't click any links, open attachments, reply, or call any phone numbers in this email, and " +
    "don't share passwords, card numbers, or personal details. If it claims to be from a company you " +
    "use, contact them using a phone number or website you find yourself — never the details in the email.";
}

export interface VerdictEmailInput {
  results: AnalyzedIdentifier[];
  emailFlags: string[];
  pixelReport: TrackingPixelReport | null;
  // Broader tracking surface (pixels + click redirects, CSS beacons, read
  // receipts, …). Optional so existing callers/tests keep working; when given,
  // it supersedes the single pixel line in the "Why" section.
  trackingFindings?: TrackingFinding[];
  // Canonical site origin. When given, the reply ends with a call to action
  // linking to a prefilled report form so the forwarder can lodge the scam in
  // the public database in one tap. Omitted → no CTA (the reply is still
  // complete without it), which keeps existing callers and tests working.
  siteUrl?: string;
  // The original scammer's From / Reply-To, already unwrapped from the forward.
  // Used only to prefill the report link — never to address anything.
  senderAddress?: string;
  replyToAddress?: string;
  /**
   * Persuasion techniques the message uses. Reported beside the verdict, never
   * folded into it — a legitimate sale and a scam pull the same levers, and the
   * separation is what lets this be said without calling a shop a scam.
   */
  pressure?: PressureReport;
  /**
   * Set when the forward was larger than we accept and only its first part was
   * analysed. The reply then says what it checked and what it could not, and a
   * clean result is reported as "not sure" — see formatVerdictEmail.
   */
  partial?: PartialCheck;
}

export interface VerdictEmail {
  subject: string;
  text: string;
  html: string;
}

// Human label for an identifier kind, used in the breakdown.
const KIND_LABEL: Record<AnalyzedIdentifier["kind"], string> = {
  url: "Link", email: "Sender", phone: "Phone", message: "Message",
};

/**
 * Reasons shown per identifier before collapsing into "…and N more".
 *
 * A heavily-flagged message can trip a dozen rules; printing all of them buries
 * the verdict in a wall of text on a phone. The flags are ordered by the
 * detector in roughly descending importance, so the first few carry most of the
 * explanation.
 */
const MAX_REASONS_PER_ITEM = 4;

interface BreakdownItem {
  heading: string;
  reasons: string[];
  /** Weighted evidence for this identifier — the same rows the sheet shows. */
  signals: Signal[];
  /** Where a shortened link actually goes. Not a scored signal; shown first. */
  expanded: string;
}

/**
 * Format one signal's contribution the way the results sheet does: a signed
 * weight, or an em dash when a row is context rather than a contribution.
 *
 * Publishing the weights is the claim the whole product rests on — detection is
 * open source so people can check our reasoning, and a score with no breakdown
 * asks to be taken on faith. The emailed verdict was asking for exactly that.
 */
function formatPoints(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `${points}`;
  return "—";
}

/**
 * The score's meaning in words, matching the bands the sheet names.
 *
 * Bounds are scoreToResult's, and the wording is read from the same bundle the
 * sheet renders — someone who checked on the site and someone who forwarded
 * must read the same sentence about the same number. Retyping them here dropped
 * a trailing sentence without anything noticing, which is why this reads rather
 * than copies.
 */
function scoreBand(score: number, findings: Signal[]): string {
  const key =
    score >= 45
      ? findings.length >= 4
        ? "verdict.score.band.scamMany"
        : "verdict.score.band.scam"
      : score >= 20
        ? "verdict.score.band.suspicious"
        : "verdict.score.band.safe";
  return (enNormal as Record<string, string>)[key] ?? "";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Build the verdict reply. When there are no scored identifiers but sender flags
// exist (header-only forward), the headline is driven by the flags' presence.
export function formatVerdictEmail(input: VerdictEmailInput): VerdictEmail {
  const { results, emailFlags, pixelReport, trackingFindings = [], siteUrl, senderAddress, replyToAddress, pressure, partial } = input;

  // One shared severity decision — same rule the Check UI uses — so a header-
  // only forward still gets a meaningful headline and the two never disagree.
  //
  // A partial check never reports "safe". A scam signal found in the part that
  // arrived stands — nothing further on can make it less of a scam — but a
  // clean result only says the first part was clean, which is "not sure", the
  // same downgrade the checkers apply under partial regional coverage.
  const composedVerdict = overallVerdict(results, pixelReport, emailFlags, trackingFindings.length > 0).verdict;
  const verdict: Verdict = partial && composedVerdict === "safe" ? "unknown" : composedVerdict;
  const head = VERDICT_HEADLINE[verdict];

  // The score and the rows under it, composed together.
  //
  // These cannot be sourced separately. composeVerdict returns the WORST
  // identifier's score while evidence covers EVERY identifier, so pairing them
  // by hand puts a headline of 75 above rows adding to 120 — in a reply that
  // invites the reader to check our arithmetic. The results sheet had that
  // defect, and composeVerdictWithEvidence exists to prevent it; the email
  // reimplemented the pairing and reintroduced it. It also does the pooling
  // (duplicate observations collapse rather than printing twice) and adds the
  // tracking-pixel row that no identifier scores.
  const composed = composeVerdictWithEvidence(results, pixelReport);
  // Fall back to the headline score for a header-only forward, where no
  // identifier scored but sender flags still imply a severity.
  const score = composed?.score ?? overallVerdict(results, pixelReport, emailFlags, trackingFindings.length > 0).score;
  // Context rows (source "score") are the clamp's own arithmetic, not an
  // observation about the message, so they are excluded from the count exactly
  // as the sheet excludes them.
  const pooled = (composed?.signals ?? []).filter((x) => x.source !== "score");

  // Breakdown — each identifier, its status, and WHY. The reasons are the point:
  // "Link evil[.]tk: likely scam" with nothing under it tells someone to be
  // afraid without teaching them what to look for next time. The detector
  // already writes lay-readable flags ("Dodgy top-level domain (.tk) — commonly
  // used by scammers"); this surfaces them instead of discarding them.
  // Rows already printed under an earlier identifier. The breakdown groups
  // evidence by identifier, which the sheet's flat list does not, so pooling
  // has to happen across the groups: the same observation reached from two
  // identifiers is one finding, and printing it twice both double-counts
  // against the score above and inflates the "how many rules did this trip"
  // wording. Ordered by identifier, so a duplicate stays under the first
  // identifier that produced it.
  const alreadyShown = new Set<string>();

  const breakdown: BreakdownItem[] = results.map((r) => {
    const label = KIND_LABEL[r.kind];
    const value = r.kind !== "message" && r.value ? ` ${defangValue(r.kind, r.value)}` : "";
    // The weighted rows behind this verdict, deduped across identifiers — see
    // alreadyShown. Runs before the flag fallback below, which reads the same
    // set.
    const signals = (r.result.signals ?? []).filter((x) => {
      if (x.source === "score") return false;
      if (alreadyShown.has(x.text)) return false;
      alreadyShown.add(x.text);
      return true;
    });

    // Flags already shown under an earlier identifier are dropped for the same
    // reason their weighted rows are: one observation, printed once. Without
    // this an identifier whose rows all deduped away falls back to the flag
    // list and reprints them unweighted.
    const freshFlags = r.result.flags.filter((f) => !alreadyShown.has(f));
    const reasons = freshFlags.slice(0, MAX_REASONS_PER_ITEM).map((f) => defangFlag(f));
    const hidden = Math.max(0, freshFlags.length - MAX_REASONS_PER_ITEM);
    if (hidden > 0) reasons.push(`…and ${hidden} more signal${hidden === 1 ? "" : "s"}`);

    // The resolved destination of a shortened link is the single most useful
    // fact we can give someone, so it leads rather than sitting among the
    // flags. Held separately rather than pushed into `reasons`, because the
    // weighted path does not render `reasons` at all and would otherwise drop
    // it — it is an observation we made, not a signal that scored.
    const expanded = r.result.expandedUrl
      ? `Real destination: ${defangFlag(r.result.expandedUrl)}`
      : "";

    // The weighted rows behind that verdict. Context rows (source "score") are
    // the clamp's own arithmetic, not an observation about the message, so they
    // are excluded here exactly as the sheet excludes them.

    return {
      heading: `${label}${value} — ${VERDICT_STATUS[r.result.verdict]}`,
      reasons,
      signals,
      expanded,
    };
  });
  const flagLines = emailFlags.map((f) => defangFlag(f));
  // Tracking: prefer the broader findings when present; otherwise fall back to
  // the single pixel summary so older callers still surface pixels.
  if (trackingFindings.length > 0) {
    for (const f of trackingFindings) flagLines.push(`${f.label}: ${f.detail}`);
  } else if (pixelReport?.summary) {
    flagLines.push(`Tracking pixel: ${pixelReport.summary}`);
  }

  // Coverage caveat — stated before the advice so a reader can't take a quiet
  // result as a clean bill of health for a region we don't fully cover.
  const coverage = overallCoverage(results);
  const coverageNote =
    coverage === "full"
      ? ""
      : "Heads up: we don't have full scam-detection rules for this region yet, so " +
        "this check is less thorough than usual. Treat a quiet result as 'not checked', not 'safe'.";

  // What a cut-off forward covered. Stated right under the verdict, because it
  // qualifies everything after it.
  //
  // Attachment filenames are the sender's own text, so they are defanged like
  // every other value from the scam: a file named after a URL or a phone number
  // must not arrive as a live link in our reply. The extension is kept apart so
  // "invoice.pdf" still reads as a file.
  const defangName = (name: string) => {
    const ext = name.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? "";
    return defangPhone(defangFlag(name.slice(0, name.length - ext.length))) + ext;
  };
  const partialNotChecked = partial
    ? [
        ...(partial.textCut ? ["the rest of the message text"] : []),
        ...partial.attachments.map(
          (a) => `${defangName(a.name)} (${a.complete ? "we don't open attachments" : "cut off"})`,
        ),
        `everything after the first ${formatBytes(partial.receivedBytes)}`,
      ]
    : [];
  const partialHeading = partial
    ? `Partial check: this email was ${formatBytes(partial.totalBytes)}, and we checked the first ${formatBytes(partial.receivedBytes)}.`
    : "";
  // Only when nothing was found: a "not sure" verdict can still list findings
  // (partial region coverage downgrades to it), and this line would contradict
  // them.
  const foundNothing =
    breakdown.every((b) => b.reasons.length === 0 && b.signals.length === 0) && flagLines.length === 0;
  const partialCaveat =
    partial && foundNothing && (verdict === "unknown" || verdict === "safe")
      ? "We found no scam signs in the part we checked. Treat that as 'not fully checked', not 'safe'."
      : "";

  // The clear next step, matched to the verdict. This used to sit buried in the
  // footer; for a non-technical reader it's the whole point, so it leads.
  const advice = actionAdvice(verdict);

  // Footer, split into three plain lines:
  //   • help — where to turn if they've already been caught, and how to warn others.
  //   • privacy — the discard promise (kept verbatim: "did not keep a copy").
  //   • trust — states plainly that WE are automated and will never ask for
  //     anything, so this reply can't be mistaken for the kind of thing it warns
  //     about. This is the anti-impersonation line that makes us read as a real
  //     service rather than one more unsolicited email asking for something.
  const helpLine =
    "If you've already lost money or shared details, contact IDCARE on 1800 595 160 (free). " +
    "You can report scams to Scamwatch at scamwatch.gov.au.";
  const privacyLine =
    "We checked this email the moment it arrived and did not keep a copy.";
  const trustLine =
    "This is an automated safety reply from Veriguard. We'll never ask you for passwords, " +
    "payments, or personal details.";
  // The site host (no scheme) for a plain "veriguard.app" footer link. Gated on
  // siteUrl so the reply carries no <a> at all when no origin is configured.
  const siteHost = siteUrl ? siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "";

  // When nothing was flagged, say what we looked at rather than going quiet.
  // Silence reads as "we didn't bother"; naming the checks is the reassurance.
  // Not on a partial check: its own caveat says the same about the part we
  // received, and this line would read as covering the whole email.
  const nothingFound =
    !partial && breakdown.length > 0 && breakdown.every((b) => b.reasons.length === 0) && flagLines.length === 0
      ? "We checked the sender's details, the links, and the wording against our scam patterns, " +
        "and nothing matched."
      : "";

  // Report CTA — the one action that turns a private verdict into a public
  // warning. Only offered when something was actually found: inviting someone
  // to lodge a report for an email we just called clean would pollute the
  // database and waste their time.
  //
  // The link carries only the extracted identifiers (see lib/reportPrefill.ts).
  // The forwarded email is never stored and never travels in the URL — the same
  // reply promises we didn't keep a copy, and that has to stay true.
  const reportUrl = (() => {
    // The underlying result, not the displayed one: a clean partial check is
    // shown as "not sure", but it found nothing to report.
    if (!siteUrl || composedVerdict === "safe") return "";
    const first = (kind: AnalyzedIdentifier["kind"]) =>
      results.find((r) => r.kind === kind)?.value;
    const scamEmail = senderAddress || first("email");
    const prefill: ReportPrefill = {
      // A sender address means we're looking at email source; otherwise fall
      // back to whatever identifier the detector actually scored.
      type: scamEmail ? "email" : first("url") ? "url" : first("phone") ? "phone" : "custom",
      ...(first("url") ? { scamUrl: first("url") } : {}),
      ...(scamEmail ? { scamEmail } : {}),
      ...(replyToAddress ? { scamReplyTo: replyToAddress } : {}),
      ...(first("phone") ? { scamPhone: first("phone") } : {}),
    };
    const query = buildReportQuery(prefill);
    return `${siteUrl.replace(/\/$/, "")}/report${query ? `?${query}` : ""}`;
  })();

  const ctaLine =
    "Help someone else dodge this: lodge it in our public scam database. " +
    "We've already filled in what we found — you just add anything you want to " +
    "say and hit submit.";

  // The pooled rows drive both the band wording and the tactics, so the two
  // sections cannot disagree about what the evidence was.
  const tactics = matchedTactics(pooled);
  const tacticNames = TACTIC_IDS.filter((id) => tactics.has(id)).map((id) => TACTIC_TITLES[id]);

  // The score and what it means — the sheet's own framing.
  //
  // Shown whenever a check actually ran, including for a clean result: the
  // sheet renders RiskScore unconditionally, and a low score is itself the
  // finding there ("the absence of evidence, not evidence of safety"). What is
  // suppressed is the case where nothing was examined at all, where "0/100"
  // would present a number we never worked out as though it were a result.
  const showScore = pooled.length > 0 || score > 0 || results.length > 0;
  const bandLine = showScore ? scoreBand(score, pooled) : "";

  // ── Plain text ──
  const textParts = [
    "VERIGUARD — Scam check result",
    "",
    `${head.emoji} ${head.line}`,
    head.meaning,
    "",
    ...(partial
      ? [
          partialHeading,
          `  Checked: ${partial.checked.join("; ") || "nothing we could read"}`,
          `  Not checked: ${partialNotChecked.join("; ")}`,
          ...(partialCaveat ? [`  ${partialCaveat}`] : []),
          "",
        ]
      : []),
    ...(showScore ? [`RISK SCORE: ${score}/100`, `  ${bandLine}`, ""] : []),
    ...(breakdown.length
      ? [
          "WHAT WE FOUND",
          ...breakdown.flatMap((b) => [
            `  • ${b.heading}`,
            // The weighted rows when we have them, the plain reasons otherwise.
            // A row's contribution is the thing being published; dropping it
            // leaves a list of assertions and a number that cannot be checked
            // against them.
            // The expanded destination of a shortened link leads whatever
            // follows: it is the single most useful fact we can give someone,
            // and it is not a scored signal, so the weighted rows would drop it.
            ...(b.expanded ? [`      ${b.expanded}`] : []),
            ...(b.signals.length
              ? b.signals.map((x) => `      ${formatPoints(x.points).padStart(4)}  ${defangFlag(x.text)}`)
              : b.reasons.map((r) => `      - ${r}`)),
          ]),
          "",
        ]
      : []),
    ...(tacticNames.length
      ? [
          "TACTICS USED",
          `  ${tacticNames.join(" · ")}`,
          "  These are among the six tactics we explain on the Learn page.",
          "",
        ]
      : []),
    ...(pressure && pressure.count > 0
      ? [
          `HOW THIS MESSAGE PRESSURES YOU (${pressure.count})`,
          ...pressure.tactics.flatMap((t) => [`  \u2022 ${t.label}`, `      ${t.explains}`]),
          "  These techniques are not proof of anything on their own. Legitimate",
          "  sellers use them too — which is the point worth knowing.",
          "",
        ]
      : []),
    "WHAT YOU SHOULD DO",
    `  ${advice}`,
    "",
    ...(nothingFound ? [nothingFound, ""] : []),
    ...(flagLines.length ? ["WHO SENT IT", ...flagLines.map((f) => `  • ${f}`), ""] : []),
    ...(coverageNote ? [coverageNote, ""] : []),
    ...(reportUrl ? [ctaLine, reportUrl, ""] : []),
    helpLine,
    privacyLine,
    trustLine,
    "",
    `— Veriguard · Check before you act${siteHost ? ` · ${siteHost}` : ""}`,
  ];
  const text = textParts.join("\n");

  // ── HTML ──
  // Deliberately self-contained: everything is escaped and NO external resource
  // is referenced. This email quotes attacker-controlled text, and a remote
  // image would leak the recipient's IP and read status to whoever hosts it —
  // unacceptable when the recipient may be a scam victim. Styling stays inline
  // so it survives clients that strip <style>; the colour-coded accent bar is
  // what makes the verdict readable at a glance on a phone.
  const li = (items: string[]) => items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");

  // Evidence rows carry their weight, as the results sheet does. A two-column
  // table rather than a list: the weights must line up as a column to be
  // scannable, and table layout is the one thing every mail client agrees on.
  // Colour follows the sheet — amber for a contribution, green for a credit,
  // grey for a context row worth no points.
  const weightedRows = (signals: Signal[]) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" ` +
    `style="width:100%;margin:6px 0 0;border-collapse:collapse">` +
    signals
      .map((x) => {
        const colour = x.points > 0 ? "#9a6b12" : x.points < 0 ? "#1c7a55" : "#7c879a";
        return (
          `<tr>` +
          `<td style="padding:4px 10px 4px 0;color:#444;font-size:14px;line-height:1.5;` +
          `vertical-align:top">${escapeHtml(defangFlag(x.text))}</td>` +
          `<td style="padding:4px 0;color:${colour};font-size:13px;font-weight:bold;` +
          `white-space:nowrap;text-align:right;vertical-align:top">` +
          `${escapeHtml(formatPoints(x.points))}</td>` +
          `</tr>`
        );
      })
      .join("") +
    `</table>`;

  const breakdownHtml = breakdown
    .map((b) => {
      // The expanded destination leads, whichever path renders below it.
      const expandedHtml = b.expanded
        ? `<div style="margin:4px 0 0;color:#444;font-size:14px">${escapeHtml(b.expanded)}</div>`
        : "";
      const detail = b.signals.length
        ? weightedRows(b.signals)
        : b.reasons.length
          ? `<ul style="margin:4px 0 0;padding-left:20px;color:#444;font-size:14px">${li(b.reasons)}</ul>`
          : "";
      return (
        `<li style="margin-bottom:10px"><strong>${escapeHtml(b.heading)}</strong>` +
        `${expandedHtml}${detail}</li>`
      );
    })
    .join("");

  // The brand shell. Everything is inline-styled (clients strip <style>) and,
  // critically, references NO external resource — no <img>, no web font, no
  // background url() — so the reply can never leak the recipient's IP or read
  // status to a remote host. That constraint is why the "logo" is a CSS badge
  // (a check mark in a rounded emerald tile, echoing the site's shield-check)
  // rather than an image, and why the palette is hard-coded here to match the
  // app (navy #141C2B ground, emerald #00A676 accent, cream #F4F3EF wordmark).
  const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;

  // A short line hidden from the body but shown as the inbox preview snippet —
  // the touch that makes a real service's mail read as intentional, not raw.
  const preheader =
    `<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">` +
    `${escapeHtml(`${head.label}. ${advice}`)}</span>`;

  const header =
    `<div style="background:#141C2B;padding:18px 22px">` +
    `<span style="display:inline-block;width:28px;height:28px;line-height:28px;text-align:center;` +
    `background:#00A676;color:#ffffff;border-radius:8px;font-size:17px;font-weight:bold;` +
    `vertical-align:middle">&#10003;</span>` +
    `<span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#F4F3EF;` +
    `font-size:19px;font-weight:bold;letter-spacing:-0.01em">Veriguard</span>` +
    `<div style="color:#8b93a3;font-size:12px;margin-top:8px">` +
    `${escapeHtml("Scam check for links, texts & emails")}</div>` +
    `</div>`;

  // The verdict banner: the accent colour (border + label) carries the answer at
  // a glance, the big label states it in words, and the sentence under it says
  // what that means. Kept dark-on-tint rather than white-on-accent so the 14px
  // meaning line clears WCAG AA — white on the amber/green accents does not.
  const banner =
    `<div style="background:${head.tint};border-left:5px solid ${head.accent};` +
    `border-radius:8px;padding:14px 16px;margin:0 0 18px">` +
    `<div style="color:${head.accent};font-size:19px;font-weight:bold;line-height:1.3">` +
    `${escapeHtml(`${head.emoji} ${head.label}`)}</div>` +
    `<div style="color:#2b3648;font-size:14px;line-height:1.5;margin-top:6px">` +
    `${escapeHtml(head.meaning)}</div>` +
    `</div>`;

  // The single most important block for a worried reader — what to do, now.
  const actionBox =
    `<div style="border:1px solid #dfe3e8;background:#f7f9fb;border-radius:10px;padding:14px 16px;margin:0 0 18px">` +
    `<div style="font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:0.04em;` +
    `color:#3a4658;margin-bottom:6px">What you should do</div>` +
    `<div style="font-size:14px;line-height:1.55;color:#2b3648">${escapeHtml(advice)}</div>` +
    `</div>`;

  // The score, with the bar the sheet draws. Built from a table rather than a
  // div with a percentage width: Outlook ignores percentage widths on divs, and
  // a bar that renders full-width in one client and empty in another is worse
  // than no bar. The filled cell is the score, the rest is the track.
  const scoreBox = showScore
    ? `<div style="border:1px solid #dfe3e8;background:#ffffff;border-radius:10px;` +
      `padding:14px 16px;margin:0 0 18px">` +
      `<div style="font-size:13px;font-weight:bold;text-transform:uppercase;` +
      `letter-spacing:0.04em;color:#3a4658;margin-bottom:8px">Risk score</div>` +
      `<div style="font-size:26px;font-weight:bold;color:${head.accent};line-height:1.1">` +
      `${score}<span style="font-size:15px;color:#7c879a;font-weight:normal">/100</span></div>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" ` +
      `style="width:100%;margin:10px 0 0;border-collapse:collapse;height:6px">` +
      `<tr>` +
      (score > 0
        ? `<td style="width:${Math.max(2, Math.min(100, score))}%;` +
          // The accent as a border rather than a fill. A solid-accent block is
          // one step from a solid-accent block WITH text on it, which is the
          // contrast failure the banner above is deliberately built to avoid;
          // keeping the accent out of `background` entirely means the rule
          // cannot be broken here by someone later dropping a label inside.
          `border-top:6px solid ${head.accent};` +
          `border-radius:3px 0 0 3px;font-size:0;line-height:0">&nbsp;</td>`
        : "") +
      (score < 100
        ? `<td style="border-top:6px solid #e8ecf1;` +
          `border-radius:${score > 0 ? "0 3px 3px 0" : "3px"};` +
          `font-size:0;line-height:0">&nbsp;</td>`
        : "") +
      `</tr></table>` +
      `<div style="font-size:13px;line-height:1.55;color:#4a5567;margin-top:10px">` +
      `${escapeHtml(bandLine)}</div>` +
      `</div>`
    : "";

  // The tactics this message used, named as the Learn page names them. The
  // continuity is the point: someone who has read "how scammers operate"
  // should meet the same six words on their own result.
  const tacticsBox = tacticNames.length
    ? `<div style="margin:0 0 18px">` +
      `<p style="margin:0 0 6px;font-size:13px;font-weight:bold;text-transform:uppercase;` +
      `letter-spacing:0.04em;color:#3a4658">Tactics used</p>` +
      tacticNames
        .map(
          (n) =>
            `<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 10px;` +
            `background:#eef1f5;border-radius:999px;color:#3a4658;font-size:13px">` +
            `${escapeHtml(n)}</span>`,
        )
        .join("") +
      `<div style="font-size:13px;color:#7c879a;margin-top:2px">` +
      `${escapeHtml("These are among the six tactics we explain on the Learn page.")}</div>` +
      `</div>`
    : "";

  // Persuasion techniques, beside the verdict rather than inside it. Rendered
  // on the neutral surface the service notice uses, not on a verdict colour:
  // this is an observation about how the message is written, and giving it the
  // amber of a coverage caveat or the red of a verdict would read as a finding
  // about safety, which it is not.
  const pressureBox =
    pressure && pressure.count > 0
      ? `<div style="border:1px solid #dfe3e8;background:#ffffff;border-radius:10px;` +
        `padding:14px 16px;margin:0 0 18px">` +
        `<div style="font-size:13px;font-weight:bold;text-transform:uppercase;` +
        `letter-spacing:0.04em;color:#3a4658;margin-bottom:8px">` +
        `${escapeHtml(`How this message pressures you (${pressure.count})`)}</div>` +
        pressure.tactics
          .map(
            (t) =>
              `<div style="margin:0 0 10px"><div style="font-size:14px;font-weight:bold;` +
              `color:#2b3648">${escapeHtml(t.label)}</div>` +
              `<div style="font-size:13px;line-height:1.55;color:#4a5567;margin-top:2px">` +
              `${escapeHtml(t.explains)}</div></div>`,
          )
          .join("") +
        `<div style="font-size:12.5px;line-height:1.5;color:#7c879a;margin-top:2px">` +
        `${escapeHtml("These techniques are not proof of anything on their own. Legitimate sellers use them too — which is the point worth knowing.")}` +
        `</div></div>`
      : "";

  const sectionHeading = (t: string) =>
    `<p style="margin:0 0 6px;font-size:13px;font-weight:bold;text-transform:uppercase;` +
    `letter-spacing:0.04em;color:#3a4658">${escapeHtml(t)}</p>`;

  const partialBox = partial
    ? `<div style="border:1px solid #f0dfb5;background:#fdf6e3;border-radius:10px;` +
      `padding:14px 16px;margin:0 0 18px;color:#5c4a1f;font-size:14px;line-height:1.55">` +
      `<div style="font-weight:bold;margin-bottom:6px">${escapeHtml(partialHeading)}</div>` +
      `<div><strong>Checked:</strong> ${escapeHtml(partial.checked.join("; ") || "nothing we could read")}</div>` +
      `<div><strong>Not checked:</strong> ${escapeHtml(partialNotChecked.join("; "))}</div>` +
      (partialCaveat ? `<div style="margin-top:6px">${escapeHtml(partialCaveat)}</div>` : "") +
      `</div>`
    : "";

  const body = [
    banner,
    partialBox,
    scoreBox,
    breakdown.length
      ? sectionHeading("What we found") +
        `<ul style="margin:0 0 18px;padding-left:20px">${breakdownHtml}</ul>`
      : "",
    tacticsBox,
    pressureBox,
    actionBox,
    nothingFound ? `<p style="margin:0 0 18px;color:#444">${escapeHtml(nothingFound)}</p>` : "",
    flagLines.length
      ? sectionHeading("Who sent it") +
        `<ul style="margin:0 0 18px;padding-left:20px;color:#444;font-size:14px">${li(flagLines)}</ul>`
      : "",
    coverageNote
      ? `<p style="margin:0 0 18px;padding:10px 12px;background:#fdf6e3;border-radius:6px;` +
        `color:#8a6d3b;font-size:13px">${escapeHtml(coverageNote)}</p>`
      : "",
    // The report CTA is the only link inside the message body, and it points at
    // our own origin — built from siteUrl and URL-encoded params, never from
    // attacker-controlled text. Everything else stays unlinked so nothing in a
    // quoted scam becomes clickable.
    reportUrl
      ? `<div style="background:#f0f9f4;border-radius:8px;padding:14px 16px;margin:0 0 4px">` +
        `<div style="color:#245c3d;font-size:14px;line-height:1.5">${escapeHtml(ctaLine)}</div>` +
        `<a href="${escapeHtml(reportUrl)}" style="display:inline-block;margin-top:12px;` +
        `padding:11px 18px;background:#00A676;color:#ffffff;text-decoration:none;` +
        `border-radius:8px;font-weight:bold;font-size:14px">Report this scam</a></div>`
      : "",
  ].filter(Boolean).join("\n");

  // Footer band — help, the discard promise, and the anti-impersonation line.
  const footerBand =
    `<div style="background:#f7f8fa;border-top:1px solid #e6e8ec;padding:18px 22px;` +
    `color:#5a6472;font-size:12.5px;line-height:1.55">` +
    `<p style="margin:0 0 8px">${escapeHtml(helpLine)}</p>` +
    `<p style="margin:0 0 8px">${escapeHtml(privacyLine)}</p>` +
    `<p style="margin:0 0 10px;color:#3a4658"><strong>${escapeHtml(trustLine)}</strong></p>` +
    `<p style="margin:0;color:#8b93a3">` +
    `${escapeHtml("Veriguard · Check before you act")}` +
    (siteUrl
      ? ` · <a href="${escapeHtml(siteUrl.replace(/\/$/, ""))}" style="color:#00875f;` +
        `text-decoration:none">${escapeHtml(siteHost)}</a>`
      : "") +
    `</p></div>`;

  const html =
    preheader +
    `<div style="background:#f2f4f7;padding:24px 12px;font-family:${FONT}">` +
    `<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e6e8ec;` +
    `border-radius:12px;overflow:hidden;font-size:15px;line-height:1.5;color:#222">` +
    header +
    `<div style="padding:22px">${body}</div>` +
    footerBand +
    `</div></div>`;

  const subject =
    verdict === "likely_scam" ? "Scam alert: the email you forwarded"
    : verdict === "suspicious" ? "Caution: the email you forwarded looks suspicious"
    : "Result: the email you forwarded";

  return { subject, text, html };
}

// Every finding across every identifier, as one list of evidence.
//
// The results page used to hand the verdict card only the *worst* identifier's
// signals, which quietly dropped the rest. A parcel-fee SMS carrying a dodgy
// link scores as two identifiers — the message and the URL — and showing only
// the message's rows hid the ".top domain" and "no HTTPS" findings that are the
// most concrete evidence on the page. The overall score is composed from all of
// them, so the evidence under it has to be too, or the arithmetic doesn't add
// up in front of a reader we explicitly invite to check it.
/**
 * The overall verdict AND the evidence behind it, composed together.
 *
 * These have to be produced in one place. composeVerdict returns the WORST
 * identifier's score while pooled evidence covers EVERY identifier, and pairing
 * them put a headline of 75 above six rows adding to 120 — in a panel whose own
 * copy invites the reader to check our arithmetic. Worse, the score panel
 * reasons over the rows it is handed (how many rules tripped, which one was
 * heaviest, what the clamp row means), so cross-identifier rows let it assert
 * things about a score a different identifier produced.
 *
 * The pooling, the cap and the clamp row now live in
 * `@veriguard/engine/verdictRank` alongside the rank table, because the
 * WebExtension shows the same evidence list and cannot reach `lib/`. It had a
 * second copy of this pairing and got it wrong in exactly the way described
 * above. This function is what remains app-side: the verdict, and the tracking
 * pixel that no identifier scores.
 */
export function composeVerdictWithEvidence(
  results: AnalyzedIdentifier[],
  pixelReport: TrackingPixelReport | null,
): (OverallVerdict & { signals: Signal[] }) | null {
  const composed = composeVerdict(results, pixelReport);
  if (!composed) return null;

  // The tracking pixel nudges the verdict without any identifier scoring it, so
  // it has to enter the evidence as its own row — otherwise the panel shows a
  // 40/100 meter above rows totalling 5 and never names the reason. That is the
  // one app-side addition; the arithmetic around it is the engine's.
  const floor = pixelReport
    ? {
        score: composed.score,
        text: `Contains ${pixelReport.pixels.length === 1 ? "a tracking pixel" : `${pixelReport.pixels.length} tracking pixels`} — an invisible image that tells the sender you opened this, and when. Legitimate senders use them too, but it confirms your address is live and being watched.`,
        source: "message" as const,
      }
    : undefined;

  const { score, signals } = evidenceFor(results, floor);
  return { verdict: composed.verdict, score, signals };
}

export { pooledSignals } from "@veriguard/engine/verdictRank";
