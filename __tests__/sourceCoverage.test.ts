import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Plain .mjs helper; allowJs resolves it.
import { parseRegistry } from "../scripts/check-sources.mjs";
import { coverageByRegion, uncovered, human, markdown } from "../scripts/check-source-coverage";
import { supportedRegions } from "@veriguard/engine/regions";

const registry = parseRegistry(
  readFileSync(resolve(__dirname, "../docs/threat-intel/sources.yml"), "utf8"),
) as { tiers: Record<string, Array<Record<string, unknown>>>; errors: string[] };

describe("registry", () => {
  it("parses without errors", () => {
    expect(registry.errors).toEqual([]);
  });
});

describe("coverageByRegion", () => {
  it("reports a row for every supported region", () => {
    const rows = coverageByRegion(registry);
    expect(rows.map((r) => r.region)).toEqual(supportedRegions());
  });

  it("gives every jurisdiction at least one tier-1 source", () => {
    // The invariant this whole change exists to establish. A region with no
    // registered authority cannot produce a negative finding: the sweeps read
    // FROM the registry, so "no new threats identified" would mean only that
    // nothing was read. Adding a region pack without a source reintroduces
    // that, silently, and this is what catches it.
    expect(uncovered(coverageByRegion(registry))).toEqual([]);
  });

  it("does not count the rest-of-world fallback as a gap", () => {
    // ZZ is FALLBACK_REGION, not a country whose regulator was forgotten.
    const rows = coverageByRegion(registry);
    const zz = rows.find((r) => r.region === "ZZ");
    expect(zz?.tier1).toBe(0);
    expect(uncovered(rows).some((r) => r.region === "ZZ")).toBe(false);
  });

  it("excludes retired sources from the counts", () => {
    const withRetired = {
      tiers: { "1": [{ region: "AU", retired: true }, { region: "AU" }] },
    };
    const au = coverageByRegion(withRetired).find((r) => r.region === "AU");
    // A retired source cannot be read by this week's research, so counting it
    // would overstate coverage in the exact direction this check corrects.
    expect(au?.tier1).toBe(1);
  });

  it("ignores sources with no region", () => {
    // A global feed cannot answer a jurisdiction-specific question.
    const globalOnly = { tiers: { "1": [{ name: "some global feed" }] } };
    expect(uncovered(coverageByRegion(globalOnly)).length).toBeGreaterThan(0);
  });
});

describe("reporting", () => {
  it("renders both formats", () => {
    const rows = coverageByRegion(registry);
    expect(human(rows)).toContain("Registered sources by region");
    expect(markdown(rows)).toContain("| Region | Tier 1 | All tiers |");
  });

  it("explains what a zero means rather than only counting it", () => {
    const rows = coverageByRegion({ tiers: { "1": [] } });
    const out = markdown(rows);
    expect(out).toContain("**0**");
    expect(out).toContain("artifact of an empty source list");
  });
});
