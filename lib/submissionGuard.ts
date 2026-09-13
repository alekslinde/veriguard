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
  // The scam identifier the reporter is accusing, if any — used to cross-check
  // that the accusation is actually about something scam-shaped rather than
  // an innocent third party's domain riding along behind unrelated
  // scam-flavoured free text. `kind` says which scorer applies: content.type
  // is the REPORT's type (e.g. "email" for a forwarded scam email) and is not
  // always the identifier's own shape — an email report still names a
  // scamUrl. See scoreContent below.
  scamIdentifier?: { kind: "url" | "phone" | "email"; value: string };
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
  // If loadedAt is missing or the gap is under 2.5s it's automated.
  //
  // An unverified loadedAt is a claim, not evidence — an attacker who has read
  // this file can fabricate Date.now() - 3000 and clear the bar instantly. It
  // still gates *unauthenticated* submissions (no REPORT_FORM_SECRET
  // configured) so local dev and any deploy that hasn't set the secret keep
  // the old behaviour, but a verified timestamp is required to earn "accept"
  // outright — see the plausibility step below, which additionally downgrades
  // an otherwise-passing unverified submission.
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

  // ── 8. Identifier plausibility ─────────────────────────────────────────────
  // scoreContent above only checks the free-text `content` field — it never
  // looks at the accused scamUrl/scamPhone/scamEmail itself. That gap lets an
  // attacker name a real, innocent business's domain as the identifier while
  // padding `content` with scam-flavoured filler that clears the score-8
  // floor on its own: the plausibility check passes, but nothing about it was
  // ever actually about the accused identifier. Since accepted reports appear
  // on the public feed sorted by report_count, this is exploitable as
  // targeted reputational harm, not just spam.
  //
  // Two independent checks, either of which downgrades to "suspect" (review
  // queue) rather than blocking outright — a false positive here costs a
  // legitimate reporter a delay, not a rejection:
  //   - the identifier itself must not score as obviously legitimate
  //   - the identifier must actually appear in the reported content, so the
  //     accusation is demonstrably about the thing being named
  if (input.scamIdentifier) {
    const { kind, value } = input.scamIdentifier;
    const identifierScore =
      kind === "url"   ? checkUrl(value).score :
      kind === "phone" ? checkPhone(value).score :
                          checkEmail(value).score;
    const mentioned = input.content.toLowerCase().includes(value.toLowerCase());
    if (identifierScore < 8 || !mentioned) {
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
