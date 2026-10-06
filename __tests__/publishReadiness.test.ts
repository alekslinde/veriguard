// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// What has to be true before either package goes to npm.
//
// A published version cannot be replaced and unpublishing is restricted after
// 72 hours, so the cost of getting one of these wrong is a dead version number
// and a migration note. Each assertion below is something that is cheap to
// check now and permanent to get wrong.
//
// The manifests' own shape is covered elsewhere — enginePublish.test.ts and
// mcpPublish.test.ts load the built artifacts. This file is about the release
// machinery around them: the support claim, the dependency ordering, and the
// workflows that do the publishing.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");
const json = (rel: string) => JSON.parse(read(rel));

const DETECT = json("packages/detect/package.json");
const MCP = json("packages/mcp/package.json");
const CI = read(".github/workflows/ci.yml");

const PACKAGES = [
  { name: "@veriguard/detect", manifest: DETECT, workflow: "publish-engine.yml" },
  { name: "@veriguard/mcp", manifest: MCP, workflow: "publish-mcp.yml" },
];

describe("the support claim matches what CI tests", () => {
  /** The Node versions the packages job actually runs. */
  const matrix = (() => {
    const job = CI.slice(CI.indexOf("  packages:"));
    const line = /node:\s*\[([^\]]+)\]/.exec(job);
    return line ? line[1].split(",").map((v) => Number(v.replace(/["'\s]/g, ""))) : [];
  })();

  it("finds the matrix to compare against", () => {
    // Guards against the job being renamed and every assertion below going
    // vacuous against an empty array.
    expect(matrix.length, "no node matrix found in the packages job").toBeGreaterThan(1);
  });

  it.each(PACKAGES)("$name claims no version CI leaves untested", ({ manifest }) => {
    // The claim was ">=18" while CI tested 22 alone — an untested support
    // claim, which fails later as somebody else's bug report rather than here.
    const claimed = Number(/>=\s*(\d+)/.exec(manifest.engines.node)?.[1]);
    expect(claimed, `engines.node is "${manifest.engines.node}", which this test cannot read`)
      .toBeGreaterThan(0);
    expect(
      Math.min(...matrix),
      `engines.node claims >=${claimed} but the lowest tested version is ${Math.min(...matrix)}`,
    ).toBe(claimed);
  });

  it.each(PACKAGES)("$name does not claim an end-of-life runtime", ({ manifest }) => {
    // Node 18 reached EOL in April 2025 and Node 20 in April 2026. Claiming a
    // dead version invites someone to start a project on it.
    const claimed = Number(/>=\s*(\d+)/.exec(manifest.engines.node)?.[1]);
    expect(claimed, `Node ${claimed} is end-of-life`).toBeGreaterThanOrEqual(22);
  });
});

describe("the packages can be installed in the order they are released", () => {
  it("pins the engine by a resolvable range, not a workspace link", () => {
    // `*` or `workspace:*` publishes a package nobody can install. npm does not
    // rewrite either on publish — only pnpm does — so this is the kind of thing
    // that ships and then costs a version number to fix.
    const range = MCP.dependencies["@veriguard/detect"];
    expect(range).toBeTruthy();
    expect(range, `"${range}" is not a semver range`).toMatch(/^\^?\d+\.\d+\.\d+/);
    expect(range).not.toContain("workspace:");
  });

  it("asks for an engine version that exists in this tree", () => {
    // The range has to be satisfiable by what is about to be released, or the
    // server is published against a version of the engine that was never cut.
    const range = MCP.dependencies["@veriguard/detect"].replace(/^\^/, "");
    const [rMajor, rMinor] = range.split(".").map(Number);
    const [dMajor, dMinor] = DETECT.version.split(".").map(Number);

    expect(dMajor, `engine is ${DETECT.version}, server wants ^${range}`).toBe(rMajor);
    expect(dMinor, `engine is ${DETECT.version}, server wants ^${range}`)
      .toBeGreaterThanOrEqual(rMinor);
  });

  it("makes the server's workflow refuse to run before the engine is published", () => {
    // Releasing the server first produces a package whose own dependency
    // cannot be resolved. The gate is in the workflow because the ordering is
    // not visible from either manifest alone.
    const mcp = read(".github/workflows/publish-mcp.yml");
    expect(mcp).toContain("npm view");
    expect(mcp).toMatch(/publish the engine first|approve its stage first/i);
  });
});

describe("releases are staged, not published", () => {
  it.each(PACKAGES)("$name stages rather than publishing outright", ({ workflow }) => {
    // A version on npm is permanent, so no workflow run — including one
    // started by a mistyped tag — should put code in front of users on its
    // own. `npm stage publish` holds the tarball until a maintainer approves
    // it with 2FA.
    const source = read(`.github/workflows/${workflow}`);
    expect(source).toContain("npm stage publish");
    expect(source, "a bare `npm publish` bypasses the approval gate")
      .not.toMatch(/run:\s*npm publish/);
  });

  it.each(PACKAGES)("$name authenticates by OIDC, with no token in the workflow", ({ workflow }) => {
    // An NPM_TOKEN is a long-lived credential that can leak. Trusted
    // publishing exchanges the Actions OIDC token for a short-lived one, so
    // there is nothing to leak and nothing to rotate. An empty NODE_AUTH_TOKEN
    // is worse than none: it reads as absent while implying a token signs
    // these releases.
    const source = read(`.github/workflows/${workflow}`);
    expect(source).toContain("id-token: write");
    const active = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("#"))
      .join("\n");
    expect(active, "a token is still wired into this workflow").not.toContain("NODE_AUTH_TOKEN");
    expect(active).not.toContain("NPM_TOKEN");
  });

  it.each(PACKAGES)("$name runs on a Node new enough for trusted publishing", ({ workflow }) => {
    // OIDC needs npm >= 11.5.1, and Node 22 bundles npm 10.x. On an old npm no
    // exchange happens, the PUT goes out unauthenticated, and the registry
    // answers 404 — which reads as "package missing", not "credential
    // missing", and sends you debugging the wrong thing entirely.
    const source = read(`.github/workflows/${workflow}`);
    const version = /node-version:\s*"?(\d+)"?/.exec(source)?.[1];
    expect(Number(version), `release job runs on Node ${version}`).toBeGreaterThanOrEqual(24);
  });

  it.each(PACKAGES)("$name asks for provenance explicitly", ({ workflow, manifest }) => {
    // Provenance ties the tarball to the commit and workflow that built it,
    // which is the check a consumer can make without trusting us. Passed at
    // the call site as well as set in the manifest, so a manifest edit cannot
    // silently drop it.
    expect(read(`.github/workflows/${workflow}`)).toContain("--provenance");
    expect(manifest.publishConfig?.provenance).toBe(true);
  });
});

describe("the manifests carry what a registry page needs", () => {
  it.each(PACKAGES)("$name is publishable and public", ({ manifest }) => {
    expect(manifest.private).toBeUndefined();
    expect(manifest.publishConfig?.access).toBe("public");
  });

  it.each(PACKAGES)("$name links back to its source", ({ manifest }) => {
    // Provenance requires `repository`; the rest is what makes the npm page
    // useful. `directory` has to track the package's real location — it was
    // packages/engine until the package was renamed.
    expect(manifest.repository?.url).toBeTruthy();
    // npm shows `homepage` as the package's docs link; both packages are
    // documented on the site's /packages page.
    expect(manifest.homepage).toBe("https://veriguard.app/packages");
    expect(manifest.bugs).toBeTruthy();
    expect(manifest.license).toBe("Apache-2.0");

    const dir = manifest.repository.directory;
    expect(dir, "repository.directory is missing").toBeTruthy();
    expect(
      () => readFileSync(path.join(ROOT, dir, "package.json")),
      `repository.directory points at ${dir}, which holds no package.json`,
    ).not.toThrow();
  });

  it.each(PACKAGES)("$name ships a licence and a readme", ({ manifest }) => {
    // Both are listed in `files`, and a listed file that does not exist is
    // simply absent from the tarball — no warning, no failure.
    for (const file of ["README.md", "LICENSE"]) {
      expect(manifest.files, `${file} is not in files`).toContain(file);
      expect(
        () => readFileSync(path.join(ROOT, manifest.repository.directory, file)),
        `${file} is listed in files but does not exist`,
      ).not.toThrow();
    }
  });
});
