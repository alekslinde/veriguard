// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Item 2 of the roadmap, settled 2026-09-05: this project does not quote a
// false-positive rate, a recall figure, or any aggregate detection metric.
//
// The decision is enforced here rather than left to the comments in the file,
// because the failure mode is silent. A gate re-added "just for AU" would pass
// every existing test, sit green for months at a limit nobody expects to bind,
// and put a quotable-looking number back in the repo — which is precisely the
// state the withdrawal ended.
//
// If a future corpus genuinely supports gating, the honest move is to delete
// this test as part of that change, with the corpus that justifies it in the
// same diff. That is a deliberate act. Editing thresholds.json alone is not.

const thresholds = JSON.parse(
  readFileSync(join(process.cwd(), "eval/thresholds.json"), "utf8"),
) as Record<string, unknown>;

const SECTIONS = ["region", "category", "type"] as const;

describe("detection thresholds stay withdrawn", () => {
  it("has every gate set to null", () => {
    for (const section of SECTIONS) {
      const slices = (thresholds[section] ?? {}) as Record<string, Record<string, unknown>>;
      for (const [slice, gates] of Object.entries(slices)) {
        for (const [metric, limit] of Object.entries(gates)) {
          expect(limit, `${section}.${slice}.${metric} must stay null`).toBeNull();
        }
      }
    }
  });

  it("keeps the reasoning in the file, not just the nulls", () => {
    // A bare set of nulls reads as an oversight. The prose is what stops someone
    // "fixing" it by filling the gates back in.
    for (const key of ["_decision", "_why", "_the_arithmetic", "_what_replaces_it"]) {
      expect(String(thresholds[key] ?? ""), `${key} is missing`).not.toBe("");
    }
  });

  it("states no numeric target to drift back toward", () => {
    // `_fpr_target: 0.02` used to sit here as an aspiration. Keeping a target
    // with no gate is how a number re-enters a claim sideways.
    expect(Object.keys(thresholds)).not.toContain("_fpr_target");
  });
});
