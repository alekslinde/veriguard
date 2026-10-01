// Expands shortened URLs by issuing a HEAD-only request to the shortener
// service itself, then reading the Location redirect header.
//
// Security contract: only whitelisted, known shortener hosts are ever contacted.
// The final destination URL is never fetched — only analysed as a string.
// This is the single documented exception to the no-outbound-fetch contract in
// app/api/check/route.ts. Scammer infrastructure is never reached.
//
// TRANSPORT CONTRACT: this module never reaches for a global fetch. The caller
// supplies one, and supplying nothing means no network access — expansion
// reports itself unavailable rather than silently skipping.
//
// The reason is privacy, and it only becomes visible once the engine runs
// somewhere other than the server. Today the request originates from our
// infrastructure, so the shortener sees us. Bundled into a browser extension
// the identical code would originate from the user's browser, so the shortener
// would see the home IP of someone who found a link suspicious enough to check
// — an exposure the current architecture prevents by accident of where it runs.
// Making the transport an argument forces each client to make that call
// deliberately: the web app passes fetch, and a bundled client either routes
// expansion through our API or goes without it.

const EXPAND_TIMEOUT_MS = 3_000;
const MAX_HOPS = 3;
const CACHE_TTL_MS = 60 * 60 * 1_000; // 1 hour

export const SHORTENER_HOSTS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "short.io",
  "rb.gy", "cutt.ly", "is.gd", "v.gd", "tiny.cc", "shorte.st",
  "buff.ly", "dlvr.it", "j.mp", "lnkd.in", "youtu.be", "fb.me",
  "snip.ly", "bl.ink", "soo.gd", "clck.ru", "x.co",
]);

/** Injected network transport. Structurally a subset of the fetch signature. */
export type ExpandFetch = (
  url: string,
  init: { method: string; redirect: "manual"; signal: AbortSignal; headers: Record<string, string> },
) => Promise<{ headers: { get(name: string): string | null } }>;

export interface ExpandResult {
  expandedUrl: string | null;
  /**
   * The destination as the Location header actually spelled it, before
   * `new URL()` resolved and punycoded it.
   *
   * Needed because that resolution is lossy in one specific way: it encodes a
   * non-ASCII hostname to its "xn--" form, which carries no script information.
   * A caller scoring only `expandedUrl` therefore cannot tell a homoglyph
   * lookalike from an ordinary internationalised domain — and the destination
   * of a shortener is precisely where a hidden lookalike is put.
   *
   * Null whenever `expandedUrl` is, and optional so a caller constructing an
   * ExpandResult by hand (tests, stubs) need not supply it — scoring falls back
   * to `expandedUrl`, which is the pre-existing behaviour.
   *
   * Not for display: prefer `expandedUrl`, which is absolute and normalised.
   * This exists for script inspection.
   */
  rawExpandedUrl?: string | null;
  hops: string[];
  /**
   * Why expandedUrl is null, so a caller can tell "we looked and there was
   * nothing" from "we were unable to look".
   *
   *  · "expanded"    — resolved; expandedUrl is set
   *  · "unavailable" — no transport supplied; we never tried
   *  · "failed"      — tried and got nothing (timeout, no Location, error)
   *
   * The distinction matters for user-facing copy: a client with no transport
   * should say "this is a shortened link we could not unshorten" rather than
   * dropping the signal, which is what the previous silent null did.
   */
  status: "expanded" | "unavailable" | "failed";
}

const cache = new Map<string, { result: ExpandResult; expiresAt: number }>();

export function isShortened(url: string): boolean {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return SHORTENER_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function expandUrl(shortUrl: string, fetcher?: ExpandFetch): Promise<ExpandResult> {
  // No transport — report unavailability instead of pretending we looked.
  // Not cached: a client that gains a transport later must not be served this.
  if (!fetcher) return { expandedUrl: null, rawExpandedUrl: null, hops: [], status: "unavailable" };

  const cacheKey = shortUrl.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() < hit.expiresAt) return hit.result;

  const result = await followRedirects(shortUrl, MAX_HOPS, fetcher);
  cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

async function followRedirects(
  url: string,
  remainingHops: number,
  fetcher: ExpandFetch,
): Promise<ExpandResult> {
  if (remainingHops === 0) return { expandedUrl: null, rawExpandedUrl: null, hops: [], status: "failed" };

  try {
    const res = await fetcher(url, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(EXPAND_TIMEOUT_MS),
      headers: { "User-Agent": "veriguard/1.0 (scam-detection tool)" },
    });

    const location = res.headers.get("location");
    if (!location) return { expandedUrl: null, rawExpandedUrl: null, hops: [], status: "failed" };

    const dest = new URL(location, url).toString();

    // Recursively follow if the destination is also a known shortener,
    // but only while hops remain — prevents infinite chains.
    if (isShortened(dest)) {
      // Out of hops, or the inner hop did not resolve: we reached a shortener
      // and stopped there. Report the failure rather than presenting that
      // shortener as the real destination — a caller that scored it would find
      // bit.ly reputable and tell the user a malicious chain looked clean.
      // `hops` still records how far we actually got, for the multi-hop signal.
      if (remainingHops <= 1) {
        return { expandedUrl: null, rawExpandedUrl: null, hops: [dest], status: "failed" };
      }

      const inner = await followRedirects(dest, remainingHops - 1, fetcher);
      if (!inner.expandedUrl) {
        return { expandedUrl: null, rawExpandedUrl: null, hops: [dest, ...inner.hops], status: inner.status };
      }
      return {
        expandedUrl: inner.expandedUrl,
        rawExpandedUrl: inner.rawExpandedUrl,
        hops: [dest, ...inner.hops],
        status: "expanded",
      };
    }

    // `location` rather than `dest`: the raw header text, before new URL()
    // resolved and punycoded it. Falls back to dest for a relative header,
    // which cannot carry a hostname anyway.
    return {
      expandedUrl: dest,
      rawExpandedUrl: /^[a-z][a-z0-9+.-]*:\/\//i.test(location) ? location : dest,
      hops: [dest],
      status: "expanded",
    };
  } catch {
    return { expandedUrl: null, rawExpandedUrl: null, hops: [], status: "failed" };
  }
}
