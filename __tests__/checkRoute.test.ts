import { describe, it, expect, vi } from "vitest";

// Avoid any real network: the blocklist fetch and the aggregate counter are
// stubbed so the route runs purely in memory.
vi.mock("@/lib/urlhausBlocklist", () => ({
  getUrlhausBlocklist: async () => new Set<string>(),
}));
vi.mock("@/lib/reportStore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/reportStore")>();
  return { ...actual, incrementCheckCount: async () => {} };
});

import { POST } from "@/app/api/check/route";
import { NextRequest } from "next/server";
import { DEFAULT_REGION } from "@veriguard/engine/regions";
import { CHECK_RATE_LIMIT } from "@/lib/reportStore";

// The route's rate limiter is module-level state shared across this file, keyed
// on x-forwarded-for. Each request gets a unique synthetic IP so tests can never
// throttle each other — without this the suite would start failing on whichever
// test happened to be the 31st. Rate-limit tests below opt into a fixed IP.
let ipCounter = 0;

function check(body: unknown, headers: Record<string, string> = {}): NextRequest {
  ipCounter += 1;
  return new NextRequest("http://localhost/api/check", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `10.0.0.${ipCounter % 254}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const SCAM = "ATO: your tax refund is waiting, verify now at http://ato-refund.xyz";

describe("POST /api/check region resolution", () => {
  it("reports the region it actually used", async () => {
    const res = await POST(check({ content: SCAM }));
    const json = await res.json();
    expect(json.region).toBe(DEFAULT_REGION);
    expect(json.results.length).toBeGreaterThan(0);
  });

  it("honours an explicit supported region over the geo header", async () => {
    const res = await POST(check({ content: SCAM, region: "AU" }, { "x-vercel-ip-country": "AU" }));
    expect((await res.json()).region).toBe("AU");
  });

  it("resolves from the geo header when no region is supplied", async () => {
    const res = await POST(check({ content: SCAM }, { "x-vercel-ip-country": "AU" }));
    expect((await res.json()).region).toBe("AU");
  });

  it("degrades to the default for an unparseable region rather than erroring", async () => {
    const res = await POST(check({ content: SCAM, region: "QQ" }));
    expect(res.status).toBe(200);
    expect((await res.json()).region).toBe(DEFAULT_REGION);
  });

  it("uses the base-only pack for a known-but-uncovered country", async () => {
    // "DE" until the DE pack shipped; kept as a country with no national layer
    // rather than one that has since acquired one. regionResolver.test.ts
    // derives its equivalent fixture from supportedRegions() — this one names a
    // single country because the assertion is about the route's plumbing, not
    // about which countries are covered.
    const res = await POST(check({ content: SCAM }, { "x-vercel-ip-country": "FR" }));
    const json = await res.json();
    expect(json.region).toBe("ZZ");
    // Universal signals still fire — the .xyz link is caught regardless.
    expect(JSON.stringify(json.results)).toContain("Dodgy top-level domain");
  });

  it("ignores a non-string region without erroring", async () => {
    const res = await POST(check({ content: SCAM, region: { evil: true } }));
    expect(res.status).toBe(200);
    expect((await res.json()).region).toBe(DEFAULT_REGION);
  });

  it("still rejects missing content", async () => {
    const res = await POST(check({ region: "AU" }));
    expect(res.status).toBe(400);
  });

  it("produces the same verdicts with and without an explicit default region", async () => {
    const a = await (await POST(check({ content: SCAM }))).json();
    const b = await (await POST(check({ content: SCAM, region: DEFAULT_REGION }))).json();
    expect(a.results).toEqual(b.results);
  });
});

describe("POST /api/check rate limiting", () => {
  // /api/check is public and unauthenticated. Before Phase 0 it had no limiter
  // at all, so these tests are the regression guard on that gap.
  function checkFrom(ip: string): NextRequest {
    return new NextRequest("http://localhost/api/check", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ content: SCAM }),
    });
  }

  it("allows a normal burst of checks from one client", async () => {
    const ip = "203.0.113.10";
    for (let i = 0; i < CHECK_RATE_LIMIT; i++) {
      expect((await POST(checkFrom(ip))).status).toBe(200);
    }
  });

  it("returns 429 once the budget is spent", async () => {
    const ip = "203.0.113.11";
    for (let i = 0; i < CHECK_RATE_LIMIT; i++) await POST(checkFrom(ip));

    const res = await POST(checkFrom(ip));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/too many checks/i);
  });

  it("throttles per client, so one abuser cannot block everyone else", async () => {
    const noisy = "203.0.113.12";
    for (let i = 0; i < CHECK_RATE_LIMIT + 1; i++) await POST(checkFrom(noisy));
    expect((await POST(checkFrom(noisy))).status).toBe(429);

    expect((await POST(checkFrom("203.0.113.13"))).status).toBe(200);
  });

  it("throttles before analysing, so a spent budget costs no work", async () => {
    const ip = "203.0.113.14";
    for (let i = 0; i < CHECK_RATE_LIMIT; i++) await POST(checkFrom(ip));

    // Malformed body would normally 400 during parsing; the 429 proves the
    // limiter short-circuits ahead of both parsing and analysis.
    const res = await POST(
      new NextRequest("http://localhost/api/check", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: "not json",
      }),
    );
    expect(res.status).toBe(429);
  });

  it("shares no budget with report submissions", async () => {
    // The submission budget is 4; check must not inherit it.
    const ip = "203.0.113.15";
    for (let i = 0; i < 5; i++) {
      expect((await POST(checkFrom(ip))).status).toBe(200);
    }
  });
});
