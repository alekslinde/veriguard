// The extension's blocklist client.
//
// Three properties matter more than "does it fetch":
//
//   1. A check never waits on the network. The fetch is floated; whatever is
//      cached is returned immediately.
//   2. A failure degrades to no-blocklist, never to a wrong answer. Missing the
//      list lowers a score; it can never manufacture a false accusation.
//   3. A response is validated before it is trusted, because a cached copy
//      outlives the session that fetched it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hashHost, HOST_HASH_ALGORITHM } from "@veriguard/engine/hostHash";

// In-memory stand-in for extension storage.
let store: Record<string, unknown> = {};

vi.mock("../extension/src/browser", () => ({
  hasExtensionApi: () => true,
  storageGet: vi.fn(async (key: string) => store[key] ?? null),
  storageSet: vi.fn(async (key: string, value: unknown) => {
    store[key] = value;
  }),
}));

import { getBlocklist } from "../extension/src/blocklist";

const API = "https://api.example.invalid";
const HOSTS = ["evil.example", "phish.test"];

function okResponse(hashes: string[], ttl = 21600) {
  return {
    ok: true,
    json: async () => ({ algorithm: HOST_HASH_ALGORITHM, ttl, hashes, count: hashes.length }),
  };
}

/** Lets a test await the floated background refresh. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  store = {};
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("getBlocklist", () => {
  it("returns nothing on a cold start, without waiting for the fetch", async () => {
    // The first check runs offline-only. Making the user wait on a list fetch to
    // score a message that is mostly scored locally is the wrong trade.
    let resolveFetch: (v: unknown) => void = () => {};
    vi.mocked(fetch).mockReturnValue(new Promise((r) => (resolveFetch = r)) as never);

    const { lookup } = await getBlocklist(API);
    expect(lookup).toBeUndefined();

    // The refresh was still started — it lands in storage for the next check.
    expect(fetch).toHaveBeenCalledOnce();
    resolveFetch(okResponse(HOSTS.map(hashHost)));
  });

  it("stores a fetched list and uses it on the next call", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(HOSTS.map(hashHost)) as never);

    expect((await getBlocklist(API)).lookup).toBeUndefined(); // cold
    await settle();

    const { lookup, fresh } = await getBlocklist(API);
    expect(lookup).toBeDefined();
    expect(fresh).toBe(true);
    for (const host of HOSTS) expect(lookup!.has(host), host).toBe(true);
    expect(lookup!.has("innocent.example")).toBe(false);
  });

  it("does not refetch while the cached copy is fresh", async () => {
    vi.mocked(fetch).mockResolvedValue(okResponse(HOSTS.map(hashHost)) as never);
    await getBlocklist(API);
    await settle();
    vi.mocked(fetch).mockClear();

    await getBlocklist(API);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serves a stale copy rather than nothing, and refreshes behind it", async () => {
    // A host reported malicious six hours ago is overwhelmingly likely still to
    // be. Using a stale list can only raise a score.
    store.blocklist = {
      algorithm: HOST_HASH_ALGORITHM,
      hashes: [hashHost("evil.example")],
      ttl: 1,
      fetchedAt: Date.now() - 86_400_000,
    };
    vi.mocked(fetch).mockResolvedValue(okResponse([hashHost("newer.example")]) as never);

    const { lookup, fresh } = await getBlocklist(API);
    expect(lookup!.has("evil.example")).toBe(true);
    // Used, but not counted as consulted: hosts added since this copy was taken
    // could not have been caught, and the popup says so on a clean verdict.
    expect(fresh).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("degrades to no blocklist when the fetch fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));
    expect((await getBlocklist(API)).lookup).toBeUndefined();
    await settle();
    // The failure is recorded rather than thrown.
    expect((store.blocklist as { failedAt?: number })?.failedAt).toBeTypeOf("number");
  });

  it("backs off after a failure instead of retrying on every check", async () => {
    store.blocklist = {
      algorithm: HOST_HASH_ALGORITHM,
      hashes: [],
      ttl: 21600,
      fetchedAt: 0,
      failedAt: Date.now(),
    };
    vi.mocked(fetch).mockResolvedValue(okResponse([]) as never);

    await getBlocklist(API);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a usable copy when a later refresh fails", async () => {
    // Losing a working list because a refresh failed would turn a temporary
    // outage into a permanent downgrade.
    store.blocklist = {
      algorithm: HOST_HASH_ALGORITHM,
      hashes: [hashHost("evil.example")],
      ttl: 1,
      fetchedAt: Date.now() - 86_400_000,
    };
    vi.mocked(fetch).mockRejectedValue(new Error("offline"));

    const { lookup } = await getBlocklist(API);
    expect(lookup!.has("evil.example")).toBe(true);
    await settle();

    const kept = store.blocklist as { hashes: string[]; failedAt?: number };
    expect(kept.hashes).toEqual([hashHost("evil.example")]);
    expect(kept.failedAt).toBeTypeOf("number");
  });
});

describe("response validation", () => {
  const badResponses: [string, unknown][] = [
    ["an unrecognised algorithm", { algorithm: "md5-32", hashes: ["abc"] }],
    ["a missing algorithm", { hashes: ["abc"] }],
    ["hashes that are not an array", { algorithm: HOST_HASH_ALGORITHM, hashes: "abc" }],
  ];

  for (const [label, body] of badResponses) {
    it(`rejects ${label} rather than caching it`, async () => {
      // A rejected scheme must not be stored and silently matched against:
      // hashes from a scheme this client does not implement answer false for
      // everything, which is indistinguishable from a clean feed.
      vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => body } as never);

      expect((await getBlocklist(API)).lookup).toBeUndefined();
      await settle();
      expect((store.blocklist as { hashes?: string[] })?.hashes ?? []).toHaveLength(0);
    });
  }

  it("drops malformed entries from an otherwise valid response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      okResponse([hashHost("evil.example"), "NOTHEX!!", "", "ZZZZ"]) as never,
    );
    await getBlocklist(API);
    await settle();

    const cached = store.blocklist as { hashes: string[] };
    expect(cached.hashes).toEqual([hashHost("evil.example")]);
  });

  it("ignores a non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 503 } as never);
    expect((await getBlocklist(API)).lookup).toBeUndefined();
  });
});

describe("backoff covers server-side failures too", () => {
  // The backoff existed only for thrown errors, so a refused response retried on
  // every popup open. That is the case it is most needed for: a client that
  // trips the route's rate limit and immediately retries keeps itself locked out
  // for the whole window — the precise abuse pattern the backoff prevents.
  const refusals: [string, unknown][] = [
    ["a 429", { ok: false, status: 429, json: async () => ({ code: "rate_limited" }) }],
    ["a 503", { ok: false, status: 503, json: async () => ({}) }],
    ["a body it will not store", { ok: true, json: async () => ({ algorithm: "md5-32", hashes: [] }) }],
  ];

  for (const [label, response] of refusals) {
    it(`records ${label} as a failure and backs off`, async () => {
      vi.mocked(fetch).mockResolvedValue(response as never);

      await getBlocklist(API);
      await settle();
      expect((store.blocklist as { failedAt?: number })?.failedAt).toBeTypeOf("number");

      // The second open must not produce a second request.
      vi.mocked(fetch).mockClear();
      await getBlocklist(API);
      await settle();
      expect(fetch).not.toHaveBeenCalled();
    });
  }

  it("keeps serving a usable copy through a refusal", async () => {
    store.blocklist = {
      algorithm: HOST_HASH_ALGORITHM,
      hashes: [hashHost("evil.example")],
      ttl: 1,
      fetchedAt: Date.now() - 86_400_000,
    };
    vi.mocked(fetch).mockResolvedValue({ ok: false, status: 429, json: async () => ({}) } as never);

    await getBlocklist(API);
    await settle();

    const { lookup } = await getBlocklist(API);
    expect(lookup!.has("evil.example")).toBe(true);
  });
});
