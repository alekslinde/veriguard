// Coarse submission location, derived from the platform's geo headers
// (set by Vercel's edge from the connecting IP). The IP itself is used only
// transiently for rate limiting and is NEVER stored — this string is the only
// location data that reaches the database.
//
// Granularity is deliberately coarse:
//   · Australia  → state/territory ("NSW, Australia")
//   · elsewhere  → country only    ("United Kingdom")
// City-level data is available in the headers but intentionally unused — a
// small town plus a scam report could identify the reporter.

const AU_REGIONS = new Set(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);

/**
 * ISO 3166-1 alpha-2 country code from the platform geo headers, or "" when
 * absent or malformed.
 *
 * Separate from locationFromHeaders: this feeds region-pack selection, which
 * needs a machine-readable code, while locationFromHeaders produces the coarse
 * human-readable string that gets stored. Callers must treat "" as "unknown"
 * and fall back to the default region — geo headers are absent in local dev and
 * behind some privacy proxies.
 */
export function countryFromHeaders(headers: Headers): string {
  const country = (headers.get("x-vercel-ip-country") ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : "";
}

export function locationFromHeaders(headers: Headers): string {
  const country = countryFromHeaders(headers);
  if (!country) return "";

  if (country === "AU") {
    const region = (headers.get("x-vercel-ip-country-region") ?? "").toUpperCase();
    return AU_REGIONS.has(region) ? `${region}, Australia` : "Australia";
  }

  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

/**
 * Client IP from the platform's forwarding header, or "unknown" when absent or
 * malformed. Used ONLY as a transient rate-limiting key — never stored, and
 * never written to the database (see the note at the top of this file).
 *
 * `x-forwarded-for` can carry a comma-separated chain; the first entry is the
 * originating client. Values that don't look like an IPv4 or IPv6 address are
 * treated as "unknown" rather than trusted, so a spoofed header degrades to
 * sharing one bucket instead of forging a fresh one per request.
 *
 * Takes Headers rather than NextRequest so this stays framework-free and
 * usable from any route handler or worker.
 */
// Structural validation, not a full IP parse. A forged value must collapse to
// "unknown" and share one bucket — a loose shape check would let distinct
// keys walk straight through the rate limiter it feeds.
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
// IPv6 in any of its forms, including "::" compression, and the IPv4-mapped
// tail (::ffff:203.0.113.5) that dual-stack proxies emit.
const IPV6 = /^(?=.*:)(?!.*::.*::)(([0-9a-f]{1,4})?(:([0-9a-f]{1,4})?){1,7}|::)(%[0-9a-z]+)?$/i;
const IPV6_MAPPED = /^::ffff:(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/i;

export function clientIpFromHeaders(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const ip = fwd.split(",")[0].trim();
    if (IPV4.test(ip) || IPV6_MAPPED.test(ip) || IPV6.test(ip)) return ip;
  }
  return "unknown";
}
