// README-freshness checker.
//
// The gap this closes: a README makes claims in the PRESENT TENSE about paths,
// scripts, schedules and counts, and every one is a hostage to the next
// refactor. Nothing fails when one goes stale — the file still renders, CI
// stays green, and the drift is only found when someone follows an instruction
// that no longer works. docs/threat-intel/README.md described detection as
// living in `lib/` for weeks after the engine moved to packages/engine/.
//
// This is deliberately NOT a timer. "Review the docs every N weeks" fires
// whether or not anything changed, so it is ignored on the quiet weeks and
// carries no information on the busy ones. Instead it compares two dates
// already in the repo:
//
//   · the `*Last reviewed: YYYY-MM-DD.*` marker in the README
//   · the last commit touching that README's SUBJECT — the directory it
//     documents, excluding the README itself
//
// A README whose subject has moved on since its last review is flagged. One
// sitting beside code nobody has touched is not, however old the date is,
// because nothing it describes can have drifted.
//
// It FLAGS, it does not edit — same philosophy as check-sources.mjs and
// check-promotion-freshness.ts. Whether a claim is still true is a reading
// task; only the *prompt* to re-read is mechanical.
//
// Purely offline: git metadata and file contents, no network.
//
// Usage:
//   npx tsx scripts/check-readme-freshness.ts             # human report
//   npx tsx scripts/check-readme-freshness.ts --markdown  # issue-body format
//
// Exit codes: 0 all current · 1 at least one README is behind its subject ·
// 2 the check itself failed.

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A README and the directory whose claims it is responsible for. */
export interface ReadmeSubject {
  /** Repo-relative path to the README. */
  readme: string;
  /**
   * Repo-relative directory it documents. The root README documents the whole
   * project, which is too broad to be useful as a signal — it is scoped to the
   * surfaces a reader would follow from it instead.
   */
  subject: string[];
}

export const SUBJECTS: ReadmeSubject[] = [
  { readme: "README.md", subject: ["app", "components", "package.json"] },
  { readme: "docs/threat-intel/README.md", subject: ["docs/threat-intel", "scripts/check-sources.mjs", "scripts/check-source-coverage.ts"] },
  { readme: "docs/scam-calendar/README.md", subject: ["docs/scam-calendar", "lib/scamCalendar.ts"] },
  { readme: "eval/README.md", subject: ["eval", "scripts/eval.ts", "scripts/eval-metamorphic.ts"] },
  { readme: "packages/engine/README.md", subject: ["packages/engine/src"] },
  { readme: "workers/inbound-email/README.md", subject: ["workers/inbound-email"] },
];

const REVIEWED = /^\*Last reviewed:\s*(\d{4}-\d{2}-\d{2})\.?\*/m;

/** Last commit date (YYYY-MM-DD) touching any of `paths`, excluding `except`. */
export function lastTouched(paths: string[], except: string): string | null {
  const args = ["log", "-1", "--format=%ad", "--date=short", "--", ...paths, `:(exclude)${except}`];
  const out = execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
  return out || null;
}

/** The `Last reviewed` marker, or null when the README carries none. */
export function reviewedDate(readme: string): string | null {
  const full = resolve(ROOT, readme);
  if (!existsSync(full)) return null;
  return REVIEWED.exec(readFileSync(full, "utf8"))?.[1] ?? null;
}

export interface Row {
  readme: string;
  reviewed: string | null;
  subjectMoved: string | null;
  /** Stale when the subject has changed since the README was last reviewed. */
  stale: boolean;
}

export function report(subjects: ReadmeSubject[] = SUBJECTS): Row[] {
  return subjects.map(({ readme, subject }) => {
    const existing = subject.filter((p) => existsSync(resolve(ROOT, p)));
    const reviewed = reviewedDate(readme);
    const subjectMoved = existing.length ? lastTouched(existing, readme) : null;
    // No marker at all counts as stale: the file has never been reviewed under
    // this convention, so there is nothing to compare against.
    const stale = reviewed === null || (subjectMoved !== null && subjectMoved > reviewed);
    return { readme, reviewed, subjectMoved, stale };
  });
}

function human(rows: Row[]): string {
  const lines = ["", "README freshness — is each file behind the code it documents?", ""];
  for (const r of rows) {
    const mark = r.stale ? "  ⚠" : "  ·";
    const reviewed = r.reviewed ?? "never";
    lines.push(`${mark} ${r.readme}`);
    lines.push(`      reviewed ${reviewed} · subject last moved ${r.subjectMoved ?? "—"}`);
  }
  const stale = rows.filter((r) => r.stale);
  lines.push("");
  lines.push(
    stale.length
      ? `${stale.length} README(s) behind their subject. Re-read, then update the marker.`
      : "Every README has been reviewed since its subject last changed.",
  );
  return lines.join("\n");
}

function markdown(rows: Row[]): string {
  const stale = rows.filter((r) => r.stale);
  if (!stale.length) return "Every README has been reviewed since its subject last changed.";
  const lines = [
    "The code these files document has changed since they were last reviewed.",
    "They may still be correct — this flags that nobody has checked.",
    "",
    "| README | Last reviewed | Subject last moved |",
    "|---|---|---|",
  ];
  for (const r of stale) {
    lines.push(`| \`${r.readme}\` | ${r.reviewed ?? "**never**"} | ${r.subjectMoved ?? "—"} |`);
  }
  lines.push("", "Re-read each, correct what has drifted, then update its");
  lines.push("`*Last reviewed: YYYY-MM-DD.*` marker — on checking, not on editing nearby.");
  return lines.join("\n");
}

function main() {
  const rows = report();
  process.stdout.write((process.argv.includes("--markdown") ? markdown(rows) : human(rows)) + "\n");
  process.exit(rows.some((r) => r.stale) ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`check-readme-freshness failed: ${(err as Error).message}`);
    process.exit(2);
  }
}
