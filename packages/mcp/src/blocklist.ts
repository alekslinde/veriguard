// URLhaus (abuse.ch) blocklist, fetched for a long-lived process.
//
// lib/urlhausBlocklist.ts does this job for the website, but it wraps the fetch
// in `unstable_cache` from next/cache — a request-scoped cache tied to a
// framework this package must not depend on. The parsing below is the same
// shape deliberately; what differs is the caching, because the lifetimes differ:
//
//   · The website caches per request across many short-lived invocations.
//   · This server is one process a developer leaves running for hours, so it
//     refreshes on a timer and serves from memory in between.
//
// The fetch goes to a fixed abuse.ch endpoint, chosen by us and named in the
// README. It is never a host that arrived in input being checked — that
// distinction is the whole privacy contract, and __tests__/privacyInvariant
// .test.ts enforces it on the engine side.

import type { HostLookup } from "@veriguard/scam-detect/engineTypes";

const URLHAUS_CSV = "https://urlhaus.abuse.ch/downloads/csv_recent/";

/** Matches the website's window, so the two surfaces see the same feed age. */
const TTL_MS = 6 * 60 * 60 * 1000;

/** Bounds memory and parse time on a feed that can grow without warning. */
const MAX_ENTRIES = 5000;

/** A fetch of the feed that hangs must not wedge the server's first check. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * How long to wait after a failed refresh before trying again.
 *
 * Shorter than the TTL, because a transient failure should not cost six hours
 * of blocklist coverage, and long enough that a sustained outage is not
 * hammered. One minute also bounds the worst case a user can feel: at most one
 * FETCH_TIMEOUT_MS wait per minute rather than one per tool call.
 */
const RETRY_AFTER_FAILURE_MS = 60_000;

function parseHostnames(csv: string): Set<string> {
  const hostnames = new Set<string>();
  for (const line of csv.split("\n")) {
    if (line.startsWith("#") || line.startsWith('"id"') || !line.trim()) continue;

    // CSV columns: id, dateadded, url, url_status, last_online, threat, tags, urlhaus_link, reporter
    const cols = line.split('","');
    if (cols.length < 4) continue;

    const urlStatus = cols[3]?.replace(/"/g, "").trim();
    if (urlStatus !== "online") continue; // skip already-taken-down entries

    const rawUrl = cols[2]?.replace(/^"/, "").trim();
    if (!rawUrl) continue;

    try {
      const { hostname } = new URL(rawUrl);
      if (hostname) hostnames.add(hostname.toLowerCase());
    } catch {
      // malformed URL in feed — skip
    }

    if (hostnames.size >= MAX_ENTRIES) break;
  }
  return hostnames;
}

/**
 * A blocklist that refreshes in the background and never blocks a check.
 *
 * `has` is synchronous and total, per the HostLookup contract: before the first
 * fetch lands it answers false for everything. That is the right failure mode —
 * a missing blocklist costs one signal on a host that other rules still score,
 * whereas making the scorer wait on a network round trip would put abuse.ch's
 * availability in the path of every check.
 *
 * A failed refresh keeps serving the previous copy rather than emptying it. The
 * feed being briefly unreachable is not evidence that its entries became safe.
 */
export class UrlhausBlocklist implements HostLookup {
  #hosts = new Set<string>();
  #fetchedAt = 0;
  /** When the last attempt failed, so a dead feed is not retried every call. */
  #failedAt = 0;
  #inFlight: Promise<void> | null = null;

  has(hostname: string): boolean {
    return this.#hosts.has(hostname);
  }

  /** Entries currently loaded. Zero before the first successful refresh. */
  get size(): number {
    return this.#hosts.size;
  }

  /** Whether a usable copy is loaded, for the server's startup log. */
  get ready(): boolean {
    return this.#fetchedAt > 0;
  }

  /**
   * Refresh if the copy is older than the TTL and we are not backing off.
   *
   * Concurrent callers share one in-flight request: the server calls this
   * before each check, and a burst of tool calls must not become a burst of
   * requests to abuse.ch.
   */
  async refreshIfStale(): Promise<void> {
    if (Date.now() - this.#fetchedAt < TTL_MS) return;
    // A failed attempt is remembered, or every call retries. See #failedAt.
    if (Date.now() - this.#failedAt < RETRY_AFTER_FAILURE_MS) return;
    if (this.#inFlight) return this.#inFlight;

    this.#inFlight = this.#refresh().finally(() => {
      this.#inFlight = null;
    });
    return this.#inFlight;
  }

  async #refresh(): Promise<void> {
    try {
      const res = await fetch(URLHAUS_CSV, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "User-Agent": "veriguard-mcp (scam-detection tool)" },
      });
      if (!res.ok) return this.#fail();

      const parsed = parseHostnames(await res.text());
      // An empty parse means the feed changed shape or returned an error body
      // with a 200. Keeping the previous copy is safer than trusting it.
      if (parsed.size === 0) return this.#fail();

      this.#hosts = parsed;
      this.#fetchedAt = Date.now();
      this.#failedAt = 0;
    } catch {
      // Unreachable or timed out. Keep whatever we had; see the class comment.
      this.#fail();
    }
  }

  /**
   * Record a failed attempt so the next calls do not retry immediately.
   *
   * Without this, a stale copy plus an unreachable feed means every tool call
   * re-issues the fetch and waits up to FETCH_TIMEOUT_MS before answering,
   * because only success advanced the clock. A third-party feed being down for
   * longer than the TTL is an ordinary condition, not an exotic one, and the
   * cost landed on the person waiting for a verdict.
   */
  #fail(): void {
    this.#failedAt = Date.now();
  }
}

/** Exported for tests, which parse fixture CSV without touching the network. */
export { parseHostnames };
