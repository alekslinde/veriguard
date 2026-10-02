// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

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
// It reports two different kinds of staleness, because there are two:
//
//   1. A SURFACE behind the newest sweep. Region-level, gated on AU, and the
//      original purpose of this file.
//   2. A SEASON nobody has reviewed in a month. Per-entry and never gated. A
//      region's date is its newest season, so a single promoted season reports
//      the whole region current — which is how twelve AU seasons aged to 44 days
//      behind a green check. See the staleSeasons() note.
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

import { lastUpdated, authoredRadarRegions, type RadarRegion } from "../lib/threatRadar";
import {
  lastReviewed,
  authoredCalendarRegions,
  calendarForRegion,
  type CalendarRegion,
} from "../lib/scamCalendar";
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
  region: RadarRegion | CalendarRegion;
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

/** A season whose `reviewed` date has aged past the staleness threshold. */
interface StaleSeason {
  region: CalendarRegion;
  id: string;
  reviewed: string;
  ageDays: number;
}

interface Report {
  newest: string;
  behind: Array<{ surface: Surface; gapDays: number }>;
  inSync: Surface[];
  /**
   * Seasons nobody has reviewed lately, independent of the sweep comparison
   * above. Reported, never gating — see the staleSeasons() note.
   */
  staleSeasons: StaleSeason[];
}

/**
 * Regions whose staleness gates the digest issue and the exit code.
 *
 * Everything authored is REPORTED; only these decide whether the check is
 * failing. The two are deliberately different. Before this check looked past
 * AU, five non-AU calendars were already behind — some by nearly a month — and
 * folding them into the gate would mean `behind.length === 0` could never hold
 * again, so the digest issue could never close no matter how promptly a sweep
 * was promoted. A permanently-open flag is one nobody reads, which is the
 * alert fatigue this file's own comments argue against.
 *
 * AU is the gate because it is the sweeps' home region: a roadmap that lands
 * un-promoted is, first and always, an AU promotion that did not happen. The
 * other regions are reported so their drift is visible and can be worked off
 * deliberately, rather than being silently absent as they were before.
 *
 * Widen this as a region's promotion actually becomes routine — the list is
 * the honest statement of what we hold ourselves to, not of what exists.
 */
const GATING_REGIONS = new Set(["AU"]);

/** The behind-rows that gate: stale, and in a region we hold to the cycle. */
function gating(report: Report): Report["behind"] {
  return report.behind.filter((b) => GATING_REGIONS.has(b.surface.region));
}

// Whole-day gap between two YYYY-MM-DD strings, for the "N days behind" line.
// UTC midnight on both sides so DST can't shift the count.
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ── Per-season staleness ─────────────────────────────────────────────────────
//
// The surface check above asks "is the region's date behind the newest sweep".
// That question is answered by lastReviewed(), which returns the NEWEST reviewed
// date in a region — so one freshly-reviewed season reports the whole region as
// current. AU sat in exactly that state on 2026-09-29: the gate read 2026-09-27
// from a single promoted season while twelve others were still on 2026-08-16 or
// 2026-09-11, and nothing was failing.
//
// This closes that by measuring each season on its own. Two deliberate
// differences from the surface check:
//
//   · It measures AGE AGAINST TODAY, not distance behind the newest sweep.
//     Seasons are not per-sweep artefacts — a quiet cycle that re-confirms a
//     season is a real review, and most sweeps say nothing about most seasons.
//     The honest question is "has anyone looked at this lately", which is a
//     question about elapsed time.
//   · It is reported, never gating. Which season deserves attention is the same
//     editorial call the rest of this file refuses to automate, and a per-season
//     gate over 45 seasons would be permanently red — the alert fatigue the
//     GATING_REGIONS note argues against.
//
// Threshold: the observed sweep cadence over the first 13 sweeps was a mean of
// 8 days with a worst gap of 25, so 30 days sits just above a skipped cycle. A
// region reviewed once per cycle never trips this; one left for a month does.
// Checked against the pre-2026-09-29 data, where 22 seasons were over 30 days
// and the oldest were 50 — a 60-day threshold would have flagged none of them.
const SEASON_STALE_DAYS = 30;

// How many stale seasons to list before collapsing the rest into a count.
//
// Seasons reviewed in one sitting age out together — all 45 were reviewed on
// 2026-09-29, so without a cap the first stale week prints a 45-row wall that
// says little more than "review the calendar". The cap keeps the oldest rows,
// which are the ones worth acting on first, and still states the true total so
// nothing is hidden.
const SEASON_LIST_LIMIT = 12;

/**
 * Seasons nobody has reviewed in SEASON_STALE_DAYS, oldest first.
 *
 * `today` is a parameter rather than a `new Date()` call inside, so a test can
 * state the date it is reasoning about instead of depending on when it runs —
 * the coupling that broke the non-gating-visibility test twice.
 */
function staleSeasons(today: string, maxAgeDays = SEASON_STALE_DAYS): StaleSeason[] {
  const rows: StaleSeason[] = [];
  for (const region of authoredCalendarRegions()) {
    for (const season of calendarForRegion(region)) {
      const ageDays = daysBetween(season.reviewed, today);
      if (ageDays > maxAgeDays) {
        rows.push({ region, id: season.id, reviewed: season.reviewed, ageDays });
      }
    }
  }
  return rows.sort((a, b) => b.ageDays - a.ageDays || a.region.localeCompare(b.region));
}

/**
 * `today` defaults to the newest sweep rather than the wall clock.
 *
 * That keeps assess(newest) a pure function of the repo for every existing
 * caller and test, and it is the conservative choice: dating season ages from
 * the sweep can only under-report staleness relative to a later real date, never
 * invent it. The CLI passes the actual today so the report a maintainer reads is
 * measured against now.
 */
function assess(newest: string, today: string = newest): Report {
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
  return { newest, behind, inSync, staleSeasons: staleSeasons(today) };
}

// ── Reporting ────────────────────────────────────────────────────────────────

/**
 * `limit` caps the stale-season list. The CLI passes Infinity, because a
 * terminal can scroll and the person ran the command to see the whole picture;
 * the digest body keeps the cap so a GitHub issue does not open on a 45-row
 * table. The markdown note tells the reader the local run lists the rest, so
 * that has to be true.
 */
function human(report: Report, limit: number = SEASON_LIST_LIMIT): string {
  const lines: string[] = [];
  lines.push(`Newest sweep on disk: ${report.newest}`);
  lines.push("");
  const gate = gating(report);
  const informational = report.behind.filter((b) => !GATING_REGIONS.has(b.surface.region));

  if (gate.length === 0) {
    lines.push("✅ Radar and calendar are current with the newest sweep.");
  } else {
    lines.push("⚠️  A surface has fallen behind the newest sweep:");
    for (const { surface, gapDays } of gate) {
      const at = surface.asAt ?? "(empty)";
      lines.push(
        `  • ${surface.name} [${surface.region}] (${surface.file}) — as at ${at}, ${gapDays} day(s) behind`,
      );
    }
    lines.push("");
    lines.push("Promote the sweep into the surface(s) above — see");
    lines.push("docs/threat-intel/README.md, the Workflow section.");
  }

  if (informational.length > 0) {
    lines.push("");
    lines.push("Also behind, not gating (see GATING_REGIONS):");
    for (const { surface, gapDays } of informational) {
      const at = surface.asAt ?? "(empty)";
      lines.push(`  · ${surface.name} [${surface.region}] — as at ${at}, ${gapDays} day(s) behind`);
    }
  }
  for (const surface of report.inSync) {
    lines.push(`  · ${surface.name} [${surface.region}] up to date (as at ${surface.asAt}).`);
  }

  if (report.staleSeasons.length > 0) {
    lines.push("");
    lines.push(
      `Seasons not reviewed in over ${SEASON_STALE_DAYS} days (not gating — a region's`,
    );
    lines.push("date is its newest season, so these hide behind it):");
    for (const s of report.staleSeasons.slice(0, limit)) {
      lines.push(`  · ${s.region}/${s.id} — reviewed ${s.reviewed}, ${s.ageDays} day(s) ago`);
    }
    const rest = report.staleSeasons.length - limit;
    if (rest > 0) lines.push(`  · … and ${rest} more (${report.staleSeasons.length} in total)`);
  }
  return lines.join("\n");
}

function markdown(report: Report): string {
  const lines: string[] = [];
  lines.push("### 📡 Radar / calendar promotion freshness");
  lines.push("");
  lines.push(`Newest sweep on disk: **${report.newest}**`);
  lines.push("");
  const gate = gating(report);
  const informational = report.behind.filter((b) => !GATING_REGIONS.has(b.surface.region));

  const table = (rows: Report["behind"]) => {
    lines.push("| Surface | Region | File | As at | Behind |");
    lines.push("|---|---|---|---|---|");
    for (const { surface, gapDays } of rows) {
      const at = surface.asAt ?? "_(empty)_";
      lines.push(
        `| ${surface.name} | ${surface.region} | \`${surface.file}\` | ${at} | ${gapDays} day(s) |`,
      );
    }
    lines.push("");
  };

  // Appended on BOTH paths below: a stale season is independent of whether a
  // sweep was promoted, so a clean gate is exactly when it would otherwise go
  // unnoticed — which is how twelve AU seasons aged behind a green check.
  const seasonSection = () => {
    if (report.staleSeasons.length === 0) return;
    lines.push("");
    lines.push(`#### Seasons not reviewed in over ${SEASON_STALE_DAYS} days`);
    lines.push("");
    lines.push("A region's \"as at\" date is its **newest** season, so these do not move it");
    lines.push("and are invisible to the check above. Re-read each against its sources and");
    lines.push("bump its `reviewed` date — or record why it stands unchanged. Reported for");
    lines.push("visibility; this does not gate.");
    lines.push("");
    lines.push("| Region | Season | Reviewed | Age |");
    lines.push("|---|---|---|---|");
    for (const s of report.staleSeasons.slice(0, SEASON_LIST_LIMIT)) {
      lines.push(`| ${s.region} | \`${s.id}\` | ${s.reviewed} | ${s.ageDays} day(s) |`);
    }
    const rest = report.staleSeasons.length - SEASON_LIST_LIMIT;
    if (rest > 0) {
      lines.push("");
      lines.push(
        `… and ${rest} more, ${report.staleSeasons.length} stale in total. ` +
          "Oldest first — the rest are listed by re-running the check locally.",
      );
    }
  };

  if (gate.length === 0) {
    lines.push("✅ The threat radar and scam calendar are current with the newest sweep.");
    if (informational.length > 0) {
      lines.push("");
      lines.push("Other authored regions are behind but do not gate this check:");
      lines.push("");
      table(informational);
    }
    seasonSection();
    return lines.join("\n");
  }
  lines.push("The newest weekly sweep has landed in `docs/threat-intel/`, but a");
  lines.push("user-facing surface has not been promoted forward to match it:");
  lines.push("");
  table(gate);
  lines.push("**What to do:** promote the cycle into the surface(s) above, then re-run");
  lines.push("this check. The promotion step is documented in");
  lines.push("[`docs/threat-intel/README.md`](../blob/main/docs/threat-intel/README.md)");
  lines.push("(the *Workflow* section). This is a maintenance flag, not a broken build —");
  lines.push("promotion is an editorial call and stays a human step.");
  if (informational.length > 0) {
    lines.push("");
    lines.push("Other authored regions are also behind. They are reported for");
    lines.push("visibility and do not gate this check:");
    lines.push("");
    table(informational);
  }
  seasonSection();
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

  // Real today for the season ages, so the report a maintainer reads measures
  // "has anyone looked at this lately" against now rather than against the sweep.
  // UTC: the threshold is 30 days, so a timezone's worth of hours cannot change
  // which side of it a season falls on.
  const today = new Date().toISOString().slice(0, 10);
  const report = assess(newest, today);

  if (asMarkdown) console.log(markdown(report));
  else console.log(human(report, Infinity));

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
        clean: gating(report).length === 0,
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

  process.exitCode = gating(report).length > 0 ? 1 : 0;
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

export {
  newestRoadmap,
  assess,
  human,
  markdown,
  gating,
  staleSeasons,
  GATING_REGIONS,
  SEASON_STALE_DAYS,
  type Report,
  type StaleSeason,
};
