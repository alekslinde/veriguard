// Redacts structured PII from free-text descriptions before public exposure.
// Covers patterns with reliable regex shapes. Names and street addresses
// cannot be reliably detected without NLP and are out of scope.

// Every PATTERN below assumes ASCII digits with at most one ordinary
// separator between groups. An attacker who has read this file can defeat
// every one of them for free by writing a phone number in fullwidth Unicode
// digits (０-９, which \d never matches) or by interleaving
// zero-width/invisible characters between ordinary digits — the number still
// reads as a phone number to a human, and still round-trips through most
// clients, but no PATTERN's character class contains it.
//
// NFKC normalization folds fullwidth/compatibility digit forms down to plain
// ASCII ("０４１２" → "0412"), and stripping the zero-width/invisible block
// closes the interleaving trick — both applied once, up front, rather than
// widening every regex's character classes individually.
const ZERO_WIDTH_RE = /[​-‍﻿­⁠]/g;

function normalizeForScrubbing(text: string): string {
  return text.normalize("NFKC").replace(ZERO_WIDTH_RE, "");
}

const PATTERNS: Array<[RegExp, string]> = [
  // Email addresses
  [/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g, "[email removed]"],
  // AU mobile: 04xx xxx xxx (various spacing/dash styles)
  [/\b04\d{2}[\s\-]?\d{3}[\s\-]?\d{3}\b/g, "[phone removed]"],
  // AU landline: 0x xxxx xxxx
  [/\b0[2378][\s\-]?\d{4}[\s\-]?\d{4}\b/g, "[phone removed]"],
  // International: +xx...
  [/\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{3,5}[\s\-]?\d{3,5}\b/g, "[phone removed]"],
  // IPv4 addresses
  [/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, "[IP removed]"],
  // IPv6 addresses. Runs after IPv4 so a mapped ::ffff:1.2.3.4 has its IPv4 tail
  // redacted first. Four ordered branches (most specific first, so a whole
  // address is consumed in one replacement with no trailing remnant):
  //   1. any compressed "::" form — the literal "::" never appears in a
  //      timestamp, so it's matched whole regardless of group count, including a
  //      bracketed tail like "[2001:db8::1]" (the leading \b sits after "[").
  //   2. full uncompressed: exactly 8 groups.
  //   3/4. 3–7-group runs, but only when a group actually looks like hex (has a
  //      letter or is 3–4 digits) — this rejects pure short-decimal sequences
  //      such as "1:2:3:4" and HH:MM:SS timestamps (which are 1–2 digit groups),
  //      while still catching real addresses like "2002:a05:6512:31c3".
  [/\b[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*::(?:[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{1,4})*)?|\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){2,7}(?:[0-9a-fA-F]*[a-fA-F][0-9a-fA-F]*|\d{3,4})\b|\b(?:[0-9a-fA-F]*[a-fA-F][0-9a-fA-F]*|\d{3,4}):(?:[0-9a-fA-F]{1,4}:){1,6}[0-9a-fA-F]{1,4}\b/g, "[IP removed]"],
  // AU Tax File Number: 3 groups of 3 digits (space or dash separated)
  [/\b\d{3}[\s\-]\d{3}[\s\-]\d{3}\b/g, "[TFN removed]"],
  // AU BSB: xxx-xxx
  [/\b\d{3}-\d{3}\b/g, "[BSB removed]"],
  // Credit card: 16 digits in groups of 4
  [/\b\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}\b/g, "[card removed]"],
];

export function scrubPii(text: string): string {
  let result = normalizeForScrubbing(text);
  for (const [pattern, replacement] of PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * The literal substrings scrubPii would redact, in order of appearance.
 *
 * Exposed for callers that must reason about *which* identifiers a text
 * contains rather than just removing them — the eval corpus check requires each
 * one to be declared by hand, so a victim's address can never ride along inside
 * a case that declared only the scammer's.
 *
 * Reported from the patterns themselves rather than by diffing scrubbed output
 * against the original: replacements change the string's length, so diffing can
 * only re-locate a span by guessing at surrounding context, and two adjacent
 * redactions then merge into one span.
 *
 * Later patterns are applied to text where earlier ones already matched, so a
 * span already covered is skipped — mirroring scrubPii's sequential replace,
 * where an IPv4 inside a mapped IPv6 is consumed by the IPv4 pass first.
 */
export function findPii(rawText: string): string[] {
  // Scanned against the same normalized text scrubPii actually redacts —
  // reporting spans from the raw input would miss exactly the fullwidth/
  // zero-width evasions normalization exists to catch.
  const text = normalizeForScrubbing(rawText);
  const spans: Array<[number, number]> = [];
  const covered = (start: number, end: number): boolean =>
    spans.some(([s, e]) => start < e && end > s);

  for (const [pattern] of PATTERNS) {
    // Patterns are module-level and carry /g, so lastIndex must be reset before
    // each scan or successive calls resume mid-string.
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      if (!covered(m.index, m.index + m[0].length)) {
        spans.push([m.index, m.index + m[0].length]);
      }
    }
  }

  return spans
    .sort((a, b) => a[0] - b[0])
    .map(([start, end]) => text.slice(start, end));
}

// Headers that identify the reporter's own mailbox or expose the delivery path
// (relay hostnames + IPs, including IPv6). Stripped before the content is shown,
// stored, or published — none are needed to assess the scam.
//
// `Received` is included: the chain records every relay the message passed
// through, leaking the recipient's mail infrastructure and IP addresses. We do
// NOT strip `Authentication-Results` — its SPF/DKIM/DMARC verdicts are scam
// evidence and carry no recipient PII.
const REPORTER_HEADER_NAMES = [
  "delivered-to",
  "x-original-to",
  "x-forwarded-to",
  "x-google-original-to",
  "received",        // full relay chain — hostnames + IPs (incl. IPv6)
  "x-received",
  "x-originating-ip",
  "received-spf",    // carries client-ip of the relay; the spf verdict is
                     // preserved separately via Authentication-Results
];

// A header and all of its folded continuation lines (lines beginning with
// whitespace belong to the header above them). `m` so ^ matches each line; the
// continuation run `(?:\r?\n[ \t][^\n]*)*` swallows folded values like a
// multi-line Received chain.
const REPORTER_HEADER_RE = new RegExp(
  `^(?:${REPORTER_HEADER_NAMES.join("|")})\\s*:[^\\n]*(?:\\r?\\n[ \\t][^\\n]*)*\\r?\\n?`,
  "gim",
);

// Strip reporter/delivery headers, scoped to the HEADER BLOCK only. Several
// header names (notably "received") are also ordinary English words, so running
// the regex over the whole message would silently delete body prose like
// "Received: your parcel could not be delivered." We split headers from body at
// the first blank line, scrub only the header side, and stitch the original
// separator + verbatim body back on. Header-only input (no blank line) scrubs
// the whole thing. We re-split here (rather than via splitHeadersBody) so the
// exact CRLF-or-LF separator is preserved on reconstruction.
export function stripReporterHeaders(raw: string): string {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx === -1) return raw.replace(REPORTER_HEADER_RE, "");
  const sep = raw.slice(idx).match(/^\r?\n\r?\n/)?.[0] ?? "\n\n";
  const headerBlock = raw.slice(0, idx);
  const body = raw.slice(idx + sep.length);
  return headerBlock.replace(REPORTER_HEADER_RE, "") + sep + body;
}
