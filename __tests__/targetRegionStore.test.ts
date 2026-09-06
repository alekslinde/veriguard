import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import {
  recordTargetRegion,
  getTargetRegionEvents,
  MIN_CELL_SIZE,
} from "@/lib/reportStore";
import { getDb } from "@/lib/db";

function mockDb(rows: Record<string, unknown>[] = []) {
  const execute = vi.fn().mockResolvedValue({ rows });
  vi.mocked(getDb).mockResolvedValue({ execute } as never);
  return execute;
}

describe("recordTargetRegion", () => {
  it("upserts one row per (day, surface, region, confidence)", async () => {
    const execute = mockDb();
    await recordTargetRegion("web", "GB", "tld", Date.UTC(2026, 8, 6, 3, 0, 0));

    const call = execute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain("INSERT INTO target_region_events");
    expect(call.sql).toContain("ON CONFLICT");
    expect(call.args).toEqual(["2026-09-06", "web", "GB", "tld"]);
  });

  it("buckets by UTC, not local time", async () => {
    const execute = mockDb();
    // 23:30 UTC is already tomorrow in AEST. The bucket must not move.
    await recordTargetRegion("web", "AU", "phone", Date.UTC(2026, 8, 6, 23, 30, 0));
    const call = execute.mock.calls[0][0] as { args: unknown[] };
    expect(call.args[0]).toBe("2026-09-06");
  });

  it("drops an empty region rather than bucketing it", async () => {
    // "No national signal" is the COMMON case. Counting it would produce one
    // bucket dwarfing every real one, which invites reading it as a finding.
    const execute = mockDb();
    await recordTargetRegion("web", "", "none");
    expect(execute).not.toHaveBeenCalled();
  });

  it("buckets an unrecognised surface as 'unknown'", async () => {
    const execute = mockDb();
    await recordTargetRegion("telegram" as never, "GB", "tld", Date.UTC(2026, 8, 6));
    const call = execute.mock.calls[0][0] as { args: unknown[] };
    expect(call.args[1]).toBe("unknown");
  });

  it("never throws — telemetry must not fail a user-facing check", async () => {
    vi.mocked(getDb).mockRejectedValue(new Error("db down") as never);
    await expect(recordTargetRegion("web", "GB", "tld")).resolves.toBeUndefined();
  });

  it("writes no content, no IP and no sub-day timestamp", async () => {
    // The aggregate-only property, asserted rather than assumed. Everything
    // bound must be a coarse bucket key or a count.
    const execute = mockDb();
    await recordTargetRegion("web", "GB", "tld", Date.UTC(2026, 8, 6, 14, 23, 45));
    const call = execute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.args).toEqual(["2026-09-06", "web", "GB", "tld"]);
    // A day string, never a full timestamp.
    expect(String(call.args[0])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.sql).not.toMatch(/content|ip|address|text/i);
  });
});

describe("getTargetRegionEvents — cell-size suppression", () => {
  const rows = [
    { day: "2026-09-06", surface: "web", target_region: "GB", confidence: "tld", value: MIN_CELL_SIZE },
    { day: "2026-09-06", surface: "web", target_region: "IE", confidence: "tld", value: MIN_CELL_SIZE - 1 },
    { day: "2026-09-06", surface: "web", target_region: "AU", confidence: "phone", value: 500 },
  ];

  it("suppresses buckets below the minimum by default", async () => {
    mockDb(rows);
    const result = await getTargetRegionEvents();
    expect(result.map((r) => r.targetRegion).sort()).toEqual(["AU", "GB"]);
  });

  it("treats the minimum as inclusive", async () => {
    mockDb(rows);
    const result = await getTargetRegionEvents();
    expect(result.find((r) => r.targetRegion === "GB")?.value).toBe(MIN_CELL_SIZE);
  });

  it("drops a suppressed bucket entirely rather than zeroing it", async () => {
    // A zero would read as "no checks targeted Ireland", which the data does
    // not support — the truth is "too few to publish".
    mockDb(rows);
    const result = await getTargetRegionEvents();
    expect(result.some((r) => r.targetRegion === "IE")).toBe(false);
  });

  it("requires suppression to be waived explicitly", async () => {
    mockDb(rows);
    const raw = await getTargetRegionEvents(undefined, false);
    expect(raw.map((r) => r.targetRegion).sort()).toEqual(["AU", "GB", "IE"]);
  });

  it("keeps the floor high enough to be meaningful", () => {
    expect(MIN_CELL_SIZE).toBeGreaterThanOrEqual(20);
  });
});
