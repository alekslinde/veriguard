// The blocklist endpoint.
//
// What matters here is not that it returns data, but that it returns the *right
// shape* and refuses to become something else. The endpoint's whole safety
// argument is that it is a static cached payload rather than a per-query oracle,
// and that argument only holds while there is no way to ask it about one host.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hashHost, HOST_HASH_ALGORITHM, HOST_HASH_HEX_LENGTH } from "@veriguard/engine/hostHash";

const HOSTS = ["evil.example", "phish.test", "malware.invalid"];

vi.mock("@/lib/urlhausBlocklist", () => ({
  BLOCKLIST_TTL_SECONDS: 21600,
  getUrlhausBlocklist: vi.fn(async () => new Set(HOSTS)),
}));

vi.mock("@/lib/reportStore", () => ({
  FEED_RATE_LIMIT: 240,
  checkAndRecordRateLimit: vi.fn(() => true),
}));

vi.mock("@/lib/geo", () => ({ clientIpFromHeaders: vi.fn(() => "203.0.113.9") }));

import { GET, OPTIONS } from "@/app/api/blocklist/route";
import { getUrlhausBlocklist } from "@/lib/urlhausBlocklist";
import { checkAndRecordRateLimit } from "@/lib/reportStore";
import { NextRequest } from "next/server";

const req = (headers: Record<string, string> = {}) =>
  new NextRequest("https://veriguard.app/api/blocklist", { headers });

beforeEach(() => {
  vi.mocked(checkAndRecordRateLimit).mockReturnValue(true);
  vi.mocked(getUrlhausBlocklist).mockResolvedValue(new Set(HOSTS));
});

afterEach(() => vi.clearAllMocks());

describe("GET /api/blocklist", () => {
  it("returns the feed as truncated hashes, not hostnames", async () => {
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.algorithm).toBe(HOST_HASH_ALGORITHM);
    expect(body.hexLength).toBe(HOST_HASH_HEX_LENGTH);
    expect(body.count).toBe(HOSTS.length);
    expect(body.hashes).toHaveLength(HOSTS.length);

    // The point of the endpoint: no hostname appears in the response.
    const raw = JSON.stringify(body);
    for (const host of HOSTS) expect(raw).not.toContain(host);
  });

  it("publishes hashes the shared scheme reproduces", async () => {
    // Server and client must agree byte for byte. A mismatch would not throw —
    // every lookup would just answer false, which looks exactly like a clean
    // feed.
    const body = await (await GET(req())).json();
    for (const host of HOSTS) expect(body.hashes).toContain(hashHost(host));
  });

  it("sorts the hashes so an unchanged feed produces an unchanged body", async () => {
    const body = await (await GET(req())).json();
    expect(body.hashes).toEqual([...body.hashes].sort());
  });

  it("states a TTL matching the server's own refresh window", async () => {
    const body = await (await GET(req())).json();
    expect(body.ttl).toBe(21600);
  });

  it("keeps the edge window under the client's, so the two do not compound", async () => {
    // The windows are sequential, not alternatives: a client refetches after
    // `ttl`, and an edge copy already `ttl` old at that moment hands it entries
    // twice that age. Equal windows therefore promise six hours of staleness and
    // deliver up to twelve, so the edge gets a fraction of the client's.
    const res = await GET(req());
    const cache = res.headers.get("Cache-Control")!;
    const edge = Number(/s-maxage=(\d+)/.exec(cache)![1]);
    const { ttl } = await (await GET(req())).json();

    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(ttl);
    // The client's stated ttl is the honest bound on the whole chain.
    expect(edge + ttl).toBeLessThanOrEqual(ttl * 1.5);
  });

  it("caches an empty response only briefly", async () => {
    // An empty feed means the upstream fetch failed — getUrlhausBlocklist
    // degrades to an empty set. Caching that for six hours would pin the
    // failure in place long after it recovered.
    vi.mocked(getUrlhausBlocklist).mockResolvedValue(new Set());
    const res = await GET(req());
    const body = await res.json();

    expect(body.count).toBe(0);
    expect(res.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(res.headers.get("Cache-Control")).not.toContain("s-maxage=21600");
  });

  it("throttles on the shared read budget", async () => {
    vi.mocked(checkAndRecordRateLimit).mockReturnValue(false);
    const res = await GET(req());

    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe("rate_limited");
    // A stored 429 would lock out every client behind the same CDN node.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not throttle an unidentifiable caller into a shared bucket", async () => {
    const { clientIpFromHeaders } = await import("@/lib/geo");
    vi.mocked(clientIpFromHeaders).mockReturnValue("unknown");
    await GET(req());
    expect(checkAndRecordRateLimit).not.toHaveBeenCalled();
  });

  it("carries Vary: Origin whether or not the caller is allowlisted", async () => {
    // The route's output depends on Origin, so every response must say so —
    // otherwise a shared cache may hand one origin's response to another.
    const res = await GET(req({ origin: "https://not-allowed.example" }));
    expect(res.headers.get("Vary")).toBe("Origin");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers a preflight", async () => {
    const res = await OPTIONS(req({ origin: "https://veriguard.app" }));
    expect(res.status).toBe(204);
  });
});

describe("the endpoint is a list, not a lookup", () => {
  it("ignores any attempt to ask about a single host", async () => {
    // There is deliberately no ?host= parameter. Answering "is this host
    // malicious" for arbitrary callers would turn a cached static payload into
    // a per-query oracle, and would record which hosts a user is checking —
    // the knowledge the offline client exists to avoid producing.
    const withQuery = new NextRequest(
      "https://veriguard.app/api/blocklist?host=evil.example&q=evil.example",
    );
    const body = await (await GET(withQuery)).json();

    // Same full payload as the unfiltered call — the parameter changed nothing.
    expect(body.count).toBe(HOSTS.length);
    expect(JSON.stringify(body)).not.toContain("evil.example");
  });
});
