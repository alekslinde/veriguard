import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { SUBJECTS, report, reviewedDate } from "../scripts/check-readme-freshness";

// The checker's own failure mode is silence: if SUBJECTS drifts from the repo,
// it reports "everything current" while checking nothing. These assert the
// wiring, not the freshness — a stale README is a maintenance signal, never a
// failing build.

const ROOT = resolve(__dirname, "..");

describe("README freshness wiring", () => {
  it("lists every README tracked in the repo", async () => {
    // A new README that nobody adds here is invisible to the check forever,
    // which is the quiet way this stops working.
    const { execFileSync } = await import("node:child_process");
    const tracked = execFileSync("git", ["ls-files", "*README.md"], { cwd: ROOT, encoding: "utf8" })
      .split("\n")
      .filter(Boolean);
    const covered = SUBJECTS.map((s) => s.readme).sort();
    expect(covered).toEqual(tracked.sort());
  });

  it("points every subject path at something that exists", () => {
    // A subject that has been moved or renamed dates the README against
    // nothing, and the row silently reads as current.
    for (const { readme, subject } of SUBJECTS) {
      for (const path of subject) {
        expect({ readme, path, exists: existsSync(resolve(ROOT, path)) }).toEqual({
          readme,
          path,
          exists: true,
        });
      }
    }
  });

  it("never dates a README against itself", () => {
    // The subject is what the README documents. If the README's own directory
    // is the subject, editing the file marks it fresh — the check would then
    // certify any edit as a review.
    for (const { readme, subject } of SUBJECTS) {
      expect({ readme, selfReferential: subject.includes(readme) }).toEqual({
        readme,
        selfReferential: false,
      });
    }
  });

  it("reads a marker where one is present", () => {
    // Pins the marker format the convention documents, so a reformat that
    // breaks parsing shows up here rather than as a permanent "never".
    expect(reviewedDate("docs/threat-intel/README.md")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("reports a row per README, with a verdict for each", () => {
    const rows = report();
    expect(rows).toHaveLength(SUBJECTS.length);
    for (const row of rows) {
      expect(typeof row.stale).toBe("boolean");
    }
  });

  it("treats a missing marker as stale", () => {
    // "Never reviewed" must not read as "current" — there is nothing to
    // compare against, which is the least safe state, not the safest.
    const rows = report([
      { readme: "package.json", subject: ["packages/engine/src"] },
    ]);
    expect(rows[0]).toMatchObject({ reviewed: null, stale: true });
  });
});
