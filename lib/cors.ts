// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Cross-origin access control for the public API.
//
// Until now every route was same-origin only — no CORS headers at all, so a
// browser blocked any cross-origin read. That is the correct default and it
// stays the default: this module opens exactly one route to exactly the origins
// named in configuration, and nothing else changes.
//
// The consumer this exists for is the WebExtension (roadmap Phase 2b). An
// extension's fetch sends `Origin: chrome-extension://<id>` (or
// `moz-extension://<uuid>` on Firefox), and those identifiers are not knowable
// until the extension is packaged and published. So the allowlist is
// configuration rather than code, and it is **empty by default**: a deployment
// that sets nothing trusts only its own site origin, which is exactly today's
// behaviour.
//
// What this deliberately does NOT do:
//
//   · No wildcard, ever — not `*`, and not "any chrome-extension:// origin".
//     Matching the scheme rather than the id would let every extension on a
//     user's machine call this API from that user's browser, with their IP and
//     their rate-limit budget. There is no upside to trade against that.
//   · No credentials. `Access-Control-Allow-Credentials` is never sent, so a
//     cross-origin caller cannot ride on a user's cookies. The API is
//     unauthenticated; nothing here should imply otherwise.
//   · No effect on the write paths. `/api/report`, `/api/bug` and `/api/ocr`
//     stay same-origin, so their abuse defences keep the exposure they were
//     designed against.

import { SITE_URL } from "@/lib/siteUrl";

/**
 * Origins permitted to call the CORS-enabled routes, lowest-friction first:
 *
 *   1. The site's own origin — same-origin requests do not carry `Origin` at
 *      all for simple GETs, but a same-site fetch from a different subdomain
 *      does, and the canonical origin is always legitimate.
 *   2. `CORS_ALLOWED_ORIGINS` — comma-separated, empty by default. This is
 *      where an extension id goes once the extension is published.
 *
 * Parsed once at module load: the value comes from the environment and cannot
 * change between requests, and re-parsing per request would be wasted work on
 * the hot path.
 */
/** Serialised-origin form: no trailing slash, which is what a browser sends. */
function normalise(origin: string): string {
  return origin.replace(/\/+$/, "");
}

function parseAllowedOrigins(): Set<string> {
  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    // A trailing slash is the most common way to write an origin wrongly, and
    // it never matches: browsers send the serialised origin with no path.
    // Normalising is friendlier than silently refusing a plausible-looking
    // config value.
    .map(normalise);

  return new Set([normalise(SITE_URL), ...configured]);
}

/**
 * Resolved per call rather than captured at module load.
 *
 * CORS_ALLOWED_ORIGINS is a runtime variable (no NEXT_PUBLIC_ prefix), so a
 * deployment can legitimately set it without a rebuild — and SITE_URL resolves
 * from the environment too. Freezing the set at import time meant a build that
 * ran without NEXT_PUBLIC_SITE_URL baked `http://localhost:3000` in as the
 * "site's own origin", making the documented guarantee false in production
 * while every test still passed. The parse is a split over a short string; a
 * cache keyed on the env value would cost more complexity than it saves.
 */
function allowlist(): Set<string> {
  return parseAllowedOrigins();
}

/** The configured allowlist. Exported for tests and for the health check. */
export function allowedOrigins(): ReadonlySet<string> {
  return allowlist();
}

/**
 * The allowlist entry matching `origin`, or null.
 *
 * Returns the *stored* entry rather than a boolean so callers echo back the
 * normalised form. Echoing the caller's raw value instead reintroduces
 * whatever it was normalised away from — a request from "https://app.example/"
 * matched the allowlist and was then answered with a trailing-slash
 * Access-Control-Allow-Origin, which no browser matches against its own
 * serialised origin. The lenient match produced a silently blocked request,
 * which is worse than an honest refusal.
 */
function matchOrigin(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const candidate = normalise(origin);
  return allowlist().has(candidate) ? candidate : null;
}

/**
 * Whether `origin` may call a CORS-enabled route.
 *
 * A missing origin is *not* allowed-by-default here — callers decide what to do
 * with a same-origin request, which carries no `Origin` header. Keeping this
 * function strictly about the allowlist means it cannot accidentally authorise
 * a header-less cross-origin request.
 */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  return matchOrigin(origin) !== null;
}

/**
 * CORS response headers for a request from `origin`, or an empty object when
 * the origin is not allowed.
 *
 * Returning nothing for a disallowed origin is the whole enforcement mechanism:
 * the browser refuses to expose a response that lacks
 * `Access-Control-Allow-Origin`. The request still reaches the handler and is
 * still rate-limited, which is deliberate — CORS is a browser policy, not a
 * server firewall, and treating it as one would be a false comfort. Anything
 * that must not be reachable by a non-browser client needs a different control.
 */
export function corsHeaders(origin: string | null | undefined): Record<string, string> {
  const matched = matchOrigin(origin);

  // Vary is unconditional, and that is the point: it describes the *route*, not
  // this response. A route whose output depends on Origin must say so on every
  // response, including the ones carrying no Allow-Origin — otherwise a shared
  // cache has no signal that the URL varies, and may hand an allowed origin's
  // cached response, Allow-Origin header included, to a different origin.
  if (matched === null) return { Vary: "Origin" };

  return {
    // The matched entry, not the caller's raw string: see matchOrigin. Echoing
    // a specific origin rather than "*" is what makes the allowlist mean
    // anything.
    "Access-Control-Allow-Origin": matched,
    Vary: "Origin",
  };
}

/**
 * Headers for a CORS preflight (`OPTIONS`) response.
 *
 * A preflight is sent when the request is not "simple" — and a JSON POST is
 * not, because of its `Content-Type`. So every extension check will preflight
 * before the real request, and a route that answers only POST would fail with a
 * 405 before the browser ever sends it.
 */
export function corsPreflightHeaders(
  origin: string | null | undefined,
  methods: string[],
): Record<string, string> {
  const base = corsHeaders(origin);
  // Keyed on the Allow-Origin header rather than on the object being empty:
  // corsHeaders always returns at least Vary now, so an emptiness check would
  // silently start authorising every preflight.
  if (!base["Access-Control-Allow-Origin"]) return base;
  return {
    ...base,
    "Access-Control-Allow-Methods": [...methods, "OPTIONS"].join(", "),
    // Only what the client actually needs to send. Reflecting
    // Access-Control-Request-Headers verbatim would let a caller pre-authorise
    // any header it likes, which defeats the point of naming them.
    "Access-Control-Allow-Headers": "Content-Type",
    // Cache the preflight so a burst of checks costs one OPTIONS, not one per
    // request. 24h is the Chromium cap; Firefox caps lower and will clamp.
    "Access-Control-Max-Age": "86400",
  };
}
