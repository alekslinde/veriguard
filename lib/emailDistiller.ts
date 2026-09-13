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

import { unwrapForwarded, splitHeadersBody } from "@/lib/forwardedEmail";

// Headers worth showing a human: who it's from, who it claims to reply to, what
// it's about, when it arrived. Everything else is transport/auth/MIME plumbing.
// Lowercased for case-insensitive matching.
const KEEP_HEADERS = ["from", "reply-to", "to", "subject", "date"];

// Decode quoted-printable: "=3D" → "=", soft line breaks ("=" at end of line)
// removed, "=XX" hex escapes → their byte. Good enough for the us-ascii/utf-8
// text bodies real mail clients emit; we decode per-byte then UTF-8 decode.
function decodeQuotedPrintable(input: string): string {
  // Soft line breaks: an "=" immediately before CRLF/LF is a wrap, not content.
  const unwrapped = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < unwrapped.length; i++) {
    const ch = unwrapped[i];
    if (ch === "=" && i + 2 < unwrapped.length) {
      const hex = unwrapped.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    // Push the char's bytes (charCodeAt is fine for the ASCII these bodies use;
    // any multi-byte UTF-8 already arrived as raw bytes in the source string).
    bytes.push(ch.charCodeAt(0) & 0xff);
  }
  try {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  } catch {
    return unwrapped; // fall back to the soft-unwrapped text
  }
}

// Decode a part body according to its Content-Transfer-Encoding header value.
function decodeBody(body: string, encoding: string): string {
  const enc = encoding.trim().toLowerCase();
  if (enc === "quoted-printable") return decodeQuotedPrintable(body);
  if (enc === "base64") {
    try {
      // Whitespace isn't valid base64 input; strip the MIME line wrapping.
      const clean = body.replace(/\s+/g, "");
      const binary = atob(clean);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return body;
    }
  }
  return body; // 7bit / 8bit / binary / absent — already text
}

// Convert an HTML body to readable plain text: drop <style>/<script>/<head>
// blocks and MSO conditional comments wholesale, turn <a> links and block
// elements into something legible, strip remaining tags, decode basic entities,
// and collapse the blank-line storm Word/Outlook HTML produces.
//
// NOT a sanitizer, despite the shape. It makes hostile HTML *readable*, and its
// output is only ever rendered as text or stored — never as markup. The tag
// stripping below is defeatable on purpose-built input and known to be: a
// "</style >" with a space survives it, a nested "<scr<script>ipt>" leaves
// residue, and "&amp;lt;" decodes to "<" because the entity pass runs after the
// tag pass. That is acceptable for readability and would not be for safety, so
// if you ever need to render this output as HTML, do not reach for this
// function — escape at the render site or bring in a real sanitizer.
function htmlToText(html: string): string {
  let s = html;
  // Remove non-content blocks entirely (including their inner text).
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "");
  // Links: replace the whole anchor with its visible text + a link placeholder.
  // The actual URL is captured separately into the report's "Scam URL" field, so
  // we never store/show the live malicious link inline.
  s = s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1 [scam link removed]");
  // Block-level breaks → newlines so paragraphs survive.
  s = s.replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n");
  s = s.replace(/<br\b[^>]*>/gi, "\n");
  // Strip every remaining tag.
  s = s.replace(/<[^>]+>/g, "");
  // Decode the handful of entities Outlook emits.
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
  // Collapse runs of blank lines and trailing spaces.
  s = s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

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

// Pull a header value (first occurrence, unfolded) from a part's header block.
function partHeader(headerBlock: string, name: string): string {
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}\\s*:\\s*(.*)$`, "im");
  return unfolded.match(re)?.[1].trim() ?? "";
}

function boundaryOf(contentType: string): string {
  const m =
    contentType.match(/boundary\s*=\s*"([^"]+)"/i) ||
    contentType.match(/boundary\s*=\s*([^\s;]+)/i);
  return m ? m[1] : "";
}

function multipartParts(body: string, boundary: string): string[] {
  return body
    .split(`--${boundary}`)
    .map((p) => p.replace(/^\r?\n/, "").replace(/\r?\n--\s*$/, ""))
    .filter((p) => p.trim() && p.trim() !== "--");
}

// Walk a message into readable body text. Prefers a text/plain part; otherwise
// falls back to a text/html part rendered to text. Recurses into multipart
// containers. Returns "" when no textual part is found.
function extractReadableBody(raw: string, depth = 0): string {
  if (depth > 10) return "";
  const { headerBlock, body } = splitHeadersBody(raw);
  const ctRaw = partHeader(headerBlock, "content-type");
  const ct = ctRaw.toLowerCase();
  const cte = partHeader(headerBlock, "content-transfer-encoding");

  if (ct.startsWith("multipart/")) {
    const boundary = boundaryOf(ctRaw);
    if (!boundary) return "";
    const parts = multipartParts(body, boundary);
    // Prefer plain text; remember an HTML fallback if that's all we get.
    let htmlFallback = "";
    for (const part of parts) {
      const text = extractReadableBody(part, depth + 1);
      if (!text) continue;
      const partCt = partHeader(splitHeadersBody(part).headerBlock, "content-type").toLowerCase();
      if (partCt.startsWith("text/html")) {
        if (!htmlFallback) htmlFallback = text;
        continue;
      }
      return text; // a text/plain (or other non-html text) part wins
    }
    return htmlFallback;
  }

  if (ct.startsWith("text/html")) {
    return redactUrls(htmlToText(decodeBody(body, cte)));
  }
  // text/plain, or a bare body with no Content-Type (treat as text).
  if (ct.startsWith("text/plain") || ct === "") {
    return redactUrls(decodeBody(body, cte).trim());
  }
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
