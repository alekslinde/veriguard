#!/usr/bin/env npx tsx
//
// Metamorphic eval entrypoint.  npm run eval:metamorphic [-- options]
//
//   --suspicious-as=flagged|clean|abstain   how to count a "suspicious"
//                                           verdict (default: flagged)
//   --corpus=<dir>                          corpus directory
//   --only=<id,id>                          run just these transforms
//   --list                                  print the transforms and exit
//   --json                                  machine-readable output only
//   --seed=<n>                              composite sampling seed (default 1)
//   --stacks=<n>                            composite stacks to sample (default 60)
//   --depth=<a,b>                           composite stack depths (default 2,3)
//   --no-composites                         skip the composite family
//   --markdown                              append a job-summary report
//   --issue                                 refresh the composite-drift issue
//
// Runs three families in one pass:
//   · CONTENT relations (metamorphic.ts) — rewrite the message, hold the region.
//     Catches evasion.
//   · REGION relations (regionRelations.ts) — hold the message, vary the pack.
//     Catches pack leakage and suppressed base signals.
//   · COMPOSITE stacks (composite.ts) — several content transforms at once.
//     Catches evasion that no single transform reaches, because each step may
//     shed points legitimately while only the sum crosses a verdict threshold.
// Each is reported separately because they fail for different reasons and point
// at different files.
//
// ── Exit codes ───────────────────────────────────────────────────────────────
//
// Unlike the corpus eval there is no threshold to tune and no baseline to
// ratchet: a violation is a self-inconsistency, which is a bug rather than a
// trade-off someone chose. But the two CI roles need to tell two failures
// apart, so the composite family exits differently from the other two:
//
//   0  everything holds
//   1  a SINGLE-transform or REGION relation broke — deterministic, and a
//      function of the engine alone. On a PR this means "your diff broke it",
//      so it fails the build.
//   3  ONLY composite stacks broke. Composites are a sampled search, so a new
//      seed can surface a pre-existing bug with no code change. That is a real
//      finding but not this PR's fault, and failing the build on it teaches
//      people to re-run until green. The weekly job files an issue instead.
//   2  the harness itself broke (bad flags, unloadable corpus).
//
// A run breaking both reports 1, since the deterministic failure is the one to
// fix first and its cause is unambiguous.

import { join } from "node:path";
import { loadCorpus } from "@/eval/corpus";
import { runMetamorphic, formatSummary, formatViolations } from "@/eval/metamorphicRunner";
import { TRANSFORMS } from "@/eval/metamorphic";
import {
  runComposites,
  formatCompositeSummary,
  formatCompositeViolations,
} from "@/eval/metamorphicRunner";
import { sampleComposites } from "@/eval/composite";
import {
  runRegionRelations,
  formatRegionSummary,
  formatRegionViolations,
} from "@/eval/regionRelations";
import type { SuspiciousPolicy } from "@/eval/schema";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- shared .mjs helper, same import shape as check-promotion-freshness.ts
import { publishDigestIssue } from "./lib/digestIssue.mjs";

/** Region-relation ids, selectable via --only alongside transform ids. */
const REGION_RELATION_IDS = ["region-invariance", "coverage-monotonicity"];

const ROOT = process.cwd();
const args = process.argv.slice(2);

function flag(name: string): string | undefined {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

/**
 * A numeric flag, rejecting the empty string.
 *
 * `--stacks=` parses to "" rather than undefined, so `?? default` does not fire
 * (an empty string is not nullish) and `Number("")` is 0 — which sampled no
 * stacks, disabled the composite family and exited 0, looking exactly like a
 * passing run. An unset workflow input expands to precisely that, so this is a
 * shape CI can produce rather than only a typo.
 */
function numericFlag(name: string, fallback: number): number {
  const raw = flag(name);
  if (raw === undefined) return fallback;
  if (raw.trim() === "") {
    console.error(`--${name}= was given with no value.`);
    process.exit(2);
  }
  return Number(raw);
}

const suspiciousAs = (flag("suspicious-as") ?? "flagged") as SuspiciousPolicy;
const corpusDir = flag("corpus") ?? join(ROOT, "eval/corpus");
const only = flag("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const jsonOnly = args.includes("--json");
const markdown = args.includes("--markdown");
const issue = args.includes("--issue");
const noComposites = args.includes("--no-composites");
const seed = numericFlag("seed", 1);
const stackCount = numericFlag("stacks", 60);
const depthRaw = flag("depth") ?? "2,3";
const depths = depthRaw.split(",").map((s) => Number(s.trim()));

// Integers, not merely finite numbers. `Number("")` is 0, so `--stacks=` (a
// blank shell variable, which is exactly what an unset workflow input expands
// to) coerced to zero and silently disabled the whole composite family with a
// clean exit 0. And the sampler floors its indices, so `--seed=1.5` and
// `--seed=1.9` produce byte-identical samples to `--seed=1` — quietly breaking
// the seed-based reproducibility this feature is built on. Both are rejected
// rather than normalised: a run that searched nothing, or that did not search
// the ground its seed names, must not look like a passing run.
if (!Number.isInteger(seed)) {
  console.error(`--seed must be an integer (got "${flag("seed")}")`);
  process.exit(2);
}
if (!Number.isInteger(stackCount) || stackCount < 0) {
  console.error(`--stacks must be an integer >= 0 (got "${flag("stacks")}")`);
  process.exit(2);
}
if (depths.length === 0 || depths.some((d) => !Number.isInteger(d) || d < 2)) {
  console.error(`--depth takes integers >= 2 (a depth-1 stack is a single transform), got "${depthRaw}"`);
  process.exit(2);
}

if (args.includes("--list")) {
  for (const t of TRANSFORMS) console.log(`${t.id.padEnd(25)} ${t.relation.padEnd(10)} ${t.intent}`);
  for (const id of REGION_RELATION_IDS) {
    console.log(`${id.padEnd(25)} ${"region".padEnd(10)} varies the region pack, holds content fixed`);
  }
  process.exit(0);
}

if (!["flagged", "clean", "abstain"].includes(suspiciousAs)) {
  console.error(`--suspicious-as must be flagged, clean or abstain (got "${suspiciousAs}")`);
  process.exit(2);
}

if (only?.length) {
  const known = [...TRANSFORMS.map((t) => t.id), ...REGION_RELATION_IDS];
  const unknown = only.filter((id) => !known.includes(id));
  if (unknown.length > 0) {
    console.error(`Unknown relation(s): ${unknown.join(", ")}`);
    console.error(`Available: ${known.join(", ")}`);
    process.exit(2);
  }
}

async function main(): Promise<void> {
  const { cases, errors } = loadCorpus(corpusDir);
  if (errors.length > 0) {
    console.error(`Corpus validation failed (${errors.length}):`);
    errors.forEach((e) => console.error(`  ${e}`));
    process.exit(2);
  }

  const result = await runMetamorphic(cases, suspiciousAs, only);
  const regionResult = await runRegionRelations(cases, suspiciousAs, only);

  // Drawn from the same pool `--only` scopes, so narrowing a run to one
  // transform narrows its composites too rather than silently sampling the
  // full set alongside it.
  const pool = only?.length ? TRANSFORMS.filter((t) => only.includes(t.id)) : TRANSFORMS;
  const composites =
    noComposites || stackCount === 0 || pool.length < Math.min(...depths)
      ? []
      : sampleComposites(stackCount, depths, seed, pool);
  const compositeResult = await runComposites(cases, suspiciousAs, composites, seed);

  if (jsonOnly) {
    console.log(
      JSON.stringify(
        {
          checks:
            [...result.applied.values()].reduce((a, b) => a + b, 0) +
            [...regionResult.applied.values()].reduce((a, b) => a + b, 0) +
            [...compositeResult.applied.values()].reduce((a, b) => a + b, 0),
          violations: result.violations,
          applied: Object.fromEntries(result.applied),
          regionViolations: regionResult.violations,
          regionApplied: Object.fromEntries(regionResult.applied),
          compositeSeed: seed,
          compositeViolations: compositeResult.violations,
          compositeApplied: Object.fromEntries(compositeResult.applied),
        },
        null,
        2,
      ),
    );
  } else {
    // With --markdown, stdout is reserved for the job-summary block so the
    // workflow can redirect it into $GITHUB_STEP_SUMMARY without dragging the
    // full tables in. The tables still print — to stderr, where they show up in
    // the run log, which is where someone debugging a violation looks.
    const out = markdown ? console.error : console.log;
    out(`\nMetamorphic eval: ${cases.length} cases from ${corpusDir}`);
    out(`Suspicious counted as: ${suspiciousAs}`);
    out(formatSummary(result));
    out(formatViolations(result));
    out(formatRegionSummary(regionResult));
    out(formatRegionViolations(regionResult));
    if (composites.length > 0) {
      out(formatCompositeSummary(compositeResult));
      out(await formatCompositeViolations(compositeResult, cases, suspiciousAs));
    }
  }

  // ── Job summary ────────────────────────────────────────────────────────────

  if (markdown) {
    const lines = [
      "## Metamorphic eval",
      "",
      `Corpus: ${cases.length} cases · suspicious counted as \`${suspiciousAs}\``,
      "",
      "| Family | Checks | Violations |",
      "|---|---:|---:|",
      `| Single transforms | ${[...result.applied.values()].reduce((a, b) => a + b, 0)} | ${result.violations.length} |`,
      `| Region relations | ${[...regionResult.applied.values()].reduce((a, b) => a + b, 0)} | ${regionResult.violations.length} |`,
      `| Composite stacks (seed ${seed}) | ${[...compositeResult.applied.values()].reduce((a, b) => a + b, 0)} | ${compositeResult.violations.length} |`,
    ];
    if (compositeResult.violations.length > 0) {
      lines.push("", "### Composite violations", "");
      lines.push("Reproduce locally:", "", "```bash");
      lines.push(`npm run eval:metamorphic -- --seed=${seed} --stacks=${stackCount} --depth=${depths.join(",")}`);
      lines.push("```", "");
      for (const v of compositeResult.violations) {
        lines.push(
          `- **${v.caseId}** [${v.region}] \`${v.stack}\` — ${v.before.verdict} (${v.before.score}) → ${v.after.verdict} (${v.after.score})`,
        );
      }
      lines.push(
        "",
        "A composite violation is a stack of transforms that no single transform reaches. " +
          "Before treating it as an engine defect, check whether a transform's `applies` guard " +
          "should have excluded the composed input — the first such run was entirely harness artefact.",
      );
    }
    console.log(lines.join("\n"));
  }

  // ── Composite-drift issue ──────────────────────────────────────────────────
  //
  // Only the composite family gets an issue. The other two are deterministic and
  // already fail the build on the PR that caused them, so an issue would restate
  // a red check. Composites are the sampled search whose findings arrive without
  // a triggering diff, which is exactly what a long-lived digest issue is for.

  if (issue) {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY;
    if (!token || !repo) {
      console.error("--issue needs GITHUB_TOKEN and GITHUB_REPOSITORY.");
      process.exit(2);
    }
    // A search that did not run cannot certify anything clean. `--issue`
    // alongside --no-composites, --stacks=0, or an --only pool too small to
    // build a stack leaves `composites` empty by construction, violations at
    // zero, and would CLOSE the drift issue — auto-resolving an open finding
    // nobody looked at. Refuse instead: publishing a verdict from an empty
    // search is worse than not publishing one.
    if (composites.length === 0) {
      console.error(
        "--issue needs a composite search to report on, and none ran " +
          `(${noComposites ? "--no-composites" : stackCount === 0 ? "--stacks=0" : "the transform pool is smaller than the shallowest depth"}). ` +
          "Refusing to close the drift issue on an empty search.",
      );
      process.exit(2);
    }
    const clean = compositeResult.violations.length === 0;
    const body = clean
      ? `No composite violations at seed ${seed} (${[...compositeResult.applied.values()].reduce((a, b) => a + b, 0)} checks).`
      : [
          `Composite stacks found ${compositeResult.violations.length} violation(s) at **seed ${seed}**.`,
          "",
          "```bash",
          `npm run eval:metamorphic -- --seed=${seed} --stacks=${stackCount} --depth=${depths.join(",")}`,
          "```",
          "",
          ...compositeResult.violations.map(
            (v) =>
              `- **${v.caseId}** [${v.region}] \`${v.stack}\` — ${v.before.verdict} (${v.before.score}) → ${v.after.verdict} (${v.after.score})`,
          ),
          "",
          "**Triage first: is this the harness or the engine?** A stack can compose an input a " +
            "transform's `applies` guard was written to exclude but does not — the first composite " +
            "run's eight violations were all that artefact. The per-step trail in the run log names " +
            "the step that shed the points.",
        ].join("\n");

    try {
      const { number, action } = await publishDigestIssue({
        repo,
        token,
        label: "composite-drift",
        title: "🧬 Composite metamorphic drift",
        body,
        clean,
        extraLabels: ["detection"],
        labelColor: "5319e7",
        labelDescription: "Weekly composite metamorphic search found a stack that weakens a verdict",
        closeComment:
          "No composite violations in the latest search — closing. " +
          "Reopened automatically when a future seed finds one.",
      });
      console.error(number === null ? `Digest issue ${action}.` : `Digest issue #${number} ${action}.`);
    } catch (err) {
      console.error(`Failed to refresh digest issue: ${(err as Error).message}`);
      process.exit(2);
    }
  }

  // Deterministic failures outrank the sampled one — see the exit-code note at
  // the top. Reporting 1 when both broke keeps the unambiguous cause in front.
  const deterministic = result.violations.length + regionResult.violations.length;
  if (deterministic > 0) process.exit(1);
  process.exit(compositeResult.violations.length > 0 ? 3 : 0);
}

main().catch((err) => {
  console.error("Metamorphic eval failed:", err);
  process.exit(2);
});
