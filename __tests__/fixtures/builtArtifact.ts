// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// The shared gate for the three suites that assert against a *built* artifact
// rather than source: the extension bundle, the published engine, and the
// published MCP server.
//
// All three want the same contract, and all three had written it slightly
// differently:
//
//   - a fresh clone running `npm test` is not blocked on a build step, so an
//     absent dist/ skips rather than fails;
//   - a skip that nobody notices is the failure mode worth preventing, because
//     a suite that quietly passes having checked nothing reads as coverage on
//     a release checklist.
//
// Each file previously claimed in its header that its skip was "visible in the
// output". It was not. Two used a bare `describe.skipIf`, which reports the
// file as passed and folds the cases into a skipped count that scrolls past
// unread in a 151-file run. The third added a top-level `console.warn`, which
// vitest swallows — so it printed nothing at all, and the claim had never been
// true for any of them.
//
// A warning was the wrong instrument. What makes a skip visible is a test: the
// `describe` below always runs and names the missing build and the command
// that produces it.
//
// WHAT THIS DOES NOT KEY ON: whether we are in CI.
//
// The first version of this gate failed when `CI=true` and a build was absent,
// on the premise that in CI a build always precedes these suites. That premise
// is false in every workflow this repo has. `npm test` runs BEFORE any build
// in ci.yml; publish-engine.yml builds only the engine before it;
// publish-mcp.yml builds the engine and the MCP server but not the extension;
// release.yml runs `ext:pack` but neither package build. Four jobs, four
// different subsets — so `CI` cannot distinguish "the build is missing because
// this job was meant to produce it" from "this job never builds this artifact,
// by design". Keying on it turned a correct tree red in all four.
//
// Reordering the workflows would not fix it either: each one legitimately
// builds only what it needs, and making all three build everything everywhere
// buys nothing but minutes. Only the job knows what it was supposed to build,
// so the job says so — per artifact, by name, through the environment variable
// below. Absent that declaration the gate reports and skips, which is the
// behaviour a contributor's first `npm test` should get.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

/**
 * Artifacts a workflow has declared it builds, as a comma-separated list of
 * the labels passed to `describeWhenBuilt`.
 *
 * A job that builds an artifact sets this to say so, and the gate then treats
 * an absent build as a failure rather than a skip — because there it means the
 * build step moved, broke, or emitted nothing, and the publish checks silently
 * stopped running. A job that does not build a given artifact leaves it out,
 * and that artifact's checks skip and report, exactly as they do locally.
 *
 * Example, for the job that builds both packages:
 *
 *   env:
 *     VERIGUARD_REQUIRE_BUILT: enginePublish,mcpPublish
 */
const required = new Set(
  (process.env.VERIGUARD_REQUIRE_BUILT ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean),
);

/**
 * Gate a suite on a built artifact being present.
 *
 * Returns the `describe` to hang the artifact-dependent cases on — the real
 * one when the build is there, `describe.skip` when it is not — and registers
 * an always-running case that reports the state either way.
 *
 * @param label  Short name for the suite. Used in the reported messages and as
 *               the name a workflow lists in VERIGUARD_REQUIRE_BUILT.
 * @param probe  A path whose existence means the build is present. Point this
 *               at a file the build emits, never at the output directory: an
 *               interrupted build leaves the directory there and the probe
 *               would call a partial build present, so the cases would run and
 *               fail on missing files instead of reporting the build absent.
 * @param build  The npm script that produces it, named in the failure.
 */
export function describeWhenBuilt(label: string, probe: string, build: string) {
  const built = existsSync(probe);
  const mustBeBuilt = required.has(label);

  // Always runs, in both states, so the gate itself is covered rather than
  // being the one piece of this file nothing checks.
  describe(`${label} — build gate`, () => {
    it("has the build its assertions read, or says which command makes it", () => {
      if (built) {
        expect(built).toBe(true);
        return;
      }
      // Declared as built by the job, but absent: the build step moved or
      // produced nothing, and these checks stopped running without saying so.
      // That is the case this gate exists to catch.
      expect(
        mustBeBuilt,
        `[${label}] VERIGUARD_REQUIRE_BUILT names this artifact, so this job ` +
          `is expected to have built it — but ${probe} is absent. The build ` +
          `step (\`${build}\`) did not run, failed, or no longer emits that ` +
          `file, and these checks have been silently skipped.`,
      ).toBe(false);

      // Not declared, so an absent build is information rather than a
      // failure: the checks below are skipped, and the test name plus this
      // annotation say which command would run them. Asserted as a pass on
      // the fact the gate did its job, so the case reads as a statement about
      // the gate rather than an assertion that the build is missing.
      expect(
        { label, built, skipped: true },
        `[${label}] the built artifact is absent, so its checks did not run. ` +
          `Run \`${build}\` before trusting a green run on a change that ` +
          `affects what ships.`,
      ).toEqual({ label, built: false, skipped: true });
    });
  });

  return built ? describe : describe.skip;
}
