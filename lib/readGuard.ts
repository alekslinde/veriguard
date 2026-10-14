// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Cost controls for the public read endpoints.
//
// Deliberately NOT in lib/cors.ts, and the separation is the point. That module
// is the permissive one: importing it means "this route is being opened to
// cross-origin callers", and an invariant test asserts no other route imports
// it so that opening can never happen by copying an import. This module is the
// opposite — it *restricts* — so putting it there would make that invariant
// unreadable, and would eventually let a real CORS opening hide behind a
// plausible-looking import.
//
// What these guard is the free-tier budget, not confidentiality. The
// submissions feed is PII-scrubbed and already published at /submissions;
// nothing here is protecting secrets. It protects the row-read quota, because
// every feed call runs two queries and an unthrottled endpoint is the cheapest
// way for one script to take the site down for everyone.

import { NextResponse } from "next/server";
import { isAllowedOrigin } from "./cors";
import { checkAndRecordRateLimit } from "./reportStore";
import { clientIpFromHeaders } from "./geo";

/**
 * Whether a request may read a same-origin-only route.
 *
 * **This is a cost control, not a security boundary.** `Origin` and `Referer`
 * are set by browsers and trivially forged by anything else — `curl -H
 * "Origin: …"` walks straight past it. What it stops is the realistic case:
 * another site's JavaScript, or a casual script, pulling the feed repeatedly
 * and spending the read budget. A determined caller is bounded by the rate
 * limit behind it, not by this.
 *
 * The rules, in order:
 *
 *   1. No `Origin` and no `Referer` — allowed. A same-origin navigation or a
 *      simple GET sends neither, and so does the server rendering its own page.
 *      Refusing here would break the site.
 *   2. An `Origin` on the allowlist (the site, plus CORS_ALLOWED_ORIGINS) —
 *      allowed, so a published extension keeps working once configured.
 *   3. A `Referer` whose origin is on the allowlist — allowed. Some browsers
 *      omit `Origin` on same-site GETs but still send `Referer`.
 *   4. Anything else — refused.
 *
 * Rule 1 is the deliberate hole. Closing it would mean rejecting the site's own
 * requests, and a cost control that breaks the product is not a trade worth
 * making.
 */
export function isSameOriginRead(headers: Headers): boolean {
  const origin = headers.get("origin");
  const referer = headers.get("referer");

  if (!origin && !referer) return true;
  // Origin is checked first and alone: a forged Referer must not launder a
  // foreign Origin.
  if (origin) return isAllowedOrigin(origin);

  try {
    return isAllowedOrigin(new URL(referer!).origin);
  } catch {
    // An unparseable Referer is not evidence of anything good.
    return false;
  }
}

/**
 * The prose a throttled caller sees when a route does not word it itself.
 *
 * One definition because it was three identical copies, and a reworded or
 * translated copy should not become a fourth variant by accident. Routes whose
 * refusal names what was throttled ("checks", "images") pass their own.
 */
export const RATE_LIMITED_MESSAGE =
  "Too many requests — give it a few minutes and try again.";

/**
 * The 429 body and headers shared by every throttled route.
 *
 * `code` rather than prose alone: clients branch on it to tell the reader to
 * wait rather than retry, and matching on a message string breaks the moment it
 * is reworded or translated.
 *
 * `Cache-Control: no-store` is not optional. A stored 429 is served to every
 * client behind the same CDN node, which turns a per-IP limit into an outage for
 * all of them — so the header belongs with the status rather than at each call
 * site, where it was once omitted. Extra headers (CORS, `Vary`) are merged in
 * by callers that need them.
 */
export function rateLimitedResponse(
  message: string = RATE_LIMITED_MESSAGE,
  headers: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: message, code: "rate_limited" },
    { status: 429, headers: { ...headers, "Cache-Control": "no-store" } },
  );
}

/**
 * Throttle an identified caller on the shared read budget.
 *
 * Returns a 429 to return, or `null` to carry on — so a route reads as
 * `const limited = rateLimitRead(...); if (limited) return limited;` and cannot
 * check the budget without acting on the answer.
 *
 * **An "unknown" IP is deliberately not throttled.** Every unidentifiable
 * caller shares one bucket, so keying on it would take the endpoint down for all
 * of them at once — turning a cost control into an availability bug, which is a
 * strictly worse failure than the one it guards against. That is safe here
 * because it is never the only control: the origin guard above still applies and
 * the edge cache absorbs the volume. The platform sets the header in production,
 * so this is the degraded path rather than the normal one.
 *
 * Routes that must charge every caller, identified or not — `/api/check`, where
 * analysis is the expensive part and there is no cache behind it — call
 * `checkAndRecordRateLimit` directly instead.
 */
export function rateLimitRead(
  headers: Headers,
  namespace: string,
  limit: number,
  extraHeaders: Record<string, string> = {},
): NextResponse | null {
  const ip = clientIpFromHeaders(headers);
  if (ip === "unknown") return null;
  if (checkAndRecordRateLimit(`${namespace}:${ip}`, limit)) return null;
  return rateLimitedResponse(RATE_LIMITED_MESSAGE, extraHeaders);
}
