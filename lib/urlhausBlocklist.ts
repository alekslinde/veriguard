// URLhaus (abuse.ch) live malware/phishing domain blocklist.
//
// Fetches the CSV dump of recently-added malicious URLs, extracts hostnames
// from online entries only, and returns them as a Set for O(1) lookup.
//
// The fetch goes to a fixed, trusted endpoint (abuse.ch) — not to any
// user-submitted URL — so it does not violate the "no outbound fetch to
// scam infrastructure" contract in the check API route.
//
// Cache TTL: 6 hours. The URLhaus CSV is regenerated every few minutes, but
// phishing domains are typically live for hours-to-days, so 6h gives a good
// freshness/cost balance.

import { unstable_cache } from "next/cache";

const URLHAUS_CSV = "https://urlhaus.abuse.ch/downloads/csv_recent/";
/**
 * How long a fetched copy of the feed is reused, in seconds.
 *
 * Exported so the blocklist endpoint caches for the same window rather than
 * picking its own: a client cache longer than this serves entries we have
 * already refreshed, and a shorter one asks us to re-serve a list that has not
 * changed. One constant, so the two cannot drift apart.
 */
export const BLOCKLIST_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const TTL_SECONDS = BLOCKLIST_TTL_SECONDS;
const MAX_ENTRIES = 5000;         // cap to bound memory and parse time

function parseHostnames(csv: string): Set<string> {
  const hostnames = new Set<string>();
  for (const line of csv.split("\n")) {
    if (line.startsWith("#") || line.startsWith('"id"') || !line.trim()) continue;

    // CSV columns: id, dateadded, url, url_status, last_online, threat, tags, urlhaus_link, reporter
    const cols = line.split('","');
    if (cols.length < 4) continue;

    const urlStatus = cols[3]?.replace(/"/g, "").trim();
    if (urlStatus !== "online") continue;  // skip already-taken-down entries

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

// Wrapped in unstable_cache so the expensive fetch + parse only runs once per
// TTL window across all concurrent requests, not once per request.
const fetchBlocklist = unstable_cache(
  async (): Promise<string[]> => {
    const res = await fetch(URLHAUS_CSV, {
      headers: { "User-Agent": "veriguard/1.0 (abuse-reporting tool)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`URLhaus fetch failed: ${res.status}`);
    const csv = await res.text();
    return Array.from(parseHostnames(csv));
  },
  ["urlhaus-blocklist"],
  { revalidate: TTL_SECONDS },
);

// Returns a Set of malicious hostnames from the live URLhaus feed.
// Falls back to an empty set on any network/parse error so the detector
// degrades gracefully rather than breaking the check flow.
export async function getUrlhausBlocklist(): Promise<Set<string>> {
  try {
    const entries = await fetchBlocklist();
    return new Set(entries);
  } catch {
    return new Set();
  }
}
