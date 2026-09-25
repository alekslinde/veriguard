// The small slice of MIME that forwarded-email handling needs: split headers
// from body, walk multipart containers, undo Content-Transfer-Encoding, and
// turn an HTML part into readable text.
//
// Shared by forwardedEmail.ts (which must find the forward marker in a body
// the mail client base64- or quoted-printable-encoded) and emailDistiller.ts
// (which shows that body to a human). Before they shared it, only the
// distiller decoded, so a forward whose text part was base64 — the default for
// non-ASCII mail in most clients — hid its marker, and the unwrapper fell back
// to analysing the forwarder instead of the scam.
//
// Pure string work, no MIME library — auditable on one screen.

// Pull a header value (first occurrence), unfolding continuation lines.
export function headerValue(headerBlock: string, name: string): string {
  const unfolded = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}\\s*:\\s*(.*)$`, "im");
  return unfolded.match(re)?.[1].trim() ?? "";
}

// Split a raw email into its header block and body at the first blank line,
// accounting for the CRLF-or-LF separator length.
export function splitHeadersBody(raw: string): { headerBlock: string; body: string } {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx === -1) return { headerBlock: raw, body: "" };
  const sepLen = raw.slice(idx).match(/^\r?\n\r?\n/)?.[0].length ?? 2;
  return { headerBlock: raw.slice(0, idx), body: raw.slice(idx + sepLen) };
}

// Strip the boundary parameter out of a Content-Type value, honouring optional
// quoting: boundary="..." or boundary=...
export function boundaryOf(contentType: string): string {
  const m =
    contentType.match(/boundary\s*=\s*"([^"]+)"/i) ||
    contentType.match(/boundary\s*=\s*([^\s;]+)/i);
  return m ? m[1] : "";
}

// Split a multipart body into its parts, each as raw text (own headers + body).
export function multipartParts(body: string, boundary: string): string[] {
  return body
    .split(`--${boundary}`)
    .map((p) => p.replace(/^\r?\n/, "").replace(/\r?\n--\s*$/, ""))
    .filter((p) => p.trim() && p.trim() !== "--");
}

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
export function decodeBody(body: string, encoding: string): string {
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
// `links` decides what an anchor becomes. "redact" (display and storage) swaps
// it for a placeholder so a live scam link is never shown inline; "keep"
// (analysis) writes the href after the anchor text so the detector still sees
// where the link goes.
//
// NOT a sanitizer, despite the shape. It makes hostile HTML *readable*, and its
// output is only ever rendered as text, stored, or analysed — never as markup.
// The tag stripping below is defeatable on purpose-built input and known to
// be: a "</style >" with a space survives it, a nested "<scr<script>ipt>"
// leaves residue, and "&amp;lt;" decodes to "<" because the entity pass runs
// after the tag pass. That is acceptable for readability and would not be for
// safety, so if you ever need to render this output as HTML, do not reach for
// this function — escape at the render site or bring in a real sanitizer.
export function htmlToText(html: string, links: "redact" | "keep"): string {
  let s = html;
  // Remove non-content blocks entirely (including their inner text).
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "");
  s =
    links === "redact"
      ? s.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1 [scam link removed]")
      : s.replace(/<a\b[^>]*?\bhref\s*=\s*["']?([^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi, "$2 $1");
  // Block-level breaks → newlines so paragraphs survive.
  s = s.replace(/<\/(p|div|tr|h[1-6]|li|blockquote)>/gi, "\n");
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

export interface TextParts {
  // First text/plain part (or a bare body with no Content-Type), decoded.
  plain: string;
  // First text/html part, decoded but still markup.
  html: string;
}

// Walk a message to its first text/plain and first text/html parts, undoing
// the transfer encoding on each. Recurses into multipart containers but not
// into message/rfc822 — an attached original is a separate message, found by
// the caller before this runs.
export function textParts(raw: string, depth = 0): TextParts {
  const out: TextParts = { plain: "", html: "" };
  if (depth > 10) return out; // guard against pathological nesting
  const { headerBlock, body } = splitHeadersBody(raw);
  // Match the type case-insensitively, but extract the boundary from the
  // original-case value — MIME boundaries are case-sensitive.
  const ctRaw = headerValue(headerBlock, "content-type");
  const ct = ctRaw.toLowerCase();
  const cte = headerValue(headerBlock, "content-transfer-encoding");

  if (ct.startsWith("multipart/")) {
    const boundary = boundaryOf(ctRaw);
    if (!boundary) return out;
    for (const part of multipartParts(body, boundary)) {
      const inner = textParts(part, depth + 1);
      if (!out.plain) out.plain = inner.plain;
      if (!out.html) out.html = inner.html;
      if (out.plain && out.html) break;
    }
    return out;
  }
  if (ct.startsWith("text/html")) out.html = decodeBody(body, cte);
  else if (ct.startsWith("text/plain") || ct === "") out.plain = decodeBody(body, cte);
  return out;
}
