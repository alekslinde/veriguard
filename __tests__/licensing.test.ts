// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// REUSE-IgnoreStart: this file names licences it is checking, not its own.
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// The repository is licensed in parts (README "Licence"; REUSE.toml is the full
// map). `reuse lint` in CI proves every file HAS a licence; this suite proves
// each one has the RIGHT one for where it lives, which reuse cannot know —
// a file copied from extension/ into lib/ would keep a valid MPL-2.0 header
// and pass lint while sitting in AGPL territory.

const ROOT = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
/** Licence texts compared by words: the package copies predate LICENSES/ and are laid out differently. */
const words = (p: string) => read(p).replace(/\s+/g, " ").trim();

/** The licence each directory is under. First match wins. */
function expectedLicence(path: string): string {
  if (path === "packages/detect/src/publicSuffixList.ts") return "MPL-2.0";
  if (path.startsWith("packages/")) return "Apache-2.0";
  if (path.startsWith("extension/")) return "MPL-2.0";
  return "AGPL-3.0-or-later";
}

const SOURCE = /\.(ts|tsx|mjs|mts|js|cjs|css|sh|html)$/;
const tracked = execSync("git ls-files -z", { cwd: ROOT, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const sources = tracked.filter((f) => SOURCE.test(f) || f === ".githooks/commit-msg");

describe("SPDX headers", () => {
  it("has source files to check", () => {
    expect(sources.length).toBeGreaterThan(300);
  });

  it("gives every source file a header naming its directory's licence", () => {
    const wrong = sources.flatMap((f) => {
      // The header sits in the first few lines (after a shebang or doctype).
      const head = read(f).split("\n").slice(0, 4).join("\n");
      const id = head.match(/SPDX-License-Identifier: ([\w.+-]+)/)?.[1] ?? "(none)";
      return id === expectedLicence(f) ? [] : [`${f}: ${id}, expected ${expectedLicence(f)}`];
    });
    expect(wrong).toEqual([]);
  });

  it("keeps the MPL notice on the generated Public Suffix List, in source and generator", () => {
    // The generator writes the file, so a header added only to the output
    // would vanish on the next `npm run psl`. `//!` survives esbuild into dist/.
    for (const f of ["packages/detect/src/publicSuffixList.ts", "scripts/generate-psl.mjs"]) {
      expect(read(f), f).toContain("SPDX-License-Identifier: MPL-2.0");
      expect(read(f), f).toContain("//! Generated from the Public Suffix List");
    }
  });
});

describe("licence declarations agree", () => {
  it.each([
    ["package.json", "AGPL-3.0-or-later"],
    ["workers/inbound-email/package.json", "AGPL-3.0-or-later"],
    ["extension/package.json", "MPL-2.0"],
    ["packages/detect/package.json", "Apache-2.0"],
    ["packages/mcp/package.json", "Apache-2.0"],
  ])("%s declares %s", (file, licence) => {
    expect(JSON.parse(read(file)).license).toBe(licence);
  });

  it("maps each directory to the same licence in REUSE.toml", () => {
    // Coarse on purpose: a TOML parser for one assertion is not worth a
    // dependency. Each block's path line is followed by its identifier.
    const toml = read("REUSE.toml");
    const pairs: [string, string][] = [
      ['path = "**"', "AGPL-3.0-or-later"],
      ['path = ["packages/detect/**", "packages/mcp/**"]', "Apache-2.0"],
      ['path = "extension/**"', "MPL-2.0"],
      ['path = ["docs/**", "messages/**"]', "CC-BY-SA-4.0"],
      ['path = "packages/detect/src/publicSuffixList.ts"', "MPL-2.0"],
    ];
    for (const [path, licence] of pairs) {
      const block = toml.slice(toml.indexOf(path));
      expect(toml, path).toContain(path);
      expect(block.match(/SPDX-License-Identifier = "([^"]+)"/)?.[1], path).toBe(licence);
    }
  });

  it("has the full text of every licence it names", () => {
    const ids = new Set(read("REUSE.toml").match(/(?<=SPDX-License-Identifier = ")[^"]+/g));
    for (const id of ids) {
      expect(existsSync(resolve(ROOT, "LICENSES", `${id}.txt`)), id).toBe(true);
    }
  });

  it("ships each published package's own licence and notice", () => {
    expect(words("LICENSE")).toBe(words("LICENSES/AGPL-3.0-or-later.txt"));
    expect(words("extension/LICENSE")).toBe(words("LICENSES/MPL-2.0.txt"));
    for (const pkg of ["detect", "mcp"]) {
      const dir = `packages/${pkg}`;
      expect(words(`${dir}/LICENSE`)).toBe(words("LICENSES/Apache-2.0.txt"));
      expect(JSON.parse(read(`${dir}/package.json`)).files).toEqual(
        expect.arrayContaining(["LICENSE", "NOTICE"]),
      );
    }
  });

  it("credits every bundled third party in NOTICE", () => {
    const notice = read("NOTICE");
    for (const name of ["Public Suffix List", "Tesseract", "tesseract.js", "libphonenumber-js"]) {
      expect(notice, name).toContain(name);
    }
  });
});
// REUSE-IgnoreEnd
