import { describe, it, expect, vi, beforeEach } from "vitest";

// Avoid any real network: the blocklist fetch and the aggregate counter are
// stubbed so the route runs purely in memory.
vi.mock("@/lib/urlhausBlocklist", () => ({
  getUrlhausBlocklist: async () => new Set<string>(),
}));
const incrementCheckCount = vi.fn(async () => {});
const recordCheckEvent = vi.fn(async () => {});
const recordTargetRegion = vi.fn(async () => {});
vi.mock("@/lib/reportStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportStore")>();
  return {
    ...actual,
    incrementCheckCount: () => incrementCheckCount(),
    recordCheckEvent: (...args: unknown[]) => recordCheckEvent(...(args as [])),
    recordTargetRegion: (...args: unknown[]) => recordTargetRegion(...(args as [])),
  };
});

import { POST, GET } from "@/app/api/inbound/route";
import { NextRequest } from "next/server";

const SECRET = "test-secret-123";

function inbound(bodyObj: unknown, secret: string | null = SECRET): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (secret !== null) headers["x-inbound-secret"] = secret;
  return new NextRequest("http://localhost/api/inbound", {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObj),
  });
}

const SCAM_FORWARD = [
  "From: victim@gmail.com",
  "Subject: Fwd: refund",
  "",
  "---------- Forwarded message ---------",
  "From: ATO <refunds@ato-refund.xyz>",
  "Reply-To: get@payme.cc",
  "Subject: refund",
  "",
  "You are owed money, click http://ato-refund.xyz/claim",
].join("\n");

beforeEach(() => {
  process.env.INBOUND_SECRET = SECRET;
});

describe("POST /api/inbound — auth", () => {
  it("rejects a missing secret with 401", async () => {
    const res = await POST(inbound({ raw: "x", from: "a@b.com" }, null));
    expect(res.status).toBe(401);
  });

  it("rejects a wrong secret with 401", async () => {
    const res = await POST(inbound({ raw: "x", from: "a@b.com" }, "nope"));
    expect(res.status).toBe(401);
  });

  it("is closed by default when INBOUND_SECRET is unset", async () => {
    delete process.env.INBOUND_SECRET;
    const res = await POST(inbound({ raw: "x", from: "a@b.com" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/inbound — analysis", () => {
  it("returns a verdict reply for a forwarded scam, analysing the ORIGINAL sender", async () => {
    const res = await POST(inbound({ raw: SCAM_FORWARD, from: "victim@gmail.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.source).toBe("inline");
    expect(data.reply.subject).toBeTruthy();
    // The reply must reference the scammer, defanged — never the victim, never live.
    expect(data.reply.text).toContain("payme[.]cc");
    expect(data.reply.text).not.toMatch(/victim@gmail\.com/);
    expect(data.reply.text).not.toMatch(/http:\/\/ato-refund\.xyz/);
  });

  it("surfaces broader tracking mechanisms from an inline forward", async () => {
    // Inline forwards now preserve the quoted headers AND body, so header-level
    // (read-receipt) and body-level (pixel) tracking both survive — not just
    // the attachment path.
    const forward = [
      "From: victim@gmail.com",
      "Subject: Fwd: alert",
      "",
      "is this real?",
      "",
      "---------- Forwarded message ---------",
      "From: Bank <noreply@bank-evil.tk>",
      "Disposition-Notification-To: spy@bank-evil.tk",
      "Subject: alert",
      "",
      '<img src="https://trk.bank-evil.tk/pixel/1" width="1" height="1">',
    ].join("\n");
    const data = await (await POST(inbound({ raw: forward, from: "victim@gmail.com" }))).json();
    expect(data.source).toBe("inline");
    expect(data.reply.text).toMatch(/read-receipt request/i);
  });

  it("skips (200, no reply) on empty raw", async () => {
    const res = await POST(inbound({ raw: "", from: "a@b.com" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skip).toBeTruthy();
    expect(data.reply).toBeUndefined();
  });

  it("skips oversized input", async () => {
    const huge = "x".repeat(1_000_001);
    const data = await (await POST(inbound({ raw: huge, from: "a@b.com" }))).json();
    expect(data.skip).toBe("empty-or-too-large");
  });
});

describe("POST /api/inbound — rate limit", () => {
  it("stops replying after repeated forwards from the same sender", async () => {
    const sender = `flood-${Date.now()}@x.com`;
    const replies: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const data = await (await POST(inbound({ raw: SCAM_FORWARD, from: sender }))).json();
      replies.push(!!data.reply);
    }
    // The limiter allows a handful, then no-ops — at least one later call is skipped.
    expect(replies.filter(Boolean).length).toBeLessThan(replies.length);
    expect(replies.at(-1)).toBe(false);
  });
});

describe("POST /api/inbound — check counter", () => {
  // The public "scams checked" number must mean "a person received a verdict",
  // not "we ran an analysis". Cloudflare refuses to send the reply when the
  // incoming forward failed DMARC, so analysing and delivering are genuinely
  // different events and only the second one counts.
  it("does not count a check at analysis time", async () => {
    incrementCheckCount.mockClear();
    const res = await POST(inbound({ raw: SCAM_FORWARD, from: "victim@gmail.com" }));
    const body = await res.json();
    expect(body.reply).toBeTruthy();
    expect(incrementCheckCount).not.toHaveBeenCalled();
  });

  it("records the analysis attempt even when analysis then throws", async () => {
    // Recording after a successful analysis would drop every crash from the
    // `analysed` volume, making the path look healthiest when it fails most.
    recordCheckEvent.mockClear();
    const blocklist = await import("@/lib/urlhausBlocklist");
    const spy = vi
      .spyOn(blocklist, "getUrlhausBlocklist")
      .mockRejectedValueOnce(new Error("boom") as never);

    const res = await POST(inbound({ raw: SCAM_FORWARD, from: "crash-probe@gmail.com" }));
    expect(await res.json()).toMatchObject({ skip: "analysis-error" });
    expect(recordCheckEvent).toHaveBeenCalledWith("email", "analysed");

    spy.mockRestore();
  });

  it("records the analysis attempt under the analysed outcome, not delivered", async () => {
    // A fresh sender: the per-sender limiter is 4 per 10 min and its state is
    // shared across every test in this file.
    recordCheckEvent.mockClear();
    await POST(inbound({ raw: SCAM_FORWARD, from: "outcome-probe@gmail.com" }));
    expect(recordCheckEvent).toHaveBeenCalledWith("email", "analysed");
  });

  it("counts a check when the Worker confirms the reply was delivered", async () => {
    incrementCheckCount.mockClear();
    const res = await POST(inbound({ delivered: true }));
    expect(await res.json()).toMatchObject({ ok: true, counted: true });
    expect(incrementCheckCount).toHaveBeenCalledTimes(1);
  });

  it("requires the shared secret to confirm a delivery", async () => {
    // Otherwise the public counter would be writable by anyone.
    incrementCheckCount.mockClear();
    const res = await POST(inbound({ delivered: true }, "wrong-secret"));
    expect(res.status).toBe(401);
    expect(incrementCheckCount).not.toHaveBeenCalled();
  });

  it("rate-limits repeated confirmations from the same sender", async () => {
    // The analysis path's limiter used to bound the increment structurally.
    // Without its own limit a secret-holder — or a Cloudflare retry of email()
    // after a successful reply — could inflate a number we publish.
    incrementCheckCount.mockClear();
    const sender = `flood-${Date.now()}@gmail.com`;
    for (let i = 0; i < 40; i++) {
      await POST(inbound({ delivered: true, from: sender }));
    }
    const counted = incrementCheckCount.mock.calls.length;
    expect(counted).toBeGreaterThan(0);
    expect(counted).toBeLessThan(40);
  });

  it("counts confirmations from different senders independently", async () => {
    // The per-sender budget must not let one forwarder starve another.
    incrementCheckCount.mockClear();
    const stamp = Date.now();
    for (let i = 0; i < 5; i++) {
      await POST(inbound({ delivered: true, from: `solo-${stamp}-${i}@gmail.com` }));
    }
    expect(incrementCheckCount).toHaveBeenCalledTimes(5);
  });

  it("refuses a confirmation that also carries raw, rather than counting it", async () => {
    // Piggybacking the confirmation onto the analysis POST would count the check
    // but return no reply, so the Worker would send nothing while the counter
    // climbed. Reject the ambiguous shape instead of silently trapping it.
    incrementCheckCount.mockClear();
    const res = await POST(
      inbound({ delivered: true, raw: SCAM_FORWARD, from: "victim@gmail.com" }),
    );
    const body = await res.json();
    expect(body.counted).toBeUndefined();
    expect(body.reply).toBeUndefined();
    expect(incrementCheckCount).not.toHaveBeenCalled();
  });

  it("ignores a non-true delivered value rather than counting it", async () => {
    incrementCheckCount.mockClear();
    const res = await POST(inbound({ delivered: "yes" }));
    const body = await res.json();
    expect(body.counted).toBeUndefined();
    expect(incrementCheckCount).not.toHaveBeenCalled();
  });
});

// P8 (probe 2026-09-09): the inference was wired to /api/check only, so no
// forwarded email could ever contribute a target-region row — and email was
// the only surface carrying traffic. The evidence is discarded per request and
// cannot be backfilled, so an unwired path loses it permanently.
describe("POST /api/inbound — target-region inference", () => {
  beforeEach(() => recordTargetRegion.mockClear());

  it("records the target region of a forwarded scam on the email surface", async () => {
    const auForward = [
      "From: victim@gmail.com",
      "Subject: Fwd: refund",
      "",
      "---------- Forwarded message ---------",
      "From: myGov <refunds@mygov-refund.com.au>",
      "Subject: refund",
      "",
      "You are owed money, click http://mygov-refund.com.au/claim",
    ].join("\n");
    const res = await POST(inbound({ raw: auForward, from: "p8-au@example.com" }));
    expect((await res.json()).ok).toBe(true);
    expect(recordTargetRegion).toHaveBeenCalledTimes(1);
    const [surface, region, confidence] =
      recordTargetRegion.mock.calls[0] as unknown as string[];
    expect(surface).toBe("email");
    expect(region).toBe("AU");
    expect(confidence).toBe("tld");
  });

  // The whole reason to infer from `original` rather than `raw`. The top-level
  // headers belong to the FORWARDER; inferring from those attributes the
  // campaign to whoever reported it, which is the exact confusion between
  // target and connection region the aggregate exists to expose.
  // The AU signal lives ONLY in the forwarder's own header line, so it is
  // absent from the extracted original entirely — inferring from `raw` yields
  // AU, inferring from `original` yields GB. An earlier version of this test
  // used a `.com.au` sender address and passed under BOTH readings (an email
  // address is not a corroborated hostname, so it never scored), which made it
  // a test that named the right thing without exercising it.
  it("infers from the extracted scam, not the forwarder's own headers", async () => {
    const crossBorder = [
      "From: reporter@example.com",
      "Subject: Fwd: tax — seen at https://www.mygov.com.au/inbox",
      "",
      "---------- Forwarded message ---------",
      "From: HMRC <refunds@hmrc-refund.co.uk>",
      "Subject: tax refund",
      "",
      "Your HMRC refund is pending: http://hmrc-refund.co.uk/claim",
    ].join("\n");
    await POST(inbound({ raw: crossBorder, from: "p8-crossborder@example.com" }));
    expect(recordTargetRegion).toHaveBeenCalledTimes(1);
    const [, region] = recordTargetRegion.mock.calls[0] as unknown as string[];
    // GB (the scam's target), NOT AU (where the forwarder saw it).
    expect(region).toBe("GB");
  });

  it("writes no target-region row on the delivered confirmation branch", async () => {
    await POST(inbound({ delivered: true, from: "p8-delivered@example.com" }));
    expect(recordTargetRegion).not.toHaveBeenCalled();
  });

  // Abstention is the common case and is dropped rather than bucketed, so the
  // call still happens — recordTargetRegion itself drops an empty region.
  it("passes an empty region through when no national signal is present", async () => {
    const neutral = [
      "From: victim@gmail.com",
      "Subject: Fwd: parcel",
      "",
      "---------- Forwarded message ---------",
      "From: delivery@parcel-notice.top",
      "",
      "Your parcel is held. Pay the fee at http://parcel-notice.top/pay",
    ].join("\n");
    await POST(inbound({ raw: neutral, from: "p8-neutral@example.com" }));
    const [, region] = recordTargetRegion.mock.calls[0] as unknown as string[];
    expect(region).toBe("");
  });

  // Telemetry must never fail a check: the forwarder still gets their verdict.
  it("still returns a reply when the aggregate write rejects", async () => {
    recordTargetRegion.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(inbound({ raw: SCAM_FORWARD, from: "p8-reject@example.com" }));
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Not `skip: "analysis-error"` — the telemetry failure must not reach the
    // route's outer catch, which would swallow the verdict the forwarder came for.
    expect(body.skip).toBeUndefined();
    expect(body.reply.subject).toBeTruthy();
  });
});

describe("GET /api/inbound", () => {
  it("is method-not-allowed", async () => {
    expect((await GET()).status).toBe(405);
  });
});
