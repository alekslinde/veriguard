// Reduce a raw (often forwarded) email to the legible "scam content" a human
// needs to read — a few meaningful headers plus the decoded message body.
//
// Why: when someone forwards a suspicious email, the raw RFC822 carries dozens
// of transport/authentication headers (ARC-Seal, DKIM-Signature, the whole
// X-MS-Exchange-* / X-Forefront family), MIME boundaries, quoted-printable
// encoding, and a duplicated HTML alternative. None of that is the scam — it's
// noise that makes the stored report and the report-form prefill unreadable.
//
// This module is for DISPLAY/STORAGE ONLY. Scam analysis (sender spoofing,
// tracking pixels, CSS beacons, meta-refresh) still runs on the RAW original via
// analyseEmailSource — those signals live precisely in the markup and headers we
// strip here, so distillation must never feed the analysers.
//
// Pure string work, no MIME library — the same focused-splitter philosophy as
// forwardedEmail.ts, auditable on one screen.

import { unwrapForwarded } from "@/lib/forwardedEmail";
import { splitHeadersBody, headerValue as partHeader, htmlToText, textParts } from "@/lib/mime";

// Headers worth showing a human: who it's from, who it claims to reply to, what
// it's about, when it arrived. Everything else is transport/auth/MIME plumbing.
// Lowercased for case-insensitive matching.
const KEEP_HEADERS = ["from", "reply-to", "to", "subject", "date"];

// Redact URLs from a (plain-text) body. The actual scam link is captured into
// the report's dedicated "Scam URL" field, so we never store/show the live link
// in the content. Handles the Outlook plain-text convention of "label<URL>"
// (e.g. "click here<https://evil/...>") as well as bare URLs, leaving the human
// label intact.
function redactUrls(text: string): string {
  return text
    // "label<https://...>" → "label [scam link removed]"
    .replace(/<https?:\/\/[^>\s]+>/gi, " [scam link removed]")
    // any remaining bare URL
    .replace(/https?:\/\/[^\s<>")\]]+/gi, "[scam link removed]")
    // tidy the doubled space the first replacement can introduce
    .replace(/[ \t]{2,}/g, " ");
}

// Readable body text: the decoded text/plain part, else the HTML part rendered
// to text. Returns "" when no textual part is found.
function extractReadableBody(raw: string): string {
  const { plain, html } = textParts(raw);
  if (plain.trim()) return redactUrls(plain.trim());
  if (html) return redactUrls(htmlToText(html, "redact"));
  return "";
}

// Distil raw email source into a compact, human-legible block: the meaningful
// headers followed by the decoded body. Unwraps a forwarded original first so we
// show the scam, not the forward. Falls back gracefully — if no textual body can
// be extracted, returns the kept headers alone; if there are no headers either,
// returns the unwrapped original untouched so we never lose the content.
export function distillEmailContent(raw: string): string {
  const { raw: original } = unwrapForwarded(raw);
  const { headerBlock } = splitHeadersBody(original);

  // Unfold so a folded Subject/From survives as one line, then keep only the
  // human-meaningful headers, in our canonical order.
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const keptLines: string[] = [];
  for (const name of KEEP_HEADERS) {
    const value = partHeader(unfolded, name);
    if (value) {
      // Title-case the header name for display (From, Reply-To, Subject…).
      const label = name.replace(/(^|-)([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
      keptLines.push(`${label}: ${value}`);
    }
  }

  const bodyText = extractReadableBody(original).trim();

  if (keptLines.length && bodyText) return `${keptLines.join("\n")}\n\n${bodyText}`;
  if (keptLines.length) return keptLines.join("\n");
  if (bodyText) return bodyText;
  return original.trim();
}
