import { describe, it, expect, vi, beforeEach } from "vitest";
import { isShortened, expandUrl, SHORTENER_HOSTS } from "@veriguard/detect/urlExpander";

// ── Feature: isShortened ──────────────────────────────────────────────────────

describe("Feature: isShortened — identifying known shortener hostnames", () => {
  it("recognises bit.ly as a shortener", () => {
    expect(isShortened("https://bit.ly/abc123")).toBe(true);
  });

  it("recognises tinyurl.com as a shortener", () => {
    expect(isShortened("https://tinyurl.com/xyz")).toBe(true);
  });

  it("recognises every host declared in SHORTENER_HOSTS", () => {
    for (const host of SHORTENER_HOSTS) {
      expect(isShortened(`https://${host}/x`), `${host} should be detected`).toBe(true);
    }
  });

  it("returns false for a legitimate non-shortener domain", () => {
    expect(isShortened("https://commbank.com.au/login")).toBe(false);
  });

  it("returns false when the hostname only partially matches a shortener name", () => {
    // 'bit.ly' must match the whole hostname, not a substring
    expect(isShortened("https://notbit.ly.evil.com/path")).toBe(false);
  });

  it("handles a URL supplied without a scheme", () => {
    expect(isShortened("bit.ly/abc")).toBe(true);
  });

  it("returns false for an unparseable string rather than throwing", () => {
    expect(isShortened("not a url %%")).toBe(false);
  });
});

// ── Feature: expandUrl ────────────────────────────────────────────────────────

describe("Feature: expandUrl — following redirects to reveal the real destination", () => {
  // The transport is injected rather than stubbed onto the global: the module
  // never reaches for a global fetch, so passing the spy here is what a real
  // caller does. See the transport contract in lib/urlExpander.ts.
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  it("returns the Location header as expandedUrl on a 301 redirect", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://evil-phishing.tk/steal" } }),
    );

    const result = await expandUrl("https://bit.ly/xp-301-unique", fetchSpy);
    expect(result.expandedUrl).toBe("https://evil-phishing.tk/steal");
    expect(result.hops).toEqual(["https://evil-phishing.tk/steal"]);
  });

  it("returns the Location header as expandedUrl on a 302 redirect", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://real-destination.com/page" } }),
    );

    const result = await expandUrl("https://tinyurl.com/xp-302-unique", fetchSpy);
    expect(result.expandedUrl).toBe("https://real-destination.com/page");
    expect(result.hops).toEqual(["https://real-destination.com/page"]);
  });

  it("returns null expandedUrl and empty hops when no Location header is present", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await expandUrl("https://bit.ly/xp-noloc-unique", fetchSpy);
    expect(result.expandedUrl).toBeNull();
    expect(result.hops).toEqual([]);
  });

  it("returns null expandedUrl gracefully when fetch throws a network error", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network failure"));

    const result = await expandUrl("https://bit.ly/xp-neterr-unique", fetchSpy);
    expect(result.expandedUrl).toBeNull();
    expect(result.hops).toEqual([]);
  });

  it("returns null expandedUrl gracefully when fetch times out", async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException("The operation was aborted", "AbortError"));

    const result = await expandUrl("https://bit.ly/xp-timeout-unique", fetchSpy);
    expect(result.expandedUrl).toBeNull();
    expect(result.hops).toEqual([]);
  });

  it("follows a chain of shorteners and returns the final non-shortener destination", async () => {
    // bit.ly → tinyurl.com → final destination
    fetchSpy
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://tinyurl.com/hop2" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://final-scam.tk/phish" } }),
      );

    const result = await expandUrl("https://bit.ly/xp-chain-unique", fetchSpy);
    expect(result.expandedUrl).toBe("https://final-scam.tk/phish");
    expect(result.hops).toContain("https://tinyurl.com/hop2");
    expect(result.hops).toContain("https://final-scam.tk/phish");
    expect(result.hops.length).toBe(2);
  });

  it("stops expanding after MAX_HOPS, making no further requests", async () => {
    // bit.ly → tinyurl.com → rb.gy → is.gd: four-hop chain but MAX_HOPS = 3,
    // so exactly 3 fetches are issued and the 4th shortener is never contacted.
    //
    // This used to also assert expandedUrl was non-null, which encoded a bug:
    // the cut-short chain returned the last *shortener* as the real
    // destination. The hop cap is the contract worth asserting; what the cutoff
    // reports is covered by the regression tests at the end of this file.
    fetchSpy
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://tinyurl.com/h2" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://rb.gy/h3" } }),
      )
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { location: "https://is.gd/h4" } }),
      );

    await expandUrl("https://bit.ly/xp-maxhops-unique", fetchSpy);
    // Exactly MAX_HOPS (3) fetch calls — the chain is cut there
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("caches the result so a second call with the same URL does not issue a second fetch", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://destination.com/page" } }),
    );

    const url = "https://bit.ly/xp-cache-unique";
    const first = await expandUrl(url, fetchSpy);
    const second = await expandUrl(url, fetchSpy);

    expect(first).toEqual(second);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("sends a HEAD request to the shortener, never a GET, to avoid downloading scam payloads", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://evil.tk/x" } }),
    );

    await expandUrl("https://bit.ly/xp-method-unique", fetchSpy);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ method: "HEAD" }),
    );
  });

  it("sends redirect: 'manual' so the fetch layer does not follow redirects on its own", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://evil.tk/x" } }),
    );

    await expandUrl("https://bit.ly/xp-redirect-mode-unique", fetchSpy);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: "manual" }),
    );
  });
});

// ── Feature: the transport contract ───────────────────────────────────────────

describe("Feature: expandUrl transport contract — no ambient network access", () => {
  it("makes no network call when no transport is supplied", async () => {
    // The guarantee a bundled client relies on: without a transport the engine
    // is pure string analysis and cannot leak the user's IP to a shortener.
    const globalFetch = vi.fn();
    vi.stubGlobal("fetch", globalFetch);
    try {
      const result = await expandUrl("https://bit.ly/no-transport");
      expect(globalFetch).not.toHaveBeenCalled();
      expect(result.expandedUrl).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reports 'unavailable' rather than 'failed' when it never tried", async () => {
    // The distinction a caller needs to say "could not check" instead of
    // silently dropping the signal.
    const result = await expandUrl("https://bit.ly/unavailable-status");
    expect(result.status).toBe("unavailable");
  });

  it("does not cache an unavailable result, so gaining a transport later works", async () => {
    const url = "https://bit.ly/xp-uncached-unavailable";
    expect((await expandUrl(url)).status).toBe("unavailable");

    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://real-destination.com/p" } }),
    );
    const second = await expandUrl(url, fetchSpy);
    expect(second.status).toBe("expanded");
    expect(second.expandedUrl).toBe("https://real-destination.com/p");
  });

  it("reports 'failed' when a transport was supplied but returned nothing useful", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await expandUrl("https://bit.ly/xp-no-location", fetchSpy);
    expect(result.status).toBe("failed");
    expect(result.expandedUrl).toBeNull();
  });

  it("reports 'failed' when the transport throws, without propagating the error", async () => {
    const fetchSpy = vi.fn().mockRejectedValueOnce(new Error("network down"));
    const result = await expandUrl("https://bit.ly/xp-throws", fetchSpy);
    expect(result.status).toBe("failed");
  });

  it("only ever contacts allowlisted shortener hosts, never the destination", async () => {
    // The security contract: scammer infrastructure is never reached.
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: "https://scam-site.tk/steal" } }),
    );
    await expandUrl("https://bit.ly/xp-allowlist-only", fetchSpy);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    for (const [calledUrl] of fetchSpy.mock.calls) {
      expect(isShortened(calledUrl as string), `contacted ${calledUrl}`).toBe(true);
    }
  });
});

// ── Regression: an unresolved chain must never be reported as expanded ────────

describe("Feature: expandUrl — a chain that does not resolve is not 'expanded'", () => {
  // The recursion once stamped status "expanded" on the way back out and fell
  // back to `inner.expandedUrl ?? dest`, so a shortener URL was returned as the
  // verified real destination. applyExpansion then scored THAT with checkUrl,
  // found bit.ly reputable, and reported a malicious chain as clean.
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
  });

  function redirectTo(location: string) {
    return new Response(null, { status: 301, headers: { location } });
  }

  it("reports failure, not a shortener, when the hop budget runs out", async () => {
    // Four shorteners deep; MAX_HOPS is 3, so the chain is cut mid-flight.
    fetchSpy
      .mockResolvedValueOnce(redirectTo("https://tinyurl.com/mh2"))
      .mockResolvedValueOnce(redirectTo("https://is.gd/mh3"))
      .mockResolvedValueOnce(redirectTo("https://cutt.ly/mh4"));

    const result = await expandUrl("https://bit.ly/xp-maxhop-regression", fetchSpy);
    expect(result.status).toBe("failed");
    expect(result.expandedUrl).toBeNull();
  });

  it("never returns a known shortener as the resolved destination", async () => {
    fetchSpy
      .mockResolvedValueOnce(redirectTo("https://tinyurl.com/sh2"))
      .mockResolvedValueOnce(redirectTo("https://is.gd/sh3"))
      .mockResolvedValueOnce(redirectTo("https://cutt.ly/sh4"));

    const { expandedUrl } = await expandUrl("https://bit.ly/xp-never-shortener", fetchSpy);
    if (expandedUrl) expect(isShortened(expandedUrl)).toBe(false);
  });

  it("reports failure when an inner hop times out", async () => {
    fetchSpy
      .mockResolvedValueOnce(redirectTo("https://tinyurl.com/if2"))
      .mockRejectedValueOnce(new Error("timeout"));

    const result = await expandUrl("https://bit.ly/xp-inner-timeout", fetchSpy);
    expect(result.status).toBe("failed");
    expect(result.expandedUrl).toBeNull();
  });

  it("reports failure when an inner hop returns no Location header", async () => {
    fetchSpy
      .mockResolvedValueOnce(redirectTo("https://tinyurl.com/nl2"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await expandUrl("https://bit.ly/xp-inner-nolocation", fetchSpy);
    expect(result.status).toBe("failed");
    expect(result.expandedUrl).toBeNull();
  });

  it("still resolves a chain that reaches a real destination in budget", async () => {
    // The fix must not break the case the recursion exists for.
    fetchSpy
      .mockResolvedValueOnce(redirectTo("https://tinyurl.com/ok2"))
      .mockResolvedValueOnce(redirectTo("https://evil-final.tk/steal"));

    const result = await expandUrl("https://bit.ly/xp-chain-resolves", fetchSpy);
    expect(result.status).toBe("expanded");
    expect(result.expandedUrl).toBe("https://evil-final.tk/steal");
    expect(result.hops).toEqual(["https://tinyurl.com/ok2", "https://evil-final.tk/steal"]);
  });

  it("records the hops actually walked when the chain is cut short", async () => {
    // hops feeds the "Multi-hop chain (N redirects)" flag, so it must reflect
    // what was really traversed rather than being dropped or inflated.
    fetchSpy
      .mockResolvedValueOnce(redirectTo("https://tinyurl.com/hp2"))
      .mockResolvedValueOnce(redirectTo("https://is.gd/hp3"))
      .mockResolvedValueOnce(redirectTo("https://cutt.ly/hp4"));

    const result = await expandUrl("https://bit.ly/xp-hops-recorded", fetchSpy);
    expect(result.hops).toEqual([
      "https://tinyurl.com/hp2",
      "https://is.gd/hp3",
      "https://cutt.ly/hp4",
    ]);
  });
});
