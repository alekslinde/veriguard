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
import { isWorse, worstBy } from "@veriguard/engine/verdictRank";
import type { Verdict } from "@veriguard/engine/verdictRank";
import type { RegionCoverage } from "@veriguard/engine/regions";
import type { Signal } from "@veriguard/engine/engineTypes";
import { TrackingPixelReport } from "@/lib/trackingPixel";
import { TrackingFinding } from "@/lib/emailTracking";
import { defang, defangEmail, defangPhone, defangText } from "@veriguard/engine/urlSanitizer";
import { buildReportQuery, ReportPrefill } from "@/lib/reportPrefill";

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
  return flag
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
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Build the verdict reply. When there are no scored identifiers but sender flags
// exist (header-only forward), the headline is driven by the flags' presence.
export function formatVerdictEmail(input: VerdictEmailInput): VerdictEmail {
  const { results, emailFlags, pixelReport, trackingFindings = [], siteUrl, senderAddress, replyToAddress } = input;

  // One shared severity decision — same rule the Check UI uses — so a header-
  // only forward still gets a meaningful headline and the two never disagree.
  const { verdict } = overallVerdict(results, pixelReport, emailFlags, trackingFindings.length > 0);
  const head = VERDICT_HEADLINE[verdict];

  // Breakdown — each identifier, its status, and WHY. The reasons are the point:
  // "Link evil[.]tk: likely scam" with nothing under it tells someone to be
  // afraid without teaching them what to look for next time. The detector
  // already writes lay-readable flags ("Dodgy top-level domain (.tk) — commonly
  // used by scammers"); this surfaces them instead of discarding them.
  const breakdown: BreakdownItem[] = results.map((r) => {
    const label = KIND_LABEL[r.kind];
    const value = r.kind !== "message" && r.value ? ` ${defangValue(r.kind, r.value)}` : "";
    const reasons = r.result.flags.slice(0, MAX_REASONS_PER_ITEM).map((f) => defangFlag(f));
    const hidden = Math.max(0, r.result.flags.length - MAX_REASONS_PER_ITEM);
    if (hidden > 0) reasons.push(`…and ${hidden} more signal${hidden === 1 ? "" : "s"}`);

    // The resolved destination of a shortened link is the single most useful
    // fact we can give someone, so it leads rather than sitting among the flags.
    if (r.result.expandedUrl) {
      reasons.unshift(`Real destination: ${r.result.expandedUrl}`);
    }

    return { heading: `${label}${value} — ${VERDICT_STATUS[r.result.verdict]}`, reasons };
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
  const nothingFound =
    breakdown.length > 0 && breakdown.every((b) => b.reasons.length === 0) && flagLines.length === 0
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
    if (!siteUrl || verdict === "safe") return "";
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

  // ── Plain text ──
  const textParts = [
    "VERIGUARD — Scam check result",
    "",
    `${head.emoji} ${head.line}`,
    head.meaning,
    "",
    "WHAT YOU SHOULD DO",
    `  ${advice}`,
    "",
    ...(breakdown.length
      ? [
          "WHAT WE FOUND",
          ...breakdown.flatMap((b) => [
            `  • ${b.heading}`,
            ...b.reasons.map((r) => `      - ${r}`),
          ]),
          "",
        ]
      : []),
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

  const breakdownHtml = breakdown
    .map((b) => {
      const reasons = b.reasons.length
        ? `<ul style="margin:4px 0 0;padding-left:20px;color:#444;font-size:14px">${li(b.reasons)}</ul>`
        : "";
      return `<li style="margin-bottom:10px"><strong>${escapeHtml(b.heading)}</strong>${reasons}</li>`;
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

  const sectionHeading = (t: string) =>
    `<p style="margin:0 0 6px;font-size:13px;font-weight:bold;text-transform:uppercase;` +
    `letter-spacing:0.04em;color:#3a4658">${escapeHtml(t)}</p>`;

  const body = [
    banner,
    actionBox,
    breakdown.length
      ? sectionHeading("What we found") +
        `<ul style="margin:0 0 18px;padding-left:20px">${breakdownHtml}</ul>`
      : "",
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
//
// Ordering: findings first in identifier order, then the clamp row last if any
// identifier hit its ceiling — it is arithmetic about the total, so it belongs
// at the bottom of the column it explains, not interleaved with observations.
//
// Duplicate texts are collapsed. The same URL appearing in both the message
// scan and its own scan produces the same sentence twice, and one observation
// listed twice reads as two independent findings.
/**
 * The overall verdict AND the evidence behind it, composed together.
 *
 * These have to be produced in one place. composeVerdict returns the WORST
 * identifier's score while pooledSignals returns EVERY identifier's rows, and
 * pairing them put a headline of 75 above six rows adding to 120 — in a panel
 * whose own copy invites the reader to check our arithmetic. Worse, the score
 * panel reasons over the rows it is handed (how many rules tripped, which one
 * was heaviest, what the clamp row means), so cross-identifier rows let it
 * assert things about a score a different identifier produced.
 *
 * So the headline here is the sum of the evidence shown, capped at 100 like
 * every per-identifier score, with a clamp row when the cap bites. That keeps
 * the invariant the engine already holds itself to: the rows on screen add up
 * to the number above them.
 *
 * The verdict still comes from composeVerdict — worst-identifier-wins is the
 * severity rule, and it is shared with the email reply. Only the arithmetic
 * shown to the reader is recomputed. A pooled sum can only ever be >= the worst
 * identifier's score, so this never softens a verdict.
 */
export function composeVerdictWithEvidence(
  results: AnalyzedIdentifier[],
  pixelReport: TrackingPixelReport | null,
): (OverallVerdict & { signals: Signal[] }) | null {
  const composed = composeVerdict(results, pixelReport);
  if (!composed) return null;

  const findings = pooledSignals(results).filter((x) => x.source !== "score");
  let signals = findings;
  let score = Math.min(findings.reduce((n, x) => n + x.points, 0), 100);

  // The tracking pixel nudges the verdict without any identifier scoring it, so
  // it has to enter the evidence as its own row — otherwise the panel shows a
  // 40/100 meter above rows totalling 5 and never names the reason.
  if (pixelReport && score < composed.score) {
    signals = [
      ...findings,
      {
        text: `Contains ${pixelReport.pixels.length === 1 ? "a tracking pixel" : `${pixelReport.pixels.length} tracking pixels`} — an invisible image that tells the sender you opened this, and when. Legitimate senders use them too, but it confirms your address is live and being watched.`,
        points: composed.score - score,
        source: "message",
      },
    ];
    score = composed.score;
  }

  const raw = signals.reduce((n, x) => n + x.points, 0);
  if (raw > score) {
    signals = [
      ...signals,
      { text: `Signals total ${raw} — the score is capped at ${score}`, points: score - raw, source: "score" },
    ];
  }

  return { verdict: composed.verdict, score, signals };
}

export function pooledSignals(results: AnalyzedIdentifier[]): Signal[] {
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
