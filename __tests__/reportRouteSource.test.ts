// Attribution, asserted through the route rather than around it.
//
// This file exists because of a specific failure: `source` was built into the
// link, validated on parse, stamped into both extension builds and covered by
// tests at each end — while the form never forwarded it and the route never
// posted it. Every test passed over a feature that recorded nothing, because
// each one checked a hop in isolation and none crossed the gap.
//
// So this drives the real POST handler and reads what it would bind to the
// column. A unit test of either half cannot catch a missing middle; this can.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ getDb: vi.fn() }));

import { getDb } from "@/lib/db";
import { POST } from "@/app/api/report/route";

describe("POST /api/report — source attribution", () => {
  // Returns a zero COUNT first, so storeReport's duplicate check passes and it
  // reaches the INSERT.
  const execute = vi.fn().mockResolvedValue({ rows: [{ n: 0 }] });

  beforeEach(() => {
    execute.mockClear();
    vi.mocked(getDb).mockResolvedValue({ execute } as never);
  });

  const post = (body: Record<string, unknown>) =>
    POST(
      new Request("http://localhost/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "url",
          content: "https://evil.example/x",
          scamUrl: "https://evil.example/x",
          description: "probe",
          // Empty honeypot and a dwell time past the minimum, so the
          // submission guard does not discard this as a bot before it reaches
          // the write being tested.
          hp: "",
          loadedAt: Date.now() - 9000,
          ...body,
        }),
      }) as never,
    );

  /** What the handler bound to `source`, read positionally out of the INSERT. */
  const boundSource = (): unknown => {
    const call = execute.mock.calls.find((c) =>
      String((c[0] as { sql: string }).sql).includes("INSERT INTO reports"),
    );
    if (!call) return "<no insert>";
    const sql = String(call[0].sql);
    const columns = sql
      .slice(sql.indexOf("(") + 1, sql.indexOf(")"))
      .split(",")
      .map((c) => c.trim());
    return (call[0].args as unknown[])[columns.indexOf("source")];
  };

  it("records an allowlisted surface", async () => {
    await post({ source: "ext-firefox" });
    expect(boundSource()).toBe("ext-firefox");
  });

  it("discards a crafted surface rather than storing it", async () => {
    // The param rides a link anyone can edit, so this is untrusted input
    // reaching an operational column. It must land as '' — the same value a
    // direct arrival produces — so a stranger cannot invent a category.
    await post({ source: "twitter-campaign-42" });
    expect(boundSource()).toBe("");
  });

  it("stores empty for someone who came to the form directly", async () => {
    // The common case, and not a gap. It must be '' and never undefined, which
    // the driver would reject on a NOT NULL column.
    await post({});
    expect(boundSource()).toBe("");
  });
});
