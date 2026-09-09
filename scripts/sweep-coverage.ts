// Sweep → surface coverage report.
//
// check-promotion-freshness.ts answers "is the newest sweep promoted yet?" — a
// single date comparison against the most recent roadmap. This answers the
// wider question behind it: across the whole archive, which sweeps ever made it
// into a user-facing surface, and which landed and were never promoted at all?
//
// The distinction matters because freshness is self-healing in the wrong way. A
// sweep that is skipped stops being flagged the moment a newer one is promoted:
// the surface is "current" again, and the skipped cycle's campaigns are simply
// missing from the radar with nothing pointing at the hole. That is invisible to
// a date check by construction, and it is the failure this report exists to make
// visible.
//
// WHAT THIS READS, AND WHY IT IS NOT A ROADMAP PARSER.
// Roadmaps are hand-written research documents and their shape has changed
// repeatedly — the proposal table alone has had six different header rows across
// ten sweeps ("# | Tactic | Proposed Rule | Target File | FP Risk | Priority",
// "ID | Priority | Region | Tactic | ...", "ID | Tactic | Region | Target file /
// array | ..."), and section headings have run through "### 1.", "### T1." and
// regional "### AU —" conventions. Extracting proposals from that prose would
// mis-read a column silently and would need rewriting every time the research
// evolved, which is exactly backwards: the archive's format freedom is worth
// more than this report is.
//
// So it reads only two things, both structurally stable:
//
//   · roadmap FILENAMES on disk (the YYYY-MM-DD-threat-roadmap.md convention,
//     already load-bearing in check-promotion-freshness.ts and asserted by a
//     test in __tests__/threatRadar.test.ts);
//   · the `roadmap` field authored on every ThreatEntry, which is the entry's
//     own citation of the sweep it came from.
//
// Both are data the code already depends on. Nothing here interprets prose, so
// a sweep can be written however its author likes without breaking this.
//
// The calendar is reported differently and deliberately so. Seasons carry a
// `reviewed` date but no `roadmap` field — a season is a recurring window that
// gets re-checked against fresh intel, not something promoted out of one cycle.
// Asking "which sweep is this season from" would be a category error, so the
// calendar section reports review recency per region instead.
//
// It FLAGS, it does not edit — same philosophy as check-promotion-freshness.ts
// and check-sources.mjs. Whether an unpromoted sweep actually had anything worth
// promoting is an editorial call; this only shows you where to look.
//
// Usage:
//   npx tsx scripts/sweep-coverage.ts             # human report
//   npx tsx scripts/sweep-coverage.ts --markdown  # issue/PR-body format
//
// Exit codes: 0 always — this is a report, not a gate. Promotion is an editorial
// call, and a sweep can be legitimately skipped (an infrastructure-only cycle
// with nothing consumer-facing in it). Failing CI over that would train people
// to ignore it. check-promotion-freshness.ts is the one that exits non-zero.

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { radarForRegion, authoredRadarRegions, lastUpdated } from "../lib/threatRadar";
import { calendarForRegion, authoredCalendarRegions, lastReviewed } from "../lib/scamCalendar";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROADMAP_DIR = resolve(HERE, "../docs/threat-intel");

const ROADMAP_RE = /^(\d{4}-\d{2}-\d{2})-threat-roadmap\.md$/;

/** One sweep on disk, and what the radar shows for it. */
interface SweepRow {
  /** Sweep date, from the filename. */
  date: string;
  /** Radar entry ids citing this sweep as their `roadmap`, by region. */
  promoted: Array<{ region: string; ids: string[] }>;
  /** Total entries citing it, across regions. */
  total: number;
}

/** All sweep dates on disk, oldest first. */
async function roadmapDates(): Promise<string[]> {
  const entries = await readdir(ROADMAP_DIR);
  return entries
    .map((name) => ROADMAP_RE.exec(name)?.[1])
    .filter((d): d is string => Boolean(d))
    .sort();
}

/**
 * Cross-reference every sweep against the `roadmap` citations on radar entries.
 *
 * An entry cites the sweep it was promoted out of, so the inverse mapping —
 * sweep → entries — is the promotion record, already maintained as a
 * by-product of authoring. No separate ledger to keep in sync.
 */
function coverage(dates: string[]): SweepRow[] {
  return dates.map((date) => {
    const promoted: SweepRow["promoted"] = [];
    let total = 0;
    for (const region of authoredRadarRegions()) {
      const ids = radarForRegion(region)
        .filter((t) => t.roadmap === date)
        .map((t) => t.id);
      if (ids.length > 0) {
        promoted.push({ region, ids });
        total += ids.length;
      }
    }
    return { date, promoted, total };
  });
}

// ── Reporting ────────────────────────────────────────────────────────────────

function human(rows: SweepRow[]): string {
  const lines: string[] = [];
  const unpromoted = rows.filter((r) => r.total === 0);

  lines.push(`Sweeps on disk: ${rows.length}`);
  lines.push("");
  lines.push("Radar promotion by sweep:");
  for (const row of rows) {
    if (row.total === 0) {
      lines.push(`  ✗ ${row.date} — no radar entries cite this sweep`);
      continue;
    }
    const detail = row.promoted.map((p) => `${p.region}: ${p.ids.length}`).join(", ");
    lines.push(`  ✓ ${row.date} — ${row.total} entr${row.total === 1 ? "y" : "ies"} (${detail})`);
  }

  lines.push("");
  if (unpromoted.length === 0) {
    lines.push("Every sweep has at least one radar entry citing it.");
  } else {
    lines.push(
      `${unpromoted.length} sweep(s) with no radar entry: ${unpromoted.map((r) => r.date).join(", ")}`,
    );
    lines.push("Not necessarily wrong — an infrastructure-only cycle may have had");
    lines.push("nothing consumer-facing to promote. Worth a look, not a failure.");
  }

  lines.push("");
  lines.push("Radar as-at, by region:");
  for (const region of authoredRadarRegions()) {
    lines.push(`  · ${region} — ${lastUpdated(region) ?? "(empty)"} (${radarForRegion(region).length} entries)`);
  }

  lines.push("");
  lines.push("Calendar review recency, by region:");
  for (const region of authoredCalendarRegions()) {
    const seasons = calendarForRegion(region);
    const oldest = seasons.reduce<string | null>(
      (min, s) => (min === null || s.reviewed < min ? s.reviewed : min),
      null,
    );
    lines.push(
      `  · ${region} — newest ${lastReviewed(region) ?? "(empty)"}, oldest ${oldest ?? "(empty)"} (${seasons.length} seasons)`,
    );
  }

  return lines.join("\n");
}

function markdown(rows: SweepRow[]): string {
  const lines: string[] = [];
  const unpromoted = rows.filter((r) => r.total === 0);

  lines.push("### 🗂 Sweep → surface coverage");
  lines.push("");
  lines.push(`Sweeps on disk: **${rows.length}**`);
  lines.push("");
  lines.push("| Sweep | Radar entries | Regions |");
  lines.push("|---|---|---|");
  for (const row of rows) {
    const regions = row.promoted.map((p) => `${p.region} (${p.ids.length})`).join(", ") || "—";
    lines.push(`| ${row.date} | ${row.total === 0 ? "**0**" : row.total} | ${regions} |`);
  }
  lines.push("");

  if (unpromoted.length > 0) {
    lines.push(
      `**${unpromoted.length} sweep(s) with no radar entry citing them:** ` +
        unpromoted.map((r) => `\`${r.date}\``).join(", "),
    );
    lines.push("");
    lines.push("This is a prompt, not a failure — a cycle whose findings were all");
    lines.push("infrastructure-side has nothing a member of the public could meet, and");
    lines.push("correctly promotes nothing. The report cannot tell those apart; it only");
    lines.push("shows which cycles never reached a user-facing surface.");
    lines.push("");
  }

  lines.push("| Region | Radar as at | Entries | Calendar newest | Calendar oldest |");
  lines.push("|---|---|---|---|---|");
  const regions = [...new Set([...authoredRadarRegions(), ...authoredCalendarRegions()])].sort();
  for (const region of regions) {
    const entries = radarForRegion(region);
    const seasons = calendarForRegion(region);
    const oldest = seasons.reduce<string | null>(
      (min, s) => (min === null || s.reviewed < min ? s.reviewed : min),
      null,
    );
    lines.push(
      `| ${region} | ${lastUpdated(region) ?? "_(none)_"} | ${entries.length || "—"} ` +
        `| ${lastReviewed(region) ?? "_(none)_"} | ${oldest ?? "_(none)_"} |`,
    );
  }

  return lines.join("\n");
}

async function main() {
  const asMarkdown = process.argv.slice(2).includes("--markdown");

  const dates = await roadmapDates();
  if (dates.length === 0) {
    console.error(`No roadmaps found in ${ROADMAP_DIR} — nothing to report.`);
    process.exitCode = 2;
    return;
  }

  const rows = coverage(dates);
  console.log(asMarkdown ? markdown(rows) : human(rows));
}

// Only run when invoked directly, so the helpers stay importable by a test
// without the CLI firing. Same guard as check-promotion-freshness.ts.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("sweep-coverage failed:", err);
    process.exitCode = 2;
  });
}

export { roadmapDates, coverage, human, markdown, type SweepRow };
