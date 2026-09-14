// Guards incoming report submissions against bots, scrapers, rate abusers,
// and scammers trying to poison the database.
//
// Returns one of three verdicts:
//   'accept'  — store in the main legitimate queue
//   'suspect' — store in the suspect/review queue, return fake success to caller
//   'poison'  — discard silently, return fake success to caller
//
// All three return an identical-looking success response to the client.

import { checkUrl, checkSms, checkEmail, checkPhone, checkCustom, ScamType } from "@veriguard/engine/scamDetector";
import { checkAndRecordRateLimit, isRecentDuplicate } from "./reportStore";

export type GuardVerdict = "accept" | "suspect" | "poison";

export interface GuardInput {
  type: string;
  content: string;
  description: string;
  hp: string;           // honeypot — must be empty
  // unix ms the form was rendered. Server-verified when loadedAtVerified is
  // true (see lib/formToken.ts) — otherwise this is the client's own claim
  // and worth treating as a soft signal only, since it costs an attacker
  // nothing to fabricate.
  loadedAt: number;
  loadedAtVerified: boolean;
  ip: string;
  userAgent: string;
  contentLength: number;
  // The scam identifier the reporter is accusing, if any — cross-checked
  // against substantiationText so an innocent third party's domain cannot
  // ride along behind unrelated scam-flavoured free text. `kind` is the
  // identifier's own shape, which is NOT the report's `type`: an email report
  // still names a scamUrl.
  scamIdentifier?: { kind: "url" | "phone" | "email"; value: string };
  // The reporter's text BEFORE PII scrubbing, used only for the substantiation
  // match above and never stored or returned. Scrubbing redacts the very
  // phone/email shapes an identifier holds, so the scrubbed `content` cannot
  // answer "did they actually mention this?". Includes the description and,
  // for email reports, the raw source the scammer's address was parsed from.
  substantiationText: string;
}

export interface GuardResult {
  verdict: GuardVerdict;
  reason: string;
}

// User-agent substrings that indicate automated tools / scrapers
const BOT_UA_PATTERNS = [
  "curl", "wget", "python-requests", "python/", "go-http", "java/",
  "libwww", "httpclient", "scrapy", "okhttp", "axios/", "node-fetch",
  "got/", "undici", "pycurl", "bot/", "crawler", "spider", "headless",
  "phantomjs", "selenium",
];

export function guardSubmission(input: GuardInput): GuardResult {
  // ── 1. Honeypot ────────────────────────────────────────────────────────────
  // Bots filling all fields in a form will populate this hidden field.
  if (input.hp.length > 0) {
    return { verdict: "poison", reason: "honeypot_filled" };
  }

  // ── 2. Payload sanity ──────────────────────────────────────────────────────
  if (!input.type || !input.content?.trim()) {
    return { verdict: "poison", reason: "missing_required_fields" };
  }
  if (input.contentLength > 8000) {
    return { verdict: "poison", reason: "payload_too_large" };
  }

  // ── 3. Timing check ────────────────────────────────────────────────────────
  // A human takes at least a few seconds to read the form and fill it in.
  //
  // An unverified loadedAt is a claim, not evidence. It still gates
  // submissions without a configured secret so local dev keeps working, but a
  // verified timestamp is required to earn "accept" outright — see the
  // plausibility step below, which additionally downgrades an
  // otherwise-passing unverified submission.
  const elapsed = Date.now() - (input.loadedAt || 0);
  if (!input.loadedAt || elapsed < 2500) {
    return { verdict: "suspect", reason: "submitted_too_fast" };
  }
  // loadedAt suspiciously far in the past (>1 hour) or future suggests manipulation
  if (elapsed > 3_600_000 || elapsed < 0) {
    return { verdict: "suspect", reason: "suspicious_timestamp" };
  }

  // ── 4. User-agent check ────────────────────────────────────────────────────
  const ua = input.userAgent.toLowerCase();
  if (!ua || ua.length < 10) {
    return { verdict: "suspect", reason: "missing_user_agent" };
  }
  if (BOT_UA_PATTERNS.some((p) => ua.includes(p))) {
    return { verdict: "suspect", reason: "bot_user_agent" };
  }

  // ── 5. Rate limiting ───────────────────────────────────────────────────────
  // Runs after UA check so legitimate rate-limited users get poison (silent discard)
  // rather than a real error that tells them to back off and retry.
  if (!checkAndRecordRateLimit(input.ip)) {
    return { verdict: "poison", reason: "rate_limited" };
  }

  // ── 6. Duplicate detection ─────────────────────────────────────────────────
  if (isRecentDuplicate(input.type, input.content)) {
    return { verdict: "suspect", reason: "duplicate_content" };
  }

  // ── 7. Content plausibility ────────────────────────────────────────────────
  // If the submitted content scores very low on our own scam detector, the reporter
  // is either mistaken or — more likely — a scammer trying to get a legitimate-looking
  // URL allowlisted by submitting it as a "found scam."
  const score = scoreContent(input.type as ScamType, input.content);
  if (score < 8) {
    return { verdict: "suspect", reason: "content_appears_legitimate" };
  }

  // ── 8. Identifier substantiation ───────────────────────────────────────────
  // scoreContent above only checks the free-text `content` field — it never
  // looks at the accused identifier itself. That gap would let a submission
  // name an innocent third party while padding `content` with filler that
  // clears the plausibility floor on its own. Since accepted reports appear
  // on the public feed, this guards against targeted reputational harm, not
  // just spam.
  //
  // The test is whether the accusation is ABOUT the thing being named, not
  // whether the named thing scores as a scam. Scoring it is tempting and
  // wrong in both directions: a genuine first-seen scam domain scores 0
  // because no rule has met it yet, while a typosquat like "paypa1.com"
  // also scores 0 — so a score floor would reject honest reports and admit
  // the exact lookalike this check exists to stop.
  //
  // Matching runs against `substantiationText`, which is the text as the
  // reporter typed it. It cannot run against `content`: that has already been
  // through scrubPii, which redacts precisely the phone and email shapes an
  // identifier holds, so searching it for an unredacted number can only ever
  // fail. Email reports are the case that makes this load-bearing — the
  // scammer's address is parsed from headers the reporter never submits, so
  // it is checked against the source text rather than presumed absent.
  //
  // Downgrades to "suspect" (review queue) rather than rejecting: a false
  // positive costs a legitimate reporter a delay, not their report.
  //
  // Email identifiers on an email report are EXEMPT, and deliberately so. The
  // scammer's address there is parsed from headers on the reporter's device
  // and the raw source is never transmitted — a privacy guarantee the product
  // makes on purpose — so the address is structurally absent from everything
  // the server receives. Any test against submitted text would therefore fail
  // for every genuine email report, which is the product's main flow.
  //
  // Corroborating it against the parsed Reply-To was the obvious alternative
  // and is worse than nothing: a From/Reply-To domain mismatch is itself a
  // classic scam signal, so that rule would send the MOST suspicious real
  // reports to review while an attacker simply supplies two matching
  // addresses. Leaving the exemption visible is better than a check that
  // inverts its own intent.
  if (input.scamIdentifier) {
    const exempt = input.type === "email" && input.scamIdentifier.kind === "email";
    if (!exempt && !isSubstantiated(input.scamIdentifier, input.substantiationText)) {
      return { verdict: "suspect", reason: "identifier_not_substantiated" };
    }
  }

  // A submission that cleared every other gate but whose timing proof was
  // never verified (no signed token) still only earns a review-queue slot,
  // not an automatic public listing — this is the one case where "accept" is
  // withheld purely on the strength of an unprovable claim.
  if (!input.loadedAtVerified) {
    return { verdict: "suspect", reason: "timing_unverified" };
  }

  return { verdict: "accept", reason: "ok" };
}

/**
 * Whether the reporter's own text actually references the identifier they are
 * accusing.
 *
 * Comparison is per-kind because the same identifier is legitimately written
 * several ways, and a plain substring test would reject honest reports:
 *
 *   - phone: compared digits-only, so "0412 345 678", "0412-345-678" and
 *     "+61 412 345 678" all match the stored "0412345678". The trailing 8-9
 *     digits are used so a national-format mention matches an international
 *     one, which is how people actually paste numbers.
 *   - url: compared on hostname, so a reporter naming "scam.example" matches
 *     content carrying "https://scam.example/path?utm=x". Falls back to a
 *     substring test when the value will not parse as a URL.
 *   - email: plain case-insensitive substring; addresses are written one way.
 */
function isSubstantiated(
  identifier: { kind: "url" | "phone" | "email"; value: string },
  text: string,
): boolean {
  const { kind, value } = identifier;
  if (!value.trim() || !text.trim()) return false;
  const haystack = text.toLowerCase();

  if (kind === "phone") {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 6) return false;
    const textDigits = text.replace(/\D/g, "");
    return textDigits.includes(digits.slice(-9)) || textDigits.includes(digits);
  }

  if (kind === "url") {
    const host = hostnameOf(value);
    return host ? haystack.includes(host) : haystack.includes(value.toLowerCase());
  }

  return haystack.includes(value.toLowerCase());
}

function hostnameOf(value: string): string | null {
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
    return new URL(withScheme).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function scoreContent(type: ScamType, content: string): number {
  switch (type) {
    case "url":    return checkUrl(content).score;
    case "sms":    return checkSms(content).score;
    case "email":  return checkEmail(content).score;
    case "phone":  return checkPhone(content).score;
    case "qr":     return checkUrl(content).score;
    default:       return checkCustom(content).score;
  }
}
