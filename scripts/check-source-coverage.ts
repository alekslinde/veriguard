// Source-registry coverage by region.
//
// WHAT THIS EXISTS TO PREVENT.
// The weekly sweeps read FROM docs/threat-intel/sources.yml rather than from
// open search — a deliberate discipline, documented in that file's header, so a
// new source is a reviewed addition rather than whatever a search engine
// surfaced. The cost of that discipline is a failure mode with no natural
// symptom: a region with no registered sources yields no findings, and a sweep
// then writes "no new materially distinct threats identified" for it.
//
// That sentence reads as a finding about the world. It is an artifact of an
// empty source list. The two are indistinguishable in the roadmap prose, and
// the second one silently becomes evidence — it is what a promoter reads when
// deciding a region's calendar is current, and what a reader of /radar and
// /calendar is implicitly trusting.
//
// This makes the difference measurable: which supported regions have tier-1
// sources registered, and which have none and therefore cannot produce a
// negative finding worth the name.
//
// It FLAGS, it does not edit — same philosophy as check-sources.mjs,
// check-calendar-sources.ts and check-promotion-freshness.ts. WHICH bodies
// count as authoritative for a jurisdiction is a reviewed editorial call (that
// is the entire point of the registry); this only reports where there are none.
//
// Reuses parseRegistry() from check-sources.mjs rather than re-parsing the
// file: one parser, one set of shape constraints, and a registry that stops
// parsing fails both checks together instead of one silently disagreeing.
//
// Usage:
//   npx tsx scripts/check-source-coverage.ts             # human report
//   npx tsx scripts/check-source-coverage.ts --markdown  # issue/PR-body format
//
// Exit codes: 0 whatever the report says · 2 if the check could not run (the
// registry failed to parse, or an unexpected throw). Coverage findings do not
// fail the run: adding a source for a jurisdiction is research, and gating CI
// on unfinished research would only teach people to skip the check.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Plain .mjs helper; `allowJs` resolves it and infers its shape from JSDoc —
// the documented { tiers, brands, indicators, errors } shape.
import { parseRegistry } from "./check-sources.mjs";
import { supportedRegions } from "@veriguard/engine/regions";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = resolve(HERE, "../docs/threat-intel/sources.yml");

/** A registry entry, as parseRegistry returns it. */
interface Source {
  domain?: string;
  name?: string;
  region?: string;
  retired?: boolean;
}

export interface RegionCoverage {
  region: string;
  /** Tier-1 sources registered for this region. */
  tier1: number;
  /** Sources at any tier. */
  total: number;
}

/**
 * Count registered, non-retired sources per supported region.
 *
 * Retired entries are excluded deliberately: they are kept in the file as a
 * record of what has already been looked at (see the registry header), but a
 * retired source cannot be read by this week's research, so counting it would
 * overstate coverage in exactly the direction this check exists to correct.
 *
 * A source with no `region:` is global rather than regional — it is counted in
 * neither column, because the question here is whether a *jurisdiction* has
 * authorities registered, and a global feed cannot answer a question about
 * NZ-specific advisories.
 */
export function coverageByRegion(registry: { tiers: Record<string, Source[]> }): RegionCoverage[] {
  const tier1 = new Map<string, number>();
  const total = new Map<string, number>();

  for (const [tier, entries] of Object.entries(registry.tiers)) {
    for (const entry of entries) {
      if (entry.retired) continue;
      const region = entry.region;
      if (!region) continue;
      total.set(region, (total.get(region) ?? 0) + 1);
      if (tier === "1") tier1.set(region, (tier1.get(region) ?? 0) + 1);
    }
  }

  return supportedRegions().map((region) => ({
    region,
    tier1: tier1.get(region) ?? 0,
    total: total.get(region) ?? 0,
  }));
}

/**
 * The rest-of-world fallback, which has no jurisdiction and so no authorities.
 *
 * Excluded from the gap list rather than the table: ZZ is what an unresolved
 * region falls back to (FALLBACK_REGION in the engine), not a country whose
 * regulator someone forgot to register. Reporting it as a gap forever would be
 * noise of exactly the kind that gets a check ignored.
 */
const NON_JURISDICTIONAL = new Set(["ZZ"]);

/** Regions with no tier-1 source — the ones that cannot support a negative finding. */
export function uncovered(rows: RegionCoverage[]): RegionCoverage[] {
  return rows.filter((r) => r.tier1 === 0 && !NON_JURISDICTIONAL.has(r.region));
}

// ── Reporting ────────────────────────────────────────────────────────────────

export function human(rows: RegionCoverage[]): string {
  const lines: string[] = [];
  lines.push("Registered sources by region (excluding retired):");
  lines.push("");
  for (const row of rows) {
    const mark = NON_JURISDICTIONAL.has(row.region) ? "–" : row.tier1 === 0 ? "✗" : "·";
    const note = NON_JURISDICTIONAL.has(row.region) ? "  (rest-of-world fallback)" : "";
    lines.push(`  ${mark} ${row.region} — tier 1: ${row.tier1}, all tiers: ${row.total}${note}`);
  }

  const gaps = uncovered(rows);
  lines.push("");
  if (gaps.length === 0) {
    lines.push("Every supported region has at least one tier-1 source.");
    return lines.join("\n");
  }

  lines.push(`${gaps.length} region(s) with no tier-1 source: ${gaps.map((g) => g.region).join(", ")}`);
  lines.push("");
  lines.push("A sweep cannot produce a meaningful negative finding for these.");
  lines.push('"No new threats identified" means "nothing was read", not');
  lines.push('"nothing is happening" — see docs/threat-intel/README.md, Known gaps.');
  return lines.join("\n");
}

export function markdown(rows: RegionCoverage[]): string {
  const lines: string[] = [];
  const gaps = uncovered(rows);

  lines.push("### 🗺 Source registry coverage by region");
  lines.push("");
  lines.push("| Region | Tier 1 | All tiers |");
  lines.push("|---|---|---|");
  for (const row of rows) {
    const gap = row.tier1 === 0 && !NON_JURISDICTIONAL.has(row.region);
    const t1 = gap ? "**0**" : String(row.tier1);
    const suffix = NON_JURISDICTIONAL.has(row.region) ? " _(rest-of-world)_" : "";
    lines.push(`| ${row.region}${suffix} | ${t1} | ${row.total} |`);
  }
  lines.push("");

  if (gaps.length === 0) {
    lines.push("Every supported region has at least one tier-1 source.");
    return lines.join("\n");
  }

  lines.push(
    `**${gaps.length} region(s) with no tier-1 source:** ` + gaps.map((g) => `\`${g.region}\``).join(", "),
  );
  lines.push("");
  lines.push("The sweeps read *from* this registry rather than from open search, so a");
  lines.push("region with no registered authority yields no findings — and the roadmap");
  lines.push('then records "no new materially distinct threats identified" for it. That');
  lines.push("sentence is an artifact of an empty source list, not an observation, and it");
  lines.push("is what a promoter reads when deciding that region's surfaces are current.");
  lines.push("");
  lines.push("Registering a source is a reviewed editorial call — this check only reports");
  lines.push("where there are none.");
  return lines.join("\n");
}

async function main() {
  const asMarkdown = process.argv.slice(2).includes("--markdown");

  const text = await readFile(REGISTRY, "utf8");
  const registry = parseRegistry(text) as {
    tiers: Record<string, Source[]>;
    errors: string[];
  };

  // A registry that will not parse is a broken check, not a clean one — the
  // same reasoning that gives check-sources.mjs its own hard failure.
  if (registry.errors.length > 0) {
    console.error("Registry did not parse cleanly:");
    for (const err of registry.errors) console.error(`  ${err}`);
    process.exitCode = 2;
    return;
  }

  const rows = coverageByRegion(registry);
  console.log(asMarkdown ? markdown(rows) : human(rows));
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("check-source-coverage failed:", err);
    process.exitCode = 2;
  });
}
