// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Share-target payload → check-box content.
//
// The PWA manifest registers a `share_target`, so "Veriguard" appears
// in the Android/iOS share sheet from Messages, WhatsApp, Mail, a browser — any
// app that can share text. The platform hands us the shared item as query
// params on a GET navigation, and this turns that into the string the check box
// should open with.
//
// PRIVACY: nothing here is sent anywhere. The payload lands in the client, is
// seeded into the existing check flow, and is analysed exactly like typed text
// — the same client-side-first path, with no share-specific logging. The URL is
// scrubbed from the address bar after reading (see ShareTargetSeed) so a shared
// scam does not sit in browser history or leak through a screenshot.
//
// Pure module: no React, no I/O. Shared by app/share/page.tsx (reads it) and
// its tests.

// The three params the Web Share Target spec defines for text sharing. Which
// one carries the payload is app-dependent and inconsistent in practice:
// browsers sharing a page tend to fill `url` (and put the page title in
// `title`), while messaging apps sharing a selection put everything in `text`
// — sometimes with the URL appended inside it.
export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export interface ShareContent {
  /** What the check box opens with. "" when nothing usable was shared. */
  content: string;
  /**
   * True when the shared body was longer than we carry and was cut. Surfaced to
   * the user rather than swallowed: a silently half-checked message reads as
   * "we checked all of this", which is the false reassurance the whole app
   * exists to avoid.
   */
  truncated: boolean;
}

// Generous next to reportPrefill's 300: a shared SMS or email body is the
// point here, not an extracted identifier. Long enough for a full scam message,
// bounded so a crafted share can't stuff the textarea (or exceed what browsers
// will carry in a GET URL, which is the real ceiling anyway).
const MAX_SHARE_LEN = 5000;

// Reserved for the shared `url` so a long body can never crowd it out. The url
// is the highest-signal field we get — see buildShareContent.
const MAX_URL_LEN = 600;

function clean(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

/**
 * Is `url` already present in `text` as a complete link, rather than as the
 * prefix of a longer one?
 *
 * A plain `text.includes(url)` is wrong: sharing
 * `{text: "see https://evil.tk/pay-now", url: "https://evil.tk/pay"}` would
 * treat the shorter url as already present and drop it, so the link the user
 * actually shared is never analysed. The match only counts when what follows
 * the occurrence is a boundary — end of string, whitespace, or punctuation
 * that cannot continue a URL.
 */
function containsUrl(text: string, url: string): boolean {
  let from = 0;
  for (;;) {
    const at = text.indexOf(url, from);
    if (at === -1) return false;
    const next = text[at + url.length];
    // End of string, whitespace, or a character that reads as sentence
    // punctuation rather than a continuation of the path. Trailing `.`/`,`/`!`
    // etc. are ordinary prose around a pasted link, so the url still counts as
    // present; `-` or an alphanumeric means we matched a prefix of a DIFFERENT,
    // longer link and must not treat it as present.
    if (next === undefined || /[\s<>"')\];,.!?]/.test(next)) return true;
    from = at + 1;
  }
}

/**
 * Build the check-box content from a share-target payload.
 *
 * Order matters and is deliberate:
 *
 * - `text` is the richest field — a shared message body — so it leads.
 * - `url` is appended only when `text` does not already contain it. Chrome
 *   shares a page as `{title, url}`, but many apps share a selection as
 *   `{text}` with the link already inside; blindly concatenating would hand
 *   the detector the same URL twice.
 * - `title` is dropped when either of the others is present. It is the page or
 *   conversation name, not the suspicious content, and including it adds words
 *   the scoring would weigh as if the sender had written them. It is used only
 *   as a last resort, when it is the sole thing we were given.
 *
 * Returns "" when there is nothing usable, which the caller renders as the
 * ordinary empty check box rather than an error.
 *
 * The result also reports whether anything was dropped, so the UI can say so
 * rather than silently half-checking a long message — the scam link is often in
 * the footer of a forwarded email, which is exactly what a silent tail-trim
 * discards.
 */
export function buildShareContent(payload: SharePayload): ShareContent {
  const text = clean(payload.text);
  const url = clean(payload.url);
  const title = clean(payload.title);

  // The url is appended last but must never be the part that gets clipped: it
  // is the single highest-signal field, and a half-clipped one is worse than
  // absent because it can parse as a different host. Reserve its budget first,
  // then give the body whatever remains.
  const appendUrl = url && url.length <= MAX_URL_LEN && !containsUrl(text, url) ? url : "";
  const separator = appendUrl ? "\n\n" : "";
  const bodyBudget = MAX_SHARE_LEN - appendUrl.length - separator.length;

  let body = text;
  let truncated = false;
  if (body.length > bodyBudget) {
    body = body.slice(0, bodyBudget);
    truncated = true;
  }

  const parts: string[] = [];
  if (body) parts.push(body);
  if (appendUrl) parts.push(appendUrl);

  // Only when we got nothing else — see the note above on why the title is not
  // mixed into real content.
  if (parts.length === 0 && title) parts.push(title.slice(0, MAX_SHARE_LEN));

  return { content: parts.join("\n\n"), truncated };
}

/** Read a share payload out of a URLSearchParams-like source. */
export function parseSharePayload(params: {
  get(name: string): string | null;
}): SharePayload {
  return {
    title: params.get("title") ?? undefined,
    text: params.get("text") ?? undefined,
    url: params.get("url") ?? undefined,
  };
}
