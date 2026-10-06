// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Reachability checker for the threat-intel source registry.
//
// Reads docs/threat-intel/sources.yml, requests every source URL, and reports
// what has rotted. Link rot is the quiet failure mode of the roadmap archive:
// when a citation 404s, the evidence for a hardcoded score in lib/ is gone and
// only the magic number is left.
//
// This checks REACHABILITY ONLY — whether the page still exists. It does not
// judge freshness or read content; that is the research job, not this one.
//
// DEAD needs positive evidence of rot: a 404/410 that GET confirms (from our
// agent or a browser's), a host that no longer resolves, or a redirect off the
// page. A server that ANSWERS but refuses every agent (403/429/451) is up — it
// is reported UNVERIFIED, never DEAD. A host that resolves but never answers is
// indistinguishable from CI between "geo-fenced" and "server gone", so that
// one stays rot unless a human has declared `expect: geofenced`. Four live
// sources were retired or flagged on this confusion: wa.gov.au (403 to every
// agent), ecrime.ae and condusef.gob.mx (refuse connections from outside their
// country), and SEC Nigeria (whose real problem was a move, not a block).
//
// Safety: entries under `indicators:` are scam domains quoted as evidence. They
// are never fetched. If one appears in a source tier the run FAILS rather than
// skipping it quietly, because that is a mistake that must not be merged.
//
// Dependency-free by design — it parses the registry's own fixed shape rather
// than pulling a YAML library into CI. See parseRegistry() for the constraints
// that implies.
//
// Usage:
//   node scripts/check-sources.mjs              # human-readable report
//   node scripts/check-sources.mjs --json       # machine-readable
//   node scripts/check-sources.mjs --markdown   # issue-body format
//   node scripts/check-sources.mjs --issue      # refresh the digest issue
//   node scripts/check-sources.mjs --validate   # parse + validate, no network
//   node scripts/check-sources.mjs --stale      # is `updated:` behind the file?
//   node scripts/check-sources.mjs --auto-bump  # bump `updated:` if content changed
//                                                # (compares against $BASE_SHA,
//                                                # falling back to HEAD~1)
//
// Exit codes: 0 all reachable · 1 rot found · 2 registry invalid.
// With --stale: 0 header current · 1 header behind the file · 2 check failed.
// With --auto-bump: 0 bumped or nothing to do · 2 check failed. Never exits 1 —
// it is not a reachability signal.

import { execFileSync } from "node:child_process";
import { Resolver } from "node:dns/promises";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { publishDigestIssue } from "./lib/digestIssue.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY = resolve(HERE, "../docs/threat-intel/sources.yml");

// 30s, not 15s: several .gov.au sites (acma, cyber) routinely take 15-25s to
// answer a cold request. A shorter budget reports them as TIMEOUT every week,
// which trains you to ignore the report — the one failure mode that makes this
// whole job worthless.
const TIMEOUT_MS = 30_000;
const CONCURRENCY = 6;   // polite: several are small gov / single-operator sites
const RETRIES = 1;

// The ladder runs only AFTER the direct probes have already spent their budget,
// so its rungs get a tighter one. At the full 30s a bad WAF week (every rung
// hanging) pushed worst-case per-entry wall time to ~7x30s; across ~100 entries
// at CONCURRENCY 6 that trends toward an hour and risks losing the digest
// issue, which the workflow scores as a red build. Corroboration is a
// best-effort signal — a rung that cannot answer in 8s is not worth the wait.
const FALLBACK_TIMEOUT_MS = 8_000;

// Identifies the bot and points operators at the repo. Some WAFs reject unknown
// agents outright, which is itself a checkable outcome (BLOCKED, not DEAD).
const USER_AGENT =
  "veriguard-source-check/1.0 (+https://github.com/alekslinde/veriguard; abuse-reporting tool)";

// Several sites (acma.gov.au and cyber.gov.au among them) sit behind a WAF that
// blackholes unrecognised agents — the connection hangs until it aborts rather
// than returning 403. Indistinguishable from a dead host on the first attempt.
//
// So a failure is retried once with a browser UA purely to TELL THE TWO APART.
// If the browser UA succeeds the source is reported BLOCKED — reachable, but
// unverifiable by this job — never OK. We do not launder the result: a human
// still has to look. Masking it as OK would let real rot hide behind a WAF.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// Cross-host liveness fallback (LIVE_FALLBACK).
//
// The 403-to-any-agent case is dominated by IP-reputation blocks: an enterprise
// WAF (Cloudflare, Akamai) challenges every request from a datacenter IP before
// headers or UA matter, so no on-host probe from CI can get through — and, being
// IP-wide, neither can the site's own feed or sitemap. The one signal left is
// OFF-host: the Internet Archive, which does answer CI IPs. A recent snapshot
// proves the citation existed lately and the host is a real publisher, not rot.
//
// This is corroboration, not proof of a live 200 today — hence its own state,
// never OK. A human still confirms before leaning on a *fresh* claim. But it is
// strictly better than DEAD: it stops the checker crying rot over sources that
// are demonstrably alive and merely bot-walled from the runner.
//
// The window bounds the honesty gap: a snapshot older than this is treated as no
// evidence, so a source that died a year ago still surfaces as rot.
const WAYBACK_MAX_AGE_DAYS = 365;

// Pure: read the Wayback `available` API payload and decide whether its closest
// snapshot is recent enough to vouch for the URL. Exported for unit tests —
// this is the honesty-critical bit (shape + recency), separate from the fetch.
export function waybackFreshness(data, nowMs = Date.now(), maxAgeDays = WAYBACK_MAX_AGE_DAYS) {
  const snap = data?.archived_snapshots?.closest;
  if (!snap || snap.available !== true || !snap.timestamp) return null;
  // Wayback timestamps are yyyymmddhhmmss (UTC).
  const t = String(snap.timestamp);
  if (!/^\d{14}$/.test(t)) return null;
  const iso = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const ageDays = (nowMs - ms) / 86_400_000;
  if (ageDays < 0 || ageDays > maxAgeDays) return null;
  return { snapshotUrl: snap.url, ageDays: Math.round(ageDays) };
}

// Pure: same decision for a CDX query (`output=json`, last row = newest
// capture). The `available` API regularly answers with no snapshot at all for
// pages the Archive holds hundreds of captures of, so on its own it leaves
// heavily-archived sites (wa.gov.au) with no off-host rung. CDX is filtered to
// statuscode 200 by the caller, so a row is a capture of a page that served.
export function cdxFreshness(rows, nowMs = Date.now(), maxAgeDays = WAYBACK_MAX_AGE_DAYS) {
  if (!Array.isArray(rows) || rows.length < 2) return null; // header row only
  const header = rows[0];
  const last = rows[rows.length - 1];
  if (!Array.isArray(header) || !Array.isArray(last)) return null;
  const timestamp = last[header.indexOf("timestamp")];
  const original = last[header.indexOf("original")];
  if (!timestamp || !original) return null;
  return waybackFreshness({
    archived_snapshots: {
      closest: { available: true, timestamp, url: `https://web.archive.org/web/${timestamp}/${original}` },
    },
  }, nowMs, maxAgeDays);
}

// ---------------------------------------------------------------------------
// Registry parsing
//
// Deliberately not a general YAML parser. It handles exactly the shapes
// sources.yml uses: nested maps, `- key: value` list items, quoted scalars and
// `>-` folded blocks. Anything outside that is a parse error rather than a
// silent misread — a checker that quietly skips half the registry is worse than
// one that refuses to run.
// ---------------------------------------------------------------------------

function isComment(line) {
  // Only full-line comments. Inline `#` is left alone: URLs contain fragments,
  // and no value in the registry needs a trailing comment.
  return line.trimStart().startsWith("#");
}

function unquote(v) {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length > 1) ||
    (t.startsWith("'") && t.endsWith("'") && t.length > 1)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseRegistry(text) {
  const lines = text.split("\n");

  const out = { tiers: {}, brands: [], indicators: [], version: null, updated: null, errors: [] };

  let section = null;       // "tiers" | "brands" | "indicators"
  let tierKey = null;
  let current = null;       // entry being built
  let folding = null;       // { key, indent, parts } while inside a `>-` block

  const flush = () => {
    if (!current) return;
    if (section === "tiers" && tierKey) (out.tiers[tierKey] ||= []).push(current);
    else if (section === "brands") out.brands.push(current);
    current = null;
  };

  const endFold = () => {
    if (!folding) return;
    current[folding.key] = folding.parts.join(" ").replace(/\s+/g, " ").trim();
    folding = null;
  };

  for (const [n, raw] of lines.entries()) {
    const lineNo = n + 1;

    // A comment always ends an open folded scalar. Blanking comments to "" and
    // treating them as paragraph breaks meant a comment could never terminate a
    // note, so the following entry got swallowed into it.
    if (isComment(raw)) {
      endFold();
      continue;
    }

    if (!raw.trim()) {
      // A blank line inside a folded block is a paragraph break, not an end.
      if (folding) folding.parts.push("");
      continue;
    }

    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    // Continuation of a folded scalar: anything indented past its introducer.
    if (folding && indent > folding.indent) {
      folding.parts.push(line);
      continue;
    }
    endFold();

    // Top-level keys.
    if (indent === 0) {
      flush();
      const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (!m) continue;
      const [, key, val] = m;
      if (key === "tiers" || key === "brands" || key === "indicators") {
        section = key;
        tierKey = null;
      } else if (key === "version" || key === "updated") {
        out[key] = unquote(val);
        section = null;
      } else {
        section = null;
      }
      continue;
    }

    // Tier number key, e.g. "1:".
    if (section === "tiers" && /^\d+:$/.test(line)) {
      flush();
      tierKey = line.slice(0, -1);
      continue;
    }

    // Bare list item — only `indicators:` uses this form.
    if (line.startsWith("- ") && !line.slice(2).includes(": ") && !line.slice(2).endsWith(":")) {
      const bare = unquote(line.slice(2));
      if (section === "indicators") {
        out.indicators.push(bare);
      } else {
        // A tier entry that looks bare is malformed — usually `- domain:foo.com`
        // with the space missing. Dropping it silently is the "quietly skips half
        // the registry" failure this parser is supposed to refuse.
        out.errors.push(
          `line ${lineNo}: list item in ${section === "tiers" ? `tier ${tierKey}` : section} ` +
          `is not a "key: value" mapping — check for a missing space after the colon: "${line}"`,
        );
      }
      continue;
    }

    // Start of a mapping list item: "- key: value".
    if (line.startsWith("- ")) {
      flush();
      current = {};
      const body = line.slice(2);
      const m = body.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (m) {
        const [, key, val] = m;
        if (val === ">-" || val === ">" || val === "|" || val === "|-") {
          folding = { key, indent, parts: [] };
        } else {
          current[key] = unquote(val);
        }
      } else {
        out.errors.push(`line ${lineNo}: unparseable list item: "${line}"`);
      }
      continue;
    }

    // Subsequent key on the current entry.
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (m && current) {
      const [, key, val] = m;
      // A repeated key on the same entry is always an editing mistake — a
      // leftover line from before a note was rewritten, most often — and
      // silently overwriting it hid exactly that (see sources.yml history:
      // saps.gov.za and economie.gouv.fr both shipped a stale `note:` a
      // rewrite left behind, one of them holding the very explanation for an
      // `expect: blocked` flag, discarded without a parse error). Reported
      // rather than overwritten, same discipline as the malformed-list-item
      // case above.
      if (Object.prototype.hasOwnProperty.call(current, key)) {
        out.errors.push(
          `line ${lineNo}: duplicate \`${key}:\` on ${current.domain ?? "this entry"} — ` +
          `remove the stale one (the parser would otherwise silently keep whichever comes last)`,
        );
      }
      if (val === ">-" || val === ">" || val === "|" || val === "|-") {
        folding = { key, indent, parts: [] };
      } else {
        current[key] = unquote(val);
      }
    } else if (!m) {
      out.errors.push(`line ${lineNo}: unparseable line: "${line}"`);
    }
  }

  endFold();
  flush();

  return out;
}

// ---------------------------------------------------------------------------
// Validation — runs before any network access.
// ---------------------------------------------------------------------------

const EXPECT_VALUES = new Set(["blocked", "geofenced"]);

function validate(reg) {
  const errors = [];
  const indicators = new Set(reg.indicators.map((d) => d.toLowerCase()));

  const all = [
    ...Object.entries(reg.tiers).flatMap(([t, es]) => es.map((e) => ({ ...e, tier: t }))),
    ...reg.brands.map((e) => ({ ...e, tier: "brands" })),
  ];

  // Anything the parser could not read at all. A malformed entry is a source
  // that silently vanishes from the run, so it blocks rather than warns.
  for (const e of reg.errors || []) errors.push(`PARSE: ${e}`);

  if (all.length === 0) errors.push("registry parsed to zero sources — parser or file is broken");

  // HEADER. Both fields are printed in every report ("Registry v1, updated
  // 2026-09-09"), so a missing or malformed one publishes a claim about the
  // registry that nobody can rely on. Cheap to assert, and the report is the
  // only consumer that would otherwise notice.
  if (!reg.version) errors.push("HEADER: missing `version:` — every report prints it");
  else if (!/^\d+$/.test(reg.version)) errors.push(`HEADER: version must be an integer, got "${reg.version}"`);

  if (!reg.updated) errors.push("HEADER: missing `updated:` — every report prints it");
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(reg.updated)) {
    errors.push(`HEADER: updated must be YYYY-MM-DD, got "${reg.updated}"`);
  } else if (Number.isNaN(Date.parse(`${reg.updated}T00:00:00Z`))) {
    errors.push(`HEADER: updated is not a real date: "${reg.updated}"`);
  } else if (reg.updated > new Date().toISOString().slice(0, 10)) {
    // A future date is either a typo or someone pre-dating an edit. Both make
    // the staleness comparison below meaningless.
    errors.push(`HEADER: updated is in the future: "${reg.updated}"`);
  }

  const seen = new Map();
  for (const e of all) {
    // The quarantine assertion runs FIRST and unconditionally. It is the only
    // merge-blocking safety check here, so it must never sit behind an early
    // `continue` for some unrelated missing field.
    const host = (() => {
      try { return new URL(e.url ?? "").hostname.toLowerCase().replace(/^www\./, ""); }
      catch { return null; }
    })();
    if (
      (host && indicators.has(host)) ||
      (e.domain && indicators.has(e.domain.toLowerCase()))
    ) {
      errors.push(
        `SAFETY: ${e.domain || e.url} is listed under indicators: but appears in tier ${e.tier}. ` +
        `Indicators are scam infrastructure and must never be fetched.`,
      );
    }

    if (!e.domain) {
      errors.push(`entry in tier ${e.tier} has no domain`);
      continue;
    }
    if (!e.url) {
      errors.push(`${e.domain} (tier ${e.tier}) has no url`);
      continue;
    }
    if (!/^https:\/\//.test(e.url)) {
      errors.push(`${e.domain} url must be https: ${e.url}`);
    }
    // A misspelt flag is silently a no-op in checkOne, which would report the
    // very false rot the flag was added to stop.
    if (e.expect !== undefined && !EXPECT_VALUES.has(e.expect)) {
      errors.push(`${e.domain} has unknown expect: "${e.expect}" (use ${[...EXPECT_VALUES].join(" or ")})`);
    }
    if (!host) {
      errors.push(`${e.domain} has an unparseable url: ${e.url}`);
    }

    const prev = seen.get(e.domain);
    if (prev) errors.push(`${e.domain} appears in both tier ${prev} and tier ${e.tier}`);
    else seen.set(e.domain, e.tier);
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Reachability
// ---------------------------------------------------------------------------

// Runs one request under its own fresh timeout budget.
async function withTimeout(fn, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function probe(url, method, signal, ua = USER_AGENT) {
  return fetch(url, {
    method,
    redirect: "follow",
    signal,
    headers: { "User-Agent": ua, Accept: "text/html,application/xhtml+xml,*/*" },
  });
}

// A redirect onto a bare homepage, or onto a different host, is the classic
// sign of a reorganised site that threw the deep link away: reachable, but the
// citation is gone.
function landedElsewhere(requestedUrl, finalUrl) {
  const from = new URL(requestedUrl);
  const to = new URL(finalUrl);
  const landedOnRoot = to.pathname === "/" && from.pathname !== "/";
  const changedHost = to.hostname.replace(/^www\./, "") !== from.hostname.replace(/^www\./, "");
  return landedOnRoot || changedHost;
}

// Distinguishes "WAF is refusing our bot" from "host is genuinely gone".
//
// Returns a verdict rather than a boolean, because "the browser got a 200" is
// not the same as "the citation survives" — a browser-UA request that lands on
// a homepage means the deep link has rotted, and answering `true` there would
// launder real rot as BLOCKED.
//
//   "alive"     the exact URL still serves a browser
//   "moved"     a browser reaches the host, but not this page
//   "dead"      nothing answers
async function probeWithBrowserUa(url) {
  try {
    const res = await withTimeout((signal) => probe(url, "GET", signal, BROWSER_UA));
    if (!res.ok) return { verdict: "dead", status: res.status };
    if (landedElsewhere(url, res.url)) return { verdict: "moved", finalUrl: res.url };
    return { verdict: "alive" };
  } catch {
    return { verdict: "dead" };
  }
}

// True only if the URL serves a real page to a browser UA right now (not a
// redirect onto a homepage/other host — that is rot, not liveness).
async function reachableNow(url, validate) {
  try {
    const res = await withTimeout(
      (signal) => probe(url, "GET", signal, BROWSER_UA), FALLBACK_TIMEOUT_MS);
    if (!res.ok || landedElsewhere(url, res.url)) return false;
    // A parked or catch-all host answers 200 to anything, so a status code alone
    // is not evidence. When the caller knows what the body must look like, make
    // it prove it.
    if (validate) {
      let body;
      try { body = await res.text(); } catch { return false; }
      if (!validate(body)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Same registrable-ish host, or a subdomain of it. Used to reject corroboration
// from a THIRD-PARTY host: a cached FeedBurner feed outlives the site it mirrors,
// so it cannot vouch that entry.url is still live.
function sameHost(url, domain) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    const d = String(domain).toLowerCase().replace(/^www\./, "");
    return h === d || h.endsWith(`.${d}`);
  } catch {
    return false;
  }
}

// Cheap shape checks — enough to tell a real file from a catch-all HTML page.
const looksLikeSitemap = (b) => /<(urlset|sitemapindex)\b/i.test(b);
const looksLikeRobots = (b) =>
  /^\s*(user-agent|disallow|allow|sitemap|crawl-delay)\s*:/im.test(b) && !/<html\b/i.test(b);
const looksLikeFeed = (b) => /<(rss|feed|rdf:RDF)\b/i.test(b);

// Does an archive snapshot URL actually correspond to the requested URL?
// Wayback URLs look like https://web.archive.org/web/<timestamp>/<original>.
function snapshotMatches(snapshotUrl, requestedUrl) {
  try {
    const m = String(snapshotUrl).match(/\/web\/\d+(?:[a-z_]+)?\/(.*)$/i);
    if (!m) return false;
    const norm = (u) => {
      const p = new URL(u);
      return `${p.hostname.toLowerCase().replace(/^www\./, "")}${p.pathname.replace(/\/+$/, "")}`;
    };
    return norm(m[1]) === norm(requestedUrl);
  } catch {
    return false;
  }
}

async function archiveJson(api) {
  try {
    const res = await withTimeout((signal) =>
      fetch(api, { signal, headers: { "User-Agent": USER_AGENT, Accept: "application/json" } }),
      FALLBACK_TIMEOUT_MS);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Ask the Internet Archive whether it holds a recent snapshot of the URL.
async function waybackLookup(url) {
  // archive.org can answer with a nearby ANCESTOR rather than the exact page.
  // A snapshot of the parent vouches for nothing about a child that 404'd, so
  // require the snapshot to be of the URL we actually asked about.
  const exact = (snap) => (snap && snapshotMatches(snap.snapshotUrl, url) ? snap : null);

  // Both asked at once, so the CDX rung costs no extra wall time on a ladder
  // that is already bounded per rung (see FALLBACK_TIMEOUT_MS).
  const cdx = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}` +
    "&output=json&fl=timestamp,original&filter=statuscode:200&limit=-1";
  const [available, captures] = await Promise.all([
    archiveJson(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`),
    archiveJson(cdx),
  ]);
  return exact(waybackFreshness(available)) ?? exact(cdxFreshness(captures));
}

// Does the source's host still resolve? NXDOMAIN is positive evidence of rot.
//   "resolves" · "nxdomain" · "unknown" (SERVFAIL, resolver timeout, ...)
//
// c-ares queries (Resolver), not dns.lookup: lookup runs getaddrinfo on the
// libuv threadpool with no timeout, so a stuck resolver would stall the worker
// and starve the pool every fetch also resolves through. A Resolver carries its
// own per-query timeout and never touches the pool.
const DNS_TIMEOUT_MS = 3_000;
async function defaultResolve(hostname) {
  const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 2 });
  try {
    return await resolver.resolve4(hostname);
  } catch (err) {
    // ENODATA: the name exists but has no A record. An IPv6-only host is live.
    if (err?.code === "ENODATA") return await resolver.resolve6(hostname);
    throw err;
  }
}

async function hostResolves(url, resolve = defaultResolve) {
  let hostname;
  try { hostname = new URL(url).hostname; } catch { return "unknown"; }
  try {
    await resolve(hostname);
    return "resolves";
  } catch (err) {
    // Only ENOTFOUND says the name does not exist. ENODATA says it DOES exist
    // but holds no A or AAAA record in this resolver's view (split-horizon, a
    // record migration), which a browser may still reach. Reporting that as
    // NXDOMAIN would skip every corroborating probe and name the wrong cause.
    return err?.code === "ENOTFOUND" ? "nxdomain" : "unknown";
  }
}

// The fallback ladder. Called only once the direct probes have failed to reach a
// source from CI, to tell "bot-walled but alive" apart from "actually gone".
// Cheapest and most specific first; the off-host Archive lookup last because it
// is the weakest evidence (existed recently ≠ live today) but the only one that
// survives an IP-wide block. Returns { via, detail } or null.
async function corroborateLiveness(entry) {
  // 1. Publisher feed — a live signal fetched now, and often not WAF-walled.
  //    Only a feed on the source's OWN host counts: a third-party mirror
  //    (FeedBurner et al) serves a cached copy that long outlives the site.
  if (entry.feed && sameHost(entry.feed, entry.domain)
      && await reachableNow(entry.feed, looksLikeFeed)) {
    return { via: "feed", detail: `feed reachable (${entry.feed})` };
  }
  // 2. Same-host well-known paths — only beat a PATH-specific block, but cheap.
  //    These say the HOST is up, never that entry.url's own path survives, so
  //    the detail line records that explicitly for whoever reads the digest.
  let origin;
  try { origin = new URL(entry.url).origin; } catch { origin = null; }
  if (origin) {
    for (const [path, via, shape] of [
      ["/sitemap.xml", "sitemap", looksLikeSitemap],
      ["/robots.txt", "robots", looksLikeRobots],
    ]) {
      if (await reachableNow(origin + path, shape)) {
        return { via, detail: `${origin}${path} reachable (host up; path not itself confirmed)` };
      }
    }
  }
  // 3. Off-host: a recent Internet Archive snapshot (survives an IP-wide block).
  const snap = await waybackLookup(entry.url);
  if (snap) {
    return { via: "wayback", detail: `archived ${snap.ageDays}d ago (${snap.snapshotUrl})` };
  }
  return null;
}

/**
 * @typedef {object} CheckResult
 * @property {string} domain
 * @property {string} url
 * @property {string} [tier]
 * @property {string} [name]
 * @property {string} [state]
 * @property {number} [status]
 * @property {string} [finalUrl]
 * @property {string} [via]
 * @property {string} [error]
 */

/**
 * @param {object} entry
 * @param {{ resolveHost?: (hostname: string) => Promise<unknown> }} [deps] DNS lookup, injectable for tests
 * @returns {Promise<CheckResult>}
 */
async function checkOne(entry, { resolveHost = defaultResolve } = {}) {
  /** @type {CheckResult} */
  const result = { domain: entry.domain, url: entry.url, tier: entry.tier, name: entry.name };

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      // HEAD first (cheap); many sites answer 403/405 to it, so fall back to a
      // GET before concluding anything is wrong. Some sites go further and
      // answer HEAD with a 404 (India's cybercrime.gov.in) or route it into an
      // edge error page that resolves to a 400 (bsi.bund.de) — GET on the
      // identical URL is fine. A HEAD-only rejection is a known false-rot
      // shape, so confirm 404/400/410 with GET too, not just 403/405/501; a
      // GET that repeats the same status is real evidence, not a false one.
      //
      // Each probe gets its OWN timeout budget. Sharing one timer across both
      // meant a site taking 22s on HEAD left ~8s for the GET and was reported
      // TIMEOUT while alive — precisely the .gov.au slowness this budget exists
      // to absorb.
      let res = await withTimeout((signal) => probe(entry.url, "HEAD", signal));
      if ([400, 401, 403, 404, 405, 410, 429, 451, 501].includes(res.status)) {
        res = await withTimeout((signal) => probe(entry.url, "GET", signal));
      }

      result.status = res.status;
      result.finalUrl = res.url;

      if (res.status === 404 || res.status === 410 || res.status === 400) {
        // A WAF marked `expect: blocked` does not always answer with 403 — some
        // (Netsafe among them) flip between 403 and 404 across requests, and a
        // 404 from the same edge protection says nothing real about the page
        // either. bsi.bund.de's edge goes further still and routes a blocked
        // HEAD into a 400 error page — the same reasoning extends to it: honour
        // the flag on 400 too, exactly as the 403/429 and 5xx paths already do,
        // instead of leaving it to fall through to the generic DEAD case below
        // where `expect: blocked` is never even checked.
        if (entry.expect === "blocked") {
          result.state = "BLOCKED";
          result.error = `HTTP ${res.status} (expected — bot protection)`;
        } else {
          result.state = "DEAD";
        }
      }
      else if (REFUSALS.has(res.status)) {
        // A 403 to our UA is usually a WAF, but it can also be a page pulled
        // behind auth. Confirm the URL still serves someone — unless the entry
        // is marked `expect: blocked`, meaning its edge protection refuses every
        // automated request and no probe can distinguish the two. Calling those
        // DEAD would accuse a live source of rotting.
        if (entry.expect === "blocked") {
          result.state = "BLOCKED";
          result.error = `HTTP ${res.status} (expected — bot protection)`;
        } else {
          const browser = await probeWithBrowserUa(entry.url);
          if (browser.verdict === "alive") {
            result.state = "BLOCKED";
          } else if (browser.verdict === "moved") {
            // Reachable to a browser, but not at this path — that is rot, not a WAF.
            result.state = "REDIRECTED";
            result.finalUrl = browser.finalUrl;
          } else if (GONE.has(browser.status)) {
            // The WAF refuses our agent, but the page told a browser it is gone.
            // That is the positive evidence DEAD needs; a refusal must not mask it.
            result.state = "DEAD";
            result.error = `HTTP ${res.status} to our agent; HTTP ${browser.status} to a browser`;
          } else {
            // Refused to every UA — usually an IP-reputation block, not a dead
            // host. Try the off-host fallback ladder before crying rot.
            const live = await corroborateLiveness(entry);
            if (live) {
              result.state = "LIVE_FALLBACK";
              result.via = live.via;
              result.error = `HTTP ${res.status} to our agents; ${live.detail}`;
            } else {
              // The server answered — it is up. A refusal to every agent from
              // CI is not evidence the citation rotted (wa.gov.au served a
              // browser normally while this said DEAD), so it is UNVERIFIED:
              // listed in the digest, never counted as rot.
              result.state = "UNVERIFIED";
              result.error = `HTTP ${res.status} to every agent; nothing off-host corroborates — refused, not gone`;
            }
          }
        }
      }
      else if (res.status >= 500) {
        // A WAF that answers 5xx instead of hanging must honour `expect: blocked`
        // too, or the flag is a no-op on this path and the entry reports
        // SERVER_ERROR (a PROBLEM state) every run.
        if (entry.expect === "blocked") {
          result.state = "BLOCKED";
          result.error = `HTTP ${res.status} (expected — bot protection)`;
          return result;
        }
        // A 5xx is not proof of rot. Cloudflare's edge codes in particular
        // (520-527) mean "the origin misbehaved for us right now" — often
        // transient, and sometimes only for our agent. Corroborate off-host
        // before flagging, exactly as the 403 path does; a source that is
        // genuinely down still falls through to SERVER_ERROR.
        const live = await corroborateLiveness(entry);
        if (live) {
          result.state = "LIVE_FALLBACK";
          result.via = live.via;
          result.error = `HTTP ${res.status} to our agents; ${live.detail}`;
        } else {
          result.state = "SERVER_ERROR";
        }
      }
      else if (!res.ok) {
        // Catch-all for any other non-2xx not already branched on above: 401
        // (re-probed with GET, then lands here as DEAD — a login wall means the
        // citation no longer serves the public), 406, 421, and so on. 451 is
        // not one of them; it is a REFUSAL, handled above. `expect: blocked`
        // must be honoured here too — otherwise a WAF that happens to answer
        // with a code this checker has not been individually taught about
        // defeats the flag by surprise, the same gap that let a 400 slip
        // through DEAD before 400 got its own branch above.
        if (entry.expect === "blocked") {
          result.state = "BLOCKED";
          result.error = `HTTP ${res.status} (expected — bot protection)`;
        } else {
          result.state = "DEAD";
        }
      }
      else if (landedElsewhere(entry.url, res.url)) result.state = "REDIRECTED";
      else result.state = "OK";

      return result;
    } catch (err) {
      if (attempt === RETRIES) {
        // A WAF that blackholes the connection hangs rather than returning 403,
        // so `expect: blocked` has to be honoured here too — otherwise the flag
        // the registry advertises does nothing on the very path (acma, cyber)
        // that motivated it, and the run exits 1 every week.
        if (entry.expect === "blocked") {
          result.state = "BLOCKED";
          result.error = "no response to automated agents (expected — bot protection)";
          return result;
        }
        // Ask DNS first: it is one cheap query, and a host that no longer
        // resolves is gone — no browser probe or ladder rung can change that,
        // so there is no point paying their timeouts.
        const dns = await hostResolves(entry.url, resolveHost);
        if (dns === "nxdomain") {
          result.state = "UNREACHABLE";
          result.error = "host does not resolve (NXDOMAIN)";
          return result;
        }
        // Before calling it dead, check whether it is only our UA being refused.
        const browser = await probeWithBrowserUa(entry.url);
        if (browser.verdict === "alive") {
          result.state = "BLOCKED";
          result.error = "blocks automated agents (responds to a browser)";
          return result;
        }
        if (browser.verdict === "moved") {
          result.state = "REDIRECTED";
          result.finalUrl = browser.finalUrl;
          return result;
        }
        if (GONE.has(browser.status)) {
          result.state = "DEAD";
          result.status = browser.status;
          result.error = `no response to our agent; HTTP ${browser.status} to a browser`;
          return result;
        }
        // A blackholing WAF hangs rather than answering; the source can still be
        // alive. Corroborate off-host before reporting it unreachable.
        const live = await corroborateLiveness(entry);
        if (live) {
          result.state = "LIVE_FALLBACK";
          result.via = live.via;
          result.error = `no direct response from CI; ${live.detail}`;
          return result;
        }
        // Our agent got nothing, but a browser got a refusal: a live server
        // answered. That is the same evidence the REFUSALS branch above treats
        // as UNVERIFIED, and it must not become rot just because our own
        // request hung first (the wa.gov.au misreading).
        if (REFUSALS.has(browser.status)) {
          result.state = "UNVERIFIED";
          result.status = browser.status;
          result.error = `no response to our agent; HTTP ${browser.status} to a browser — refused, not gone`;
          return result;
        }
        // A host that resolves but never answers is either geo-fenced or a
        // server that is gone with its zone left behind, and nothing reachable
        // from CI tells the two apart. So it stays rot unless a human checked
        // it from inside the fence and declared `expect: geofenced` —
        // ecrime.ae and condusef.gob.mx were retired on exactly this shape
        // while both were live at home.
        const reason = err.name === "AbortError" ? "timed out" : err.message;
        if (dns === "resolves" && entry.expect === "geofenced") {
          result.state = "UNVERIFIED";
          result.error = `no response from CI (${reason}); host still resolves (expected — geo-fenced)`;
          return result;
        }
        result.state = err.name === "AbortError" ? "TIMEOUT" : "UNREACHABLE";
        result.error = dns === "resolves"
          ? `${reason}; host still resolves — if it is live from its own country, mark it \`expect: geofenced\``
          : reason;
        return result;
      }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return result;
}

async function runPool(entries, limit) {
  const results = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, entries.length) }, async () => {
    while (i < entries.length) {
      const entry = entries[i++];
      results.push(await checkOne(entry));
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

// Statuses that mean "a live server refused this request", not "this page is
// gone": 403/429 (WAF, rate limit) and 451 (legal / geo block). 401 is NOT one:
// a login wall means the citation no longer serves the public, which is rot.
const REFUSALS = new Set([403, 429, 451]);
// Statuses that say the page itself is gone.
const GONE = new Set([404, 410]);

// BLOCKED and UNVERIFIED are not rot — a WAF or geo-fence rejecting a bot says
// nothing about whether the citation still resolves for a human. Surfaced,
// never failed on.
const PROBLEM = new Set(["DEAD", "SERVER_ERROR", "TIMEOUT", "UNREACHABLE", "REDIRECTED"]);
const FAIL = new Set(["DEAD", "UNREACHABLE", "TIMEOUT"]);

function sortKey(r) {
  const order = { DEAD: 0, UNREACHABLE: 1, TIMEOUT: 2, SERVER_ERROR: 3, REDIRECTED: 4, UNVERIFIED: 5, BLOCKED: 6, LIVE_FALLBACK: 7, OK: 8 };
  const tier = r.tier === "brands" ? 9 : Number(r.tier);
  return [order[r.state] ?? 9, tier];
}

function markdown(results, reg, retiredCount = 0) {
  const problems = results.filter((r) => PROBLEM.has(r.state)).sort((a, b) => {
    const [ao, at] = sortKey(a); const [bo, bt] = sortKey(b);
    return ao - bo || at - bt;
  });
  const blocked = results.filter((r) => r.state === "BLOCKED");
  const fallback = results.filter((r) => r.state === "LIVE_FALLBACK");
  const unverified = results.filter((r) => r.state === "UNVERIFIED");
  const ok = results.filter((r) => r.state === "OK").length;

  const out = [];
  out.push("## Threat-intel source check");
  out.push("");
  const retiredNote = retiredCount ? ` · ${retiredCount} retired (not checked)` : "";
  const fallbackNote = fallback.length ? ` · ${fallback.length} live-via-fallback` : "";
  const unverifiedNote = unverified.length ? ` · ${unverified.length} unverified from CI` : "";
  out.push(`Registry \`v${reg.version}\`, updated ${reg.updated} · ${results.length} sources checked · **${ok} OK**, **${problems.length} need attention**, ${blocked.length} blocked-to-bots${fallbackNote}${unverifiedNote}${retiredNote}.`);
  out.push("");

  if (problems.length === 0 && unverified.length === 0) {
    out.push("✅ Every source URL still resolves. No action needed.");
  } else if (problems.length === 0) {
    out.push(`✅ No source has rotted. ${unverified.length} could not be verified from CI — listed below; check them in a browser before citing anything fresh.`);
  } else {
    out.push("| State | Tier | Source | URL | Detail |");
    out.push("|---|---|---|---|---|");
    for (const r of problems) {
      const detail =
        r.state === "REDIRECTED" ? `→ ${r.finalUrl}` :
        r.error ? r.error :
        r.status ? `HTTP ${r.status}` : "";
      out.push(`| ${r.state} | ${r.tier} | ${r.name || r.domain} | ${r.url} | ${detail} |`);
    }
    out.push("");
    if (problems.some((r) => FAIL.has(r.state))) {
      out.push("**DEAD / UNREACHABLE** — the citation is gone. Find the replacement URL or mark the source retired; any roadmap claim resting on it has lost its evidence.");
      out.push("");
    }
    if (problems.some((r) => r.state === "REDIRECTED")) {
      out.push("**REDIRECTED** — resolves, but landed on a homepage or a different host. Usually a site reorganisation that dropped the deep link. Update the registry URL.");
      out.push("");
    }
  }

  if (blocked.length) {
    out.push("");
    out.push(`<details><summary>${blocked.length} blocked to automated requests (not rot)</summary>`);
    out.push("");
    for (const r of blocked) {
      const why = r.status ? `HTTP ${r.status}` : r.error || "no response to our agent";
      out.push(`- ${r.name || r.domain} — ${why} — ${r.url}`);
    }
    out.push("");
    out.push("</details>");
  }

  if (fallback.length) {
    out.push("");
    out.push(`<details><summary>${fallback.length} unreachable from CI but corroborated live (not rot)</summary>`);
    out.push("");
    out.push("Refused every direct probe from the runner (usually a datacenter-IP block), but a fallback vouches the source is still live. Corroboration, not a verified 200 — confirm before citing anything fresh.");
    out.push("");
    for (const r of fallback) {
      out.push(`- ${r.name || r.domain} — via ${r.via} — ${r.url}${r.error ? ` — ${r.error}` : ""}`);
    }
    out.push("");
    out.push("</details>");
  }

  if (unverified.length) {
    out.push("");
    out.push(`<details><summary>${unverified.length} refused by a live server, unverified from CI (not rot)</summary>`);
    out.push("");
    out.push("The host answered or still resolves, but refused every probe from the runner and no off-host evidence was found. Usually a WAF or geo-fence. Check in a browser before citing anything fresh; retire only on a 404, NXDOMAIN or a confirmed move.");
    out.push("");
    for (const r of unverified) {
      out.push(`- ${r.name || r.domain} — ${r.error || "unverified"} — ${r.url}`);
    }
    out.push("");
    out.push("</details>");
  }

  out.push("");
  out.push("<sub>Reachability only — this does not check whether a source has published anything new. Indicator domains are never fetched.</sub>");
  return out.join("\n");
}

// Posted when a clean run closes the digest issue. "Reachable" is only true
// when nothing came back UNVERIFIED; say so rather than overclaim.
function closeComment(results) {
  const unverified = results.filter((r) => r.state === "UNVERIFIED").length;
  return unverified
    ? `No threat-intel source has rotted as of the latest run — closing. ${unverified} could not be verified from CI (refused or geo-fenced, not gone); the run summary lists them. Reopened automatically the next time one rots.`
    : "All threat-intel sources are reachable as of the latest run — closing. Reopened automatically the next time one rots.";
}

function human(results, reg, retiredCount = 0) {
  const by = (s) => results.filter((r) => r.state === s);
  const lines = [];
  lines.push(`\nSource registry v${reg.version} (updated ${reg.updated})`);
  lines.push(`${results.length} sources checked${retiredCount ? `, ${retiredCount} retired (skipped)` : ""}\n`);
  for (const state of ["DEAD", "UNREACHABLE", "TIMEOUT", "SERVER_ERROR", "REDIRECTED", "UNVERIFIED", "BLOCKED", "LIVE_FALLBACK"]) {
    const rs = by(state);
    if (!rs.length) continue;
    lines.push(`${state} (${rs.length}):`);
    for (const r of rs) {
      const extra =
        r.state === "REDIRECTED" ? ` -> ${r.finalUrl}` :
        r.state === "LIVE_FALLBACK" ? ` (via ${r.via}${r.error ? ` — ${r.error}` : ""})` :
        r.error ? ` (${r.error})` : r.status ? ` (HTTP ${r.status})` : "";
      lines.push(`  [tier ${r.tier}] ${r.domain}${extra}`);
    }
    lines.push("");
  }
  lines.push(`OK: ${by("OK").length}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Content diffing — powers --auto-bump.
//
// A byte diff on sources.yml can't tell a re-tiered source from a reflowed
// comment, so it can't decide on its own whether `updated:` needs to move.
// This compares the PARSED registries instead — every field parseRegistry
// produces, except `errors` (a parser artifact) and the header itself
// (`version`/`updated`, which is exactly the thing being decided). Two
// registries that parse to the same sources/tiers/brands/indicators, in the
// same order, are content-identical regardless of what the comments around
// them say.
// ---------------------------------------------------------------------------

/**
 * True if two parsed registries differ in anything other than the header.
 * Exported for unit tests — this is the judgement call that used to be a
 * human reading a PR diff, so it needs the same scrutiny a person would give
 * it: every source field, in order, with nothing quietly excluded.
 */
export function registryContentChanged(a, b) {
  const strip = (reg) => {
    const rest = { ...reg };
    delete rest.version;
    delete rest.updated;
    delete rest.errors;
    return rest;
  };
  return JSON.stringify(strip(a)) !== JSON.stringify(strip(b));
}

/**
 * Is the `updated:` header behind the file's own last change?
 *
 * The header is printed in every report — "Registry v1, updated 2026-09-09" —
 * so when someone edits the registry and forgets the date, every run afterwards
 * publishes a freshness claim that is quietly false. That already happened: ten
 * sources were added on 2026-09-10 while the header still read 2026-09-09.
 *
 * Compared against git rather than mtime, because a fresh clone or a checkout
 * rewrites mtime for every file and would report the whole registry as touched
 * today. Uses the last COMMIT that changed the file; an uncommitted edit in the
 * working tree is reported separately, since that is the moment to fix the
 * header rather than after it lands.
 *
 * Returns null when git is unavailable (a tarball, a shallow export), which is
 * "cannot tell", not "stale" — the caller treats it as a skip.
 */
function headerStaleness(reg) {
  let committed = null;
  let dirty = false;
  try {
    committed =
      execFileSync("git", ["log", "-1", "--format=%ad", "--date=short", "--", REGISTRY], {
        cwd: HERE,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null;
    dirty =
      execFileSync("git", ["status", "--porcelain", "--", REGISTRY], {
        cwd: HERE,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim().length > 0;
  } catch {
    return null;
  }
  if (!committed) return null;
  return { declared: reg.updated, committed, dirty, stale: committed > reg.updated };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes("--json");
  const asMarkdown = args.includes("--markdown");
  const asIssue = args.includes("--issue");
  const validateOnly = args.includes("--validate");
  const staleOnly = args.includes("--stale");
  const autoBump = args.includes("--auto-bump");

  const text = await readFile(REGISTRY, "utf8");
  const reg = parseRegistry(text);

  // Sets exitCode rather than calling process.exit(): stdout is a pipe when the
  // documented `| head` usage runs, and exiting can truncate a buffered write.
  const errors = validate(reg);
  if (errors.length) {
    console.error("Registry is invalid:\n");
    for (const e of errors) console.error(`  • ${e}`);
    process.exitCode = 2;
    return;
  }

  if (staleOnly) {
    const st = headerStaleness(reg);
    if (st === null) {
      console.log("Cannot read git history for the registry — skipping the freshness check.");
      return;
    }
    if (st.dirty) {
      console.log(
        `Registry has uncommitted changes. Declared updated: ${st.declared} — ` +
        `set it to today if this edit changes what the registry claims.`,
      );
    }
    if (st.stale) {
      console.error(
        `Registry header is behind the file.\n\n` +
        `  declared updated: ${st.declared}\n` +
        `  last changed:     ${st.committed}\n\n` +
        `Every report prints the declared date, so it is currently publishing a\n` +
        `freshness claim the file does not support. Set \`updated:\` to the date\n` +
        `the registry's CONTENT last changed.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Registry header is current — updated ${st.declared}, last changed ${st.committed}.`);
    return;
  }

  if (autoBump) {
    // Runs on main, after merge — never on a PR. The PR-time --stale warning
    // is the human nudge; this is the backstop for whatever lands anyway,
    // deciding by content rather than trusting the author remembered.
    //
    // BASE_SHA (the push event's `before` SHA) is preferred over HEAD~1: a
    // push can carry more than one commit — a merge commit among them — and
    // HEAD~1 only reaches the last commit's immediate parent, not the state
    // before the push. Falls back to HEAD~1 for a local/manual run, where
    // there is no push event to supply it, and for the same reason on a
    // GitHub-documented all-zero SHA (a branch's first push, or a rewritten
    // history the runner has no record of) — `git show` on 40 zeros always
    // fails, and treating that the same as "no BASE_SHA at all" still gives
    // the real previous commit on disk to diff against, rather than silently
    // skipping a bump a genuine content change earned.
    const ZERO_SHA = "0000000000000000000000000000000000000000";
    const baseRef = (process.env.BASE_SHA && process.env.BASE_SHA !== ZERO_SHA)
      ? process.env.BASE_SHA
      : "HEAD~1";
    let previousText;
    try {
      previousText = execFileSync("git", ["show", `${baseRef}:docs/threat-intel/sources.yml`], {
        cwd: HERE,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      console.log("No previous commit to diff against (first commit, or shallow clone) — nothing to bump.");
      return;
    }

    const previous = parseRegistry(previousText);
    if (previous.errors.length) {
      // The prior commit's registry doesn't parse — nothing safe to diff
      // against. Not this run's problem to fix; just skip the bump.
      console.log("Previous registry revision does not parse — skipping the content diff.");
      return;
    }

    if (!registryContentChanged(previous, reg)) {
      console.log(`No content change since the last commit — leaving \`updated: ${reg.updated}\` as is.`);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    if (reg.updated === today) {
      console.log(`\`updated:\` is already ${today} — nothing to bump.`);
      return;
    }

    const bumped = text.replace(/^updated:\s*.*$/m, `updated: ${today}`);
    if (bumped === text) {
      console.error("Could not find an `updated:` line to replace — registry header may be malformed.");
      process.exitCode = 2;
      return;
    }
    await writeFile(REGISTRY, bumped, "utf8");
    console.log(`Content changed since the last commit — bumped \`updated:\` from ${reg.updated} to ${today}.`);
    return;
  }

  if (validateOnly) {
    const count =
      Object.values(reg.tiers).reduce((n, es) => n + es.length, 0) + reg.brands.length;
    console.log(`Registry v${reg.version} valid — ${count} sources, ${reg.indicators.length} quarantined indicators.`);
    return;
  }

  const entries = [
    ...Object.entries(reg.tiers).flatMap(([t, es]) => es.map((e) => ({ ...e, tier: t }))),
    ...reg.brands.map((e) => ({ ...e, tier: "brands" })),
  ];

  // Belt and braces: the validator already fails on overlap, but never let an
  // indicator reach the network layer even if validation is ever loosened.
  const indicators = new Set(reg.indicators.map((d) => d.toLowerCase()));
  const safe = entries.filter((e) => {
    try { return !indicators.has(new URL(e.url).hostname.toLowerCase().replace(/^www\./, "")); }
    catch { return false; }
  });

  // `retired: true` marks a source that is known-gone and kept only as a record
  // (see gotaxaustralia.com). Re-checking it every week would report the same
  // known failure forever.
  const live = safe.filter((e) => e.retired !== "true" && e.retired !== true);
  const retiredCount = safe.length - live.length;

  const results = await runPool(live, CONCURRENCY);

  if (asJson) console.log(JSON.stringify({ registry: { version: reg.version, updated: reg.updated }, retired: retiredCount, results }, null, 2));
  else if (asMarkdown) console.log(markdown(results, reg, retiredCount));
  else console.log(human(results, reg, retiredCount));

  // Hoisted above the issue block: it is both the exit code and the digest's
  // clean/unclean signal.
  const rotted = results.some((r) => FAIL.has(r.state));

  if (asIssue) {
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) {
      console.error("--issue needs GITHUB_REPOSITORY and GITHUB_TOKEN");
      process.exitCode = 2;
      return;
    }
    // Publishing the digest IS the deliverable, so a failure here must not be
    // swallowed — it exits 2, which the workflow reports separately from the
    // rot signal (exit 1).
    try {
      const { number, action } = await publishDigestIssue({
        repo,
        token,
        label: "source-check",
        title: "🔗 Threat-intel source check",
        body: markdown(results, reg, retiredCount),
        clean: !rotted,
        extraLabels: ["threat-intel"],
        labelColor: "1d76db",
        labelDescription: "Weekly threat-intel source reachability digest",
        closeComment: closeComment(results),
      });
      console.error(number === null ? `Digest issue ${action}.` : `Digest issue #${number} ${action}.`);
    } catch (err) {
      console.error(`Failed to refresh digest issue: ${err.message}`);
      process.exitCode = 2;
      return;
    }
  }

  process.exitCode = rotted ? 1 : 0;
}

// Only run when invoked directly, so the parser and validator can be imported
// by tests without firing off a hundred network requests.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("check-sources failed:", err);
    process.exitCode = 2;
  });
}

export { parseRegistry, validate, checkOne, hostResolves, markdown, closeComment };
