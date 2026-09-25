// Locate the ORIGINAL scam message inside a forwarded email.
//
// When someone forwards a suspicious email to us, the top-level RFC822 headers
// describe *their* forward (their address, their provider's SPF/DKIM) — not the
// scam. Analysing those would be worse than useless: it'd vouch for the
// victim's own mail. The original lives in one of two shapes:
//
//   1. As a `message/rfc822` attachment (Apple Mail "Forward as Attachment",
//      Gmail/Outlook "forward as .eml"). The attachment body IS the original
//      raw message — headers and all. This is the high-fidelity case.
//   2. Quoted inline in the body, under a separator like
//      "---------- Forwarded message ---------" followed by lines such as
//      "From: ...", "Reply-To: ...", sometimes `>`-quoted. We preserve the
//      quoted headers AND the quoted body, so sender analysis AND tracking
//      analysis (pixels, CSS beacons, read receipts, meta refresh) both work.
//      The only loss versus an attachment is the receiving-server SPF/DKIM/DMARC
//      results, which clients don't carry into the quote.
//
// This module returns the best raw block to hand to parseEmailHeaders /
// analyseEmailTracking, plus how it was found, so callers can caveat the
// (slightly lower-fidelity) inline result.
//
// Pure string logic. No MIME library — a focused splitter covers the shapes
// real clients actually produce, and is auditable in one screen.

import { splitHeadersBody, headerValue, boundaryOf, multipartParts, htmlToText, textParts } from "@/lib/mime";

// "body" only arises for a known forward (see UnwrapOptions): no original was
// found, so the forwarder's headers are dropped and the decoded body alone is
// analysed.
export type ForwardSource = "attachment" | "inline" | "toplevel" | "body";

export interface UnwrappedEmail {
  // Raw text to feed parseEmailHeaders — the innermost original we could find.
  raw: string;
  // The original's decoded HTML, for tracking analysis only (pixels, CSS
  // beacons, meta refresh live in markup). Kept apart from `raw` because `raw`
  // is also distilled into text people read and store, where markup is noise.
  // "" when there is none, or none that can be told apart from the forwarder's.
  markup: string;
  // How we found it. "toplevel" means no forward wrapper was detected, so the
  // input is treated as the original (e.g. a raw .eml the user exported).
  // "body" means the same for a known forward, whose headers are dropped.
  source: ForwardSource;
}

export interface UnwrapOptions {
  // The outer message is known to be someone forwarding a suspect email to us
  // (the forward-to-check inbox), not the suspect email itself (a pasted or
  // exported .eml). Its headers and its text above the forward marker belong
  // to the forwarder, so neither is ever part of what we analyse.
  forwarded?: boolean;
}

// Recursively descend through multipart containers looking for a
// message/rfc822 part. Returns its raw content (the embedded original), or "".
function findRfc822(raw: string, depth = 0): string {
  if (depth > 10) return ""; // guard against pathological nesting
  const { headerBlock, body } = splitHeadersBody(raw);
  // Match the type case-insensitively, but extract the boundary from the
  // original-case value — MIME boundaries are case-sensitive.
  const ctRaw = headerValue(headerBlock, "content-type");
  const ct = ctRaw.toLowerCase();

  if (ct.startsWith("message/rfc822")) {
    // The body of a message/rfc822 part is the embedded message verbatim.
    return body.trim();
  }
  if (ct.startsWith("multipart/")) {
    const boundary = boundaryOf(ctRaw);
    if (!boundary) return "";
    for (const part of multipartParts(body, boundary)) {
      const found = findRfc822(part, depth + 1);
      if (found) return found;
    }
  }
  return "";
}

// Markers different clients place before an inline-quoted forwarded message.
// The dash runs are anchored to their first dash: unanchored, a failed match
// retried from every dash of a long run, which is quadratic on hostile input.
const SEPARATOR_MARKERS = [
  /(?<!-)-{2,}\s*forwarded message\s*-{2,}/i,     // Gmail, Yahoo, generic
  /begin forwarded message:/i,                    // Apple Mail
  /(?<!-)-{2,}\s*original message\s*-{2,}/i,      // Outlook (older)
];
// Outlook writes no separator line, only the quoted header block itself, so
// the match starts ON the original's From line and that line is kept.
const HEADER_BLOCK_MARKERS = [
  /^[ \t>]*from:\s[^\n]*\bsent:\s/im,              // From and Sent on one line
  /^[ \t>]*from:\s[^\n]*\n[ \t>]*sent:\s/im,        // From, then Sent
];

// A line that looks like an email header: "Header-Name: value".
const HEADER_LINE_RE = /^[A-Za-z][A-Za-z0-9\-]*\s*:\s/;

// Header names a forwarded quote typically carries — used to recognise the
// original's header block even when extra prose is interleaved.
const QUOTED_HEADER_RE = /^(from|to|cc|reply-to|sent|date|subject|disposition-notification-to|return-receipt-to|x-confirm-reading-to)\s*:/i;

// Extract the inline-quoted original as a full email: its quoted headers, a
// blank line, then the quoted body. Preserving the body (not just From/Reply-To)
// means tracking analysis — pixels, CSS beacons, meta refresh — works on inline
// forwards too, and read-receipt headers in the quote survive. Returns "" when
// nothing useful is quoted.
function findInline(body: string): string {
  // Find the earliest marker; everything after it is the quoted original.
  let cut = -1;
  let isSeparator = false;
  for (const [markers, separator] of [[SEPARATOR_MARKERS, true], [HEADER_BLOCK_MARKERS, false]] as const) {
    for (const re of markers) {
      const at = body.search(re);
      if (at !== -1 && (cut === -1 || at < cut)) {
        cut = at;
        isSeparator = separator;
      }
    }
  }
  if (cut === -1) return "";

  // De-quote (`> `) every line after the marker, dropping a separator line
  // ("---- Forwarded message ----", "Begin forwarded message:") but not a
  // header-block marker, whose first line is the original's From.
  const lines = body
    .slice(cut)
    .split(/\r?\n/)
    .slice(isSeparator ? 1 : 0)
    .map((l) => l.replace(/^\s*>+\s?/, ""));

  // Walk the de-quoted lines: the leading run of header-looking lines (allowing
  // blank lines and folded continuations among them) is the original's header
  // block; the first line that's clearly body text ends it. Everything from
  // there on is the body we hand to the tracking analyser.
  const headerLines: string[] = [];
  let bodyStart = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") {
      // A blank line ends the header block ONLY once we've seen a real header.
      if (headerLines.length > 0) { bodyStart = i + 1; break; }
      continue;
    }
    if (QUOTED_HEADER_RE.test(line) || (headerLines.length > 0 && /^\s+\S/.test(line))) {
      // A recognised header, or a folded continuation of the previous one.
      headerLines.push(line.trim());
      continue;
    }
    if (HEADER_LINE_RE.test(line) && headerLines.length > 0) {
      // Some other header-shaped line amid the block — keep it.
      headerLines.push(line.trim());
      continue;
    }
    // First non-header line: the body starts here.
    bodyStart = i;
    break;
  }

  // Need at least a From/Reply-To to be worth treating as the original.
  const hasSender = headerLines.some((l) => /^(from|reply-to)\s*:/i.test(l));
  if (!hasSender) return "";

  const bodyText = lines.slice(bodyStart).join("\n").trim();
  // Reassemble as a proper RFC822 message: headers, blank line, body.
  return bodyText ? `${headerLines.join("\n")}\n\n${bodyText}` : headerLines.join("\n");
}

// Where the quoted original starts in an HTML part, found without a regex
// over the markup: the text markers some clients write into it, then the
// wrappers others put around the quote.
const HTML_TEXT_MARKERS = SEPARATOR_MARKERS;
const HTML_QUOTE_OPENERS = [
  'class="gmail_quote',   // Gmail
  'id="divrplyfwdmsg"',   // Outlook
  "id=divrplyfwdmsg",
  'type="cite"',          // Apple Mail
];

// The HTML part from where the quoted original starts, so tracking analysis
// sees the original's markup and not the forwarder's (whose signature can
// carry its own images). Falls back to the first mention of the original's
// sender address, which every client writes into the quoted header block.
// "" when neither is found.
function quotedMarkup(html: string, senderAddress: string): string {
  const lower = html.toLowerCase();
  const found: number[] = [];
  for (const re of HTML_TEXT_MARKERS) {
    const at = html.search(re);
    if (at !== -1) found.push(at);
  }
  for (const opener of HTML_QUOTE_OPENERS) {
    const at = lower.indexOf(opener);
    if (at !== -1) found.push(lower.lastIndexOf("<", at));
  }
  if (found.length === 0 && senderAddress) {
    const at = lower.indexOf(senderAddress.toLowerCase());
    if (at !== -1) found.push(at);
  }
  return found.length ? html.slice(Math.max(0, Math.min(...found))) : "";
}

// The From (else Reply-To) address in a quoted header block, lowercased.
function quotedSender(original: string): string {
  const { headerBlock } = splitHeadersBody(original);
  const value = headerValue(headerBlock, "from") || headerValue(headerBlock, "reply-to");
  const open = value.indexOf("<");
  const close = value.indexOf(">", open + 1);
  return (open !== -1 && close !== -1 ? value.slice(open + 1, close) : value).trim().toLowerCase();
}

// Find the original message inside a (possibly) forwarded email. Tries the
// high-fidelity attachment path first, then inline quotes, then falls back to
// treating the whole input as the original — or, for a known forward, to its
// body alone.
//
// The body is decoded before the marker search. Mail clients routinely send it
// base64 or quoted-printable, and searching the encoded form found no marker,
// so a forwarded scam was scored as the forwarder's own message.
export function unwrapForwarded(raw: string, opts: UnwrapOptions = {}): UnwrappedEmail {
  const attachment = findRfc822(raw);
  if (attachment) return { raw: attachment, markup: textParts(attachment).html, source: "attachment" };

  const { headerBlock } = splitHeadersBody(raw);
  const { plain, html } = textParts(raw);
  // Links are kept as their hrefs: this text is analysed, not displayed.
  const text = plain.trim() ? plain : html ? htmlToText(html, "keep") : "";

  const inline = findInline(text);
  if (inline) {
    const markup = html ? quotedMarkup(html, quotedSender(inline)) : "";

    // For a known forward, the text above the marker is the forwarder's note
    // and signature — outside the scam, and it carries the forwarder's own
    // name, address and number. Stop there.
    if (opts.forwarded) return { raw: inline, markup, source: "inline" };

    // Otherwise keep whatever preceded the marker as well, rather than
    // analysing only the quoted original. Dropping it is an evasion an attacker
    // gets for free: append "---------- Forwarded message ---------" plus an
    // innocuous block to a scam, and the real content sits ABOVE the marker and
    // is discarded. Measured at the time of the fix, that took a myGov phishing
    // email from 100/likely_scam (with its URL flagged) to 10, with the
    // malicious link gone from the analysis entirely.
    //
    // A known forward does not reopen this: the forwarder's client writes the
    // first marker, so a marker the scam planted comes after it and the text
    // above the planted one is inside the quote.
    //
    // The quoted original still leads, so header parsing — which reads the
    // FIRST header block — continues to see the original's headers rather than
    // the forwarder's. For the same reason the whole HTML part goes to
    // tracking: nothing in it is out of scope here.
    const leadIn = text.slice(0, text.indexOf(inline.split(/\r?\n/)[0] ?? "")).trim();
    return { raw: leadIn ? `${inline}\n\n${leadIn}` : inline, markup: html, source: "inline" };
  }

  // A redirect (bounce) re-sends the original with its headers intact and
  // records the redirector in Resent-* headers, so the top level IS the scam.
  const resent = /^resent-(from|sender)\s*:/im.test(headerBlock);
  if (opts.forwarded && !resent) {
    // No marker and no attachment, but the headers are still the forwarder's.
    // Analyse what they sent us — the decoded body — and nothing about them.
    return { raw: text.trim(), markup: html, source: "body" };
  }

  return { raw, markup: html, source: "toplevel" };
}
