// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { clientIpFromHeaders, locationFromHeaders } from "@/lib/geo";

function headers(map: Record<string, string>): Headers {
  return new Headers(map);
}

describe("locationFromHeaders", () => {
  it("returns state + Australia for AU connections", () => {
    expect(
      locationFromHeaders(headers({ "x-vercel-ip-country": "AU", "x-vercel-ip-country-region": "NSW" })),
    ).toBe("NSW, Australia");
  });

  it("falls back to plain Australia for an unknown AU region", () => {
    expect(
      locationFromHeaders(headers({ "x-vercel-ip-country": "AU", "x-vercel-ip-country-region": "XX" })),
    ).toBe("Australia");
    expect(locationFromHeaders(headers({ "x-vercel-ip-country": "AU" }))).toBe("Australia");
  });

  it("returns country name only (no region) outside Australia", () => {
    expect(
      locationFromHeaders(headers({ "x-vercel-ip-country": "NZ", "x-vercel-ip-country-region": "AUK" })),
    ).toBe("New Zealand");
  });

  it("returns empty string when geo headers are absent or invalid", () => {
    expect(locationFromHeaders(headers({}))).toBe("");
    expect(locationFromHeaders(headers({ "x-vercel-ip-country": "evil<script>" }))).toBe("");
  });

  it("is case-insensitive on the country code", () => {
    expect(
      locationFromHeaders(headers({ "x-vercel-ip-country": "au", "x-vercel-ip-country-region": "vic" })),
    ).toBe("VIC, Australia");
  });
});

describe("clientIpFromHeaders", () => {
  // This value keys the rate limiter on /api/check. A forged header must
  // collapse to "unknown" and share one bucket — anything that passes a loose
  // shape check lets an attacker mint unlimited distinct keys and walk through
  // the limiter entirely.
  function ip(value: string): string {
    return clientIpFromHeaders(new Headers({ "x-forwarded-for": value }));
  }

  it("returns the first entry of a forwarding chain", () => {
    expect(ip("203.0.113.5, 70.41.3.18, 150.172.238.178")).toBe("203.0.113.5");
  });

  it("accepts ordinary IPv4 and IPv6 addresses", () => {
    expect(ip("8.8.8.8")).toBe("8.8.8.8");
    expect(ip("255.255.255.255")).toBe("255.255.255.255");
    expect(ip("2001:db8::1")).toBe("2001:db8::1");
    expect(ip("::1")).toBe("::1");
    expect(ip("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
  });

  it("accepts the IPv4-mapped form dual-stack proxies emit", () => {
    expect(ip("::ffff:203.0.113.5")).toBe("::ffff:203.0.113.5");
  });

  it("rejects an over-long dotted string that is not an address", () => {
    // The regression: /^[\d.]+$/ accepted these, so 1.1.1.1.1, 1.1.1.1.2, …
    // each became a fresh rate-limit bucket.
    expect(ip("1.1.1.1.1")).toBe("unknown");
    expect(ip("1.1.1.1.2")).toBe("unknown");
    expect(ip("1.2.3")).toBe("unknown");
    expect(ip("....")).toBe("unknown");
  });

  it("rejects out-of-range and zero-padded octets", () => {
    expect(ip("999.1.1.1")).toBe("unknown");
    expect(ip("256.0.0.1")).toBe("unknown");
    expect(ip("01.1.1.1")).toBe("unknown");
  });

  it("rejects malformed IPv6", () => {
    expect(ip("2001:db8::1::2")).toBe("unknown");
    expect(ip("abc")).toBe("unknown");
  });

  it("returns unknown when the header is absent or empty", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
    expect(ip("")).toBe("unknown");
  });

  it("gives every forged value the same bucket, never a fresh one", () => {
    const forged = ["1.1.1.1.1", "1.1.1.1.2", "9.9.9.9.9", "not-an-ip", "<script>"];
    expect(new Set(forged.map(ip))).toEqual(new Set(["unknown"]));
  });
});
