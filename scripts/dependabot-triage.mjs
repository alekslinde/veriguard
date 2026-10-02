// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Dependabot alert triage.
//
// GitHub gives every open Dependabot alert a severity label. That label is the
// *input* to triage, not the answer — the same "high" means very different
// things for a build-time lint plugin versus a library that parses attacker-
// controlled input at runtime. This script layers the judgment a human applies
// on top of the raw feed and emits a recommended action per alert:
//
//   auto     — safe for the grouped Dependabot PR to merge once CI is green
//              (dev/build-time dep, or a transitive runtime dep, patched by a
//              non-breaking bump).
//   review   — a human should look: breaking/major fix, a "fix" that is
//              actually a downgrade, or a dependency we import directly in a
//              runtime code path.
//   monitor  — no patched version exists yet; nothing to merge, keep watching.
//
// The philosophy matches spam-guard.yml: we FLAG with a pre-triaged digest and
// let the maintainer decide. Nothing here merges or dismisses on its own.
//
// Pure logic (assessAlert / dedupeAlerts / formatDigest) is exported and unit-
// tested in __tests__/dependabotTriage.test.ts. main() only wires in I/O
// (GitHub API + repo files), so it stays untested and thin.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { ghFetch as sharedGhFetch, publishDigestIssue } from "./lib/digestIssue.mjs";

const SEVERITY_RANK = { critical: 4, high: 3, moderate: 2, medium: 2, low: 1, unknown: 0 };
const SOURCE_DIRS = ["app", "lib", "components", "workers"];

// ── semver-lite ──────────────────────────────────────────────────────────────
// We deliberately avoid adding a `semver` dependency just for triage. These
// handle the only comparisons we need: "is the fix a breaking jump?" and "is the
// fix actually lower than what's installed?".

/** Parse "1.2.3-rc.1+build" -> [1,2,3], ignoring prerelease/build. null on junk. */
export function parseVersion(v) {
  if (!v || typeof v !== "string") return null;
  const m = v.trim().replace(/^[v=]+/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** -1 / 0 / 1 comparing a vs b; null if either is unparseable. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/**
 * Is moving from `installed` to `fix` a breaking change? A different major is
 * breaking; and under 0.x, npm convention treats a minor bump as breaking too
 * (0.34 -> 0.35, as with sharp). Unknown versions are treated as non-breaking
 * so we don't cry wolf — the CI gate is the real backstop.
 */
export function isBreakingUpgrade(installed, fix) {
  const pi = parseVersion(installed);
  const pf = parseVersion(fix);
  if (!pi || !pf) return false;
  if (pi[0] !== pf[0]) return true;
  if (pi[0] === 0 && pi[1] !== pf[1]) return true;
  return false;
}

// ── the assessment ───────────────────────────────────────────────────────────

/**
 * Turn one Dependabot alert + local repo context into a verdict.
 *
 * Both ctx fields are optional: each falls back to an empty Map/Set below, so
 * a caller with no repo context still gets a verdict (one that simply can't
 * judge reachability or breaking-ness).
 *
 * @param {object} alert  A GitHub Dependabot alert (REST shape).
 * @param {object} [ctx]
 * @param {Map<string,string>} [ctx.installedVersions]  package name -> resolved version
 * @param {Set<string>} [ctx.directImports]  package names imported from our source
 * @returns {{
 *   number:number, package:string, ghsaId:string, severity:string,
 *   verdict:"auto"|"review"|"monitor", reasons:string[], priority:number,
 *   scope:string, reachable:boolean, directlyUsed:boolean,
 *   fixVersion:(string|null), fixIsBreaking:boolean, fixIsDowngrade:boolean,
 *   manifests:string[], url:string
 * }}
 */
export function assessAlert(alert, ctx = {}) {
  const installedVersions = ctx.installedVersions ?? new Map();
  const directImports = ctx.directImports ?? new Set();

  const vuln = alert.security_vulnerability ?? {};
  const adv = alert.security_advisory ?? {};
  const dep = alert.dependency ?? {};
  const pkg = vuln.package?.name ?? dep.package?.name ?? "unknown";

  const severity = (vuln.severity ?? adv.severity ?? "unknown").toLowerCase();
  const severityRank = SEVERITY_RANK[severity] ?? 0;

  // Scope: "development" is build/test-only; "runtime" (or unknown) is shipped.
  const scope = dep.scope ?? "runtime";
  const reachable = scope !== "development";
  const directlyUsed = directImports.has(pkg);

  const fixVersion = vuln.first_patched_version?.identifier ?? null;
  const hasFix = !!fixVersion;
  const installed = installedVersions.get(pkg) ?? null;
  const cmp = hasFix ? compareVersions(fixVersion, installed) : null;
  const fixIsDowngrade = cmp === -1;
  const fixIsBreaking = hasFix ? isBreakingUpgrade(installed, fixVersion) : false;

  const reasons = [];

  // CVSS-unscored guard: never let a 0/absent numeric score outrank the
  // advisory's own severity label (native/newly-published CVEs often score 0).
  const cvss = adv.cvss?.score ?? 0;
  if ((severity === "high" || severity === "critical") && !cvss) {
    reasons.push(`CVSS unscored — ranked by advisory severity label (${severity})`);
  }

  reasons.push(reachable
    ? (directlyUsed ? "imported directly in a runtime code path" : "runtime (transitive) dependency")
    : "development / build-time only — not shipped");

  let verdict;
  if (!hasFix) {
    verdict = "monitor";
    reasons.push("no patched version published yet — track upstream");
  } else if (fixIsDowngrade) {
    verdict = "review";
    reasons.push(`patched version ${fixVersion} is LOWER than installed ${installed ?? "?"} — verify manually, likely a mis-signal`);
  } else if (fixIsBreaking) {
    verdict = "review";
    reasons.push(`fix ${installed ?? "?"} -> ${fixVersion} is a breaking/major bump`);
  } else if (!reachable) {
    verdict = "auto";
    reasons.push(`non-breaking dev bump to ${fixVersion} — safe to auto-merge behind CI`);
  } else if (directlyUsed) {
    verdict = "review";
    reasons.push(`non-breaking, but we import ${pkg} directly — glance for API/behaviour drift`);
  } else {
    verdict = "auto";
    reasons.push(`non-breaking transitive bump to ${fixVersion} — safe to auto-merge behind CI`);
  }

  // Priority for ordering the digest: severity first, then real-world exposure.
  const priority =
    severityRank * 100 +
    (reachable ? 20 : 0) +
    (directlyUsed ? 10 : 0) +
    (hasFix ? 0 : 5); // an unfixable high stays loud

  return {
    number: alert.number,
    package: pkg,
    ghsaId: adv.ghsa_id ?? "",
    severity,
    verdict,
    reasons,
    priority,
    scope,
    reachable,
    directlyUsed,
    fixVersion,
    fixIsBreaking,
    fixIsDowngrade,
    manifests: dep.manifest_path ? [dep.manifest_path] : [],
    url: alert.html_url ?? "",
  };
}

/**
 * Collapse alerts that are the same advisory on the same package (e.g. the same
 * GHSA hitting the root manifest and the worker manifest) into one row, merging
 * their manifest paths. Keyed by GHSA + package so genuinely distinct alerts
 * stay separate. This is why we read the Dependabot API and not `npm audit`:
 * the alert model is already one-row-per-vulnerability, with no dependent-package
 * double counting (the classic "next flagged because of sharp" artifact).
 */
export function dedupeAlerts(assessed) {
  const byKey = new Map();
  for (const a of assessed) {
    const key = `${a.ghsaId}::${a.package}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.manifests = [...new Set([...existing.manifests, ...a.manifests])];
      existing.priority = Math.max(existing.priority, a.priority);
    } else {
      byKey.set(key, { ...a, manifests: [...a.manifests] });
    }
  }
  return [...byKey.values()].sort((x, y) => y.priority - x.priority);
}

// ── digest rendering ─────────────────────────────────────────────────────────

const VERDICT_META = {
  review: { emoji: "🔴", heading: "Needs a human" },
  auto: { emoji: "🟢", heading: "Safe to auto-merge (behind CI)" },
  monitor: { emoji: "🟡", heading: "No fix yet — monitor" },
};

/** Render the deduped, assessed rows as a Markdown digest body. */
export function formatDigest(rows, { generatedAt = new Date().toISOString() } = {}) {
  if (rows.length === 0) {
    return `## 🔒 Dependabot alert triage\n\n✅ No open Dependabot alerts. Nothing to triage.\n\n_Last checked: ${generatedAt}_\n`;
  }

  const counts = rows.reduce((acc, r) => ((acc[r.verdict] = (acc[r.verdict] ?? 0) + 1), acc), {});
  const lines = [];
  lines.push("## 🔒 Dependabot alert triage");
  lines.push("");
  lines.push(
    `**${rows.length} open alert(s)** — ` +
      `🔴 ${counts.review ?? 0} review · 🟢 ${counts.auto ?? 0} auto · 🟡 ${counts.monitor ?? 0} monitor`,
  );
  lines.push("");
  lines.push("_The severity label is the input, not the verdict. Below is severity × reachability × fix-safety._");

  for (const verdict of ["review", "auto", "monitor"]) {
    const group = rows.filter((r) => r.verdict === verdict);
    if (group.length === 0) continue;
    const meta = VERDICT_META[verdict];
    lines.push("");
    lines.push(`### ${meta.emoji} ${meta.heading} (${group.length})`);
    lines.push("");
    for (const r of group) {
      const fix = r.fixVersion ? ` → \`${r.fixVersion}\`` : "";
      const where = r.manifests.length ? ` · ${r.manifests.join(", ")}` : "";
      const link = r.url ? ` ([#${r.number}](${r.url}))` : ` (#${r.number})`;
      lines.push(`- **${r.package}**${fix} — _${r.severity}_${where}${link}`);
      for (const reason of r.reasons) lines.push(`  - ${reason}`);
    }
  }

  lines.push("");
  lines.push(`_Last checked: ${generatedAt}. This issue is refreshed in place each run; edit labels/close to silence._`);
  return lines.join("\n");
}

// ── I/O wiring (untested; keep thin) ─────────────────────────────────────────

// Shared helper, bound to this script's User-Agent. Its thrown-error shape
// ("... -> <status> ...") is what isAlertsAccessDenied() below matches on.
const ghFetch = (path, token, init = {}) =>
  sharedGhFetch(path, token, init, "veriguard-dependabot-triage");

/**
 * True when a Dependabot-alerts fetch failed because the token can't read the
 * API — either 403 (the built-in GITHUB_TOKEN lacks the "Dependabot alerts"
 * permission; `security-events` does not cover it) or 401 (the PAT is expired,
 * revoked, or otherwise invalid). Both are treated as "no access" so callers
 * degrade gracefully instead of failing the whole scheduled run — notably, an
 * expired DEPENDABOT_ALERTS_TOKEN pauses triage rather than turning CI red.
 */
export function isAlertsAccessDenied(err) {
  return /->\s*40[13]\b/.test(String(err?.message ?? ""));
}

/** Build the local-signal context: installed versions + directly-imported packages. */
function buildContext() {
  const installedVersions = new Map();
  if (existsSync("package-lock.json")) {
    try {
      const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
      for (const [p, meta] of Object.entries(lock.packages ?? {})) {
        if (!p.startsWith("node_modules/") || !meta.version) continue;
        const name = p.slice(p.lastIndexOf("node_modules/") + "node_modules/".length);
        if (!installedVersions.has(name)) installedVersions.set(name, meta.version);
      }
    } catch { /* lockfile missing/unreadable — major detection just degrades to non-breaking */ }
  }

  const directImports = new Set();
  const dirs = SOURCE_DIRS.filter((d) => existsSync(d));
  if (dirs.length) {
    try {
      // Grep our own source for `from "<pkg>"` / `require("<pkg>")`. Package name
      // may be followed by a quote (bare import) or a slash (subpath import).
      const out = execFileSync(
        "grep",
        ["-rhoE", "-e", "(from|require\\()\\s*['\"][^'\"]+['\"]", "--include=*.ts", "--include=*.tsx", "--include=*.js", "--include=*.mjs", ...dirs],
        { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      );
      for (const line of out.split("\n")) {
        const m = line.match(/['"]([^'"]+)['"]/);
        if (!m) continue;
        let spec = m[1];
        if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("node:")) continue;
        // Normalise to the package name: "@scope/name/sub" -> "@scope/name", "name/sub" -> "name".
        const parts = spec.split("/");
        spec = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
        directImports.add(spec);
      }
    } catch { /* grep unavailable — directlyUsed just stays false everywhere */ }
  }

  return { installedVersions, directImports };
}

// Unlike the source-check and promotion-freshness digests, this one never
// changes issue state (closeOnClean: false). Two reasons:
//
//   1. Its footer tells maintainers "edit labels/close to silence" — closing is
//      a deliberate human signal here, so the helper must neither close the
//      issue nor reopen one that a person closed.
//   2. This same issue carries the token-expiry skip notice, which is not a
//      "clean" state even though it lists zero alerts.
//
// So it keeps the refresh-in-place behaviour it has always had: body updated,
// state left alone. `clean` is therefore always false — it is unused when
// closeOnClean is false, but passing true would misdescribe the run.
async function upsertDigestIssue(repo, token, body) {
  const { number } = await publishDigestIssue(
    {
      repo,
      token,
      label: "deps-triage",
      title: "🔒 Dependabot alert triage",
      body,
      clean: false,
      closeOnClean: false,
      extraLabels: ["dependencies"],
      labelColor: "d93f0b",
      labelDescription: "Weekly pre-triaged Dependabot alert digest",
    },
    { ghFetch },
  );
  return number;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const fixtureArg = process.argv.indexOf("--fixture");
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  let alerts;
  if (fixtureArg !== -1) {
    alerts = JSON.parse(readFileSync(process.argv[fixtureArg + 1], "utf8"));
  } else {
    if (!repo || !token) throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required (or pass --fixture <file>)");
    try {
      alerts = await ghFetch(`/repos/${repo}/dependabot/alerts?state=open&per_page=100`, token);
    } catch (err) {
      // The token can't read the Dependabot alerts API: 403 (built-in
      // GITHUB_TOKEN lacks the permission) or 401 (the PAT is expired/revoked/
      // invalid). Either way, skip cleanly rather than failing every scheduled
      // run — a lapsed DEPENDABOT_ALERTS_TOKEN pauses triage, it doesn't break CI.
      if (!isAlertsAccessDenied(err)) throw err;
      const expired = /->\s*401\b/.test(String(err?.message ?? ""));
      const note = expired
        ? "### 🔒 Dependabot alert triage skipped\n\n" +
          "The `DEPENDABOT_ALERTS_TOKEN` was rejected (HTTP 401) — it is most likely " +
          "**expired or revoked**.\n\n" +
          "**Fix:** regenerate the fine-grained PAT (**Dependabot alerts: read**, plus " +
          "**Issues: read/write** and **Contents: read**) and update the " +
          "`DEPENDABOT_ALERTS_TOKEN` repository secret with the new value.\n"
        : "### 🔒 Dependabot alert triage skipped\n\n" +
          "The configured token can't read the Dependabot alerts API (HTTP 403). The " +
          "built-in `GITHUB_TOKEN` cannot access this endpoint even with " +
          "`security-events: read`.\n\n" +
          "**Fix:** create a fine-grained PAT with **Dependabot alerts: read** (plus " +
          "**Issues: read/write** and **Contents: read**) and add it as the " +
          "`DEPENDABOT_ALERTS_TOKEN` repository secret.\n";
      process.stderr.write(note + "\n");
      if (process.env.GITHUB_STEP_SUMMARY) {
        try { execFileSync("bash", ["-c", `cat >> "$GITHUB_STEP_SUMMARY"`], { input: note }); } catch { /* best effort */ }
      }
      return;
    }
  }

  const ctx = buildContext();
  const rows = dedupeAlerts(alerts.map((a) => assessAlert(a, ctx)));
  const body = formatDigest(rows);

  // Always drop the digest into the Actions job summary for at-a-glance review.
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { execFileSync("bash", ["-c", `cat >> "$GITHUB_STEP_SUMMARY"`], { input: body }); } catch { /* best effort */ }
  }

  if (dryRun || !token || !repo) {
    process.stdout.write(body + "\n");
    return;
  }

  const issueNumber = await upsertDigestIssue(repo, token, body);
  process.stdout.write(`Triage digest written to issue #${issueNumber} (${rows.length} alert(s)).\n`);
}

// Run only when invoked directly, not when imported by the test suite.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
