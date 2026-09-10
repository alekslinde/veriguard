import { describe, it, expect } from "vitest";
import { resolveRegion } from "@/lib/regionResolver";
import { DEFAULT_REGION, FALLBACK_REGION, supportedRegions } from "@veriguard/engine/regions";

const headers = (map: Record<string, string> = {}) => new Headers(map);
const geo = (country: string) => headers({ "x-vercel-ip-country": country });

describe("resolveRegion", () => {
  it("prefers an explicit supported choice over the geo header", () => {
    expect(resolveRegion(geo("AU"), "AU")).toBe("AU");
  });

  it("falls back to the geo header when no choice is given", () => {
    expect(resolveRegion(geo("AU"))).toBe("AU");
  });

  it("falls back to the default when geo headers are absent", () => {
    // Normal path in local dev and behind privacy proxies — not an error.
    expect(resolveRegion(headers())).toBe(DEFAULT_REGION);
  });

  it("falls back to the default for a malformed geo header", () => {
    // Malformed means "no signal", not "a country we don't cover".
    expect(resolveRegion(geo("evil<script>"))).toBe(DEFAULT_REGION);
    expect(resolveRegion(geo("AUS"))).toBe(DEFAULT_REGION);
  });

  it("sends a known-but-uncovered country to the base-only pack", () => {
    // Applying AU agency and brand rules to a German user would be useless and
    // would wrongly claim full coverage.
    //
    // "US", then "DE" and "JP", each used to be a fixture here and each now has
    // its own pack — which is the point of the change rather than a regression.
    // Hand-picked placeholders expire every time a pack ships, so the fixtures
    // are DERIVED: any ISO code with no pack must resolve to the fallback, and
    // the candidates are filtered against supportedRegions() rather than
    // guessed at. Same lesson as the hand-kept COVERED set in
    // scripts/region-demand.ts — derive the set from the thing it describes.
    const covered = new Set(supportedRegions());
    const uncovered = ["FR", "IT", "MX", "KR", "PL", "TR"].filter((c) => !covered.has(c as never));
    // If this ever empties, the filter has silently stopped testing anything.
    expect(uncovered.length).toBeGreaterThan(0);
    for (const code of uncovered) {
      expect({ code, resolved: resolveRegion(geo(code)) })
        .toEqual({ code, resolved: FALLBACK_REGION });
    }
  });

  // GB is the first geo-resolvable region besides AU, so these assert that
  // resolution actually routes a second country rather than defaulting.
  it("routes a UK visitor to the GB pack from the geo header alone", () => {
    expect(resolveRegion(geo("GB"))).toBe("GB");
  });

  it("prefers an explicit GB choice over a conflicting geo header", () => {
    expect(resolveRegion(geo("AU"), "GB")).toBe("GB");
    expect(resolveRegion(geo("GB"), "AU")).toBe("AU");
  });

  it("sends the non-ISO code 'UK' to the fallback, not to Great Britain", () => {
    // ISO 3166-1 has no "UK", and libphonenumber resolves it to Switzerland
    // (the Phase 4 regression). It must not be silently treated as GB.
    expect(resolveRegion(geo("UK"))).toBe(FALLBACK_REGION);
    expect(resolveRegion(headers(), "UK")).toBe(DEFAULT_REGION);
  });

  it("ignores an unsupported explicit choice rather than pinning to it", () => {
    // Falls through to geo, so an unsupported request doesn't strand the user
    // on the default when we do know roughly where they are.
    expect(resolveRegion(geo("AU"), "QQ")).toBe("AU");
  });

  it("honours an explicit fallback-region choice", () => {
    expect(resolveRegion(geo("AU"), FALLBACK_REGION)).toBe(FALLBACK_REGION);
  });

  it.each([undefined, null, "", "   ", 42, {}, []])(
    "ignores a non-string or empty choice (%p)",
    (choice) => {
      expect(resolveRegion(geo("AU"), choice)).toBe("AU");
    },
  );

  it("accepts a lower-case explicit choice", () => {
    expect(resolveRegion(headers(), "au")).toBe("AU");
  });

  it("falls back to the default when there is no geo signal at all", () => {
    // Distinct from "we know where you are and don't cover it" — with no
    // header there is nothing to be honest about, so behaviour is unchanged.
    for (const input of ["QQ", "", "🙂"]) {
      expect(resolveRegion(headers(), input)).toBe(DEFAULT_REGION);
    }
  });

  it("always returns a code that resolves to a real pack", () => {
    const inputs = ["QQ", "", "🙂", "AU", "ZZ", null, undefined];
    for (const input of inputs) {
      const code = resolveRegion(geo("DE"), input);
      expect(supportedRegions()).toContain(code);
    }
  });
});
