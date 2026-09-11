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

import { authoredCalendarRegions, calendarForRegion } from "../lib/scamCalendar";

const TIMEOUT_MS = 30_000; // several .gov sites answer slowly; short budgets cry wolf.
const CONCURRENCY = 6;
const RETRIES = 1;

const USER_AGENT =
  "veriguard-calendar-check/1.0 (+https://github.com/alekslinde/veriguard; abuse-reporting tool)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface SourceRef {
  url: string;
  label: string;
  /** "AU/tax-time, GB/self-assessment" — where the URL is cited, for the report. */
  cited: string[];
  /** Mirrors SeasonSource.expect — see lib/scamCalendar.ts. */
  expect?: "blocked";
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

type State = "OK" | "DEAD" | "REDIRECTED" | "BLOCKED" | "SERVER_ERROR" | "TIMEOUT" | "UNREACHABLE";

interface Result extends SourceRef {
  state: State;
  status?: number;
  finalUrl?: string;
  error?: string;
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function probe(url: string, method: string, signal: AbortSignal, ua = USER_AGENT) {
  return fetch(url, {
    method,
    redirect: "follow",
    signal,
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,*/*" },
  });
}

// A redirect onto a bare homepage, or a different host, is the classic sign of a
// reorganised site that dropped the deep link: reachable, but the citation is gone.
function landedElsewhere(requested: string, final: string): boolean {
  const from = new URL(requested);
  const to = new URL(final);
  const landedOnRoot = to.pathname === "/" && from.pathname !== "/";
  const changedHost = to.hostname.replace(/^www\./, "") !== from.hostname.replace(/^www\./, "");
  return landedOnRoot || changedHost;
}

// Tells "a WAF is refusing our bot" apart from "the host is gone" — a browser-UA
// 200 on the same URL means BLOCKED (reachable, unverifiable), never laundered to OK.
async function probeWithBrowserUa(url: string): Promise<"alive" | "moved" | "dead"> {
  try {
    const res = await withTimeout((signal) => probe(url, "GET", signal, BROWSER_UA));
    if (!res.ok) return "dead";
    return landedElsewhere(url, res.url) ? "moved" : "alive";
  } catch {
    return "dead";
  }
}

async function checkOne(ref: SourceRef): Promise<Result> {
  const result: Result = { ...ref, state: "OK" };

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      let res = await withTimeout((signal) => probe(ref.url, "HEAD", signal));
      if (res.status === 405 || res.status === 403 || res.status === 501) {
        res = await withTimeout((signal) => probe(ref.url, "GET", signal));
      }
      result.status = res.status;
      result.finalUrl = res.url;

      if (res.status === 404 || res.status === 410) result.state = "DEAD";
      else if (res.status === 403 || res.status === 429) {
        const browser = await probeWithBrowserUa(ref.url);
        if (browser === "alive") result.state = "BLOCKED";
        else if (browser === "moved") {
          result.state = "REDIRECTED";
          result.finalUrl = undefined;
        } else if (ref.expect === "blocked") {
          // Declared unverifiable-from-CI by a human who checked in a browser.
          // Without this a site whose WAF refuses every agent is indistinguishable
          // from a dead one, and the weekly run reports the same false rot forever
          // until people stop reading it. Same flag as the threat-intel registry.
          result.state = "BLOCKED";
          result.error = `HTTP ${res.status} to any agent (expected: edge bot-protection)`;
        } else {
          result.state = "DEAD";
          result.error = `HTTP ${res.status} to any agent`;
        }
      } else if (res.status >= 500) result.state = "SERVER_ERROR";
      else if (!res.ok) result.state = "DEAD";
      else if (landedElsewhere(ref.url, res.url)) result.state = "REDIRECTED";
      else result.state = "OK";

      return result;
    } catch (err) {
      if (attempt === RETRIES) {
        const browser = await probeWithBrowserUa(ref.url);
        if (browser === "alive") {
          result.state = "BLOCKED";
          result.error = "blocks automated agents (responds to a browser)";
          return result;
        }
        if (browser === "moved") {
          result.state = "REDIRECTED";
          return result;
        }
        result.state = (err as Error).name === "AbortError" ? "TIMEOUT" : "UNREACHABLE";
        result.error = (err as Error).message;
        return result;
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return result;
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

// BLOCKED is not rot — a WAF rejecting a bot says nothing about a human's access.
const FAIL = new Set<State>(["DEAD", "UNREACHABLE", "TIMEOUT"]);
const PROBLEM = new Set<State>(["DEAD", "UNREACHABLE", "TIMEOUT", "SERVER_ERROR", "REDIRECTED"]);

function markdown(results: Result[]): string {
  const problems = results.filter((r) => PROBLEM.has(r.state));
  const blocked = results.filter((r) => r.state === "BLOCKED");
  const ok = results.filter((r) => r.state === "OK").length;

  const out: string[] = [];
  out.push("## Scam calendar source check");
  out.push("");
  out.push(`${results.length} source URLs checked · **${ok} OK**, **${problems.length} need attention**, ${blocked.length} blocked-to-bots.`);
  out.push("");
  if (problems.length === 0) {
    out.push("✅ Every calendar source URL still resolves. No action needed.");
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
  out.push("");
  out.push("<sub>Reachability only — this does not check whether a source published anything new.</sub>");
  return out.join("\n");
}

function human(results: Result[]): string {
  const lines: string[] = [`\n${results.length} calendar source URLs checked\n`];
  for (const state of ["DEAD", "UNREACHABLE", "TIMEOUT", "SERVER_ERROR", "REDIRECTED", "BLOCKED"] as State[]) {
    const rs = results.filter((r) => r.state === state);
    if (!rs.length) continue;
    lines.push(`${state} (${rs.length}):`);
    for (const r of rs) {
      const extra = r.state === "REDIRECTED" ? ` -> ${r.finalUrl ?? "elsewhere"}` : r.error ? ` (${r.error})` : r.status ? ` (HTTP ${r.status})` : "";
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

main().catch((err) => {
  console.error("check-calendar-sources failed:", err);
  process.exitCode = 2;
});
