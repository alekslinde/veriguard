// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Tracking pixel detection and reverse-engineering.
//
// Scammers embed 1×1 images (or zero-size beacons) in email HTML. The moment
// any mail client renders the message the pixel is fetched, logging the
// recipient's IP, timestamp, mail client and OS — confirming the address is
// live. This module extracts those beacon URLs from a raw .eml and reverse-
// engineers them: identifying the sending platform, decoding base64/URL-
// encoded path segments, and surfacing any recipient email addresses that
// were baked into the tracking URL.
//
// Crucially, none of these URLs are ever fetched — all analysis is pure
// string processing so the pixel is never triggered.

export interface PixelAnalysis {
  url: string;
  domain: string;
  esp: string;           // identified sending platform, e.g. "Mailchimp" or "unknown"
  espReport: EspReport | null; // where to report the sender, when the ESP is known
  decodedSegments: string[]; // printable strings recovered from encoded path/query parts
  embeddedEmails: string[];  // email addresses found inside the decoded URL
  isLikelyTracking: boolean;
  notes: string[];
}

// Where a scammer's bulk-sender account can be reported. `kind` lets the UI
// choose the right affordance: a "url" opens the platform's abuse form, a
// "mailto" pre-addresses an abuse email.
export interface EspReport {
  esp: string;
  href: string;
  kind: "url" | "mailto";
}

export interface TrackingPixelReport {
  pixels: PixelAnalysis[];
  hasTrackingPixels: boolean;
  espsUsed: string[];          // de-duped list of identified platforms
  espReports: EspReport[];     // de-duped abuse-report targets, one per platform
  embeddedRecipients: string[]; // de-duped recipient addresses found across all pixels
  summary: string;             // one-line human-readable summary, "" when none found
}

// ─── ESP / bulk-sender fingerprints ──────────────────────────────────────────

// `report` is the platform's official abuse/spam report page, where known and
// stable. When omitted, the UI falls back to a mailto:abuse@<domain> built from
// the pixel's own hostname.
const ESP_SIGNATURES: Array<{ name: string; patterns: RegExp[]; report?: string }> = [
  { name: "Mailchimp",            patterns: [/list-manage\.com/i, /mailchimpapp\.com/i, /chimpstatic\.com/i], report: "https://mailchimp.com/contact/abuse/" },
  { name: "SendGrid",             patterns: [/sendgrid\.net/i, /\/wf\/open/i], report: "https://sendgrid.com/report-spam/" },
  { name: "Klaviyo",              patterns: [/trk\.klaviyo\.com/i, /a\.klaviyo\.com/i, /klaviyo\.com/i], report: "https://www.klaviyo.com/legal/abuse-policy" },
  { name: "Campaign Monitor",     patterns: [/createsend\.com/i, /cmail\d+\.com/i] },
  { name: "Constant Contact",     patterns: [/constantcontact\.com/i, /r\.constantcontact\.com/i], report: "https://www.constantcontact.com/legal/anti-spam" },
  { name: "HubSpot",              patterns: [/hubspot\.com/i, /hsmail\.net/i, /hs-analytics\.net/i], report: "https://www.hubspot.com/abuse-complaint" },
  { name: "ActiveCampaign",       patterns: [/activecampaign\.com/i, /activehosted\.com/i] },
  { name: "Amazon SES",           patterns: [/amazonses\.com/i], report: "https://aws.amazon.com/forms/report-abuse" },
  { name: "Salesforce Marketing", patterns: [/exacttarget\.com/i, /sfmc\.co/i, /salesforceiq\.com/i] },
  { name: "Mailjet",              patterns: [/mailjet\.com/i] },
  { name: "Brevo",                patterns: [/sendinblue\.com/i, /brevo\.com/i] },
  { name: "ConvertKit",           patterns: [/convertkit\.com/i, /ck\.page/i] },
  { name: "GetResponse",          patterns: [/getresponse\.com/i] },
  { name: "Infusionsoft/Keap",    patterns: [/infusionsoft\.com/i, /keap\.com/i] },
  { name: "Postmark",             patterns: [/postmarkapp\.com/i] },
  { name: "SparkPost",            patterns: [/sparkpost\.com/i, /sparkpostmail\.com/i] },
];

// Path/query patterns that strongly indicate a tracking beacon regardless of domain.
const TRACKING_PATH_RE = [
  /\/track\/open/i,
  /\/wf\/open/i,
  /\/pixel\//i,
  /\/beacon\//i,
  /\/trk\//i,
  /[?&]open=1/i,
  /\/o\/[a-z0-9_\-]{8,}/i, // e.g. /o/<recipient-token>
  /\/e\/[a-z0-9_\-]{20,}/i, // long opaque segment typical of tracking opens
];

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    const m = url.match(/https?:\/\/([^/?#\s]+)/i);
    return m ? m[1].toLowerCase() : "";
  }
}

function identifyEsp(url: string): string {
  for (const { name, patterns } of ESP_SIGNATURES) {
    if (patterns.some((p) => p.test(url))) return name;
  }
  return "unknown";
}

// Resolve where to report the sender behind a tracking pixel. Prefers the
// matched ESP's official abuse form; otherwise falls back to a generic
// mailto:abuse@<registrable-domain> built from the pixel's own hostname.
// Returns null when the URL is unusable (no host) so callers can hide the action.
function resolveEspReport(url: string): EspReport | null {
  for (const { name, patterns, report } of ESP_SIGNATURES) {
    if (patterns.some((p) => p.test(url))) {
      if (report) return { esp: name, href: report, kind: "url" };
      // Known platform, no curated form on file — abuse@ its sending domain.
      const host = domainFromUrl(url);
      if (!host) return null;
      return { esp: name, href: `mailto:abuse@${registrableDomain(host)}`, kind: "mailto" };
    }
  }
  return null;
}

// Collapse a hostname to its registrable domain (last two labels) so the abuse
// address targets the platform, not a per-campaign tracking subdomain
// (e.g. trk.us17.list-manage.com → list-manage.com).
function registrableDomain(host: string): string {
  const labels = host.split(".").filter(Boolean);
  return labels.length <= 2 ? host : labels.slice(-2).join(".");
}

// Attempt base64url and percent-decode on each path segment and query value.
// Returns only strings that are entirely printable ASCII (garbage-free results).
function decodeUrlSegments(url: string): string[] {
  const candidates: string[] = [];

  const tryBase64 = (s: string) => {
    if (s.length < 8) return;
    try {
      const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      const decoded = atob(padded);
      if (/^[\x20-\x7E]+$/.test(decoded)) candidates.push(decoded);
    } catch {
      // not valid base64 — skip silently
    }
  };

  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const qValues = [...u.searchParams.values()];

    for (const seg of [...segments, ...qValues]) {
      tryBase64(seg);
      const pct = (() => { try { return decodeURIComponent(seg); } catch { return seg; } })();
      if (pct !== seg && /^[\x20-\x7E]+$/.test(pct)) candidates.push(pct);
      // URLSearchParams already decodes %xx — include the value directly so
      // percent-encoded emails (e.g. victim%40example.com → victim@example.com)
      // are not silently dropped when pct === seg.
      else if (/^[\x20-\x7E]+$/.test(seg)) candidates.push(seg);
    }
  } catch {
    // URL constructor failed (malformed) — fall back to splitting on delimiters
    for (const seg of url.split(/[/?=&#]/)) {
      tryBase64(seg);
    }
  }

  return [...new Set(candidates)];
}

function extractEmailsFrom(texts: string[]): string[] {
  const found = new Set<string>();
  for (const t of texts) {
    for (const m of t.matchAll(new RegExp(EMAIL_RE.source, "g"))) {
      found.add(m[0].toLowerCase());
    }
  }
  return [...found];
}

function isTrackingUrl(url: string): boolean {
  return TRACKING_PATH_RE.some((re) => re.test(url)) || identifyEsp(url) !== "unknown";
}

// ─── Public API ──────────────────────────────────────────────────────────────

// Extract candidate tracking-pixel URLs from a raw email source.
// Considers: 1×1 or 0×0 <img> tags, <img> tags whose src matches known
// tracking path patterns, and any URL in the body matching those patterns
// (covers CSS background-image, link preloads, etc.).
// Never fetches anything.
export function extractPixelUrls(emailSource: string): string[] {
  const found = new Set<string>();

  // Scan all <img> tags.
  const imgRe = /<img\b[^>]*?>/gis;
  const srcRe = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i;

  for (const imgMatch of emailSource.matchAll(imgRe)) {
    const tag = imgMatch[0];
    const srcMatch = tag.match(srcRe);
    if (!srcMatch) continue;
    const url = (srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "").trim();
    if (!url.startsWith("http")) continue;

    const is1x1 =
      /\bwidth\s*=\s*["']?\s*[01]\s*["']?/i.test(tag) ||
      /\bheight\s*=\s*["']?\s*[01]\s*["']?/i.test(tag) ||
      /width\s*:\s*[01]px/i.test(tag) ||
      /height\s*:\s*[01]px/i.test(tag);

    if (is1x1 || isTrackingUrl(url)) found.add(url);
  }

  // Also catch tracking URLs embedded outside <img> (e.g., preload links).
  const genericRe = /https?:\/\/[^\s"'<>()[\]{}]+/gi;
  for (const m of emailSource.matchAll(genericRe)) {
    const url = m[0].replace(/[.,;>)\]]+$/, ""); // strip trailing punctuation
    if (!found.has(url) && isTrackingUrl(url)) found.add(url);
  }

  return [...found];
}

// Analyse a single tracking-pixel URL without fetching it.
export function analysePixelUrl(url: string): PixelAnalysis {
  const domain = domainFromUrl(url);
  const esp = identifyEsp(url);
  const espReport = resolveEspReport(url);
  const decodedSegments = decodeUrlSegments(url);
  const embeddedEmails = extractEmailsFrom([url, ...decodedSegments]);
  const isLikelyTracking = isTrackingUrl(url);

  const notes: string[] = [];
  if (esp !== "unknown") {
    notes.push(`Sent through ${esp} — the scammer has an account on this platform that can be reported`);
  }
  if (embeddedEmails.length > 0) {
    notes.push(`Recipient address encoded in the pixel URL: ${embeddedEmails.join(", ")} — opening this email confirmed your address to the sender`);
  } else if (isLikelyTracking) {
    notes.push("Opening this email notified the sender — the pixel was fetched the moment the message rendered");
  }

  return { url, domain, esp, espReport, decodedSegments, embeddedEmails, isLikelyTracking, notes };
}

// Full tracking-pixel analysis for a raw email source.
export function analyseTrackingPixels(rawEmail: string): TrackingPixelReport {
  const pixelUrls = extractPixelUrls(rawEmail);
  const pixels = pixelUrls.map(analysePixelUrl);
  const espsUsed = [...new Set(pixels.map((p) => p.esp).filter((e) => e !== "unknown"))];
  const espReports = [...new Map(
    pixels.map((p) => p.espReport).filter((r): r is EspReport => r !== null).map((r) => [r.esp, r]),
  ).values()];
  const embeddedRecipients = [...new Set(pixels.flatMap((p) => p.embeddedEmails))];

  let summary = "";
  if (pixels.length > 0) {
    const count = pixels.length === 1 ? "1 tracking pixel" : `${pixels.length} tracking pixels`;
    const platform = espsUsed.length > 0 ? ` via ${espsUsed.join(", ")}` : "";
    const recipient = embeddedRecipients.length > 0
      ? ` — recipient address baked in: ${embeddedRecipients[0]}${embeddedRecipients.length > 1 ? ` (+${embeddedRecipients.length - 1} more)` : ""}`
      : "";
    summary = `${count} detected${platform}${recipient}`;
  }

  return { pixels, hasTrackingPixels: pixels.length > 0, espsUsed, espReports, embeddedRecipients, summary };
}
