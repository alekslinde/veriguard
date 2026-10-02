// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the DB layer before importing anything that uses it.
vi.mock("@/lib/db", () => ({
  getDb: vi.fn(),
}));

import {
  generateBugId,
  isBugAction,
  sanitizeBugReport,
  storeBugReport,
} from "@/lib/bugStore";
import { getDb } from "@/lib/db";

describe("generateBugId", () => {
  it("uses the BUG- prefix", () => {
    expect(generateBugId()).toMatch(/^BUG-[0-9A-F]{8}$/);
  });

  it("is unique across calls", () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateBugId()));
    expect(ids.size).toBe(20);
  });
});

describe("isBugAction", () => {
  it("accepts known actions", () => {
    expect(isBugAction("upload")).toBe(true);
    expect(isBugAction("check")).toBe(true);
    expect(isBugAction("report")).toBe(true);
    expect(isBugAction("manual")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isBugAction("delete")).toBe(false);
    expect(isBugAction(42)).toBe(false);
    expect(isBugAction(undefined)).toBe(false);
  });
});

describe("sanitizeBugReport", () => {
  it("falls back to 'manual' for an unknown action", () => {
    expect(sanitizeBugReport({ action: "hax" }).action).toBe("manual");
    expect(sanitizeBugReport({ action: "check" }).action).toBe("check");
  });

  it("scrubs PII from the description", () => {
    const r = sanitizeBugReport({
      description: "It broke, email me at victim@example.com or call 0412 345 678",
    });
    expect(r.description).not.toContain("victim@example.com");
    expect(r.description).not.toContain("0412 345 678");
    expect(r.description).toContain("[email removed]");
  });

  it("caps overly long fields", () => {
    const r = sanitizeBugReport({
      error: "x".repeat(900),
      description: "y".repeat(2000),
      userAgent: "z".repeat(900),
    });
    expect(r.errorMessage.length).toBe(500);
    expect(r.description.length).toBe(1000);
    expect(r.userAgent.length).toBe(400);
  });

  it("coerces missing fields to empty strings", () => {
    const r = sanitizeBugReport({});
    expect(r.errorMessage).toBe("");
    expect(r.description).toBe("");
    expect(r.contact).toBe("");
    expect(r.path).toBe("");
    expect(typeof r.submittedAt).toBe("number");
  });
});

describe("storeBugReport", () => {
  const mockExecute = vi.fn().mockResolvedValue({ rows: [] });

  beforeEach(() => {
    mockExecute.mockClear();
    vi.mocked(getDb).mockResolvedValue({ execute: mockExecute } as never);
  });

  it("inserts a row into bug_reports with the sanitised values", async () => {
    const report = sanitizeBugReport({
      action: "upload",
      error: "OCR request failed",
      description: "Spun forever",
      path: "/",
      viewport: "390×844",
    });
    await storeBugReport(report);

    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ sql: expect.stringContaining("INSERT INTO bug_reports") }),
    );
    const call = mockExecute.mock.calls[0][0] as { args: unknown[] };
    expect(call.args).toContain(report.id);
    expect(call.args).toContain("upload");
    expect(call.args).toContain("OCR request failed");
  });
});
