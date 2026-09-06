import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/urlhausBlocklist", () => ({
  getUrlhausBlocklist: async () => new Set<string>(),
}));

const recordTargetRegion = vi.fn(async () => {});
vi.mock("@/lib/reportStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportStore")>();
  return {
    ...actual,
    incrementCheckCount: async () => {},
    recordTargetRegion: (...args: unknown[]) => recordTargetRegion(...(args as [])),
  };
});

import { POST } from "@/app/api/check/route";
import { NextRequest } from "next/server";

let ipCounter = 0;
function check(body: unknown): NextRequest {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.1.0.${ipCounter % 254}`,
    },
    body: JSON.stringify(body),
  });
}

// The route does not await the telemetry write, by design — the caller is
// waiting on a verdict. Yield so the floated promise settles before asserting.
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => recordTargetRegion.mockClear());

describe("check route — target-region inference", () => {
  it("records the inferred target by default", async () => {
    await POST(check({ content: "HMRC refund at hmrc-refund.co.uk", region: "AU" }));
    await settle();
    expect(recordTargetRegion).toHaveBeenCalledWith("web", "GB", "tld");
  });

  it("records the surface it was checked from", async () => {
    await POST(check({
      content: "HMRC refund at hmrc-refund.co.uk",
      region: "AU",
      surface: "share",
    }));
    await settle();
    expect(recordTargetRegion).toHaveBeenCalledWith("share", "GB", "tld");
  });

  it("honours an explicit opt-out", async () => {
    await POST(check({
      content: "HMRC refund at hmrc-refund.co.uk",
      region: "AU",
      shareRegion: false,
    }));
    await settle();
    expect(recordTargetRegion).not.toHaveBeenCalled();
  });

  it("defaults to on when the field is absent", async () => {
    // The consent decision is default-on, so an older client that does not know
    // about the field must still be counted.
    await POST(check({ content: "HMRC refund at hmrc-refund.co.uk" }));
    await settle();
    expect(recordTargetRegion).toHaveBeenCalled();
  });

  it("records the cross-border case the feature exists for", async () => {
    // Checked from AU, targeting GB. The response still reports AU as the
    // region that assessed it — the disagreement is the finding.
    const res = await POST(check({
      content: "HMRC: your tax refund of £245 is pending. Confirm at hmrc-gov.co.uk",
      region: "AU",
    }));
    await settle();
    expect((await res.json()).region).toBe("AU");
    expect(recordTargetRegion).toHaveBeenCalledWith("web", "GB", expect.any(String));
  });

  it("still records when nothing national is present, and infers nothing", async () => {
    // The empty region is dropped inside recordTargetRegion, not at the route —
    // so the call is made and the store decides. Asserted so a future refactor
    // cannot silently move that responsibility without a test noticing.
    await POST(check({ content: "Hi mum, my phone broke, this is my new number" }));
    await settle();
    expect(recordTargetRegion).toHaveBeenCalledWith("web", "", "none");
  });

  it("does not fail the check when telemetry throws", async () => {
    recordTargetRegion.mockRejectedValueOnce(new Error("db down") as never);
    const res = await POST(check({ content: "HMRC refund at hmrc-refund.co.uk" }));
    await settle();
    expect(res.status).toBe(200);
  });
});
