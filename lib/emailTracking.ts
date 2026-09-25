// Broad email-tracking analysis — the superset of trackingPixel.ts.
//
// Tracking pixels (1×1 <img> beacons) are just one of several ways an email can
// phone home the moment it's opened. This module detects the others, all from
// the raw .eml source and WITHOUT FETCHING ANYTHING — pure string analysis, so
// no beacon is ever triggered by our looking at it:
//
//   • pixels            — delegated to analyseTrackingPixels (the original case)
//   • click redirects   — links routed through a known ESP redirect domain
//   • unique-per-recipient URLs — long opaque tokens repeated across links
//   • CSS resources     — background-image / @import url(...) in style blocks
//   • read receipts      — Disposition-Notification-To / Return-Receipt-To headers
//   • external resources — <link rel="stylesheet|preload|prefetch"> off-domain
//   • audio/video        — <audio|video src=...> auto-loaded by some clients
//   • meta refresh       — <meta http-equiv="refresh" ...> auto-navigation
//
// The .eml upload / forward paths in this app NEVER render the HTML, so none of
// these fire for the user — that reassurance is worth showing in the UI.

import { analyseTrackingPixels, TrackingPixelReport } from "@/lib/trackingPixel";
import { splitHeadersBody } from "@/lib/mime";

export type TrackingKind =
  | "pixel"
  | "click-redirect"
  | "unique-url"
  | "css-resource"
  | "read-receipt"
  | "external-resource"
  | "av-resource"
  | "meta-refresh";

export interface TrackingFinding {
  kind: TrackingKind;
  label: string;   // short human label, e.g. "Click-tracking redirects"
  detail: string;  // one-line explanation of what was found / what it means
  count: number;   // how many distinct instances were found
}

export interface EmailTrackingReport {
  findings: TrackingFinding[];
  hasTracking: boolean;
  // The underlying pixel analysis, preserved so existing consumers (verdict
  // composition, ESP report links) keep working unchanged.
  pixelReport: TrackingPixelReport;
  summary: string; // one-line human-readable roll-up, "" when nothing found
}

// ─── Detection signals (mirrors the spec's static-detection table) ───────────

// ESP redirect/click-tracking HOSTNAMES — clicking any link on one of these is
// logged before you reach the real destination. These are matched against the
// URL's hostname ONLY (not the path), so a benign link whose PATH happens to
// contain "click" or "tracking" (e.g. /help/click.html) is not flagged.
const CLICK_REDIRECT_HOSTS = [
  /(^|\.)click\.sendgrid\.net$/i,
  /(^|\.)clicks?\.[a-z0-9\-]+\.[a-z]{2,}$/i,  // click.* / clicks.* subdomains
  /(^|\.)links?\.[a-z0-9\-]+\.[a-z]{2,}$/i,   // link(s).<brand>.<tld>
  /(^|\.)trk\.klaviyo\.com$/i,
  /(^|\.)tracking\.[a-z0-9\-]+\.[a-z]{2,}$/i, // tracking.* subdomains
  /(^|\.)list-manage\.com$/i,
  /(^|\.)sendgrid\.net$/i,
  /(^|\.)mandrillapp\.com$/i,
  /(^|\.)sparkpostmail\.com$/i,
  /(^|\.)createsend\d*\.com$/i,
  /(^|\.)ablink\.[a-z0-9\-]+\.[a-z]{2,}$/i,   // "action blink" redirect host
];

// Click-tracking ENDPOINT paths that identify a redirect regardless of host.
const CLICK_REDIRECT_PATHS = [
  /\/ls\/click\?/i,          // SharpSpring / Pardot style click endpoint
];

// A long opaque token: 32+ chars of hex or base64url. When the SAME token shape
// recurs across multiple links it's almost certainly a per-recipient id.
const OPAQUE_TOKEN_RE = /[A-Za-z0-9_\-]{32,}/;

// Hostname of a URL, lowercased; "" when unparseable. Used to anchor the
// click-redirect host patterns so they can't match inside a path.
function hostOf(url: string): string {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

// Pull every href/src/url(...) link out of the body for link-level checks.
function extractLinks(body: string): string[] {
  const links = new Set<string>();
  const reList = [
    /\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi,
    /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi,
    /url\(\s*(?:"([^"]+)"|'([^']+)'|([^)]+))\s*\)/gi,
  ];
  for (const re of reList) {
    for (const m of body.matchAll(re)) {
      const url = (m[1] ?? m[2] ?? m[3] ?? "").trim();
      if (/^https?:\/\//i.test(url)) links.add(url);
    }
  }
  return [...links];
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function analyseEmailTracking(rawEmail: string): EmailTrackingReport {
  const { headerBlock, body } = splitHeadersBody(rawEmail);
  const links = extractLinks(body);
  const findings: TrackingFinding[] = [];

  // 1. Pixels — reuse the dedicated analyser.
  const pixelReport = analyseTrackingPixels(rawEmail);
  if (pixelReport.hasTrackingPixels) {
    findings.push({
      kind: "pixel",
      label: "Tracking pixels",
      detail: pixelReport.summary || "Invisible image beacon that confirms the email was opened",
      count: pixelReport.pixels.length,
    });
  }

  // 2. Click-tracking redirects — match the hostname against known redirect
  //    hosts, or the URL against a known click-endpoint path.
  const redirectLinks = links.filter((u) => {
    const host = hostOf(u);
    return (host && CLICK_REDIRECT_HOSTS.some((re) => re.test(host))) ||
      CLICK_REDIRECT_PATHS.some((re) => re.test(u));
  });
  if (redirectLinks.length > 0) {
    findings.push({
      kind: "click-redirect",
      label: "Click-tracking redirects",
      detail: "Links route through the sender's server first, logging your IP and the time you click — even on “unsubscribe”",
      count: redirectLinks.length,
    });
  }

  // 3. Unique-per-recipient URLs — the same long opaque token recurring across
  //    links identifies you on arrival even without a redirect.
  const tokenCounts = new Map<string, number>();
  for (const u of links) {
    const m = u.match(OPAQUE_TOKEN_RE);
    if (m) tokenCounts.set(m[0], (tokenCounts.get(m[0]) ?? 0) + 1);
  }
  const recurringToken = [...tokenCounts.values()].some((n) => n >= 2);
  if (recurringToken) {
    findings.push({
      kind: "unique-url",
      label: "Unique-per-recipient links",
      detail: "A recipient id is baked into the links, so opening or clicking identifies you specifically",
      count: [...tokenCounts.values()].filter((n) => n >= 2).length,
    });
  }

  // 4. CSS external resources — background-image / @import.
  const cssMatches = [
    ...body.matchAll(/background(?:-image)?\s*:\s*url\(/gi),
    ...body.matchAll(/@import\s+url\(/gi),
  ];
  if (cssMatches.length > 0) {
    findings.push({
      kind: "css-resource",
      label: "CSS tracking beacons",
      detail: "Remote images loaded via CSS bypass image-blocking — most clients fetch CSS before you read the message",
      count: cssMatches.length,
    });
  }

  // 5. Read receipts — explicit open-confirmation headers.
  const receiptHeaders = [
    /^disposition-notification-to\s*:/im,
    /^return-receipt-to\s*:/im,
    /^x-confirm-reading-to\s*:/im,
  ].filter((re) => re.test(headerBlock));
  if (receiptHeaders.length > 0) {
    findings.push({
      kind: "read-receipt",
      label: "Read-receipt request",
      detail: "The email asks your mail client to confirm when you open it — some clients (e.g. corporate Outlook) comply silently",
      count: receiptHeaders.length,
    });
  }

  // 6. External resources via <link rel="stylesheet|preload|prefetch">.
  const linkTags = [...body.matchAll(/<link\b[^>]*\brel\s*=\s*["']?(stylesheet|preload|prefetch)["']?[^>]*>/gi)];
  if (linkTags.length > 0) {
    findings.push({
      kind: "external-resource",
      label: "External stylesheet/preload",
      detail: "Linked fonts or stylesheets that some clients fetch automatically before you open the email",
      count: linkTags.length,
    });
  }

  // 7. Audio/video tags with a remote src.
  const avTags = [...body.matchAll(/<(?:audio|video)\b[^>]*\bsrc\s*=\s*["']?https?:/gi)];
  if (avTags.length > 0) {
    findings.push({
      kind: "av-resource",
      label: "Auto-loading audio/video",
      detail: "Media elements that a subset of clients fetch on render — used in targeted campaigns",
      count: avTags.length,
    });
  }

  // 8. Meta refresh — auto-navigation that both confirms the open and redirects.
  const metaRefresh = [...body.matchAll(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi)];
  if (metaRefresh.length > 0) {
    findings.push({
      kind: "meta-refresh",
      label: "Meta refresh redirect",
      detail: "A page-refresh directive that some clients act on automatically, confirming the open and redirecting you",
      count: metaRefresh.length,
    });
  }

  const hasTracking = findings.length > 0;
  const summary = hasTracking
    ? `${findings.length} tracking mechanism${findings.length === 1 ? "" : "s"} found: ${findings.map((f) => f.label.toLowerCase()).join(", ")}`
    : "";

  return { findings, hasTracking, pixelReport, summary };
}
