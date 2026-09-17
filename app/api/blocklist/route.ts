import { NextRequest, NextResponse } from "next/server";
import { getUrlhausBlocklist, BLOCKLIST_TTL_SECONDS } from "@/lib/urlhausBlocklist";
import { hashHost, HOST_HASH_ALGORITHM, HOST_HASH_HEX_LENGTH } from "@veriguard/engine/hostHash";
import { checkAndRecordRateLimit, FEED_RATE_LIMIT } from "@/lib/reportStore";
import { clientIpFromHeaders } from "@/lib/geo";
import { corsHeaders, corsPreflightHeaders } from "@/lib/cors";

/**
 * GET /api/blocklist
 *
 * The URLhaus hostname feed, as truncated hashes, for the WebExtension.
 *
 * **Why this exists.** The extension bundles the engine, so its text checks run
 * offline — but the blocklist is fetched app-side and a bundled client has no
 * way to reach it. Without this route a client verdict is simply *lower* than
 * the site's for a blocklisted host: a miss, never a false positive, but a
 * visible gap between two surfaces answering the same question.
 *
 * **Why hashed, stated honestly.** Hashing here is obfuscation, not
 * confidentiality. Hostnames are low-entropy and enumerable — anyone with a
 * domain wordlist can hash candidates offline and recover most of this list, and
 * abuse.ch publishes the same data openly anyway. Nothing in this system may
 * treat these hashes as secret. What it does buy is narrower and still worth
 * having: the response is not a turnkey list of live malware hosts served under
 * our name at our URL. See `packages/engine/src/hostHash.ts`, which carries the
 * same note so neither half reads as a stronger claim than it is.
 *
 * **What it is not.** Not a lookup API. There is deliberately no
 * `?host=` parameter: answering "is this specific host malicious" for arbitrary
 * callers would turn a cached static payload into a per-query oracle, and would
 * tell us which hosts a user is checking — which is exactly the knowledge the
 * offline client exists to avoid producing.
 */

/**
 * How long a shared cache may hold this response, as a fraction of the client's
 * own lifetime.
 *
 * A quarter, so that a client refetching at its `ttl` cannot receive a copy
 * already that old and end up carrying entries for twice the window the payload
 * states. See the note at the `Cache-Control` header below.
 */
const EDGE_TTL_SECONDS = Math.floor(BLOCKLIST_TTL_SECONDS / 4);

/** CORS preflight. Same allowlist as /api/check; empty by default. */
export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsPreflightHeaders(req.headers.get("origin"), ["GET"]),
  });
}

export async function GET(req: NextRequest) {
  const cors = corsHeaders(req.headers.get("origin"));

  // Throttled on the shared read budget, like the other feed endpoints. An
  // "unknown" IP is not throttled: keying every unidentifiable caller into one
  // bucket would take the endpoint down for all of them at once, which is the
  // same reasoning /api/stats and /api/reports apply.
  const ip = clientIpFromHeaders(req.headers);
  if (ip !== "unknown" && !checkAndRecordRateLimit(`blocklist:${ip}`, FEED_RATE_LIMIT)) {
    return NextResponse.json(
      { error: "Too many requests — give it a few minutes and try again.", code: "rate_limited" },
      // Never cached: a stored 429 would lock out every client behind the same
      // CDN node, turning a per-IP limit into an outage for all of them.
      { status: 429, headers: { ...cors, "Cache-Control": "no-store" } },
    );
  }

  const hosts = await getUrlhausBlocklist();

  // Sorted, so the payload is byte-identical between requests whose underlying
  // feed has not changed. Set iteration order follows the order URLhaus listed
  // the entries in, so an unsorted body can differ between two refetches that
  // carry the same hosts — which costs a client its cached copy for no reason,
  // and makes two responses hard to diff when checking whether the feed moved.
  const hashes = [...hosts].map(hashHost).sort();

  const body = JSON.stringify({
    /**
     * Named so a client can refuse a scheme it does not implement rather than
     * silently matching nothing. A hash length or digest change is a breaking
     * change that produces no error — every lookup just returns false — so it
     * has to be visible in the payload.
     */
    algorithm: HOST_HASH_ALGORITHM,
    hexLength: HOST_HASH_HEX_LENGTH,
    count: hashes.length,
    /**
     * How long this copy is good for, in seconds — the same window the server
     * reuses its own fetch for. A client that caches longer serves entries we
     * have already refreshed.
     */
    ttl: BLOCKLIST_TTL_SECONDS,
    hashes,
  });

  // An empty feed is a fetch failure, not an empty world. `getUrlhausBlocklist`
  // degrades to an empty set on any network or parse error, and caching that
  // for six hours would pin the failure in place long after it recovered. Serve
  // it — a client passing an empty list scores exactly as it does today — but
  // let it expire quickly.
  //
  // The edge window is a fraction of the client's, because the two are
  // sequential and not alternatives: a client refetches after `ttl`, and an
  // edge copy `ttl` old at that moment hands it entries already twice that age.
  // Equal windows therefore promise six hours of staleness and deliver up to
  // twelve. Dividing keeps the client's `ttl` the honest bound on the whole
  // chain, and costs only a more frequent origin fetch of a payload the origin
  // already has cached for the same six hours.
  const cache =
    hashes.length === 0
      ? "public, s-maxage=60, stale-while-revalidate=60"
      : `public, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=${EDGE_TTL_SECONDS}`;

  return new NextResponse(body, {
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": cache,
    },
  });
}
