// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Reachability + structure checker for the scam calendar's source citations.
//
// The calendar's companion to scripts/check-sources.mjs. Each ScamSeason carries
// a `sources` list of authoritative citations (see lib/scamCalendar.ts); this
// checks they still resolve. Link rot is the quiet failure here too: when a
// regulator moves a page, the "expect this scam now" claim loses the evidence
// that separates the calendar from a horoscope, and only the assertion is left.
//
// Two modes:
//   --validate   structure only, no network — https + parseable URL + label.
//                Runs on every PR that touches the calendar (fast, offline).
//   (default)    probe every unique URL and report what rotted. Runs weekly.
//
// Reachability ONLY. Whether a body has published something new is research, not
// a cron job — the same discipline as the threat-intel checker.
//
// Usage:
//   npx tsx scripts/check-calendar-sources.ts             # human report
//   npx tsx scripts/check-calendar-sources.ts --validate  # structure, no network
//   npx tsx scripts/check-calendar-sources.ts --markdown  # issue-body format
//   npx tsx scripts/check-calendar-sources.ts --json      # machine-readable
//
// Exit codes: 0 all reachable · 1 rot found · 2 structure invalid.

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { authoredCalendarRegions, calendarForRegion } from "../lib/scamCalendar";
import { checkOne as checkSource } from "./check-sources.mjs";

const CONCURRENCY = 6;

interface SourceRef {
  url: string;
  label: string;
  /** "AU/tax-time, GB/self-assessment" — where the URL is cited, for the report. */
  cited: string[];
  /** Mirrors SeasonSource.expect — see lib/scamCalendar.ts. */
  expect?: "blocked" | "geofenced";
}

/** Every source URL cited anywhere in the calendar, deduped, with its call sites. */
function collectSources(): SourceRef[] {
  const byUrl = new Map<string, SourceRef>();
  for (const code of authoredCalendarRegions()) {
    for (const season of calendarForRegion(code)) {
      for (const source of season.sources) {
        const ref = byUrl.get(source.url) ?? { url: source.url, label: source.label, cited: [] };
        ref.cited.push(`${code}/${season.id}`);
        // A URL is deduped across seasons, so one citation declaring it blocked
        // declares it for all of them — the flag is about the HOST's behaviour,
        // not about any one season's use of it.
        if (source.expect) ref.expect = source.expect;
        byUrl.set(source.url, ref);
      }
    }
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

// ── Structure validation (no network) ────────────────────────────────────────

function validate(sources: SourceRef[]): string[] {
  const errors: string[] = [];
  if (sources.length === 0) errors.push("calendar cites zero sources — parser or data is broken");
  for (const s of sources) {
    if (!s.label || !s.label.trim()) errors.push(`${s.url} has no label (cited by ${s.cited.join(", ")})`);
    if (!/^https:\/\//.test(s.url)) errors.push(`url must be https: ${s.url} (cited by ${s.cited.join(", ")})`);
    try {
      new URL(s.url);
    } catch {
      errors.push(`unparseable url: ${s.url} (cited by ${s.cited.join(", ")})`);
    }
  }
  return errors;
}

// ── Reachability ─────────────────────────────────────────────────────────────
//
// Delegated to the threat-intel checker's checkOne, so both digests apply one
// rule about what counts as rot. This file used to carry its own copy of the
// probe logic, without the off-host fallback rungs or the DNS check, and it
// called a page DEAD on "403 to any agent" — the misreading that had live
// threat-intel sources (wa.gov.au, ecrime.ae) reported dead or retired. DEAD
// now needs positive evidence: a confirmed 404/410, NXDOMAIN, or a move.

type State =
  | "OK" | "DEAD" | "REDIRECTED" | "BLOCKED" | "SERVER_ERROR" | "TIMEOUT" | "UNREACHABLE"
  | "LIVE_FALLBACK" | "UNVERIFIED";

export interface Result extends SourceRef {
  state: State;
  status?: number;
  finalUrl?: string;
  via?: string;
  error?: string;
}

async function checkOne(ref: SourceRef): Promise<Result> {
  const r = await checkSource({
    domain: new URL(ref.url).hostname.replace(/^www\./, ""),
    url: ref.url,
    tier: "calendar",
    name: ref.label,
    expect: ref.expect,
  });
  return {
    ...ref,
    state: (r.state ?? "UNREACHABLE") as State,
    status: r.status,
    finalUrl: r.finalUrl,
    via: r.via,
    error: r.error,
  };
}

async function runPool(refs: SourceRef[], limit: number): Promise<Result[]> {
  const results: Result[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, refs.length) }, async () => {
    while (i < refs.length) {
      results.push(await checkOne(refs[i++]));
    }
  });
  await Promise.all(workers);
  return results;
}

// ── Reporting ────────────────────────────────────────────────────────────────

// BLOCKED, LIVE_FALLBACK and UNVERIFIED are not rot — a WAF or geo-fence
// rejecting a bot says nothing about a human's access.
const FAIL = new Set<State>(["DEAD", "UNREACHABLE", "TIMEOUT"]);
const PROBLEM = new Set<State>(["DEAD", "UNREACHABLE", "TIMEOUT", "SERVER_ERROR", "REDIRECTED"]);

export function markdown(results: Result[]): string {
  const problems = results.filter((r) => PROBLEM.has(r.state));
  const blocked = results.filter((r) => r.state === "BLOCKED");
  const fallback = results.filter((r) => r.state === "LIVE_FALLBACK");
  const unverified = results.filter((r) => r.state === "UNVERIFIED");
  const ok = results.filter((r) => r.state === "OK").length;

  const out: string[] = [];
  out.push("## Scam calendar source check");
  out.push("");
  const extras = [
    `${blocked.length} blocked-to-bots`,
    fallback.length ? `${fallback.length} live-via-fallback` : "",
    unverified.length ? `${unverified.length} unverified from CI` : "",
  ].filter(Boolean).join(" · ");
  out.push(`${results.length} source URLs checked · **${ok} OK**, **${problems.length} need attention**, ${extras}.`);
  out.push("");
  if (problems.length === 0 && unverified.length === 0) {
    out.push("✅ Every calendar source URL still resolves. No action needed.");
  } else if (problems.length === 0) {
    out.push(`✅ No calendar source has rotted. ${unverified.length} could not be verified from CI — listed below; check them in a browser.`);
  } else {
    out.push("| State | Source | URL | Cited by | Detail |");
    out.push("|---|---|---|---|---|");
    for (const r of problems) {
      const detail = r.state === "REDIRECTED" ? `→ ${r.finalUrl ?? "elsewhere"}` : r.error ?? (r.status ? `HTTP ${r.status}` : "");
      out.push(`| ${r.state} | ${r.label} | ${r.url} | ${r.cited.join(", ")} | ${detail} |`);
    }
    out.push("");
    out.push("A dead citation means a season's evidence is gone. Find the replacement page and update the source in lib/scamCalendar.ts, then bump that season's `reviewed` date.");
  }
  const section = (rs: Result[], summary: string, line: (r: Result) => string) => {
    if (!rs.length) return;
    out.push("");
    out.push(`<details><summary>${rs.length} ${summary}</summary>`);
    out.push("");
    for (const r of rs) out.push(`- ${line(r)}`);
    out.push("");
    out.push("</details>");
  };
  section(blocked, "blocked to automated requests (not rot)",
    (r) => `${r.label} — ${r.error ?? (r.status ? `HTTP ${r.status}` : "no response to our agent")} — ${r.url}`);
  section(fallback, "unreachable from CI but corroborated live (not rot)",
    (r) => `${r.label} — via ${r.via} — ${r.url}${r.error ? ` — ${r.error}` : ""}`);
  section(unverified, "refused by a live server, unverified from CI (not rot)",
    (r) => `${r.label} — ${r.error ?? "unverified"} — ${r.url}`);
  out.push("");
  out.push("<sub>Reachability only — this does not check whether a source published anything new.</sub>");
  return out.join("\n");
}

function human(results: Result[]): string {
  const lines: string[] = [`\n${results.length} calendar source URLs checked\n`];
  for (const state of ["DEAD", "UNREACHABLE", "TIMEOUT", "SERVER_ERROR", "REDIRECTED", "UNVERIFIED", "BLOCKED", "LIVE_FALLBACK"] as State[]) {
    const rs = results.filter((r) => r.state === state);
    if (!rs.length) continue;
    lines.push(`${state} (${rs.length}):`);
    for (const r of rs) {
      const extra =
        r.state === "REDIRECTED" ? ` -> ${r.finalUrl ?? "elsewhere"}` :
        r.state === "LIVE_FALLBACK" ? ` (via ${r.via}${r.error ? ` — ${r.error}` : ""})` :
        r.error ? ` (${r.error})` : r.status ? ` (HTTP ${r.status})` : "";
      lines.push(`  ${r.label} ${r.url}${extra} [${r.cited.join(", ")}]`);
    }
    lines.push("");
  }
  lines.push(`OK: ${results.filter((r) => r.state === "OK").length}`);
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const sources = collectSources();

  const errors = validate(sources);
  if (errors.length) {
    console.error("Calendar sources are invalid:\n");
    for (const e of errors) console.error(`  • ${e}`);
    process.exitCode = 2;
    return;
  }

  if (args.includes("--validate")) {
    console.log(`Calendar sources valid — ${sources.length} unique URLs across ${authoredCalendarRegions().length} regions.`);
    return;
  }

  const results = await runPool(sources, CONCURRENCY);

  if (args.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else if (args.includes("--markdown")) console.log(markdown(results));
  else console.log(human(results));

  process.exitCode = results.some((r) => FAIL.has(r.state)) ? 1 : 0;
}

// Only run when invoked directly, so tests can import the report and checkOne
// without firing a request at every cited regulator.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("check-calendar-sources failed:", err);
    process.exitCode = 2;
  });
}

export { checkOne };
