import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PublicReport } from "@/lib/reportStore";

// P6/P7 (probe 2026-09-09). Both findings are about the /api/reports query
// string reaching the DB layer unbounded or unparsed, so these assert on the
// arguments the route hands the store rather than on rows: the defects are in
// the coercion, and binding them is what turns them into a full-table read or
// a 500.
// Typed against the real signatures rather than `async () => []`: a bare
// zero-arg arrow infers an empty-tuple parameter list, so `mock.calls[0][0]`
// below is a tsc error (TS2493) even though vitest strips types and runs green.
type ReportsArgs = Parameters<typeof import("@/lib/reportStore").getPublicReports>;
type CountArgs = Parameters<typeof import("@/lib/reportStore").getPublicReportsCount>;

const getPublicReports = vi.fn(async (..._args: ReportsArgs) => [] as PublicReport[]);
const getPublicReportsCount = vi.fn(async (..._args: CountArgs) => 0);
vi.mock("@/lib/reportStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportStore")>();
  return {
    ...actual,
    getPublicReports: (...args: unknown[]) => getPublicReports(...(args as [])),
    getPublicReportsCount: (...args: unknown[]) => getPublicReportsCount(...(args as [])),
    // Never rate-limit these: the params are what is under test.
    checkAndRecordRateLimit: () => true,
  };
});

import { GET } from "@/app/api/reports/route";
import { NextRequest } from "next/server";

function req(qs: string): NextRequest {
  return new NextRequest(`http://localhost/api/reports${qs}`);
}

/** The options object the route handed getPublicReports. */
function opts(): { limit: number; offset: number; since?: number } {
  return getPublicReports.mock.calls[0]![0] as {
    limit: number; offset: number; since?: number;
  };
}

beforeEach(() => {
  getPublicReports.mockClear();
  getPublicReportsCount.mockClear();
});

// P6 — HIGH. Math.min(limit, 100) bounds the TOP of the range and says nothing
// about the bottom, and SQLite reads a negative LIMIT as no limit at all — so
// ?limit=-5 returned the entire reports table, defeating the row cap that is
// this endpoint's whole cost control on a free-tier database.
describe("GET /api/reports — limit is bounded at both ends (P6)", () => {
  it("does not let a negative limit through as an unbounded read", async () => {
    const res = await GET(req("?limit=-5"));
    expect(res.status).toBe(200);
    // The specific defect: a negative value reaching the LIMIT bind.
    expect(opts().limit).toBeGreaterThan(0);
    expect(opts().limit).toBeLessThanOrEqual(100);
  });

  it("does not let zero through as an empty page", async () => {
    await GET(req("?limit=0"));
    expect(opts().limit).toBeGreaterThanOrEqual(1);
  });

  it("still caps an over-large limit at 100", async () => {
    // Regression: this half was always tested and must keep working.
    await GET(req("?limit=999"));
    expect(opts().limit).toBe(100);
  });

  it("passes an ordinary limit through untouched", async () => {
    await GET(req("?limit=50"));
    expect(opts().limit).toBe(50);
  });

  it("clamps a negative offset rather than binding it", async () => {
    await GET(req("?offset=-10"));
    expect(opts().offset).toBe(0);
  });
});

// P7 — MEDIUM. parseInt("abc") is NaN, and the `?? "25"` default only fires on
// an ABSENT parameter, never a malformed one. The NaN reached the libSQL bind
// layer, which rejects non-finite numbers — turning a bad query string into a
// 500 thrown AFTER the rate check and both DB queries, the one call shape that
// reaches the database and cannot be absorbed by the edge cache.
describe("GET /api/reports — malformed numeric params (P7)", () => {
  it("falls back to the default page size on a non-numeric limit", async () => {
    const res = await GET(req("?limit=abc"));
    expect(res.status).toBe(200);
    expect(Number.isFinite(opts().limit)).toBe(true);
    expect(opts().limit).toBe(25);
  });

  it("falls back to zero on a non-numeric offset", async () => {
    const res = await GET(req("?offset=abc"));
    expect(res.status).toBe(200);
    expect(Number.isFinite(opts().offset)).toBe(true);
    expect(opts().offset).toBe(0);
  });

  // Distinct from the two above: `since` did NOT throw, so NaN silently reached
  // a `submitted_at >= ?` comparison. No crash, but the filter it describes is
  // not the filter that runs — the quieter half of the same defect.
  it("applies no since filter at all when since is unparseable", async () => {
    const res = await GET(req("?since=abc"));
    expect(res.status).toBe(200);
    expect(opts().since).toBeUndefined();
  });

  it("still honours a valid since", async () => {
    await GET(req("?since=1750000000000"));
    expect(opts().since).toBe(1750000000000);
  });

  it("never hands a non-finite number to the store", async () => {
    // The property that actually matters, stated once over every numeric param.
    for (const qs of ["?limit=abc", "?offset=abc", "?since=abc", "?limit=&offset="]) {
      getPublicReports.mockClear();
      const res = await GET(req(qs));
      expect(res.status).toBe(200);
      const o = opts();
      expect(Number.isFinite(o.limit)).toBe(true);
      expect(Number.isFinite(o.offset)).toBe(true);
      if (o.since !== undefined) expect(Number.isFinite(o.since)).toBe(true);
    }
  });
});
