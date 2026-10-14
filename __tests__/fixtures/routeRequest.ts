// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Shared request builders for the API route tests.
//
// Every route test needs the same two things before it can assert anything: a
// NextRequest it can hand the handler, and a caller identity the route's
// module-level rate limiter will not throttle. Both were hand-rolled per file —
// ten copies of `new NextRequest(...)` and four of an `ipCounter`, three of
// them drawing from the same `10.1.0.x` prefix.
//
// What is shared here is the construction and the reasoning, not the address
// space: vitest gives each file its own module registry, so each file still
// gets its own counter and its own copy of the limiter. That per-file isolation
// is what keeps these addresses from meeting, both before this fixture and
// after it — see nextTestIp.

import { NextRequest } from "next/server";

/**
 * Synthetic client IPs, one per request within a test file.
 *
 * The routes key their limiter on `x-forwarded-for`, and that limiter is
 * module-level state shared by every test in a file. A fixed IP therefore makes
 * the suite order-dependent: it passes until some test becomes the 31st, then
 * fails on whichever one that happens to be. A fresh IP per request means tests
 * cannot throttle each other, and the ones that *are* about throttling opt into
 * a fixed IP explicitly.
 *
 * Drawn from 198.18.0.0/15 — reserved for benchmarking by RFC 2544, so these
 * can never collide with a real address a fixture might also carry.
 *
 * **This does not make the sequence unique across files.** vitest isolates
 * module registries per file by default, so every file that imports this helper
 * gets its own `ipCounter` starting at 0 and draws the identical sequence. That
 * is harmless for the same reason the per-file duplicates it replaced were
 * harmless — each file also gets its own copy of the route's limiter, so the
 * addresses never meet. What this helper fixes is the arithmetic and the
 * documentation being in one place instead of four; it is not a substitute for
 * that isolation, and a move to `isolate: false` would need the limiter reset
 * between files regardless of how these addresses are allocated.
 */
let ipCounter = 0;
export function nextTestIp(): string {
  ipCounter += 1;
  // The /15 spans 198.18.0.0–198.19.255.255: 17 bits of host space, so bit 16
  // selects the second octet. Masking it off would fold the range back onto
  // 198.18.x.y and make counters 1 and 65537 the same address.
  const n = ipCounter % 131_072;
  return `198.${18 + ((n >> 16) & 1)}.${(n >> 8) & 0xff}.${n & 0xff}`;
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
