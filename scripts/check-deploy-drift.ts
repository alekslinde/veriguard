// Flags when `production` has fallen too far behind `main`.
//
// Promotion is deliberately manual (docs/releases.md): merges to `main` do not
// deploy, and production moves only when a maintainer merges a promotion PR.
// That is what decouples merge frequency from deploy frequency, and it has
// one failure mode — nothing is watching, so "I'll cut a release later"
// decays into a month of unshipped work with no prompt.
//
// This is the prompt. It measures two independent things, because they go
// wrong separately:
//
//   · AGE    — how long since production last moved. Detection work that sits
//              on main helps nobody; a scam pattern shipped to main in week one
//              and promoted in week five was undetected for four weeks.
//   · SIZE   — how many commits are waiting. A large promotion is harder to
//              review and harder to roll back, which is what makes the next one
//              feel risky enough to defer again.
//
// It FLAGS, it does not promote — same philosophy as the rest of the checks
// here. When to ship is a judgement about what is on main, and a cron job has
// no way to make it.
//
// Exit codes follow the house convention: 0 clean, 1 drift worth acting on,
// 2 the check itself broke.

import { execFileSync } from "node:child_process";
import { publishDigestIssue } from "./lib/digestIssue.mjs";

/** Branch that is deployed. */
const PROD = "production";
/** Branch that accumulates merged work. */
const MAIN = "main";

/**
 * Thresholds at which drift is worth interrupting someone about.
 *
 * Deliberately generous. A checker that flags every Tuesday gets muted, and a
 * muted checker is worse than none — it reads as coverage while providing
 * nothing. These are "this has been forgotten" levels, not "this is due".
 */
const MAX_AGE_DAYS = 14;
const MAX_COMMITS = 40;

interface Drift {
  /** False when the production branch does not exist yet. */
  configured: boolean;
  commits: number;
  ageDays: number | null;
  lastPromotion: string | null;
  prodVersion: string | null;
  mainVersion: string | null;
  /** Subject lines waiting to ship, newest first. */
  waiting: string[];
}

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function branchExists(ref: string): boolean {
  try {
    // stdio pipe, not inherit: a missing branch is the normal case on a repo
    // that has not run the one-time setup, and git's "fatal: Needed a single
    // revision" on stderr would read as a broken check rather than an answer.
    execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/** Resolve a branch to whichever of origin/<name> or <name> exists locally. */
function resolveRef(name: string): string | null {
  for (const ref of [`origin/${name}`, name]) {
    if (branchExists(ref)) return ref;
  }
  return null;
}

function versionAt(ref: string): string | null {
  try {
    return JSON.parse(git("show", `${ref}:package.json`)).version ?? null;
  } catch {
    return null;
  }
}

function assess(): Drift {
  const prodRef = resolveRef(PROD);
  const mainRef = resolveRef(MAIN);

  if (!mainRef) throw new Error(`cannot resolve ${MAIN}`);

  // Not an error: docs/releases.md has the branch created by hand as one-time
  // setup, and until that happens there is nothing to measure.
  if (!prodRef) {
    return {
      configured: false,
      commits: 0,
      ageDays: null,
      lastPromotion: null,
      prodVersion: null,
      mainVersion: versionAt(mainRef),
      waiting: [],
    };
  }

  const range = `${prodRef}..${mainRef}`;
  const commits = Number(git("rev-list", "--count", range));

  // Age is measured from production's own tip, not from the oldest waiting
  // commit. What matters is how long since users last received anything —
  // an old commit on main that shipped yesterday is not drift.
  const lastIso = git("log", "-1", "--format=%cI", prodRef);
  const ageDays = Math.floor((Date.now() - new Date(lastIso).getTime()) / 86_400_000);

  return {
    configured: true,
    commits,
    ageDays,
    lastPromotion: lastIso.slice(0, 10),
    prodVersion: versionAt(prodRef),
    mainVersion: versionAt(mainRef),
    waiting: commits === 0 ? [] : git("log", "--format=%h %s", range).split("\n").filter(Boolean),
  };
}

/** The reasons this run is worth flagging. Empty means clean. */
function reasons(d: Drift): string[] {
  if (!d.configured || d.commits === 0) return [];
  const out: string[] = [];
  if (d.ageDays !== null && d.ageDays >= MAX_AGE_DAYS) {
    out.push(`production last moved ${d.ageDays} days ago (threshold ${MAX_AGE_DAYS})`);
  }
  if (d.commits >= MAX_COMMITS) {
    out.push(`${d.commits} commits waiting (threshold ${MAX_COMMITS})`);
  }
  return out;
}

function markdown(d: Drift): string {
  if (!d.configured) {
    return [
      `## Deploy drift`,
      ``,
      `\`${PROD}\` does not exist yet — nothing to measure.`,
      ``,
      `See \`docs/releases.md\` → one-time setup. Until the branch exists and`,
      `the host's deployed branch points at it, every merge to \`${MAIN}\` still`,
      `deploys.`,
    ].join("\n");
  }

  const why = reasons(d);
  const lines = [`## Deploy drift`, ``];

  if (why.length === 0) {
    lines.push(
      d.commits === 0
        ? `\`${PROD}\` is level with \`${MAIN}\`. Nothing waiting.`
        : `${d.commits} commit(s) waiting, last promotion ${d.ageDays} day(s) ago — inside both thresholds.`,
    );
    return lines.join("\n");
  }

  lines.push(
    `\`${MAIN}\` has drifted from \`${PROD}\`:`,
    ``,
    ...why.map((r) => `- ${r}`),
    ``,
    `| | |`,
    `|---|---|`,
    `| Waiting | ${d.commits} commit(s) |`,
    `| Last promotion | ${d.lastPromotion} (${d.ageDays} days ago) |`,
    `| Version | \`${d.prodVersion ?? "?"}\` → \`${d.mainVersion ?? "?"}\` |`,
    ``,
    `Promote with the **Promotion train** workflow (\`workflow_dispatch\`), or`,
    `open a \`${MAIN}\` → \`${PROD}\` PR by hand. Rules: \`docs/releases.md\`.`,
    ``,
    `Nothing here says the work is *ready* — only that it has been waiting a`,
    `while. Deferring deliberately is a fine answer; this issue closes itself`,
    `on the next promotion.`,
  );

  const shown = d.waiting.slice(0, 30);
  lines.push(``, `<details><summary>Waiting commits (${d.commits})</summary>`, ``);
  lines.push(...shown.map((c) => `- ${c}`));
  if (d.commits > shown.length) lines.push(`- …and ${d.commits - shown.length} more`);
  lines.push(``, `</details>`);

  return lines.join("\n");
}

function human(d: Drift): string {
  if (!d.configured) return `${PROD} does not exist yet — see docs/releases.md.`;
  const why = reasons(d);
  if (d.commits === 0) return `${PROD} is level with ${MAIN}.`;
  const head = `${d.commits} commit(s) waiting, last promotion ${d.ageDays} day(s) ago.`;
  return why.length === 0 ? `${head} Inside thresholds.` : `${head}\n` + why.map((r) => `  · ${r}`).join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const asMarkdown = args.includes("--markdown");
  const asIssue = args.includes("--issue");

  let drift: Drift;
  try {
    drift = assess();
  } catch (err) {
    console.error(`Failed to measure deploy drift: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }

  console.log(asMarkdown ? markdown(drift) : human(drift));

  if (asIssue) {
    const repo = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !token) {
      console.error("--issue needs GITHUB_REPOSITORY and GITHUB_TOKEN");
      process.exitCode = 2;
      return;
    }
    // Publishing IS the deliverable here, so a failure to publish must go red
    // separately from the drift signal itself — otherwise a broken checker is
    // indistinguishable from a repo that is promoting on time.
    try {
      const { number, action } = await publishDigestIssue({
        repo,
        token,
        label: "deploy-drift",
        title: "🚢 Production is behind main",
        body: markdown(drift),
        clean: reasons(drift).length === 0,
        labelColor: "1d76db",
        labelDescription: "Production has not been promoted for a while",
        closeComment:
          "Production has been promoted — closing. Reopened automatically if " +
          "the next gap passes the age or size threshold.",
      });
      console.error(number === null ? `Digest issue ${action}.` : `Digest issue #${number} ${action}.`);
    } catch (err) {
      console.error(`Failed to refresh digest issue: ${(err as Error).message}`);
      process.exitCode = 2;
      return;
    }
  }

  process.exitCode = reasons(drift).length > 0 ? 1 : 0;
}

void main();
