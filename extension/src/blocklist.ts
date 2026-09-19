// The extension's copy of the URLhaus blocklist.
//
// **This is the one network call the extension makes, and it is worth being
// precise about what it does and does not disclose.** It fetches a static,
// cached list on a timer. It never sends the pasted content, the hostname being
// checked, or anything derived from them — the request body is empty and the URL
// carries no parameters. The server learns that a client asked for the list,
// which is the same thing it learns from any page load, and nothing about what
// the user is checking.
//
// That property is why the endpoint has no `?host=` lookup: a per-query oracle
// would be far more convenient and would disclose exactly what the offline
// client exists to avoid producing.
//
// **The check never waits for it and never fails because of it.** A cached copy
// is used when present; a missing or stale copy means the check runs without the
// blocklist, scoring exactly as it does today. A blocklist that is absent can
// only lower a score, so degrading is a miss, never a false accusation.

import { hashedHostLookup, HOST_HASH_ALGORITHM } from "@veriguard/engine/hostHash";
import type { HostLookup } from "@veriguard/engine/engineTypes";
import { storageGet, storageSet, hasExtensionApi } from "./browser";

const CACHE_KEY = "blocklist";

/** Bounds a malformed or hostile response; the real feed caps at 5000. */
const MAX_HASHES = 20_000;

/** Give up rather than hold a refresh open indefinitely. */
const FETCH_TIMEOUT_MS = 10_000;

/**
 * How long a failed refresh is left alone before trying again.
 *
 * Without this, a client whose fetch fails retries on every popup open — which
 * is the behaviour most likely to look like abuse from the server's side, and
 * the least likely to succeed, since the usual cause is being offline.
 */
const RETRY_AFTER_FAILURE_MS = 30 * 60 * 1000;

/**
 * Lifetime assumed when the server states none.
 *
 * Matches the server's own window. Kept as a fallback rather than imported from
 * `lib/` — that is app-side and the extension cannot reach it — and the server
 * sends `ttl` on every response, so this applies only to a malformed one.
 */
const DEFAULT_TTL_SECONDS = 6 * 60 * 60;

interface CachedBlocklist {
  algorithm: string;
  hashes: string[];
  /** When this copy was stored, epoch ms. */
  fetchedAt: number;
  /** Server-stated lifetime in seconds. */
  ttl: number;
  /** When a refresh last failed, epoch ms — backs off the retry. */
  failedAt?: number;
}

interface BlocklistResponse {
  algorithm?: unknown;
  ttl?: unknown;
  hashes?: unknown;
}

/** Whether a cached copy is still within the lifetime the server stated. */
function isFresh(cache: CachedBlocklist, now: number): boolean {
  return now - cache.fetchedAt < cache.ttl * 1000;
}

/**
 * Validate a response before storing it.
 *
 * The response is treated as untrusted even though it comes from our own
 * origin: a cached copy persists in local storage across updates, and a
 * malformed one that reached storage would be loaded on every subsequent check.
 * An unrecognised algorithm is rejected outright rather than stored and ignored
 * — matching hashes from a scheme this client does not implement would silently
 * answer `false` for everything, which is indistinguishable from a clean feed.
 */
function parse(body: BlocklistResponse, now: number): CachedBlocklist | null {
  if (body.algorithm !== HOST_HASH_ALGORITHM) return null;
  if (!Array.isArray(body.hashes)) return null;

  const hashes = body.hashes
    .filter((h): h is string => typeof h === "string" && /^[0-9a-f]+$/.test(h))
    .slice(0, MAX_HASHES);

  const ttl = typeof body.ttl === "number" && body.ttl > 0 ? body.ttl : DEFAULT_TTL_SECONDS;

  return { algorithm: HOST_HASH_ALGORITHM, hashes, ttl, fetchedAt: now };
}

async function readCache(): Promise<CachedBlocklist | null> {
  if (!hasExtensionApi()) return null;
  try {
    return await storageGet<CachedBlocklist>(CACHE_KEY);
  } catch {
    return null;
  }
}

/**
 * Record that a refresh failed, so the retry backs off.
 *
 * Every failure path goes through here, not just the thrown ones. A refused or
 * throttled response is the failure most in need of a backoff: a client that
 * trips the route's rate limit and retries on every popup open keeps itself
 * locked out for the whole window, which is the abuse pattern
 * `RETRY_AFTER_FAILURE_MS` exists to prevent. An exception and a 429 differ in
 * cause and in nothing else that matters here.
 *
 * A previous copy is preserved rather than replaced: it is still usable (see
 * getBlocklist), and losing it because a later refresh failed would turn a
 * temporary outage into a permanent downgrade. With no previous copy the stored
 * entry carries an empty list, so the shape is always complete and
 * `hashes.length` alone decides whether there is anything to look up.
 */
async function recordFailure(now: number): Promise<null> {
  if (!hasExtensionApi()) return null;
  const previous = await readCache();
  const record: CachedBlocklist = {
    algorithm: previous?.algorithm ?? HOST_HASH_ALGORITHM,
    hashes: previous?.hashes ?? [],
    ttl: previous?.ttl ?? DEFAULT_TTL_SECONDS,
    fetchedAt: previous?.fetchedAt ?? 0,
    failedAt: now,
  };
  await storageSet(CACHE_KEY, record).catch(() => {});
  return null;
}

/**
 * Fetch a fresh copy and store it. Resolves to null on any failure.
 *
 * `apiBase` is passed in rather than read from a global so the caller decides
 * which origin is contacted, and so this module can be tested without one.
 */
async function refresh(apiBase: string, now: number): Promise<CachedBlocklist | null> {
  try {
    const res = await fetch(`${apiBase}/api/blocklist`, {
      // No credentials, ever. The endpoint is unauthenticated and a cookie on
      // this request would associate a client's refresh with a browsing session.
      credentials: "omit",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    // Refused, throttled, or serving something this client will not store: a
    // failure like any other, and backed off like one.
    if (!res.ok) return await recordFailure(now);
    const parsed = parse((await res.json()) as BlocklistResponse, now);
    if (!parsed) return await recordFailure(now);
    if (hasExtensionApi()) await storageSet(CACHE_KEY, parsed);
    return parsed;
  } catch {
    // Offline, blocked, timed out, malformed — all the same from here.
    return await recordFailure(now);
  }
}

/**
 * What a check got, and how good it was.
 *
 * `fresh` is reported separately from `lookup` because "a list was consulted"
 * and "a current list was consulted" are different claims, and the popup makes
 * the honest one. A caller cannot derive freshness from `lookup` alone — a copy
 * days old still produces a usable lookup, which is the point of serving it.
 */
export interface BlocklistState {
  /** The lookup to hand the engine, or undefined when no copy is available. */
  lookup: HostLookup | undefined;
  /** Whether that copy is within the lifetime the server stated for it. */
  fresh: boolean;
}

/**
 * The blocklist lookup to hand the engine, with its freshness.
 *
 * **Never waits on the network.** Whatever is cached is returned immediately,
 * and a refresh is started in the background when that copy has expired — its
 * result lands in storage for the *next* check. A user pasting a suspected scam
 * is waiting for an answer, and making them wait on a list fetch to score a
 * message that is mostly scored offline anyway is the wrong trade. The cost is
 * that a first-ever check runs without the list; the benefit is that no check
 * is ever slower than the engine.
 *
 * The background refresh is deliberately not awaited, so a caller cannot
 * accidentally reintroduce the wait by awaiting this function's result harder.
 */
export async function getBlocklist(apiBase: string): Promise<BlocklistState> {
  const now = Date.now();
  const cache = await readCache();
  const usable = Boolean(cache?.hashes?.length);
  const fresh = usable ? isFresh(cache!, now) : false;

  if (!fresh) {
    // Expired, absent, or previously failed. Back off after a failure so a
    // client that is simply offline does not retry on every popup open.
    const backingOff =
      cache?.failedAt !== undefined && now - cache.failedAt < RETRY_AFTER_FAILURE_MS;
    // Floated, not awaited — see above. `refresh` handles its own failures, and
    // the `.catch` is belt-and-braces against an unhandled rejection.
    if (!backingOff) void refresh(apiBase, now).catch(() => {});
  }

  // A stale copy still beats nothing: these are hostnames reported as malicious,
  // and one reported six hours ago is overwhelmingly likely to still be. Using
  // it can only raise a score, and the direction that costs a user is the one
  // where a real scam scores low. It is still reported as stale, so the popup
  // can qualify a clean verdict that a current list might have contradicted.
  return { lookup: usable ? hashedHostLookup(cache!.hashes) : undefined, fresh };
}
