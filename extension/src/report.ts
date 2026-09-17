// Handing a finished check to the report form.
//
// **The extension never submits a report, and that is a privacy property
// rather than a missing feature.** Its whole claim is that what you paste stays
// on your machine — one network call, for a static list, carrying nothing about
// you. A POST to /api/report from here would be a second call carrying the
// user's content, which is exactly the thing the claim rules out.
//
// So the report is *handed over* instead: a link to the site's own form, with
// the identifiers already filled in. The user sees the page, sees what is about
// to be sent, edits it, and submits from our origin — where the honeypot, form
// token and rate limit live. Nothing leaves the machine until they press a
// button on a page they are looking at.
//
// The prefill contract is `lib/reportPrefill.ts`, imported rather than copied.
// It is a pure module (no React, no I/O, one type-only engine import), and it
// is the same code the report page parses with — so the link this builds and
// the form that reads it cannot disagree about a parameter name or a length
// bound. A second copy here is the defect shape this repo has paid for before.

import { buildReportQuery, type ReportPrefill } from "../../lib/reportPrefill";
import type { AnalyzedIdentifier } from "@veriguard/engine/scamDetector";
import { detectType } from "@veriguard/engine/detectType";
import type { Verdict } from "@veriguard/engine/verdictRank";

/**
 * Verdicts that get a report link.
 *
 * Only where the check actually found something. A "report this" call to action
 * under a result we just called clean invites reports of things the engine
 * judged safe, and reads as us not believing our own verdict. A user who thinks
 * we got it wrong can still report from the site.
 */
const REPORTABLE: ReadonlySet<Verdict> = new Set<Verdict>(["suspicious", "likely_scam"]);

export function isReportable(verdict: Verdict): boolean {
  return REPORTABLE.has(verdict);
}

/**
 * Pick the identifiers to carry, from the results the check already produced.
 *
 * Only identifiers — a URL, an email address, a phone number. Never the pasted
 * message: it is the field most likely to hold the user's own details (their
 * name, their address, the reason the scammer had their number), and it belongs
 * in a box they can see and edit, not in a query string assembled behind them.
 * The form leaves that field empty for them to fill in their own words, which
 * is the same choice the emailed CTA makes.
 *
 * One of each kind, first occurrence wins — the report form accuses a single
 * identifier, so sending several of one kind would mean choosing for the user
 * without showing them the choice.
 */
export function prefillFor(results: AnalyzedIdentifier[], content: string): ReportPrefill {
  const first = (kind: AnalyzedIdentifier["kind"]) =>
    results.find((r) => r.kind === kind)?.value;

  const scamUrl = first("url");
  const scamEmail = first("email");
  const scamPhone = first("phone");

  // The report's `type` is what the user is reporting, which is not the same as
  // the kind of the identifier it names: an SMS carrying a link is an "sms"
  // report that also carries a scamUrl. `detectType` is the engine's own
  // answer, shared with the website's form, so both classify a paste the same
  // way.
  const type = detectType(content);

  return { type, scamUrl, scamEmail, scamPhone };
}

/**
 * The URL to open for a prefilled report.
 *
 * `apiBase` is the same build-time origin the blocklist is fetched from, so the
 * link cannot point somewhere the manifest has not already named. With nothing
 * worth carrying it degrades to the bare form rather than a malformed query.
 */
export function reportUrl(apiBase: string, prefill: ReportPrefill): string {
  const query = buildReportQuery(prefill);
  return query ? `${apiBase}/report?${query}` : `${apiBase}/report`;
}
