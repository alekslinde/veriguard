// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Shared request builders for the API route tests.
//
// Every route test needs the same two things before it can assert anything: a
// NextRequest it can hand the handler, and a caller identity the route's
// module-level rate limiter will not throttle. Both were hand-rolled per file —
// ten copies of `new NextRequest(...)` and four of an `ipCounter` — and the
// copies had drifted: three files allocated from the same `10.1.0.x` prefix,
// which is only safe while vitest isolates module registries per file. That is
// the default, so it was not a live bug, but it was a property no file stated
// and none owned. Allocating from one place removes the question.

import { NextRequest } from "next/server";

/**
 * Synthetic client IPs, one per request, never reused.
 *
 * The routes key their limiter on `x-forwarded-for`, and that limiter is
 * module-level state shared by every test in a file. A fixed IP therefore makes
 * the suite order-dependent: it passes until some test becomes the 31st, then
 * fails on whichever one that happens to be. A fresh IP per request means tests
 * cannot throttle each other, and the ones that *are* about throttling opt into
 * a fixed IP explicitly.
 *
 * Drawn from 198.18.0.0/15 — reserved for benchmarking by RFC 2544, so it can
 * never collide with a real address a fixture might also carry. The counter is
 * module-scoped, so files sharing this helper draw from one sequence rather
 * than from overlapping guesses.
 */
let ipCounter = 0;
export function nextTestIp(): string {
  ipCounter += 1;
  // /15 gives 131072 addresses; far more than any suite allocates, and the
  // wrap is harmless because a repeat only matters within one rate window.
  const n = ipCounter % 131_072;
  return `198.18.${(n >> 8) & 0xff}.${n & 0xff}`;
}

/** Options for {@link jsonRequest}, mirroring what the route tests vary. */
export interface JsonRequestOptions {
  /** Extra or overriding headers. `x-forwarded-for` here pins the caller. */
  headers?: Record<string, string>;
  /** Pin the caller to one IP — for the rate-limit tests themselves. */
  ip?: string;
  /** Request origin, for the CORS and same-origin-guard assertions. */
  origin?: string;
  method?: string;
}

/**
 * A JSON POST to an API route, with a unique caller unless one is pinned.
 *
 * Headers are applied after the defaults, so a caller can override the
 * content type to exercise a route's own parsing guards.
 */
export function jsonRequest(
  url: string,
  body: unknown,
  { headers = {}, ip, origin, method = "POST" }: JsonRequestOptions = {},
): NextRequest {
  const base: Record<string, string> = {
    "content-type": "application/json",
    "x-forwarded-for": ip ?? nextTestIp(),
  };
  if (origin) base.origin = origin;
  return new NextRequest(url, {
    method,
    headers: { ...base, ...headers },
    body: JSON.stringify(body),
  });
}

/** A JSON POST to `/api/check` — the most-exercised route in the suite. */
export function checkRequest(body: unknown, options: JsonRequestOptions = {}): NextRequest {
  return jsonRequest("http://localhost/api/check", body, options);
}

/**
 * The blocklist stub every route test needs.
 *
 * Returns an empty set so the route runs purely in memory. Exported as a
 * factory rather than called at module scope because `vi.mock` is hoisted
 * above imports: each file passes this to its own `vi.mock` call, which is
 * what keeps the hoisting visible at the point it happens.
 *
 * A test that needs a *populated* blocklist stubs it itself — the point of
 * that test is the contents, so hiding them behind a shared helper would make
 * it read as though it ran against the real feed.
 */
export function emptyBlocklistMock() {
  return { getUrlhausBlocklist: async () => new Set<string>() };
}
