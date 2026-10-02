#!/usr/bin/env npx tsx
// SPDX-FileCopyrightText: 2026 Aleks Linde
// SPDX-License-Identifier: AGPL-3.0-or-later

//
// Corpus eval entrypoint.  npm run eval [-- options]
//
//   --suspicious-as=flagged|clean|abstain   how to count a "suspicious"
//                                           verdict (default: flagged)
//   --corpus=<dir>                          corpus directory
//   --update-baseline                       rewrite eval/baseline.json
//   --json                                  machine-readable output only
//
// Exits non-zero on a threshold breach, a corpus validation error, or a
// regression against the committed baseline.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadCorpus } from "@/eval/corpus";
import { runCorpus } from "@/eval/runner";
import { computeMetrics, sliceBy, type Metrics } from "@/eval/metrics";
import {
  checkThresholds,
  formatOverall,
  formatSliceTable,
  formatMisses,
  formatAbstentions,
  type Breach,
  type Thresholds,
} from "@/eval/report";
import type { SuspiciousPolicy } from "@/eval/schema";

const ROOT = process.cwd();
const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

const suspiciousAs = (flag("suspicious-as") ?? "flagged") as SuspiciousPolicy;
const corpusDir = flag("corpus") ?? join(ROOT, "eval/corpus");
const updateBaseline = args.includes("--update-baseline");
const jsonOnly = args.includes("--json");

if (!["flagged", "clean", "abstain"].includes(suspiciousAs)) {
  console.error(`--suspicious-as must be flagged, clean or abstain (got "${suspiciousAs}")`);
  process.exit(2);
}

async function main(): Promise<void> {
  // ── Load ──────────────────────────────────────────────────────────────────────

  const { cases, errors } = loadCorpus(corpusDir);
  if (errors.length > 0) {
    console.error(`Corpus validation failed (${errors.length}):`);
    errors.forEach((e) => console.error(`  ${e}`));
    process.exit(2);
  }

  // ── Run ───────────────────────────────────────────────────────────────────────

  const outcomes = await runCorpus(cases, suspiciousAs);
  const overall = computeMetrics(outcomes);

  const byRegion = new Map<string, Metrics>();
  for (const [region, group] of sliceBy(outcomes, (o) => o.case.region)) {
    byRegion.set(region, computeMetrics(group));
  }

  const byType = new Map<string, Metrics>();
  for (const [key, group] of sliceBy(outcomes, (o) => `${o.case.region}/${o.case.type}`)) {
    byType.set(key, computeMetrics(group));
  }

  const byCategory = new Map<string, Metrics>();
  for (const [key, group] of sliceBy(outcomes, (o) => o.case.category ?? "(uncategorised)")) {
    byCategory.set(key, computeMetrics(group));
  }

  // ── Gate ──────────────────────────────────────────────────────────────────────

  interface ThresholdFile {
    region?: Record<string, Thresholds>;
    category?: Record<string, Thresholds>;
    type?: Record<string, Thresholds>;
  }
  const thresholds = JSON.parse(
    readFileSync(join(ROOT, "eval/thresholds.json"), "utf8"),
  ) as ThresholdFile;

  // Every printed slice is gated, not just the regional one. Category is where
  // a regression actually surfaces first: overall recall can hold steady while
  // one lure family collapses, and gating only by region would let that ship.
  const breaches: Breach[] = [];
  const gate = (
    rows: Map<string, Metrics>,
    config: Record<string, Thresholds> | undefined,
    prefix: string,
  ): void => {
    if (!config) return;
    for (const [slice, m] of rows) {
      const t = config[slice];
      if (t) breaches.push(...checkThresholds(`${prefix}${slice}`, m, t));
    }
  };
  gate(byRegion, thresholds.region, "");
  gate(byCategory, thresholds.category, "category ");
  gate(byType, thresholds.type, "type ");

  // ── Baseline ratchet ──────────────────────────────────────────────────────────
  //
  // The question asked of a PR is not "is this good" but "is this worse than what
  // we had". Per-case predictions are recorded so a diff names the cases that
  // flipped, which is the actionable form — an aggregate delta says something
  // moved without saying what.

  const baselinePath = join(ROOT, "eval/baseline.json");
  interface Baseline {
    generatedAt: string;
    suspiciousAs: string;
    predictions: Record<string, string>;
  }

  const current: Baseline = {
    generatedAt: new Date().toISOString().slice(0, 10),
    suspiciousAs,
    predictions: Object.fromEntries(outcomes.map((o) => [o.case.id, o.prediction])),
  };

  const regressions: string[] = [];
  if (existsSync(baselinePath) && !updateBaseline) {
    const prev = JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
    if (prev.suspiciousAs !== suspiciousAs) {
      console.error(
        `Baseline was recorded with --suspicious-as=${prev.suspiciousAs}; comparing against ${suspiciousAs} is not meaningful.`,
      );
      process.exit(2);
    }
    for (const o of outcomes) {
      const before = prev.predictions[o.case.id];
      if (before === undefined) continue; // new case: nothing to regress from
      const wasRight =
        (o.case.label === "scam" && before === "flagged") ||
        (o.case.label === "benign" && before === "clean");
      const isRight =
        (o.case.label === "scam" && o.prediction === "flagged") ||
        (o.case.label === "benign" && o.prediction === "clean");
      if (wasRight && !isRight) {
        regressions.push(`  ${o.case.id}  ${before} → ${o.prediction}  [${o.case.region}/${o.case.type}]`);
      }
    }
  }

  if (updateBaseline) {
    writeFileSync(baselinePath, JSON.stringify(current, null, 2) + "\n");
    console.log(`Baseline written: ${baselinePath} (${outcomes.length} cases)`);
  }

  // ── Output ────────────────────────────────────────────────────────────────────

  if (jsonOnly) {
    console.log(
      JSON.stringify(
        {
          overall,
          byRegion: Object.fromEntries(byRegion),
          byType: Object.fromEntries(byType),
          byCategory: Object.fromEntries(byCategory),
          breaches,
          regressions: regressions.length,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`\nCorpus: ${cases.length} cases from ${corpusDir}`);
    console.log(`Suspicious counted as: ${suspiciousAs}`);
    console.log(formatOverall(overall));
    console.log(formatSliceTable("By region", byRegion));
    console.log(formatSliceTable("By region/type", byType));
    console.log(formatSliceTable("By category", byCategory));
    console.log(formatAbstentions(outcomes));
    console.log(formatMisses(outcomes));

    if (breaches.length > 0) {
      console.log(`\nThreshold breaches (${breaches.length}):`);
      for (const b of breaches) {
        const dir = b.metric === "fpr" ? "above" : "below";
        console.log(
          `  ${b.slice}: ${b.metric} ${(b.actual * 100).toFixed(1)}% is ${dir} the limit of ${(b.limit * 100).toFixed(1)}%` +
            (b.inconclusive
              ? " — but the limit is inside the 95% interval, so this slice may just be too small to tell"
              : ""),
        );
      }
    }
    if (regressions.length > 0) {
      console.log(`\nRegressions against baseline (${regressions.length}):`);
      regressions.forEach((r) => console.log(r));
      console.log(`\n  If intended, re-record with: npm run eval -- --update-baseline`);
    }
    if (breaches.length === 0 && regressions.length === 0) console.log("\nPASS\n");
    else console.log("");
  }

  process.exit(breaches.length > 0 || regressions.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Eval failed:", err);
  process.exit(2);
});
