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
//     a release checklist;
//   - in CI a build always precedes these suites, so there a skip is not a
//     convenience — it means the build step moved or broke, and the publish
//     checks silently stopped running.
//
// Each file previously claimed in its header that its skip was "visible in the
// output". It was not. Two used a bare `describe.skipIf`, which reports the
// file as passed and folds the cases into a skipped count that scrolls past
// unread in a 151-file run. The third added a top-level `console.warn`, which
// vitest swallows — so it printed nothing at all, and the claim had never been
// true for any of them.
//
// A warning was the wrong instrument. What makes a skip visible is a test: the
// `describe` below always runs, names the missing build and the command that
// produces it, and passes locally while failing in CI.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";

/**
 * True when running in CI, where a build always precedes these suites.
 *
 * GitHub Actions sets CI=true, as does every other runner worth naming. The
 * value is only ever read to decide whether an absent build is tolerable, so
 * treating an unset variable as "local" is the safe direction: a missed CI
 * detection weakens this gate to a local one, while a false positive would
 * fail a contributor's first `npm test`.
 */
const inCI = process.env.CI === "true" || process.env.CI === "1";

/**
 * Gate a suite on a built artifact being present.
 *
 * Returns the `describe` to hang the artifact-dependent cases on — the real
 * one when the build is there, `describe.skip` when it is not — and registers
 * a always-running case that reports the skip.
 *
 * @param label  Short name for the suite, used in the reported messages.
 * @param probe  A path whose existence means the build is present.
 * @param build  The npm script that produces it, named in the failure.
 */
export function describeWhenBuilt(label: string, probe: string, build: string) {
  const built = existsSync(probe);

  // Always runs, in both states, so the gate itself is covered rather than
  // being the one piece of this file nothing checks.
  describe(`${label} — build gate`, () => {
    it("has the build its assertions read, or says which command makes it", () => {
      if (built) {
        expect(built).toBe(true);
        return;
      }
      // Locally this is information, not a failure: the checks below are
      // skipped and the reader is told why and how to run them.
      expect(
        inCI,
        `[${label}] the built artifact is absent, so its checks did not run. ` +
          `Run \`${build}\` before trusting a green run on a change that ` +
          `affects what ships.`,
      ).toBe(false);
    });
  });

  return built ? describe : describe.skip;
}
