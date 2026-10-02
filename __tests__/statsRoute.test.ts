// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/reportStore", () => ({
  getStats: vi.fn(),
  getCheckEvents: vi.fn(),
  // The breakdown path is rate-limited; the default path is not. Allowing by
  // default keeps these tests about the response shape rather than the budget,
  // which apiCostControls.test.ts covers.
  checkAndRecordRateLimit: vi.fn(() => true),
  FEED_RATE_LIMIT: 60,
}));

import { GET } from "@/app/api/stats/route";
import { getStats, getCheckEvents } from "@/lib/reportStore";

const req = (url: string) => new Request(url);

beforeEach(() => {
  // Mock call history accumulates across tests otherwise, so assertions on
  // `mock.calls[0]` would read an earlier test's call.
  vi.clearAllMocks();
  vi.mocked(getStats).mockResolvedValue({ checks: 42, reports: 17 });
  vi.mocked(getCheckEvents).mockResolvedValue([]);
});

// The UTC day key `days` back, inclusive of today — the same arithmetic the
// route does. Compared as a key rather than as a rounded duration: `since` is a
// date-only string, which Date.parse reads as UTC midnight, so subtracting it
// from Date.now() and rounding gave 27 or 28 depending on what time of day the
// suite ran. That made these two tests pass all morning UTC and fail all
// afternoon, which is a broken test rather than a broken route.
function expectedSince(days: number): string {
  return new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
}

describe("GET /api/stats", () => {
  it("returns only the public totals by default", async () => {
    const body = await (await GET(req("https://x/api/stats"))).json();

    // StatsBar reads exactly this shape; adding keys here would leak
    // operational detail onto a public page.
    expect(body).toEqual({ checks: 42, reports: 17 });
    expect(getCheckEvents).not.toHaveBeenCalled();
  });

  it("ignores a breakdown value other than 1", async () => {
    const body = await (await GET(req("https://x/api/stats?breakdown=true"))).json();
    expect(body).toEqual({ checks: 42, reports: 17 });
  });

  it("adds the per-surface breakdown when asked, keeping the totals", async () => {
    vi.mocked(getCheckEvents).mockResolvedValue([
      { surface: "email", outcome: "analysed", day: "2026-08-29", value: 10 },
      { surface: "email", outcome: "delivered", day: "2026-08-29", value: 8 },
      { surface: "web", outcome: "delivered", day: "2026-08-29", value: 25 },
    ]);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();

    expect(body.checks).toBe(42);
    expect(body.reports).toBe(17);
    expect(body.breakdown.surfaces).toEqual([
      { surface: "web", delivered: 25, analysed: 0, unknown: 0 },
      { surface: "email", delivered: 8, analysed: 10, unknown: 0 },
    ]);
  });

  it("computes no rate from the two volumes", async () => {
    // delivered and analysed are written on different paths under independent
    // limiters, so any ratio between them is meaningless. Publishing one would
    // invite exactly the misreading this feature exists to avoid.
    vi.mocked(getCheckEvents).mockResolvedValue([
      { surface: "email", outcome: "analysed", day: "2026-08-29", value: 10 },
      { surface: "email", outcome: "delivered", day: "2026-08-29", value: 8 },
    ]);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();
    expect(body.breakdown.surfaces[0]).not.toHaveProperty("deliveredRate");
    expect(JSON.stringify(body)).not.toContain("0.8");
  });

  it("survives delivered exceeding analysed, which the limiters permit", async () => {
    vi.mocked(getCheckEvents).mockResolvedValue([
      { surface: "email", outcome: "analysed", day: "2026-08-29", value: 2 },
      { surface: "email", outcome: "delivered", day: "2026-08-29", value: 9 },
    ]);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();
    expect(body.breakdown.surfaces[0]).toEqual({
      surface: "email",
      delivered: 9,
      analysed: 2,
      unknown: 0,
    });
  });

  it("buckets an unknown outcome separately rather than as analysed", async () => {
    vi.mocked(getCheckEvents).mockResolvedValue([
      { surface: "email", outcome: "unknown", day: "2026-08-29", value: 4 },
    ]);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();
    expect(body.breakdown.surfaces[0]).toEqual({
      surface: "email",
      delivered: 0,
      analysed: 0,
      unknown: 4,
    });
  });

  it("defaults to a 28-day window", async () => {
    await GET(req("https://x/api/stats?breakdown=1"));

    expect(getCheckEvents).toHaveBeenCalledTimes(1);
    const since = vi.mocked(getCheckEvents).mock.calls[0][0] as string;
    expect(since).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    expect(since).toBe(expectedSince(28));
  });

  it("honours a valid ?days=", async () => {
    await GET(req("https://x/api/stats?breakdown=1&days=7"));

    const since = vi.mocked(getCheckEvents).mock.calls[0][0] as string;
    expect(since).toBe(expectedSince(7));
  });

  it.each(["0", "-3", "1.5", "9999", "abc", ""])(
    "rejects ?days=%s with a 400 rather than silently substituting a window",
    async (value) => {
      const res = await GET(req(`https://x/api/stats?breakdown=1&days=${value}`));
      expect(res.status).toBe(400);
      expect(getCheckEvents).not.toHaveBeenCalled();
    },
  );

  it("caps the daily rows and flags the truncation", async () => {
    const many = Array.from({ length: 1200 }, (_, i) => ({
      surface: "web" as const,
      outcome: "delivered" as const,
      day: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
      value: 1,
    }));
    vi.mocked(getCheckEvents).mockResolvedValue(many);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();
    expect(body.breakdown.daily).toHaveLength(1000);
    expect(body.breakdown.truncated).toBe(true);
  });

  it("passes the raw daily rows through for callers doing their own bucketing", async () => {
    const rows = [
      { surface: "email" as const, outcome: "delivered" as const, day: "2026-08-29", value: 3 },
    ];
    vi.mocked(getCheckEvents).mockResolvedValue(rows);

    const body = await (await GET(req("https://x/api/stats?breakdown=1"))).json();
    expect(body.breakdown.daily).toEqual(rows);
    expect(body.breakdown.days).toBe(28);
    expect(body.breakdown.truncated).toBe(false);
  });
});
