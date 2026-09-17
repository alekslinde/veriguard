import { describe, it, expect, beforeAll } from "vitest";
import { ESLint } from "eslint";
import { readFileSync } from "fs";
import path from "path";
import projectConfig from "../eslint.config.mjs";

// The lint half of the privacy invariant.
//
// __tests__/privacyInvariant.test.ts enforces "a submitted URL is never
// visited" behaviourally, but it can only intercept global fetch — module
// mocking cannot reach a dynamic import inside already-loaded production code,
// so a leak through node:dns or node:net passes every test there. The route
// contract names "an outbound HTTP request, DNS lookup, or socket connection";
// the rules in eslint.config.mjs cover the two the test cannot.
//
// A lint rule protects nothing while it is misconfigured, so these tests run
// eslint for real against probe sources and assert on the parsed ruleIds. Two
// details are deliberate, both learned from getting them wrong:
//
//   · Assert on parsed messages[].ruleId, never a substring of the raw output.
//     A report echoes the probe's own source text, so a `toContain` check
//     passes when an unrelated rule fires and the privacy rule does not.
//
//   · Probes are linted as text at a virtual path, never written to disk. A
//     probe file written into lib/ or packages/ sits inside the tsconfig
//     include and the lint glob and is untracked, so an interrupted run
//     strands a rule-violating file that breaks the next lint and is
//     committable. Writing one under packages/ also raced
//     engineDependencies.test.ts, which walks that tree (readdirSync then
//     readFileSync per entry) while vitest runs files in parallel — a probe
//     present at listing time and gone before the read threw ENOENT there.
//     lintText has neither hazard: nothing is created for a run to strand or
//     another suite to trip over.

// Two linters, because the suites below assert different things.
//
// `rules` re-declares only the rules under test, so a failure cannot be an
// unrelated project rule firing — it verifies the rule BODIES. `project` runs
// the real shipped config, which is the only way to catch a mistake in its
// `files` globs. Each boots eslint once for the whole file; lintText against a
// warm instance costs ~2ms, so the probes are effectively free after that.
let rules: ESLint;
let project: ESLint;

beforeAll(() => {
  const block = projectConfig.find(
    (c): c is { rules: Record<string, unknown> } =>
      Boolean(c && typeof c === "object" && "rules" in c && c.rules && "no-restricted-syntax" in c.rules),
  );
  if (!block) throw new Error("eslint.config.mjs no longer carries a no-restricted-syntax block");

  rules = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: true,
    overrideConfig: [{ files: ["**/*.{ts,tsx}"], rules: block.rules }],
  });
  project = new ESLint({ cwd: process.cwd() });
});

const PRIVACY_RULES = new Set(["no-restricted-imports", "no-restricted-syntax"]);

interface LintMessage {
  ruleId: string | null;
  message: string;
}

/** Lint `source` as `filePath` and return every message reported. */
async function lintAs(linter: ESLint, source: string, filePath: string): Promise<LintMessage[]> {
  const results = await linter.lintText(source, { filePath, warnIgnored: false });
  // A harness failure — config error, parser missing, eslint crash — must not
  // read as "no violations", which is the assertion most of these tests make.
  if (results.length === 0) throw new Error(`eslint produced no result for ${filePath} — the probe did not run`);
  return results.flatMap((r) => r.messages);
}

function privacyViolations(messages: LintMessage[]): LintMessage[] {
  return messages.filter((m) => m.ruleId !== null && PRIVACY_RULES.has(m.ruleId));
}

/** Lint a probe against the rule bodies in isolation, at a bare path. */
const lint = (source: string) => lintAs(rules, source, "probe.ts");

const MODULES = ["dns", "node:dns", "net", "node:net", "https", "node:https", "tls", "node:tls"];

describe("static imports of Node network modules are rejected", () => {
  for (const mod of MODULES) {
    it(`rejects: import * as x from "${mod}"`, async () => {
      const found = privacyViolations(await lint(`import * as x from "${mod}";\nexport const y = x;\n`));
      expect(found.length, `importing ${mod} was not flagged`).toBeGreaterThan(0);
    });
  }
});

describe("dynamic access is rejected too — the vector the behavioural test cannot see", () => {
  // This is the shape that motivated the whole rule. no-restricted-imports only
  // sees static import statements, so without a syntax selector these slip
  // past lint AND past privacyInvariant.test.ts — enforced by neither half.
  for (const mod of ["node:dns", "dns", "node:net"]) {
    it(`rejects: await import("${mod}")`, async () => {
      const found = privacyViolations(await lint(`export async function f() { return import("${mod}"); }\n`));
      expect(found.length, `dynamic import of ${mod} was not flagged`).toBeGreaterThan(0);
    });

    it(`rejects: require("${mod}")`, async () => {
      const found = privacyViolations(await lint(`export function f() { return require("${mod}"); }\n`));
      expect(found.length, `require of ${mod} was not flagged`).toBeGreaterThan(0);
    });
  }

  it("rejects a submodule path such as dns/promises", async () => {
    const found = privacyViolations(await lint(`export async function f() { return import("dns/promises"); }\n`));
    expect(found.length).toBeGreaterThan(0);
  });
});

describe("the project config applies the rule to every detector file", () => {
  // The tests above re-declare the rules under their own glob, so they verify
  // the rule BODIES. They cannot see a mistake in the project config's `files`
  // globs — which were once "lib/**/*.ts" and "components/**/*.tsx", leaving
  // lib/lang.tsx and lib/richText.tsx unprotected. That needs linting a real
  // path with the real config, which is what this does.
  //
  // Every directory/extension combination the detector actually contains.
  // lib/*.tsx exists today (lang.tsx, richText.tsx), so it is not hypothetical.
  const COVERED = [
    "lib/__privacy_probe__.ts",
    "lib/__privacy_probe__.tsx",
    "app/__privacy_probe__.ts",
    "app/__privacy_probe__.tsx",
    "components/__privacy_probe__.ts",
    "components/__privacy_probe__.tsx",
  ];

  for (const relPath of COVERED) {
    it(`covers ${relPath}`, async () => {
      const found = privacyViolations(
        await lintAs(project, `import * as x from "node:dns";\nexport const y = x;\n`, relPath),
      );
      expect(found.length, `${relPath} is not covered by the config's files globs`).toBeGreaterThan(0);
    });
  }
});

describe("the rule explains itself and does not over-reach", () => {
  it("says why, so silencing it requires a deliberate decision", async () => {
    const found = privacyViolations(await lint(`import * as x from "node:dns";\nexport const y = x;\n`));
    expect(found.some((m) => m.message.includes("never-visit-a-submitted-URL"))).toBe(true);
  });

  it("still allows the non-network builtins the app legitimately uses", async () => {
    // crypto backs report IDs and the inbound webhook's timing-safe compare;
    // path resolves the OCR language data. Banning Node wholesale would break
    // real code and invite a blanket disable comment.
    //
    // The positive assertion first: this file must actually have been linted,
    // otherwise "no violations" is meaningless.
    const messages = await lint(
      `import { randomBytes } from "crypto";\n` +
        `import path from "path";\n` +
        `import { readFileSync } from "node:fs";\n` +
        `export const y = [randomBytes, path, readFileSync];\n`,
    );
    const control = privacyViolations(await lint(`import * as x from "node:dns";\nexport const y = x;\n`));
    expect(control.length, "control probe did not fire — the harness is broken").toBeGreaterThan(0);

    expect(privacyViolations(messages)).toEqual([]);
  });
});

// ── Scope, not just rule bodies ───────────────────────────────────────────────
//
// Everything above re-declares the rules against a bare path, which proves the
// rule *bodies* behave but says nothing about whether the project config still
// points them at the engine. Extracting the engine to packages/engine broke
// exactly that: the `files` globs listed lib/, app/ and components/, so the
// rules silently stopped covering the one module they exist for, and lint went
// on passing. A scope that no longer matches the code is indistinguishable from
// a scope that finds nothing.
//
// These run the *real* project config against the engine's own source path, so
// the assertion is "the shipped configuration protects this path" rather than
// "the rule works somewhere". The path need not exist: lintText resolves config
// for a virtual filePath, which is what makes probing the true location safe.
describe("the project config covers the engine's real location", () => {
  const ENGINE_PROBE = "packages/engine/src/__privacy_probe__.ts";

  it("covers the glob that covers the engine", () => {
    const config = readFileSync(path.join(process.cwd(), "eslint.config.mjs"), "utf8");
    expect(config).toContain('"packages/**/*.{ts,tsx}"');
  });

  it("flags a network import inside the engine", async () => {
    const found = privacyViolations(
      await lintAs(project, `import dns from "node:dns";\nexport const x = dns;\n`, ENGINE_PROBE),
    );
    expect(
      found.length,
      "the privacy rules do not cover the engine — check the `files` globs in eslint.config.mjs",
    ).toBeGreaterThan(0);
  });

  it("flags a dynamic network import inside the engine", async () => {
    const found = privacyViolations(
      await lintAs(project, `export async function f() { return import("node:net"); }\n`, ENGINE_PROBE),
    );
    expect(found.length).toBeGreaterThan(0);
  });

  it("leaves legitimate imports alone", async () => {
    expect(
      privacyViolations(
        await lintAs(
          project,
          `import { parsePhoneNumber } from "libphonenumber-js/max";\nexport const x = parsePhoneNumber;\n`,
          ENGINE_PROBE,
        ),
      ),
    ).toEqual([]);
  });
});
