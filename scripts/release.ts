// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Interactive release walkthrough. Run by hand, once a feature or fix is done:
//
//   npm run release            walk through every part with unreleased commits
//   npm run release -- --dry-run   show the plan and stop; changes nothing
//
// For each part it shows the commits since that part's last tag, the bump their
// titles call for, and the changelog it would write. You pick the version,
// confirm the whole plan once, and then each shipping step asks for its own
// confirmation. Nothing is tagged or pushed before the plan is confirmed.
//
// Rules and the reasons for them: docs/releases.md and docs/versioning.md.

import { execFileSync, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type Commit,
  type Level,
  type Part,
  PARTS,
  bumpFor,
  bumpVersion,
  changelogEntries,
  isGreater,
  parseSemver,
  prependSection,
  rangeFor,
  renderSection,
} from "./lib/releasePlan.ts";

const ROOT = process.cwd();
const DRY_RUN = process.argv.includes("--dry-run");

type Candidate = {
  part: Part;
  current: string;
  tag: string | undefined;
  commits: Commit[];
  level: Level | null;
  suggested: string | undefined;
};

type Release = Candidate & { version: string; newTag: string; notes: string };

// ── git, shell and file helpers ─────────────────────────────────────────────

function run(
  cmd: string,
  args: string[],
  opts: { quiet?: boolean; cwd?: string; env?: Record<string, string> } = {},
): string {
  try {
    return execFileSync(cmd, args, {
      cwd: opts.cwd ?? ROOT,
      env: { ...process.env, ...opts.env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", opts.quiet ? "ignore" : "inherit"],
    }).trim();
  } catch (err) {
    throw new Error(`${cmd} ${args.join(" ")} failed`, { cause: err });
  }
}

const git = (...args: string[]) => run("git", args);

function tryRun(cmd: string, args: string[]): string | undefined {
  try {
    return run(cmd, args, { quiet: true });
  } catch {
    return undefined;
  }
}

function fail(message: string): never {
  throw new Error(message);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function writeJson(path: string, value: Record<string, unknown>) {
  writeFileSync(join(ROOT, path), JSON.stringify(value, null, 2) + "\n");
}

function readOptional(path: string): string {
  const full = join(ROOT, path);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

function repoUrl(): string {
  const raw = readJson("packages/detect/package.json") as {
    repository: { url: string };
  };
  return raw.repository.url.replace(/^git\+/, "").replace(/\.git$/, "");
}

// ── planning ────────────────────────────────────────────────────────────────

function lastTag(prefix: string): string | undefined {
  return tryRun("git", ["describe", "--tags", "--abbrev=0", "--match", `${prefix}*`]);
}

function commitsSince(part: Part, tag: string | undefined): Commit[] {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const pathspec = [part.path, ...part.exclude.map((p) => `:(exclude)${p}`)];
  const out = git("log", range, "--format=%H%x1f%s%x1f%b%x1e", "--", ...pathspec);
  return out
    .split("\x1e")
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [sha, subject, body = ""] = rec.split("\x1f");
      return { sha, subject, body };
    });
}

function plan(): Candidate[] {
  return PARTS.map((part) => {
    const current = String(readJson(part.manifest).version);
    const tag = lastTag(part.tagPrefix);
    const commits = commitsSince(part, tag);
    const level = bumpFor(commits, current);
    const suggested = level ? bumpVersion(current, level) : undefined;
    return { part, current, tag, commits, level, suggested };
  });
}

// ── prompts ─────────────────────────────────────────────────────────────────

async function ask(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return (await rl.question(q)).trim();
}

async function confirm(rl: ReturnType<typeof createInterface>, q: string): Promise<boolean> {
  return /^y(es)?$/i.test(await ask(rl, `${q} [y/N] `));
}

async function chooseVersion(
  rl: ReturnType<typeof createInterface>,
  c: Candidate,
): Promise<string | undefined> {
  const def = c.suggested;
  const hint = def
    ? `Enter = ${def}, s = skip, or type a version`
    : "no release-worthy commits; s = skip (default), or type a version";
  for (;;) {
    const answer = await ask(rl, `  version for ${c.part.name} (now ${c.current}; ${hint}): `);
    if (answer === "" && def) return def;
    if (answer === "" || answer === "s") return undefined;
    try {
      parseSemver(answer);
    } catch {
      console.log("  not an x.y.z version");
      continue;
    }
    if (!isGreater(answer, c.current)) {
      console.log(`  must be higher than ${c.current}`);
      continue;
    }
    return answer;
  }
}

// ── execution ───────────────────────────────────────────────────────────────

// Each part's manifest, changelog and lockfile, and the commit that carries them.
function lockfileFor(part: Part): string | undefined {
  if (part.id === "app" || part.id === "engine" || part.id === "mcp") return "package-lock.json";
  const dir = part.path;
  return existsSync(join(ROOT, dir, "package-lock.json")) ? `${dir}/package-lock.json` : undefined;
}

function applyVersion(r: Release, releases: Release[]): string[] {
  const touched: string[] = [];
  const manifest = readJson(r.part.manifest);
  manifest.version = r.version;
  writeJson(r.part.manifest, manifest);
  touched.push(r.part.manifest);

  // The MCP server pins the engine by range. If an engine release moves outside
  // that range, the MCP package would fail to install, so the range moves with it.
  if (r.part.id === "engine") {
    const mcp = readJson("packages/mcp/package.json") as {
      dependencies: Record<string, string>;
    };
    const next = rangeFor(mcp.dependencies["@veriguard/detect"], r.version);
    if (next) {
      mcp.dependencies["@veriguard/detect"] = next;
      writeJson("packages/mcp/package.json", mcp);
      touched.push("packages/mcp/package.json");
      const mcpReleasing = releases.some((x) => x.part.id === "mcp");
      console.log(
        `  note: @veriguard/mcp now depends on @veriguard/detect ${next}` +
          (mcpReleasing ? "" : " (mcp is not releasing, so this rides in the engine commit)"),
      );
    }
  }

  // Regenerates the lockfile's own version field without installing anything.
  // Extension and worker keep their own lockfiles, so npm runs in their folder.
  const lock = lockfileFor(r.part);
  if (lock) {
    const dir = lock.includes("/") ? lock.slice(0, lock.lastIndexOf("/")) : ".";
    run("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], {
      quiet: true,
      cwd: join(ROOT, dir),
    });
    touched.push(lock);
  }
  return touched;
}

function commitAndTag(r: Release, touched: string[]) {
  const changelog = join(ROOT, r.part.changelog);
  writeFileSync(changelog, prependSection(readOptional(r.part.changelog), r.notes));
  touched.push(r.part.changelog);

  git("add", "--", ...touched);
  git("commit", "-m", `chore(release): ${r.part.name} ${r.version}`);
  git("tag", "-a", r.newTag, "-m", `${r.part.name} ${r.version}`);
}

function gh(args: string[]) {
  run("gh", args);
}

// Shipping steps. Each runs only after its own confirmation, because each one is
// the point of no return for its part.

async function promote(rl: ReturnType<typeof createInterface>, r: Release) {
  const { id } = r.part;
  if (id === "app") {
    if (!(await confirm(rl, `Point production at ${r.newTag}? This is the deploy.`))) return;
    // A plain push is a fast-forward only: git refuses if production has commits
    // the tag does not. That refusal is the safety, so there is no --force.
    git("push", "origin", `refs/tags/${r.newTag}:refs/heads/production`);
    console.log(`  production -> ${r.newTag}`);
    return;
  }
  if (id === "engine" || id === "mcp") {
    if (!(await confirm(rl, `Stage ${r.part.name} ${r.version} on npm (CI, then approve with 2FA)?`)))
      return;
    const workflow = id === "engine" ? "publish-engine.yml" : "publish-mcp.yml";
    gh(["workflow", "run", workflow, "-f", `tag=${r.newTag}`, "-f", "dry_run=false"]);
    console.log(`  dispatched ${workflow}. When it finishes: npm stage list, then npm stage approve <id>`);
    if (id === "mcp") console.log("  it fails if the engine range is not yet published; approve the engine first");
    return;
  }
  if (id === "extension") {
    if (!(await confirm(rl, `Build the store zips for ${r.newTag} and attach them to its Release?`)))
      return;
    if (!existsSync(join(ROOT, "extension/icons"))) run("node", ["scripts/generate-icons.mjs"]);
    run("npm", ["run", "ext:pack"]);
    // The one-network-call check only means something against the built bundle.
    run("npm", ["test"], { env: { VERIGUARD_REQUIRE_BUILT: "extensionBundle" } });
    gh(["release", "upload", r.newTag, "extension/dist/*.zip", "--clobber"]);
    console.log("  zips attached. Store upload is still manual.");
    return;
  }
  if (id === "worker") {
    if (!(await confirm(rl, `Deploy the inbound email worker from ${r.newTag}?`))) return;
    gh(["workflow", "run", "deploy-inbound-worker.yml", "-f", `ref=${r.newTag}`]);
    console.log("  dispatched deploy-inbound-worker.yml");
  }
}

// ── main ────────────────────────────────────────────────────────────────────

function preflight() {
  if (!process.stdin.isTTY) fail("run this in an interactive terminal");
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (branch !== "main") fail(`releases are cut from main; you are on ${branch}`);
  if (git("status", "--porcelain") !== "") fail("working tree is not clean; commit or stash first");
  git("fetch", "--quiet", "origin", "main", "--tags");
  if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    fail("main is not level with origin/main; pull (or push) first");
  }
}

async function main() {
  if (!DRY_RUN) preflight();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const url = repoUrl();
  const today = new Date().toISOString().slice(0, 10);

  try {
    const candidates = plan();
    console.log("\nUnreleased work per part\n");
    for (const c of candidates) {
      const tag = c.tag ?? "(no tag yet)";
      console.log(`${c.part.name.padEnd(10)} ${c.current.padEnd(8)} since ${tag}: ${c.commits.length} commit(s)`);
    }

    const releases: Release[] = [];
    for (const c of candidates) {
      if (c.commits.length === 0) continue;
      console.log(`\n── ${c.part.name} ─────────────────────────────`);
      for (const commit of c.commits) {
        console.log(`  ${commit.sha.slice(0, 7)}  ${commit.subject}`);
      }
      if (DRY_RUN) {
        console.log(`  suggested: ${c.suggested ?? "none (no release-worthy commits)"}`);
        continue;
      }
      const version = await chooseVersion(rl, c);
      if (!version) continue;
      const newTag = `${c.part.tagPrefix}${version}`;
      const entries = changelogEntries(c.commits, url);
      const notes = renderSection({
        version,
        date: today,
        compareUrl: c.tag ? `${url}/compare/${c.tag}...${newTag}` : undefined,
        entries,
      });
      releases.push({ ...c, version, newTag, notes });
    }

    if (DRY_RUN) {
      console.log("\n--dry-run: nothing changed. Run without it to choose versions.");
      return;
    }

    if (releases.length === 0) {
      console.log("\nNothing selected. No changes made.");
      return;
    }

    console.log("\n── plan ──────────────────────────────────────");
    for (const r of releases) {
      console.log(`${r.part.name}: ${r.current} -> ${r.version}   tag ${r.newTag}`);
      console.log(r.notes.split("\n").map((l) => `    ${l}`).join("\n"));
    }
    const editor = process.env.EDITOR ?? "vi";
    for (const r of releases) {
      if (!(await confirm(rl, `Edit the ${r.part.name} notes in ${editor} first?`))) continue;
      const file = join(mkdtempSync(join(tmpdir(), "veriguard-release-")), "notes.md");
      writeFileSync(file, r.notes);
      spawnSync(editor, [file], { stdio: "inherit" });
      r.notes = readFileSync(file, "utf8");
    }

    if (!(await confirm(rl, `\nCommit, tag and push ${releases.length} release(s) to main?`))) {
      console.log("Stopped. No changes made.");
      return;
    }

    // Every part gets its own commit so each tag names the commit that
    // introduced its version.
    const ordered = [...releases].sort(
      (a, b) => PARTS.indexOf(a.part) - PARTS.indexOf(b.part),
    );
    for (const r of ordered) {
      const touched = applyVersion(r, releases);
      commitAndTag(r, touched);
      console.log(`  committed and tagged ${r.newTag}`);
    }

    git("push", "origin", "main");
    git("push", "origin", ...ordered.map((r) => r.newTag));
    console.log("pushed main and tags");

    for (const r of ordered) {
      const notesFile = join(mkdtempSync(join(tmpdir(), "veriguard-release-")), "notes.md");
      writeFileSync(notesFile, r.notes);
      gh(["release", "create", r.newTag, "--title", `${r.part.name} ${r.version}`, "--notes-file", notesFile, "--verify-tag"]);
    }
    console.log("GitHub releases created");

    for (const r of ordered) {
      await promote(rl, r);
    }
    console.log("\nDone.");
  } finally {
    rl.close();
  }
}

main().catch((err: Error) => {
  console.error(`\nrelease: ${err.message}`);
  if (err.cause) console.error(String(err.cause));
  process.exit(1);
});
