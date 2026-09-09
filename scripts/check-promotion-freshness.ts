// Promotion-freshness checker for the threat radar and the scam calendar.
//
// The gap this closes: a weekly sweep lands in docs/threat-intel/ as a docs-only
// PR (roadmaps never touch lib/ — see docs/threat-intel/README.md), and the
// user-facing surfaces are then meant to be brought forward by hand:
//
//   · lib/threatRadar.ts   — promote the cycle's consumer-facing campaigns
//   · lib/scamCalendar.ts  — re-review the seasons against the fresh intel
//
// That hand step has no CI behind it, so it silently doesn't happen: the
// 2026-08-16 sweep merged while the radar still said "as at 2026-08-09". This
// flags exactly that — the newest roadmap on disk running ahead of what the
// radar and calendar have been advanced to.
//
// It FLAGS, it does not edit the data — the same philosophy as
// scripts/check-sources.mjs and check-calendar-sources.ts. Promotion is an
// editorial judgement (which campaigns a member of the public can actually act
// on), not something a cron job should write. This only tells you the surfaces
// have fallen behind a sweep, while the sweep is still the most recent thing.
//
// Purely offline: it compares dates already in the repo (roadmap filenames vs.
// the radar's lastUpdated() and the calendar's lastReviewed()). No network, so
// no --validate/probe split — the report is always cheap and safe to run.
//
// Usage:
//   npx tsx scripts/check-promotion-freshness.ts             # human report
//   npx tsx scripts/check-promotion-freshness.ts --markdown  # issue-body format
//   npx tsx scripts/check-promotion-freshness.ts --issue     # refresh the digest issue
//
// Exit codes: 0 in sync · 1 a surface is behind the newest sweep · 2 the check
// itself failed (no roadmaps found, or the digest could not be published).

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { lastUpdated, authoredRadarRegions } from "../lib/threatRadar";
import { lastReviewed, authoredCalendarRegions } from "../lib/scamCalendar";
// Plain .mjs helper shared with check-sources.mjs / dependabot-triage.mjs;
// `allowJs` resolves it and infers its shape from JSDoc.
import { publishDigestIssue } from "./lib/digestIssue.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROADMAP_DIR = resolve(HERE, "../docs/threat-intel");

const ROADMAP_RE = /^(\d{4}-\d{2}-\d{2})-threat-roadmap\.md$/;

interface Surface {
  /** Human label for the report. */
  name: string;
  /** Region whose authored data this row measures. */
  region: string;
  /** File a promoter would edit. */
  file: string;
  /** The "as at" date the surface currently advertises, or null if empty. */
  asAt: string | null;
  /** The derivation shown in the report, so the number isn't a bare assertion. */
  derivedFrom: string;
}

/** Newest YYYY-MM-DD roadmap on disk, or null if the directory has none. */
async function newestRoadmap(): Promise<string | null> {
  const entries = await readdir(ROADMAP_DIR);
  const dates = entries
    .map((name) => ROADMAP_RE.exec(name)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

/**
 * One row per authored (surface, region) pair.
 *
 * Enumerated from the data rather than a fixed "AU", so a region that grows a
 * radar or calendar starts being measured the moment it is authored. A region
 * with no authored data for a surface produces no row at all — that is not the
 * same claim as "up to date", and inventing an empty row for every unauthored
 * region would bury the real gaps under noise.
 */
function surfaces(): Surface[] {
  const rows: Surface[] = [];
  for (const region of authoredRadarRegions()) {
    rows.push({
      name: "Threat radar",
      region,
      file: "lib/threatRadar.ts",
      asAt: lastUpdated(region),
      derivedFrom: "lastUpdated() — the newest lastSeen across the entries",
    });
  }
  for (const region of authoredCalendarRegions()) {
    rows.push({
      name: "Scam calendar",
      region,
      file: "lib/scamCalendar.ts",
      asAt: lastReviewed(region),
      derivedFrom: "lastReviewed() — the newest reviewed date across the seasons",
    });
  }
  return rows;
}

interface Report {
  newest: string;
  behind: Array<{ surface: Surface; gapDays: number }>;
  inSync: Surface[];
}

// Whole-day gap between two YYYY-MM-DD strings, for the "N days behind" line.
// UTC midnight on both sides so DST can't shift the count.
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

function assess(newest: string): Report {
  const behind: Report["behind"] = [];
  const inSync: Surface[] = [];
  for (const surface of surfaces()) {
    // A surface with no "as at" date (empty region) or one still behind the
    // newest sweep is flagged; string comparison is valid on zero-padded ISO
    // dates, which both derivations guarantee via their isWellFormedDate checks.
    if (surface.asAt === null || surface.asAt < newest) {
      behind.push({ surface, gapDays: surface.asAt ? daysBetween(surface.asAt, newest) : 0 });
    } else {
      inSync.push(surface);
    }
  }
  return { newest, behind, inSync };
}

// ── Reporting ────────────────────────────────────────────────────────────────

function human(report: Report): string {
  const lines: string[] = [];
  lines.push(`Newest sweep on disk: ${report.newest}`);
  lines.push("");
  if (report.behind.length === 0) {
    lines.push("✅ Radar and calendar are both current with the newest sweep.");
  } else {
    lines.push("⚠️  A surface has fallen behind the newest sweep:");
    for (const { surface, gapDays } of report.behind) {
      const at = surface.asAt ?? "(empty)";
      lines.push(
        `  • ${surface.name} [${surface.region}] (${surface.file}) — as at ${at}, ${gapDays} day(s) behind`,
      );
    }
    lines.push("");
    lines.push("Promote the sweep into the surface(s) above — see");
    lines.push("docs/threat-intel/README.md, the Workflow section.");
  }
  for (const surface of report.inSync) {
    lines.push(`  · ${surface.name} [${surface.region}] up to date (as at ${surface.asAt}).`);
  }
  return lines.join("\n");
}

function markdown(report: Report): string {
  const lines: string[] = [];
  lines.push("### 📡 Radar / calendar promotion freshness");
  lines.push("");
  lines.push(`Newest sweep on disk: **${report.newest}**`);
  lines.push("");
  if (report.behind.length === 0) {
    lines.push("✅ The threat radar and scam calendar are both current with the newest sweep.");
    return lines.join("\n");
  }
  lines.push("The newest weekly sweep has landed in `docs/threat-intel/`, but a");
  lines.push("user-facing surface has not been promoted forward to match it:");
  lines.push("");
  lines.push("| Surface | Region | File | As at | Behind |");
  lines.push("|---|---|---|---|---|");
  for (const { surface, gapDays } of report.behind) {
    const at = surface.asAt ?? "_(empty)_";
    lines.push(
      `| ${surface.name} | ${surface.region} | \`${surface.file}\` | ${at} | ${gapDays} day(s) |`,
    );
  }
  lines.push("");
  lines.push("**What to do:** promote the cycle into the surface(s) above, then re-run");
  lines.push("this check. The promotion step is documented in");
  lines.push("[`docs/threat-intel/README.md`](../blob/main/docs/threat-intel/README.md)");
  lines.push("(the *Workflow* section). This is a maintenance flag, not a broken build —");
  lines.push("promotion is an editorial call and stays a human step.");
  return lines.join("\n");
}


async function main() {
  const args = process.argv.slice(2);
  const asMarkdown = args.includes("--markdown");
  const asIssue = args.includes("--issue");

  const newest = await newestRoadmap();
  if (!newest) {
    console.error(`No roadmaps found in ${ROADMAP_DIR} — cannot assess freshness.`);
    process.exitCode = 2;
    return;
  }

  const report = assess(newest);

  if (asMarkdown) console.log(markdown(report));
  else console.log(human(report));

  if (asIssue) {
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) {
      console.error("--issue needs GITHUB_REPOSITORY and GITHUB_TOKEN");
      process.exitCode = 2;
      return;
    }
    // Publishing the digest IS the deliverable, so a failure here must go red
    // (exit 2), reported separately from the staleness signal (exit 1) — a
    // silently broken checker looks identical to a clean week forever.
    try {
      const { number, action } = await publishDigestIssue({
        repo,
        token,
        label: "promotion-freshness",
        title: "📡 Radar / calendar promotion freshness",
        body: markdown(report),
        clean: report.behind.length === 0,
        extraLabels: ["threat-intel"],
        labelColor: "0e8a16",
        labelDescription: "Weekly check that the radar/calendar have been promoted to the newest sweep",
        closeComment:
          "Radar and calendar are in sync with the newest sweep — closing. " +
          "Reopened automatically when the next sweep lands un-promoted.",
      });
      console.error(number === null ? `Digest issue ${action}.` : `Digest issue #${number} ${action}.`);
    } catch (err) {
      console.error(`Failed to refresh digest issue: ${(err as Error).message}`);
      process.exitCode = 2;
      return;
    }
  }

  process.exitCode = report.behind.length > 0 ? 1 : 0;
}

// Only run when invoked directly, so newestRoadmap/assess can be imported by a
// test without the CLI firing.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("check-promotion-freshness failed:", err);
    process.exitCode = 2;
  });
}

export { newestRoadmap, assess, human, markdown, type Report };
