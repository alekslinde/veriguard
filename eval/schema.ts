// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

// Eval case schema and the verdict → prediction mapping.
//
// This tree is deliberately separate from __tests__/. Unit tests assert
// behaviour ("this input must raise that flag") and fail when a rule breaks.
// The eval asserts aggregate quality ("across the corpus, recall ≥ 0.90 and
// FPR ≤ 0.02") and fails when a change trades one against the other. Mixing
// them makes both harder to read: a red unit test is a bug, a red eval is a
// judgement call about an acceptable trade.
//
// Nothing here imports the scoring engine. Types and pure mapping only.

import type { CheckResult } from "@veriguard/detect/engineTypes";
import type { RegionCode } from "@veriguard/detect/regions";
import { REPORT_TYPES, type ReportType } from "@/lib/reportTypes";

/**
 * Ground truth is binary on purpose.
 *
 * The engine's verdict has four values and may grow more; the truth about a
 * message has two. Keeping them apart means the verdict taxonomy can change
 * without relabelling a single case — only toPrediction() below moves.
 */
export type Label = "scam" | "benign";

/**
 * One labelled case. JSONL on disk, one object per line, so appends don't
 * churn the file and a diff shows exactly which cases a PR added.
 */
export interface EvalCase {
  /** Stable, unique. Referenced by threshold breaches and regression diffs. */
  id: string;
  type: ReportType;
  /**
   * Required, never inferred. Coverage varies by region and changes what a
   * clean result *means*, so a case without a region can't be scored.
   */
  region: RegionCode;
  content: string;
  label: Label;
  /**
   * Lure family — "parcel-delivery", "tax-refund", "voice-clone". Free text
   * rather than an enum: new lures appear faster than we can maintain a union,
   * and an unknown category should be recordable the day it is first seen.
   * Slicing recall by this is where regressions actually surface; an overall
   * number can hold steady while one family collapses.
   */
  category?: string;
  /** Provenance: "report:<id>", "fixture:<file>", "uci-sms", "handwritten". */
  source: string;
  /** ISO date the case entered the corpus. */
  addedAt: string;
  /**
   * The scammer's own identifiers appearing in `content` — sender addresses,
   * callback numbers. Declared by hand, and checked at load: any PII-shaped
   * token not listed here fails the run.
   *
   * This exists because the corpus needs scam identifiers intact (emailHeaders
   * scores on the From/Reply-To pair) while never carrying a victim's. Making
   * the author name each one turns "is this PII safe" from an assumption into a
   * decision someone made on the record.
   */
  identifiers?: string[];
  notes?: string;
}

/**
 * Three outcomes, not two.
 *
 * `abstain` is what the coverage gate produces: under any coverage short of
 * `full` the engine correctly declines to assert anything, and scoring that
 * as a miss would make an honest pack look broken. CA ships coverage:"partial"
 * by design and `minimal` packs ship with no brand knowledge at all, so their
 * clean cases abstain in bulk — that belongs in a coverage metric, never in
 * recall.
 */
export type Prediction = "flagged" | "clean" | "abstain";

/** How `suspicious` is counted. See toPrediction. */
export type SuspiciousPolicy = "flagged" | "clean" | "abstain";

/**
 * Map an engine result onto a prediction.
 *
 * Coverage is checked before verdict: a "safe" produced with no rules to look
 * with is an absence of signal, not a finding, and scoreToResult already
 * downgrades it to "unknown". Reading coverage first keeps this honest even if
 * that downgrade is ever relaxed.
 *
 * `suspicious` is a genuine judgement call — the user sees a warning either
 * way, which argues for "flagged", but it is a softer claim than likely_scam.
 * It is a parameter rather than a decision so a run can measure how much the
 * headline numbers depend on it (`--suspicious-as=`).
 */
export function toPrediction(
  result: CheckResult,
  suspiciousAs: SuspiciousPolicy = "flagged",
): Prediction {
  // Inverted to "anything but full" so a tier added later abstains by default
  // rather than being silently scored as a confident prediction. Absent
  // coverage still reads as full, for results predating the field.
  if (result.coverage !== undefined && result.coverage !== "full") return "abstain";
  if (result.verdict === "unknown") return "abstain";
  if (result.verdict === "suspicious") return suspiciousAs;
  return result.verdict === "safe" ? "clean" : "flagged";
}

const VALID_TYPES = new Set<string>(REPORT_TYPES);
const VALID_LABELS = new Set<Label>(["scam", "benign"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate one parsed line. Returns the problems rather than throwing, so a
 * malformed corpus reports every bad case at once instead of one per run.
 */
export function validateCase(value: unknown, seenIds: Set<string>): string[] {
  const errors: string[] = [];
  if (typeof value !== "object" || value === null) return ["not an object"];
  const c = value as Partial<EvalCase>;

  if (typeof c.id !== "string" || !c.id) errors.push("id: required, non-empty string");
  else if (seenIds.has(c.id)) errors.push(`id: duplicate "${c.id}"`);

  if (typeof c.type !== "string" || !VALID_TYPES.has(c.type)) {
    errors.push(`type: must be one of ${[...VALID_TYPES].join(", ")}`);
  }
  // Region is validated as a non-empty string here, not against the supported
  // list: a case for a region we have not built a pack for yet is legitimate
  // corpus content, and resolveRegionPack degrades it to the fallback.
  if (typeof c.region !== "string" || !c.region) errors.push("region: required");
  if (typeof c.content !== "string" || !c.content.trim()) errors.push("content: required, non-empty");
  if (typeof c.label !== "string" || !VALID_LABELS.has(c.label as Label)) {
    errors.push("label: must be \"scam\" or \"benign\"");
  }
  if (typeof c.source !== "string" || !c.source) errors.push("source: required");
  if (typeof c.addedAt !== "string" || !ISO_DATE.test(c.addedAt)) {
    errors.push("addedAt: required, YYYY-MM-DD");
  }
  if (c.category !== undefined && typeof c.category !== "string") errors.push("category: string");
  if (c.identifiers !== undefined && (!Array.isArray(c.identifiers) || c.identifiers.some((i) => typeof i !== "string"))) {
    errors.push("identifiers: string[]");
  }
  if (c.notes !== undefined && typeof c.notes !== "string") errors.push("notes: string");

  return errors;
}
