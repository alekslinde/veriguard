// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// When was each region last actually researched, and which ones should the
// next sweep cover?
//
// WHAT THIS EXISTS TO PREVENT.
// Researching every region every week costs tokens in proportion to the number
// of region packs, and most of those packs are `minimal` tier. So minimal
// regions are swept on a rotation instead: a few each cycle, stalest first.
// The risk with any rotation is the one docs/threat-intel/README.md already
// records under "Known gaps" — a region nobody looked at reads exactly like a
// region where nothing happened. This makes "not looked at" measurable.
//
// The record is a table each roadmap carries:
//
//   ## Region coverage
//
//   | Region | Depth | Notes |
//   |---|---|---|
//   | AU | deep | … |
//   | DE | light | … |
//   | ES | skipped | in rotation |
//
// `deep` and `light` count as researched; `skipped` (or a region missing from
// the table) does not. Roadmaps written before this convention carry no table,
// so their regions read as "never recorded" — which is the honest answer: the
// archive cannot say whether a pre-convention "quiet week" line was research
// or an artifact of an empty source list.
//
// It REPORTS, it does not gate — the same reasoning as check-source-coverage:
// a stale region is unfinished research, and failing CI on that would teach
// people to skip the check.
//
// Usage:
//   npx tsx scripts/check-research-freshness.ts              # human report
//   npx tsx scripts/check-research-freshness.ts --markdown   # issue/summary format
//   npx tsx scripts/check-research-freshness.ts --json
//   npx tsx scripts/check-research-freshness.ts --plan 5     # this cycle's regions, one line
//
// Exit codes: 0 whatever the report says · 2 if the check could not run.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { resolveRegionPack, supportedRegions } from "@veriguard/detect/regions";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROADMAP_DIR = resolve(HERE, "../docs/threat-intel");
const ROADMAP_RE = /^(\d{4}-\d{2}-\d{2})-threat-roadmap\.md$/;

export type Tier = "full" | "partial" | "minimal" | "none";
export type Depth = "deep" | "light" | "skipped";

/**
 * How long each tier may go unresearched before it is reported stale. Full
 * and partial regions are swept every cycle, so a fortnight means one missed
 * week; minimal regions rotate, so their window is one full rotation plus
 * slack.
 */
export const WINDOW_DAYS: Record<Exclude<Tier, "none">, number> = {
  full: 14,
  partial: 21,
  minimal: 42,
};

/** The rest-of-world fallback has no jurisdiction to research. */
const NON_JURISDICTIONAL = new Set(["ZZ"]);

/**
 * Read the "## Region coverage" table out of one roadmap.
 *
 * Only that section is read, and only rows whose first cell is a 2-letter
 * region code — so a stray table elsewhere in the file cannot be mistaken for
 * the record. Unknown depth words are ignored rather than guessed at.
 */
export function parseRegionCoverage(markdown: string): Map<string, Depth> {
  const out = new Map<string, Depth>();
  const lines = markdown.split("\n");
  const start = lines.findIndex((l) => /^##\s+Region coverage\s*$/i.test(l.trim()));
  if (start === -1) return out;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^#{1,2}\s/.test(line)) break; // next section
    const cells = line.split("|").map((c) => c.trim()).filter((c, j, a) => !(c === "" && (j === 0 || j === a.length - 1)));
    if (cells.length < 2) continue;
    const region = cells[0].replace(/[`*_]/g, "").toUpperCase();
    const depth = cells[1].replace(/[`*_]/g, "").toLowerCase();
    if (!/^[A-Z]{2}$/.test(region)) continue;
    if (depth === "deep" || depth === "light" || depth === "skipped") out.set(region, depth);
  }
  return out;
}

export interface RegionFreshness {
  region: string;
  tier: Tier;
  /** Newest roadmap date that records this region as deep or light. */
  lastResearched: string | null;
  /** Depth recorded on that date. */
  depth: Depth | null;
  /** Whole days since lastResearched, as of `today`. */
  ageDays: number | null;
  stale: boolean;
}

const dayMs = 86_400_000;
const days = (from: string, to: string) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / dayMs);

/**
 * Combine every roadmap's coverage table into one row per region.
 *
 * `roadmaps` is [date, coverage] pairs in any order; `regions` maps each
 * supported code to its tier. Pure, so the tests can pin the logic without
 * touching disk or the engine.
 */
export function freshness(
  roadmaps: Array<[string, Map<string, Depth>]>,
  regions: Array<[string, Tier]>,
  today: string,
): RegionFreshness[] {
  const newestFirst = [...roadmaps].sort((a, b) => b[0].localeCompare(a[0]));
  return regions
    .filter(([code]) => !NON_JURISDICTIONAL.has(code))
    .map(([region, tier]) => {
      let lastResearched: string | null = null;
      let depth: Depth | null = null;
      for (const [date, table] of newestFirst) {
        const d = table.get(region);
        if (d === "deep" || d === "light") {
          lastResearched = date;
          depth = d;
          break;
        }
      }
      const ageDays = lastResearched ? days(lastResearched, today) : null;
      const window = tier === "none" ? Infinity : WINDOW_DAYS[tier];
      const stale = ageDays === null || ageDays > window;
      return { region, tier, lastResearched, depth, ageDays, stale };
    });
}

/**
 * The regions the next sweep should cover: every full and partial region, plus
 * the `rotation` stalest minimal ones (never-researched first, then oldest;
 * ties broken alphabetically so the plan is deterministic).
 */
export function plan(rows: RegionFreshness[], rotation: number): { weekly: string[]; rotation: string[] } {
  const weekly = rows.filter((r) => r.tier === "full" || r.tier === "partial").map((r) => r.region);
  const minimal = rows
    .filter((r) => r.tier === "minimal")
    .sort((a, b) => {
      if (a.lastResearched === null && b.lastResearched !== null) return -1;
      if (b.lastResearched === null && a.lastResearched !== null) return 1;
      return (a.lastResearched ?? "").localeCompare(b.lastResearched ?? "") || a.region.localeCompare(b.region);
    })
    .slice(0, Math.max(0, rotation))
    .map((r) => r.region);
  return { weekly, rotation: minimal };
}

// ── Reporting ────────────────────────────────────────────────────────────────

const TIER_ORDER: Tier[] = ["full", "partial", "minimal", "none"];
const sorted = (rows: RegionFreshness[]) =>
  [...rows].sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) || a.region.localeCompare(b.region));

export function markdown(rows: RegionFreshness[], next: ReturnType<typeof plan>): string {
  const out: string[] = [];
  const stale = rows.filter((r) => r.stale);
  out.push("### 🧭 Region research freshness");
  out.push("");
  out.push(`**This cycle:** weekly ${next.weekly.join(", ") || "—"} · rotation ${next.rotation.join(", ") || "—"}`);
  out.push("");
  out.push("| Region | Tier | Last researched | Depth | Age (days) | Window |");
  out.push("|---|---|---|---|---|---|");
  for (const r of sorted(rows)) {
    const window = r.tier === "none" ? "—" : String(WINDOW_DAYS[r.tier]);
    const age = r.ageDays === null ? "—" : String(r.ageDays);
    const last = r.lastResearched ?? "_never recorded_";
    const mark = r.stale ? " ⚠" : "";
    out.push(`| ${r.region}${mark} | ${r.tier} | ${last} | ${r.depth ?? "—"} | ${age} | ${window} |`);
  }
  out.push("");
  out.push(
    stale.length
      ? `**${stale.length} region(s) outside their window.** Until one is researched, a "quiet week" line for it means *not looked at*, not *nothing happening*.`
      : "Every region was researched within its window.",
  );
  return out.join("\n");
}

export function human(rows: RegionFreshness[], next: ReturnType<typeof plan>): string {
  const lines = [`This cycle — weekly: ${next.weekly.join(" ")} | rotation: ${next.rotation.join(" ")}`, ""];
  for (const r of sorted(rows)) {
    const age = r.ageDays === null ? "never recorded" : `${r.lastResearched} (${r.ageDays}d, ${r.depth})`;
    lines.push(`  ${r.stale ? "⚠" : "·"} ${r.region} [${r.tier}] ${age}`);
  }
  return lines.join("\n");
}

// ── IO ───────────────────────────────────────────────────────────────────────

export async function loadRoadmaps(dir = ROADMAP_DIR): Promise<Array<[string, Map<string, Depth>]>> {
  const names = (await readdir(dir)).filter((n) => ROADMAP_RE.test(n));
  return Promise.all(
    names.map(async (n): Promise<[string, Map<string, Depth>]> => [
      ROADMAP_RE.exec(n)![1],
      parseRegionCoverage(await readFile(resolve(dir, n), "utf8")),
    ]),
  );
}

export function loadRegions(): Array<[string, Tier]> {
  return supportedRegions().map((code) => [code, resolveRegionPack(code).coverage as Tier]);
}

export async function currentFreshness(today = new Date().toISOString().slice(0, 10)) {
  return freshness(await loadRoadmaps(), loadRegions(), today);
}

async function main() {
  const args = process.argv.slice(2);
  const rows = await currentFreshness();
  const planIdx = args.indexOf("--plan");
  const rotation = planIdx >= 0 ? Number(args[planIdx + 1] ?? 5) : 5;
  if (!Number.isInteger(rotation) || rotation < 0) {
    console.error("--plan takes a non-negative whole number");
    process.exitCode = 2;
    return;
  }
  const next = plan(rows, rotation);

  if (planIdx >= 0) console.log(`weekly: ${next.weekly.join(" ")} | rotation: ${next.rotation.join(" ")}`);
  else if (args.includes("--json")) console.log(JSON.stringify({ plan: next, regions: rows }, null, 2));
  else if (args.includes("--markdown")) console.log(markdown(rows, next));
  else console.log(human(rows, next));
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("check-research-freshness failed:", err);
    process.exitCode = 2;
  });
}
