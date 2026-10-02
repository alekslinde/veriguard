// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { NextResponse } from "next/server";
import { getStats, getCheckEvents, checkAndRecordRateLimit, FEED_RATE_LIMIT, type CheckSurface, type CheckOutcome } from "@/lib/reportStore";
import { clientIpFromHeaders } from "@/lib/geo";
import { isSameOriginRead } from "@/lib/readGuard";

// Days of history the breakdown covers when `?days=` is omitted. Four weeks is
// enough to read a weekly rate and see a trend.
const DEFAULT_DAYS = 28;
// Bounds the range scan and the response size on an unauthenticated route.
const MAX_DAYS = 90;
// Hard cap on returned rows regardless of the window. With three surfaces and
// three outcomes a day tops out at ~9 rows, so this is far above any honest
// payload while still bounding a table that has grown unexpectedly.
const MAX_DAILY_ROWS = 1000;

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

interface SurfaceSummary {
  surface: CheckSurface;
  // Verdicts that reached a person.
  delivered: number;
  // Forwards the email path accepted and tried to analyse. Recorded before
  // analysis runs, so this counts attempts, not successes. Always 0 for `web`.
  analysed: number;
  unknown: number;
}

/**
 * GET /api/stats
 *
 * Default response is unchanged and public: `{ checks, reports }` — the
 * lifetime totals StatsBar renders in the hero.
 *
 * `?breakdown=1` adds the per-surface aggregate. Opt-in so the public component
 * cannot start emitting operational detail by accident.
 *
 * **No rate is computed from these counts, deliberately.** `delivered` and
 * `analysed` are separate volumes written on different code paths under
 * independent rate-limit budgets — `delivered` exceeding `analysed` is normal,
 * and `web` never writes `analysed` at all. See `getCheckEvents` in
 * lib/reportStore.ts for why dividing them produces a number that looks
 * meaningful and isn't.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const wantsBreakdown = url.searchParams.get("breakdown") === "1";

  // The breakdown scans check_events over a window; the default path reads two
  // counter rows. Only the expensive one is throttled — rate-limiting the hero
  // counters would punish ordinary visitors for the site's own page loads,
  // which the cache below already collapses into one query per window.
  //
  // Same "unknown" caveat as /api/reports: keying every unidentifiable caller
  // into one bucket would take the breakdown down for all of them at once.
  // The breakdown is operational detail — per-surface volumes and a daily
  // series — and the route's own header calls it opt-in so the public component
  // "cannot start emitting operational detail by accident". Same-origin is the
  // consistent reading of that: the default counters stay open because they are
  // two public integers rendered in the hero, but the breakdown is not for
  // arbitrary callers.
  if (wantsBreakdown && !isSameOriginRead(request.headers)) {
    return NextResponse.json(
      { error: "The breakdown is served to this site.", code: "forbidden_origin" },
      { status: 403, headers: { Vary: "Origin", "Cache-Control": "no-store" } },
    );
  }

  const ip = clientIpFromHeaders(request.headers);
  if (wantsBreakdown && ip !== "unknown" && !checkAndRecordRateLimit(`stats:${ip}`, FEED_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many requests — give it a few minutes and try again.", code: "rate_limited" },
      // Never cached: a stored 429 would lock out every visitor behind the same
      // CDN node, turning a per-IP limit into a site-wide outage.
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Read on both paths deliberately — the breakdown response spreads `...stats`
  // into its body, so hoisting this below the branch would just duplicate it.
  const stats = await getStats();

  if (!wantsBreakdown) {
    // Cached at the edge. These are two integers that change slowly, and they
    // are read on every homepage load — uncached, the site's own traffic is the
    // main consumer of the free-tier row-read budget.
    return NextResponse.json(stats, {
      headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" },
    });
  }

  const rawDays = url.searchParams.get("days");
  let days = DEFAULT_DAYS;
  if (rawDays !== null) {
    const parsed = Number(rawDays);
    // Reject rather than silently substitute: a caller asking for `days=0` or
    // `days=1.5` has a wrong assumption, and quietly returning 28 days of data
    // would hide it behind a plausible-looking response.
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_DAYS) {
      return NextResponse.json(
        { error: `days must be an integer between 1 and ${MAX_DAYS}` },
        { status: 400 },
      );
    }
    days = parsed;
  }

  // Inclusive lower bound: `days = 1` means today only.
  const since = dayKey(Date.now() - (days - 1) * 86_400_000);
  const rows = await getCheckEvents(since);

  const bySurface = new Map<CheckSurface, SurfaceSummary>();
  for (const row of rows) {
    const entry = bySurface.get(row.surface) ?? {
      surface: row.surface,
      delivered: 0,
      analysed: 0,
      unknown: 0,
    };
    const outcome: CheckOutcome = row.outcome;
    if (outcome === "delivered") entry.delivered += row.value;
    else if (outcome === "analysed") entry.analysed += row.value;
    else entry.unknown += row.value;
    bySurface.set(row.surface, entry);
  }

  const surfaces = [...bySurface.values()].sort(
    (a, b) => b.delivered - a.delivered || a.surface.localeCompare(b.surface),
  );

  const daily = rows.slice(0, MAX_DAILY_ROWS);

  return NextResponse.json({
    ...stats,
    breakdown: {
      // `since` is the first day counted, not the day the window was computed —
      // callers comparing two responses need the bound, not the request time.
      since,
      days,
      surfaces,
      // Raw rows so a caller can bucket by week itself; the summary above
      // collapses the day axis. `truncated` says the cap was hit, so a short
      // list is never mistaken for a quiet period.
      daily,
      truncated: rows.length > daily.length,
    },
  }, {
    // Shorter than the default path: the breakdown is an operational view, so
    // staleness is more noticeable, but it is also the expensive query and the
    // one worth not repeating per request. Vary because the route now refuses
    // by origin — without it the CDN would serve a cached breakdown past that
    // guard.
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      Vary: "Origin",
    },
  });
}
