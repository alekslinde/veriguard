import { NextRequest, NextResponse } from "next/server";
import { getPublicReports, getPublicReportsCount, SortOption } from "@/lib/reportStore";
import { MOCK_REPORTS } from "@/lib/fixtures/mockReports";
import { isSameOriginRead } from "@/lib/readGuard";
import { checkAndRecordRateLimit, FEED_RATE_LIMIT } from "@/lib/reportStore";
import { clientIpFromHeaders } from "@/lib/geo";

const VALID_SORTS = new Set<SortOption>(["desc", "asc", "most", "least"]);

/**
 * Read an integer query parameter, falling back on anything non-finite.
 *
 * `parseInt("abc", 10)` is NaN, and a `?? default` on the raw string only fires
 * when the parameter is ABSENT — never when it is present and malformed. The
 * NaN then reaches the libSQL bind layer, which rejects it ("Only finite
 * numbers … can be passed as arguments") and turns a bad query string into a
 * 500. That throw lands AFTER the rate-limit check and the two DB queries, so
 * it is the one call shape that reaches the database and cannot be absorbed by
 * the edge cache — the reverse of this route's reject-before-querying order.
 */
function intParam(raw: string | null, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : fallback;
}

/** As above, but absent and unparseable both yield undefined (no filter). */
function intParamOrUndefined(raw: string | null): number | undefined {
  const n = parseInt(raw ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Bound a caller-supplied value at BOTH ends.
 *
 * `Math.min(limit, 100)` alone caps the top and says nothing about the bottom,
 * and SQLite reads a negative LIMIT as no limit at all — so `?limit=-5`
 * returned the entire reports table, defeating the row cap that is this
 * endpoint's whole cost control. The upper bound was tested; the lower one did
 * not exist. Clamp both ends of anything a caller supplies.
 */
function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * Public submissions feed.
 *
 * The content is PII-scrubbed and already published at /submissions, so this is
 * not a confidentiality boundary. The controls below are about COST: every call
 * runs two queries (a page plus a count) against a free-tier database, and an
 * unthrottled feed is the cheapest way for someone to exhaust the row-read
 * budget and take the site down for everyone.
 *
 * Two layers, in cost order — reject before querying:
 *   1. Same-origin only. Stops another site's JavaScript and casual scripts.
 *      Forgeable by design (see isSameOriginRead); it is a filter, not a lock.
 *   2. Per-IP rate limit, which is what actually bounds a determined caller.
 */
export async function GET(req: NextRequest) {
  if (!isSameOriginRead(req.headers)) {
    return NextResponse.json(
      { error: "This endpoint serves the submissions page on this site.", code: "forbidden_origin" },
      // Vary here too, and no-store: a cached 403 handed to a legitimate
      // visitor would break the submissions page for them.
      { status: 403, headers: { Vary: "Origin", "Cache-Control": "no-store" } },
    );
  }

  // Only rate-limited when the caller can actually be identified.
  //
  // clientIpFromHeaders returns "unknown" for a missing or malformed
  // x-forwarded-for, and keying on that puts EVERY such visitor in one shared
  // bucket — so the feed would go dark site-wide after a couple of people
  // browsed it. That converts a cost control into an availability bug, which is
  // a strictly worse failure than the one it guards against.
  //
  // Failing open here is safe because it is not the only control: the origin
  // guard above still applies, and the edge cache absorbs the volume. Vercel
  // sets the header in production, so this is the degraded path rather than the
  // normal one.
  const ip = clientIpFromHeaders(req.headers);
  if (ip !== "unknown" && !checkAndRecordRateLimit(`feed:${ip}`, FEED_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many requests — give it a few minutes and try again.", code: "rate_limited" },
      // Never cached: a stored 429 would lock out every visitor behind the same
      // CDN node, turning a per-IP limit into a site-wide outage.
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { searchParams } = new URL(req.url);
  const limit  = clamp(intParam(searchParams.get("limit"),  25), 1, 100);
  const offset = Math.max(intParam(searchParams.get("offset"), 0), 0);
  const type   = searchParams.get("type")   ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  // undefined rather than a fallback: absent and unparseable both mean "no
  // since filter", and NaN here would silently compare against submitted_at.
  const since  = intParamOrUndefined(searchParams.get("since"));
  const sortRaw = searchParams.get("sort") ?? "desc";
  const sort: SortOption = VALID_SORTS.has(sortRaw as SortOption) ? sortRaw as SortOption : "desc";

  const [dbReports, dbTotal] = await Promise.all([
    getPublicReports({ limit, offset, type, sort, since, search }),
    getPublicReportsCount({ type, since, search }),
  ]);

  // In development, fall back to mock data when the DB has no reports so the
  // submissions page is always populated for testing.
  if (process.env.NODE_ENV === "development" && dbTotal === 0) {
    let mock = MOCK_REPORTS;
    if (type && type !== "all") mock = mock.filter((r) => r.type === type);
    if (search) {
      const q = search.toLowerCase();
      mock = mock.filter((r) =>
        r.content.toLowerCase().includes(q) ||
        r.scamUrl.toLowerCase().includes(q) ||
        r.scamPhone.toLowerCase().includes(q) ||
        r.scamEmail.toLowerCase().includes(q),
      );
    }
    const total = mock.length;
    const reports = mock.slice(offset, offset + limit);
    return NextResponse.json({ reports, total });
  }

  // Cached at the edge, which is the control that actually reduces database
  // reads: the same feed page served to many visitors costs one query per
  // window rather than one per visitor. Short, because the feed is the
  // product's "what's going around" surface and stale entries read as broken.
  //
  // Deliberately not applied to the mock-data branch above — that is
  // development only, and caching it would hide fixture changes.
  return NextResponse.json(
    { reports: dbReports, total: dbTotal },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        // Without this the cache silently defeats the origin guard above: once
        // the CDN holds a 200 for this URL from a legitimate visit, a request
        // from any origin is served from cache and never reaches the function.
        // A route whose output depends on Origin must say so on every response
        // — the same reasoning corsHeaders already documents, which I failed to
        // carry over when adding the cache.
        Vary: "Origin",
      },
    },
  );
}
