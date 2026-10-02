// SPDX-FileCopyrightText: 2026 Aleks Linde
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

import { isAllowedOrigin } from "./cors";

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
