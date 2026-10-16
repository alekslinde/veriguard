// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  type Commit,
  PARTS,
  bumpFor,
  bumpVersion,
  caretSatisfies,
  changelogEntries,
  isGreater,
  parseTitle,
  prependSection,
  rangeFor,
  renderSection,
} from "../scripts/lib/releasePlan.ts";

const commit = (subject: string, body = ""): Commit => ({
  sha: "0123456789abcdef0123456789abcdef01234567",
  subject,
  body,
});

describe("parseTitle", () => {
  it("reads type, scope, breaking marker and PR number", () => {
    expect(parseTitle("feat(detector)!: drop the legacy shape (#12)")).toEqual({
      type: "feat",
      scope: "detector",
      breaking: true,
      description: "drop the legacy shape",
      pr: 12,
    });
  });

  it("reads a BREAKING CHANGE footer from the body", () => {
    const t = parseTitle("fix(api): reshape", "details\n\nBREAKING CHANGE: the field moved");
    expect(t?.breaking).toBe(true);
  });

  it("returns null for titles that are not conventional", () => {
    expect(parseTitle("Update stuff")).toBeNull();
    expect(parseTitle("Feat: capitalised type")).toBeNull();
  });
});

describe("bumpFor", () => {
  it("feat is a minor, fix and perf are patches", () => {
    expect(bumpFor([commit("feat: x")], "0.40.0")).toBe("minor");
    expect(bumpFor([commit("perf: x")], "0.40.0")).toBe("patch");
    expect(bumpFor([commit("fix: x")], "0.40.0")).toBe("patch");
  });

  it("the highest bump across commits wins", () => {
    expect(bumpFor([commit("fix: a"), commit("feat: b"), commit("fix: c")], "1.2.3")).toBe("minor");
  });

  it("chore, refactor, docs, test and ci produce no release", () => {
    for (const t of ["chore", "refactor", "docs", "test", "ci", "build", "style"]) {
      expect(bumpFor([commit(`${t}: x`)], "1.0.0"), t).toBeNull();
    }
  });

  it("a breaking change is a minor below 1.0 and a major from 1.0", () => {
    expect(bumpFor([commit("feat!: x")], "0.39.0")).toBe("minor");
    expect(bumpFor([commit("fix(api)!: x")], "0.39.0")).toBe("minor");
    expect(bumpFor([commit("feat!: x")], "1.4.2")).toBe("major");
  });

  it("an unparseable title adds nothing", () => {
    expect(bumpFor([commit("Stuff happened")], "0.1.0")).toBeNull();
  });
});

describe("version arithmetic", () => {
  it("bumps each component and resets the lower ones", () => {
    expect(bumpVersion("0.40.0", "minor")).toBe("0.41.0");
    expect(bumpVersion("0.40.3", "patch")).toBe("0.40.4");
    expect(bumpVersion("1.4.2", "major")).toBe("2.0.0");
  });

  it("orders versions numerically, not as strings", () => {
    expect(isGreater("0.10.0", "0.9.9")).toBe(true);
    expect(isGreater("0.9.0", "0.9.0")).toBe(false);
  });

  it("caret ranges admit the same major (or minor below 1.0)", () => {
    expect(caretSatisfies("^0.2.0", "0.2.5")).toBe(true);
    expect(caretSatisfies("^0.2.0", "0.3.0")).toBe(false);
    expect(caretSatisfies("^1.2.0", "1.9.0")).toBe(true);
    expect(caretSatisfies("^1.2.0", "2.0.0")).toBe(false);
    expect(caretSatisfies("^0.2.5", "0.2.4")).toBe(false);
  });

  it("rangeFor returns null when the range already admits the version", () => {
    expect(rangeFor("^0.2.0", "0.2.1")).toBeNull();
    expect(rangeFor("^0.2.0", "0.3.0")).toBe("^0.3.0");
  });
});

describe("changelog", () => {
  const url = "https://github.com/example/repo";

  it("keeps features, fixes and perf; leaves out hidden types", () => {
    const entries = changelogEntries(
      [commit("feat(ui): new card (#7)"), commit("chore: tidy"), commit("fix: stop it")],
      url,
    );
    expect(entries.map((e) => e.section)).toEqual(["Features", "Fixes"]);
    expect(entries[0].line).toContain("**ui:** new card ([#7](https://github.com/example/repo/pull/7))");
  });

  it("renders sections in a fixed order and omits empty ones", () => {
    const entries = changelogEntries([commit("fix: a"), commit("feat: b")], url);
    const out = renderSection({
      version: "1.1.0",
      date: "2026-10-16",
      compareUrl: `${url}/compare/app-v1.0.0...app-v1.1.0`,
      entries,
    });
    expect(out.indexOf("### Features")).toBeLessThan(out.indexOf("### Fixes"));
    expect(out).not.toContain("### Performance");
    expect(out).toMatch(/^## \[1\.1\.0\]\(.*\) \(2026-10-16\)$/m);
  });

  it("prepends a new section under the title, newest first", () => {
    const existing = "# Changelog\n\n## 1.0.0 (2026-01-01)\n\n";
    const out = prependSection(existing, "## 1.1.0 (2026-10-16)\n");
    expect(out.startsWith("# Changelog\n\n## 1.1.0")).toBe(true);
    expect(out.indexOf("1.1.0")).toBeLessThan(out.indexOf("1.0.0"));
  });
});

describe("PARTS", () => {
  it("every part has a distinct tag prefix", () => {
    const prefixes = PARTS.map((p) => p.tagPrefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("the app excludes every part that releases on its own", () => {
    const app = PARTS.find((p) => p.id === "app");
    for (const other of PARTS.filter((p) => p.id !== "app")) {
      expect(app?.exclude).toContain(other.path);
    }
  });
});
