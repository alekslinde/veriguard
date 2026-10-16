// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Pure release arithmetic: which parts a set of commits touches, the bump their
// titles call for, and the changelog text. No git, no network, no filesystem —
// scripts/release.ts does the I/O and the tests exercise this directly.
//
// The rules are the ones in docs/versioning.md. Keep the two in step.

export type PartId = "app" | "engine" | "mcp" | "extension" | "worker";

export type Part = {
  id: PartId;
  name: string;
  // Path the part owns. "." is the app, which owns everything not claimed below.
  path: string;
  exclude: string[];
  tagPrefix: string;
  manifest: string;
  changelog: string;
};

export const PARTS: readonly Part[] = [
  {
    id: "app",
    name: "app",
    path: ".",
    exclude: ["packages/detect", "packages/mcp", "extension", "workers/inbound-email"],
    tagPrefix: "app-v",
    manifest: "package.json",
    changelog: "CHANGELOG.md",
  },
  {
    id: "engine",
    name: "engine",
    path: "packages/detect",
    exclude: [],
    tagPrefix: "engine-v",
    manifest: "packages/detect/package.json",
    changelog: "packages/detect/CHANGELOG.md",
  },
  {
    id: "mcp",
    name: "mcp",
    path: "packages/mcp",
    exclude: [],
    tagPrefix: "mcp-v",
    manifest: "packages/mcp/package.json",
    changelog: "packages/mcp/CHANGELOG.md",
  },
  {
    id: "extension",
    name: "extension",
    path: "extension",
    exclude: [],
    tagPrefix: "extension-v",
    manifest: "extension/package.json",
    changelog: "extension/CHANGELOG.md",
  },
  {
    id: "worker",
    name: "worker",
    path: "workers/inbound-email",
    exclude: [],
    tagPrefix: "worker-v",
    manifest: "workers/inbound-email/package.json",
    changelog: "workers/inbound-email/CHANGELOG.md",
  },
];

export type Commit = { sha: string; subject: string; body: string };

export type ParsedTitle = {
  type: string;
  scope: string | undefined;
  breaking: boolean;
  description: string;
  pr: number | undefined;
};

export type Level = "major" | "minor" | "patch";

const TITLE = /^([a-z]+)(?:\(([^)]*)\))?(!)?: (.+)$/;
const PR_SUFFIX = /\s\(#(\d+)\)$/;
const BREAKING_FOOTER = /^BREAKING[ -]CHANGE:/m;

// Returns null for anything that is not a Conventional Commit title. Callers
// treat those as no-bump and report them, so the change is not shipped silently.
export function parseTitle(subject: string, body = ""): ParsedTitle | null {
  const m = TITLE.exec(subject.trim());
  if (!m) return null;
  const pr = PR_SUFFIX.exec(m[4]);
  return {
    type: m[1],
    scope: m[2] || undefined,
    breaking: m[3] === "!" || BREAKING_FOOTER.test(body),
    description: pr ? m[4].slice(0, pr.index) : m[4],
    pr: pr ? Number(pr[1]) : undefined,
  };
}

// feat → minor, fix/perf → patch, breaking → major, or minor while below 1.0
// (bump-minor-pre-major). Everything else is no release on its own.
export function levelFor(title: ParsedTitle, current: string): Level | null {
  const major = parseSemver(current)[0];
  if (title.breaking) return major === 0 ? "minor" : "major";
  if (title.type === "feat") return "minor";
  if (title.type === "fix" || title.type === "perf") return "patch";
  return null;
}

const RANK: Record<Level, number> = { patch: 1, minor: 2, major: 3 };

export function bumpFor(commits: Commit[], current: string): Level | null {
  let best: Level | null = null;
  for (const c of commits) {
    const title = parseTitle(c.subject, c.body);
    if (!title) continue;
    const level = levelFor(title, current);
    if (level && (!best || RANK[level] > RANK[best])) best = level;
  }
  return best;
}

export function parseSemver(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`not a plain x.y.z version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function bumpVersion(current: string, level: Level): string {
  const [maj, min, pat] = parseSemver(current);
  if (level === "major") return `${maj + 1}.0.0`;
  if (level === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

export function isGreater(next: string, current: string): boolean {
  const a = parseSemver(next);
  const b = parseSemver(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

// Whether `version` satisfies a caret range such as "^0.2.0". Used to keep
// @veriguard/mcp's dependency on the engine satisfiable after an engine bump.
export function caretSatisfies(range: string, version: string): boolean {
  const m = /^\^(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (!m) return false;
  const [lo, v] = [parseSemver(m[1]), parseSemver(version)];
  const [loMaj, loMin] = lo;
  if (loMaj > 0) return v[0] === loMaj && !isGreater(m[1], version);
  if (loMin > 0) return v[0] === 0 && v[1] === loMin && !isGreater(m[1], version);
  return v[0] === 0 && v[1] === 0 && v[2] === lo[2];
}

export type ChangelogEntry = { section: string; line: string };

const SECTIONS: Record<string, string> = {
  feat: "Features",
  fix: "Fixes",
  perf: "Performance",
};

// Only the sections a reader of the changelog cares about. Refactors, docs,
// tests and chores are left out.
export function changelogEntries(commits: Commit[], repoUrl: string): ChangelogEntry[] {
  const out: ChangelogEntry[] = [];
  for (const c of commits) {
    const t = parseTitle(c.subject, c.body);
    const section = t && SECTIONS[t.type];
    if (!t || !section) continue;
    const scope = t.scope ? `**${t.scope}:** ` : "";
    const pr = t.pr ? ` ([#${t.pr}](${repoUrl}/pull/${t.pr}))` : "";
    const sha = c.sha.slice(0, 7);
    out.push({
      section,
      line: `* ${scope}${t.description}${pr} ([${sha}](${repoUrl}/commit/${c.sha}))`,
    });
  }
  return out;
}

export function renderSection(opts: {
  version: string;
  date: string;
  compareUrl: string | undefined;
  entries: ChangelogEntry[];
}): string {
  const heading = opts.compareUrl
    ? `## [${opts.version}](${opts.compareUrl}) (${opts.date})`
    : `## ${opts.version} (${opts.date})`;
  const lines = [heading, ""];
  for (const section of Object.values(SECTIONS)) {
    const rows = opts.entries.filter((e) => e.section === section).map((e) => e.line);
    if (rows.length === 0) continue;
    lines.push("", `### ${section}`, "", ...rows);
  }
  return lines.join("\n") + "\n";
}

// Inserts a new section under the file's "# Changelog" title, newest first.
export function prependSection(existing: string, section: string): string {
  const title = "# Changelog\n";
  if (!existing.startsWith(title)) return `${title}\n${section}\n${existing}`;
  const rest = existing.slice(title.length).replace(/^\n+/, "");
  return `${title}\n${section}\n${rest}`;
}

// Rewrites `"@veriguard/detect": "^0.2.0"` to the caret range that admits
// `version`, or returns null when the range already admits it.
export function rangeFor(range: string, version: string): string | null {
  return caretSatisfies(range, version) ? null : `^${version}`;
}
