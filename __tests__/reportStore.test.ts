import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB layer before importing anything that uses it
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

import {
  checkAndRecordRateLimit,
  isRecentDuplicate,
  generateReportId,
  storeReport,
  incrementCheckCount,
  recordCheckEvent,
  getCheckEvents,
  getStats,
  getPublicReports,
  getPublicReportsCount,
  countRecent,
  smoothPath,
  axisTicks,
} from "@/lib/reportStore";
import { getDb } from "@/lib/db";

// ── checkAndRecordRateLimit ───────────────────────────────────────────────────

describe("checkAndRecordRateLimit", () => {
  it("allows the first request for a new IP", () => {
    expect(checkAndRecordRateLimit("ip-allow-1")).toBe(true);
  });

  it("allows up to 4 requests within the window", () => {
    const ip = "ip-allow-4";
    expect(checkAndRecordRateLimit(ip)).toBe(true);
    expect(checkAndRecordRateLimit(ip)).toBe(true);
    expect(checkAndRecordRateLimit(ip)).toBe(true);
    expect(checkAndRecordRateLimit(ip)).toBe(true);
  });

  it("blocks the 5th request from the same IP within the window", () => {
    const ip = "ip-block-5th";
    for (let i = 0; i < 4; i++) checkAndRecordRateLimit(ip);
    expect(checkAndRecordRateLimit(ip)).toBe(false);
  });

  it("allows requests again after the rate window expires", () => {
    const ip = "ip-expiry";
    const realNow = Date.now();

    // Fill up 4 slots
    for (let i = 0; i < 4; i++) checkAndRecordRateLimit(ip);
    expect(checkAndRecordRateLimit(ip)).toBe(false);

    // Advance time past the 10-minute window
    vi.spyOn(Date, "now").mockReturnValue(realNow + 601_000);
    expect(checkAndRecordRateLimit(ip)).toBe(true);
    vi.restoreAllMocks();
  });

  it("treats different IPs independently", () => {
    for (let i = 0; i < 4; i++) checkAndRecordRateLimit("ip-indep-a");
    expect(checkAndRecordRateLimit("ip-indep-a")).toBe(false);
    expect(checkAndRecordRateLimit("ip-indep-b")).toBe(true);
  });
});

// ── isRecentDuplicate ─────────────────────────────────────────────────────────

describe("isRecentDuplicate", () => {
  it("returns false for a new submission", () => {
    expect(isRecentDuplicate("url", "https://unique-url-abc123.com")).toBe(false);
  });

  it("returns true when the same type+content is submitted again", () => {
    const content = "duplicate-content-xyz789";
    isRecentDuplicate("sms", content); // first: registers it
    expect(isRecentDuplicate("sms", content)).toBe(true);
  });

  it("normalises whitespace before comparing", () => {
    const base = "some   sms   content";
    const normalised = "some sms content";
    isRecentDuplicate("sms", normalised);
    expect(isRecentDuplicate("sms", base)).toBe(true);
  });

  it("treats the same content under different types as distinct", () => {
    const content = "shared-content-type-test";
    isRecentDuplicate("url", content);
    expect(isRecentDuplicate("sms", content)).toBe(false);
  });

  it("is case-insensitive", () => {
    isRecentDuplicate("email", "UPPER CASE CONTENT");
    expect(isRecentDuplicate("email", "upper case content")).toBe(true);
  });

  it("only uses the first 200 chars of content for the key", () => {
    const base = "x".repeat(200);
    isRecentDuplicate("custom", base + "ignored-suffix");
    expect(isRecentDuplicate("custom", base + "different-suffix")).toBe(true);
  });
});

// ── generateReportId ──────────────────────────────────────────────────────────

describe("generateReportId", () => {
  it("returns a string matching RPT-XXXXXXXX (8 uppercase hex chars)", () => {
    const id = generateReportId();
    expect(id).toMatch(/^RPT-[0-9A-F]{8}$/);
  });

  it("returns a different ID on each call", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateReportId()));
    expect(ids.size).toBe(20);
  });
});

// ── storeReport ───────────────────────────────────────────────────────────────

describe("storeReport", () => {
  const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

  beforeEach(() => {
    mockExecute.mockClear();
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);
  });

  it("inserts the report row", async () => {
    const report = {
      id: "RPT-TESTID",
      type: "url",
      content: "https://evil.com",
      description: "Looks dodgy",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "",
      scamPhone: "",
      scamEmail: "",
      scamReplyTo: "",
      region: "AU",
    };
    await storeReport(report, false);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining("INSERT INTO reports") })
    );
  });

  it("includes scam identifier fields in the INSERT args", async () => {
    // First call is the COUNT query; second is the INSERT
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 0 }] }); // COUNT → 0 existing

    const report = {
      id: "RPT-IDS001",
      type: "sms",
      content: "Your parcel is ready",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl:   "https://au-post.fake/track",
      scamPhone: "+61412345678",
      scamEmail: "noreply@fake-ato.com",
      scamReplyTo: "replies@elsewhere.ru",
      region: "AU",
    };
    await storeReport(report, false);

    const insertCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("INSERT INTO reports")
    )!;
    expect(insertCall[0].args).toContain("https://au-post.fake/track");
    expect(insertCall[0].args).toContain("+61412345678");
    expect(insertCall[0].args).toContain("noreply@fake-ato.com");
  });

  // The `region` column is what every coverage-gap analysis reads, and it
  // shipped without a single test — it was only ever observed emitting its
  // DEFAULT '' in production. These cover the write path so the column can be
  // trusted before an analysis leans on it.
  it("persists the resolved region in the INSERT args", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 0 }] }); // COUNT → 0 existing

    const report = {
      id: "RPT-REGION1",
      type: "sms",
      content: "Your parcel is held",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "London, United Kingdom",
      scamUrl: "",
      scamPhone: "",
      scamEmail: "",
      scamReplyTo: "",
      region: "GB",
    };
    await storeReport(report, false);

    const insertCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("INSERT INTO reports")
    )!;
    expect(insertCall[0].sql).toContain("region");
    // Assert on the column's own position, not merely that "GB" appears
    // somewhere in the args — region is the last bound parameter, and several
    // other columns legitimately bind ''. Positional is what actually proves
    // the value landed in `region` rather than beside it.
    const args = insertCall[0].args as unknown[];
    expect(args[args.length - 1]).toBe("GB");
  });

  // Guards the ambiguity directly: '' means "row predates the Phase 2
  // migration". A live write producing '' would make the two unreadable apart
  // forever, so it must fail rather than persist.
  it("refuses to store a report with an empty region", async () => {
    const report = {
      id: "RPT-NOREGION",
      type: "sms",
      content: "Your parcel is held",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "",
      scamPhone: "",
      scamEmail: "",
      scamReplyTo: "",
      region: "",
    };

    await expect(storeReport(report, false)).rejects.toThrow(/no region/i);
    // And nothing reached the database — a rejected write must not half-land.
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("persists scam_reply_to in the INSERT column list and args", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 0 }] }); // COUNT → 0 existing

    const report = {
      id: "RPT-REPLY01",
      type: "email",
      content: "From: \"myGov\" <x@evil.tk>",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "",
      scamPhone: "",
      scamEmail: "x@evil.tk",
      scamReplyTo: "scammer@other.ru",
      region: "AU",
    };
    await storeReport(report, false);

    const insertCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("INSERT INTO reports")
    )!;
    expect(insertCall[0].sql).toContain("scam_reply_to");
    expect(insertCall[0].args).toContain("scammer@other.ru");
  });

  it("sets report_count to 1 for the first report with a given identifier", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 0 }] }); // COUNT → no existing match

    const report = {
      id: "RPT-FIRST",
      type: "url",
      content: "https://evil.com",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "https://evil.com",
      scamPhone: "",
      scamEmail: "",
      scamReplyTo: "",
      region: "AU",
    };
    await storeReport(report, false);

    const insertCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("INSERT INTO reports")
    )!;
    expect(insertCall[0].args).toContain(1); // report_count = 1
  });

  it("increments count and updates existing rows when the identifier matches", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 2 }] }); // COUNT → 2 existing

    const report = {
      id: "RPT-MATCH",
      type: "url",
      content: "https://evil.com",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "https://evil.com",
      scamPhone: "",
      scamEmail: "",
      scamReplyTo: "",
      region: "AU",
    };
    await storeReport(report, false);

    // Should have UPDATEd existing reports with count = 3
    const updateCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("UPDATE reports SET report_count")
    )!;
    expect(updateCall[0].args).toContain(3);

    // INSERT should carry the same count
    const insertCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("INSERT INTO reports")
    )!;
    expect(insertCall[0].args).toContain(3);
  });

  it("skips count logic entirely for suspect reports", async () => {
    const report = {
      id: "RPT-SUSP2",
      type: "url",
      content: "https://evil.com",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "https://evil.com",
      scamPhone: "",
      scamEmail: "",
      scamReplyTo: "",
      region: "AU",
    };
    await storeReport(report, true); // suspect

    const countCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("SELECT COUNT(*)")
    );
    expect(countCall).toBeUndefined();
  });

  it("uses scam_phone as identifier when scam_url is empty", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ n: 0 }] }); // COUNT for phone

    const report = {
      id: "RPT-PHONE",
      type: "phone",
      content: "+61412345678",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "",
      scamPhone: "+61412345678",
      scamEmail: "",
      scamReplyTo: "",
      region: "AU",
    };
    await storeReport(report, false);

    const countCall = mockExecute.mock.calls.find(
      (c) => (c[0] as { sql: string }).sql.includes("SELECT COUNT(*)")
    )!;
    expect(countCall[0].sql).toContain("scam_phone");
    expect(countCall[0].args).toContain("+61412345678");
  });

  it("increments the reports counter for legitimate (non-suspect) reports", async () => {
    const report = {
      id: "RPT-LEGIT01",
      type: "sms",
      content: "scam text",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "",
      scamPhone: "",
      scamEmail: "",
      scamReplyTo: "",
      region: "AU",
    };
    await storeReport(report, false);
    const calls = mockExecute.mock.calls.map((c) => c[0]);
    expect(calls.some((c: { sql?: string }) => c?.sql?.includes("UPDATE counters"))).toBe(true);
  });

  it("does NOT increment the counter for suspect reports", async () => {
    const report = {
      id: "RPT-SUSPECT",
      type: "url",
      content: "https://maybe-scam.com",
      description: "",
      contact: "",
      submittedAt: Date.now(),
      location: "NSW, Australia",
      scamUrl: "",
      scamPhone: "",
      scamEmail: "",
      scamReplyTo: "",
      region: "AU",
    };
    await storeReport(report, true);
    const calls = mockExecute.mock.calls.map((c) => c[0]);
    expect(calls.some((c: { sql?: string }) => c?.sql?.includes("UPDATE counters"))).toBe(false);
  });
});

// ── recordCheckEvent / getCheckEvents ─────────────────────────────────────────

describe("recordCheckEvent", () => {
  it("upserts one row per (surface, outcome, UTC day)", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await recordCheckEvent("email", "delivered", Date.UTC(2026, 7, 29, 3, 0, 0));

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain("INSERT INTO check_events");
    expect(call.sql).toContain("ON CONFLICT");
    expect(call.args).toEqual(["email", "delivered", "2026-08-29"]);
  });

  it("buckets by UTC, not local time", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    // 23:30 UTC on the 29th is already the 30th in AEST. The bucket must not move.
    await recordCheckEvent("web", "delivered", Date.UTC(2026, 7, 29, 23, 30, 0));

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.args[2]).toBe("2026-08-29");
  });

  it("buckets an unrecognised surface as 'unknown' rather than dropping it", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await recordCheckEvent("telegram" as never, "delivered", Date.UTC(2026, 7, 29));

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.args[0]).toBe("unknown");
  });

  it("accepts the share surface", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await recordCheckEvent("share", "delivered", Date.UTC(2026, 7, 29));

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    // Must not fall through to `unknown` — share volume is the reason Phase 2a
    // is measurable at all.
    expect(call.args[0]).toBe("share");
  });

  it("buckets an unrecognised outcome as 'unknown', never as 'analysed'", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    // Folding a bad value into `analysed` would move a miswrite into a counted
    // population and quietly distort the email path's volume.
    await recordCheckEvent("email", "bogus" as never, Date.UTC(2026, 7, 29));

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.args[1]).toBe("unknown");
  });

  it("never throws when the database fails", async () => {
    vi.mocked(getDb).mockRejectedValue(new Error("db down") as never);
    await expect(recordCheckEvent("web", "delivered")).resolves.toBeUndefined();
  });
});

describe("incrementCheckCount", () => {
  it("records the per-surface aggregate when given a surface", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await incrementCheckCount("email");
    // The aggregate write is fire-and-forget, so let its microtasks settle.
    await new Promise((r) => setTimeout(r, 0));

    const sql = mockExecute.mock.calls.map((c) => (c[0] as { sql: string }).sql);
    expect(sql.some((q) => q.includes("UPDATE counters"))).toBe(true);
    expect(sql.some((q) => q.includes("INSERT INTO check_events"))).toBe(true);
  });

  it("does not make the caller wait on the aggregate write", async () => {
    let resolveAggregate: (v: unknown) => void = () => {};
    const mockExecute = vi.fn().mockImplementation((q: { sql: string }) => {
      if (q.sql.includes("check_events")) {
        return new Promise((r) => {
          resolveAggregate = r;
        });
      }
      return Promise.resolve({ rows: [] });
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    // Resolves even though the aggregate write is still outstanding — a hung
    // telemetry row must never hold up a user-facing request.
    await expect(incrementCheckCount("web")).resolves.toBeUndefined();
    resolveAggregate({ rows: [] });
  });

  it("still bumps the lifetime counter with no surface, touching no aggregate", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await incrementCheckCount();

    const sql = mockExecute.mock.calls.map((c) => (c[0] as { sql: string }).sql);
    expect(sql.some((q) => q.includes("UPDATE counters"))).toBe(true);
    expect(sql.some((q) => q.includes("checks"))).toBe(true);
    expect(sql.some((q) => q.includes("check_events"))).toBe(false);
  });
});

describe("getCheckEvents", () => {
  it("returns rows with numeric values", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ surface: "email", outcome: "delivered", day: "2026-08-29", value: "7" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const rows = await getCheckEvents();
    expect(rows).toEqual([
      { surface: "email", outcome: "delivered", day: "2026-08-29", value: 7 },
    ]);
  });

  it("passes an inclusive sinceDay bound through to the query", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getCheckEvents("2026-08-01");

    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain("day >=");
    expect(call.args).toEqual(["2026-08-01"]);
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe("getStats", () => {
  it("returns checks and reports from the database", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [
        { name: "checks", value: 42 },
        { name: "reports", value: 17 },
      ],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const stats = await getStats();
    expect(stats).toEqual({ checks: 42, reports: 17 });
  });

  it("defaults missing counters to 0", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const stats = await getStats();
    expect(stats).toEqual({ checks: 0, reports: 0 });
  });
});

// ── getPublicReports ──────────────────────────────────────────────────────────

describe("getPublicReports", () => {
  const baseRow = {
    id: "RPT-ABCD1234",
    type: "url",
    content: "https://scam.com",
    description: "Very dodgy",
    submitted_at: 1700000000000,
    scam_url: "",
    scam_phone: "",
    scam_email: "",
    report_count: 1,
  };

  it("returns mapped public report objects", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [baseRow] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      id: "RPT-ABCD1234",
      type: "url",
      // content is passed through defangText — URLs are defanged; stripTrackingParams
      // normalises bare domains to include a trailing slash
      content: "hxxps://scam[.]com/",
      submittedAt: 1700000000000,
    });
  });

  it("applies defangText to content", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, content: "Click: https://evil.com/phish and also http://bad.tk" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].content).not.toContain("https://");
    expect(reports[0].content).toContain("hxxps://evil[.]com/phish");
    expect(reports[0].content).toContain("hxxp://bad[.]tk");
  });

  it("applies PII scrubbing to the description", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{
        ...baseRow,
        id: "RPT-PII0001",
        type: "sms",
        content: "scam sms",
        description: "Called from 0412 345 678 asking for my TFN",
      }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].description).not.toContain("0412 345 678");
    expect(reports[0].description).toContain("[phone removed]");
  });

  it("defangs scam_url in returned reports", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, scam_url: "https://fake-ato.xyz/verify" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].scamUrl).toBe("hxxps://fake-ato[.]xyz/verify");
  });

  it("defangs scam_email in returned reports", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, scam_email: "phish@fake-ato.com" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].scamEmail).toBe("phish[@]fake-ato[.]com");
  });

  it("defangs scam_reply_to in returned reports", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, scam_reply_to: "replies@elsewhere.ru" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].scamReplyTo).toBe("replies[@]elsewhere[.]ru");
  });

  it("applies defangPhone to scam_phone in returned reports", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, scam_phone: "+61412345678" }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    // Strip invisible characters; the visible digits must be intact
    const visible = reports[0].scamPhone.replace(/[^\x20-\x7E]/g, "");
    expect(visible).toBe("+61412345678");
    // Invisible joiners were inserted
    expect(reports[0].scamPhone.length).toBeGreaterThan("+61412345678".length);
  });

  it("returns empty strings for missing identifier columns", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [baseRow] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].scamUrl).toBe("");
    expect(reports[0].scamPhone).toBe("");
    expect(reports[0].scamEmail).toBe("");
  });

  it("passes the limit option to the query", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ limit: 5 });
    const call = mockExecute.mock.calls[0][0] as { args: unknown[] };
    expect(call.args).toContain(5);
  });

  it("maps report_count to matchCount", async () => {
    const mockExecute = vi.fn().mockResolvedValue({
      rows: [{ ...baseRow, report_count: 7 }],
    });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].matchCount).toBe(7);
  });

  it("defaults matchCount to 1 when report_count column is absent", async () => {
    const { report_count: _, ...rowWithoutCount } = baseRow;
    const mockExecute = vi.fn().mockResolvedValue({ rows: [rowWithoutCount] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const reports = await getPublicReports();
    expect(reports[0].matchCount).toBe(1);
  });

  it("orders by report_count DESC for sort='most'", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ sort: "most" });
    const { sql } = mockExecute.mock.calls[0][0] as { sql: string };
    expect(sql).toContain("report_count DESC");
  });

  it("orders by report_count ASC for sort='least'", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ sort: "least" });
    const { sql } = mockExecute.mock.calls[0][0] as { sql: string };
    expect(sql).toContain("report_count ASC");
  });

  it("includes search term as LIKE parameters when provided", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ search: "fake-ato" });
    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain("LIKE ?");
    expect(call.args).toContain("%fake-ato%");
  });

  it("searches across content, scam_url, scam_phone, scam_email, and id", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ search: "evil" });
    const { sql, args } = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(sql).toContain("content LIKE ?");
    expect(sql).toContain("scam_url LIKE ?");
    expect(sql).toContain("scam_phone LIKE ?");
    expect(sql).toContain("scam_email LIKE ?");
    expect(sql).toContain("id LIKE ?");
    // Same search term passed for each column
    expect(args.filter((a) => a === "%evil%")).toHaveLength(5);
  });

  it("omits the search clause when search is empty or whitespace", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    await getPublicReports({ search: "   " });
    const { sql } = mockExecute.mock.calls[0][0] as { sql: string };
    expect(sql).not.toContain("LIKE");
  });
});

// ── getPublicReportsCount with search ─────────────────────────────────────────

describe("getPublicReportsCount", () => {
  it("includes search term in the WHERE clause", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [{ n: 3 }] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const count = await getPublicReportsCount({ search: "scam" });
    expect(count).toBe(3);
    const call = mockExecute.mock.calls[0][0] as { sql: string; args: unknown[] };
    expect(call.sql).toContain("LIKE ?");
    expect(call.args).toContain("%scam%");
  });

  it("returns the total without search when search is absent", async () => {
    const mockExecute = vi.fn().mockResolvedValue({ rows: [{ n: 42 }] });
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);

    const count = await getPublicReportsCount();
    expect(count).toBe(42);
    const call = mockExecute.mock.calls[0][0] as { sql: string };
    expect(call.sql).not.toContain("LIKE");
  });
});

describe("countRecent", () => {
  // A fixed clock: the whole point of countRecent taking `now` is that its
  // output doesn't depend on when the test runs.
  const now = Date.parse("2026-08-30T12:00:00Z");
  const day = (iso: string, count: number) => ({ date: iso, count });

  it("counts only days inside the window", () => {
    const byDay = [
      day("2026-08-01", 100), // well outside
      day("2026-08-23", 5),   // exactly on the cutoff
      day("2026-08-28", 3),
      day("2026-08-30", 2),
    ];
    expect(countRecent(byDay, now)).toBe(10);
  });

  it("returns 0 for an empty feed", () => {
    // The case that produced the visibly empty half of the stats card: a feed
    // with nothing recent is normal, and must report zero rather than break.
    expect(countRecent([], now)).toBe(0);
  });

  it("returns 0 when everything is older than the window", () => {
    expect(countRecent([day("2026-01-01", 40)], now)).toBe(0);
  });

  it("honours a custom window", () => {
    const byDay = [day("2026-08-02", 7), day("2026-08-29", 1)];
    expect(countRecent(byDay, now, 1)).toBe(1);
    expect(countRecent(byDay, now, 365)).toBe(8);
  });

  it("does not mutate its input", () => {
    const byDay = [day("2026-08-29", 1)];
    const copy = structuredClone(byDay);
    countRecent(byDay, now);
    expect(byDay).toEqual(copy);
  });
});

describe("smoothPath", () => {
  const pts = (...ys: number[]) => ys.map((y, i) => ({ x: i * 10, y }));

  it("returns nothing for fewer than two points", () => {
    expect(smoothPath([])).toBe("");
    expect(smoothPath([{ x: 0, y: 0 }])).toBe("");
  });

  it("starts at the first point and ends at the last", () => {
    const d = smoothPath(pts(10, 4, 8));
    expect(d.startsWith("M0.00,10.00")).toBe(true);
    expect(d.endsWith("20.00,8.00")).toBe(true);
  });

  it("passes exactly through every point", () => {
    // The property that matters: a curve that merely approximates the points
    // would draw a count nobody reported. Every input point must appear as a
    // segment endpoint.
    const input = pts(5, 12, 3, 9, 9, 1);
    const d = smoothPath(input);
    for (const p of input) {
      expect(d).toContain(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
    }
  });

  it("emits one cubic segment per gap", () => {
    expect((smoothPath(pts(1, 2, 3, 4)).match(/C/g) ?? []).length).toBe(3);
  });

  it("never overshoots the values it connects", () => {
    // A spline through a spike can bulge past it. Control points are clamped to
    // each segment's own range, so no drawn y may fall outside the data range.
    const input = pts(2, 2, 40, 2, 2);
    const d = smoothPath(input);
    const ys = [...d.matchAll(/[ML,C]?[\d.]+,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(40);
  });

  it("handles a flat series without producing NaN", () => {
    const d = smoothPath(pts(7, 7, 7, 7));
    expect(d).not.toContain("NaN");
  });
});

describe("axisTicks", () => {
  it("always includes zero", () => {
    expect(axisTicks(9)[0]).toBe(0);
    expect(axisTicks(0)).toEqual([0]);
  });

  it("covers the maximum", () => {
    for (const max of [1, 3, 7, 9, 12, 47, 130, 999]) {
      const ticks = axisTicks(max);
      expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max);
    }
  });

  it("uses round steps a reader recognises", () => {
    // The point of the 1/2/5 ladder: labels land on 0/5/10, not on whatever
    // the data's maximum happens to divide into.
    expect(axisTicks(9)).toEqual([0, 5, 10]);
    expect(axisTicks(12)).toEqual([0, 5, 10, 15]);
    expect(axisTicks(7)).toEqual([0, 5, 10]);
    expect(axisTicks(3)).toEqual([0, 1, 2, 3]);
  });

  it("keeps an even step throughout", () => {
    const ticks = axisTicks(47);
    const steps = ticks.slice(1).map((v, i) => v - ticks[i]);
    expect(new Set(steps.map((s) => s.toFixed(6))).size).toBe(1);
  });

  it("survives junk input rather than looping forever", () => {
    expect(axisTicks(-5)).toEqual([0]);
    expect(axisTicks(NaN)).toEqual([0]);
    expect(axisTicks(Infinity)).toEqual([0]);
  });
});
