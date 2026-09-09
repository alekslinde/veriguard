// Runs the metamorphic relations and reports violations.

import { scoreContent, type Scored } from "./runner";
import { TRANSFORMS, type Relation, type Transform } from "./metamorphic";
import { applyStack, type Composite } from "./composite";
import type { EvalCase, SuspiciousPolicy } from "./schema";

/**
 * Verdict severity. Shared with the runner's card reduction in spirit but kept
 * separate on purpose: that one ranks cards inside a single result, this one
 * compares two whole results, and collapsing them would tie the relation
 * semantics to a detail of how cards are picked.
 */
const RANK: Record<string, number> = { safe: 0, unknown: 1, suspicious: 2, likely_scam: 3 };

export interface Violation {
  caseId: string;
  transform: string;
  intent: string;
  relation: Relation;
  region: string;
  before: Scored;
  after: Scored;
  transformed: string;
  original: string;
}

/**
 * Whether a transformation broke its relation.
 *
 * Both relations are judged on the verdict, not the score. The score is an
 * internal quantity a user never sees, and it moves for legitimate reasons —
 * an obfuscation penalty, a signal that fires twice on padded text. Gating on
 * it would bury the failures that matter under churn. The verdict is what the
 * product asserts, so it is what must hold.
 */
function violates(relation: Relation, before: Scored, after: Scored): boolean {
  if (relation === "equal") return before.verdict !== after.verdict;
  return (RANK[after.verdict] ?? 0) < (RANK[before.verdict] ?? 0);
}

export interface MetamorphicResult {
  violations: Violation[];
  /** Checks actually run, per transform — the denominator for a rate. */
  applied: Map<string, number>;
  /** Cases a transform declined, so a silent no-op is visible as coverage. */
  skipped: Map<string, number>;
}

export async function runMetamorphic(
  cases: EvalCase[],
  suspiciousAs: SuspiciousPolicy,
  only?: string[],
): Promise<MetamorphicResult> {
  const active: Transform[] = only?.length
    ? TRANSFORMS.filter((t) => only.includes(t.id))
    : TRANSFORMS;

  const violations: Violation[] = [];
  const applied = new Map<string, number>();
  const skipped = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const c of cases) {
    // Scored once per case rather than once per transform: the engine is a pure
    // function of (content, region) here, so the original's verdict cannot
    // differ between transforms.
    const before = await scoreContent(c.content, c.region, suspiciousAs);

    for (const t of active) {
      if (!t.applies(c)) {
        bump(skipped, t.id);
        continue;
      }
      const transformed = t.apply(c.content);
      if (transformed === null || transformed === c.content) {
        bump(skipped, t.id);
        continue;
      }

      bump(applied, t.id);
      const after = await scoreContent(transformed, c.region, suspiciousAs);
      if (violates(t.relation, before, after)) {
        violations.push({
          caseId: c.id,
          transform: t.id,
          intent: t.intent,
          relation: t.relation,
          region: c.region,
          before,
          after,
          transformed,
          original: c.content,
        });
      }
    }
  }

  return { violations, applied, skipped };
}

// ── Reporting ────────────────────────────────────────────────────────────────

const pct = (n: number, d: number) => (d === 0 ? "  n/a" : `${((n / d) * 100).toFixed(1).padStart(5)}%`);

/** One row per transform: how many checks ran and how many broke. */
export function formatSummary(r: MetamorphicResult): string {
  const byTransform = new Map<string, number>();
  for (const v of r.violations) byTransform.set(v.transform, (byTransform.get(v.transform) ?? 0) + 1);

  const lines = [
    "",
    "Transform                 Relation    Checks  Violations   Rate",
    "─".repeat(66),
  ];

  for (const t of TRANSFORMS) {
    const ran = r.applied.get(t.id) ?? 0;
    // A transform that never applied is not passing — it is untested, and
    // printing it as a clean 0/0 would read as evidence it holds.
    if (ran === 0 && !r.skipped.has(t.id)) continue;
    const bad = byTransform.get(t.id) ?? 0;
    const mark = ran === 0 ? "  (never applied)" : bad > 0 ? "  ←" : "";
    lines.push(
      `${t.id.padEnd(25)} ${t.relation.padEnd(10)} ${String(ran).padStart(6)}  ${String(bad).padStart(10)}  ${pct(bad, ran)}${mark}`,
    );
  }

  const totalChecks = [...r.applied.values()].reduce((a, b) => a + b, 0);
  lines.push("─".repeat(66));
  lines.push(
    `${"TOTAL".padEnd(25)} ${"".padEnd(10)} ${String(totalChecks).padStart(6)}  ${String(r.violations.length).padStart(10)}  ${pct(r.violations.length, totalChecks)}`,
  );
  return lines.join("\n");
}

/** Truncate for terminal display, marking the cut so nothing looks complete. */
const clip = (s: string, n = 88) => {
  const flat = s.replace(/\n/g, "\\n");
  return flat.length <= n ? flat : `${flat.slice(0, n)}…`;
};

/**
 * Every violation in full.
 *
 * Printed rather than summarised because each one is a reproducible bug report:
 * the transformed string is the failing input, and a reader needs to see it to
 * judge whether the relation or the engine is wrong.
 */
export function formatViolations(r: MetamorphicResult): string {
  if (r.violations.length === 0) return "\nNo violations.\n";

  const lines = [`\nViolations (${r.violations.length}):`];
  for (const v of r.violations) {
    const arrow = v.relation === "equal" ? "must match" : "must not weaken";
    lines.push("");
    lines.push(`  ${v.caseId}  [${v.region}]  ${v.transform} — ${arrow}`);
    lines.push(`    ${v.intent}`);
    lines.push(`    ${v.before.verdict} (${v.before.score}) → ${v.after.verdict} (${v.after.score})`);
    lines.push(`    before: ${clip(v.original)}`);
    lines.push(`    after:  ${clip(v.transformed)}`);
  }
  return lines.join("\n");
}

// ── Composite relations ──────────────────────────────────────────────────────

/**
 * A violated composite. Carries the member ids and the surviving step list so a
 * reader can replay the stack, and the seed is printed once per run.
 */
export interface CompositeViolation extends Omit<Violation, "transform" | "intent"> {
  /** The stack, in application order: "zero-width+benign-padding". */
  stack: string;
  /** Steps that actually changed the text — equal to the stack when ok. */
  steps: string[];
}

export interface CompositeResult {
  violations: CompositeViolation[];
  /** Stacks that ran end to end, per stack id. */
  applied: Map<string, number>;
  /** Stacks abandoned mid-way, per stack id — coverage, not passing. */
  abandoned: Map<string, number>;
  seed: number;
  stacks: number;
}

/**
 * Run sampled composite stacks over the corpus.
 *
 * Reuses `violates` rather than restating the relation semantics: a composite's
 * verdict rule is exactly a single transform's, applied to the weakest member's
 * relation. Duplicating it here would let the two families drift apart, and the
 * failure mode of that drift is a composite suite that quietly stops asserting
 * anything.
 */
export async function runComposites(
  cases: EvalCase[],
  suspiciousAs: SuspiciousPolicy,
  composites: Composite[],
  seed: number,
): Promise<CompositeResult> {
  const violations: CompositeViolation[] = [];
  const applied = new Map<string, number>();
  const abandoned = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

  for (const c of cases) {
    const before = await scoreContent(c.content, c.region, suspiciousAs);

    for (const comp of composites) {
      const outcome = applyStack(c, comp);
      if (!outcome.ok) {
        bump(abandoned, comp.id);
        continue;
      }

      bump(applied, comp.id);
      const after = await scoreContent(outcome.content, c.region, suspiciousAs);
      if (violates(comp.relation, before, after)) {
        violations.push({
          caseId: c.id,
          stack: comp.id,
          steps: outcome.steps,
          relation: comp.relation,
          region: c.region,
          before,
          after,
          transformed: outcome.content,
          original: c.content,
        });
      }
    }
  }

  return { violations, applied, abandoned, seed, stacks: composites.length };
}

/**
 * Composite summary.
 *
 * Rows are ranked by violations then checks, and only stacks that actually ran
 * are listed: a sampled suite has many stacks that no case can satisfy (a phone
 * reformatter over a URL-only corpus), and printing every one would bury the
 * result. The abandoned total is reported as a single figure instead, because
 * it is a property of the sample rather than of any one stack.
 */
export function formatCompositeSummary(r: CompositeResult): string {
  const byStack = new Map<string, number>();
  for (const v of r.violations) byStack.set(v.stack, (byStack.get(v.stack) ?? 0) + 1);

  const ran = [...r.applied.entries()].sort(
    (a, b) => (byStack.get(b[0]) ?? 0) - (byStack.get(a[0]) ?? 0) || b[1] - a[1],
  );

  const totalChecks = [...r.applied.values()].reduce((a, b) => a + b, 0);
  const totalAbandoned = [...r.abandoned.values()].reduce((a, b) => a + b, 0);

  const lines = [
    "",
    `Composite stacks (seed ${r.seed}, ${r.stacks} sampled, ${ran.length} exercised)`,
    "",
    "Stack                                              Rel        Checks  Violations",
    "─".repeat(80),
  ];

  // Only the stacks that violated, plus the busiest clean ones, so the table
  // stays readable at any sample size. A clean run still shows its coverage
  // through the TOTAL row.
  const shown = ran.filter(([id]) => (byStack.get(id) ?? 0) > 0).slice(0, 25);
  const rest = ran.length - shown.length;

  for (const [id, checks] of shown) {
    const bad = byStack.get(id) ?? 0;
    const rel = r.violations.find((v) => v.stack === id)?.relation ?? "";
    lines.push(
      `${id.length > 48 ? `${id.slice(0, 47)}…` : id.padEnd(48)} ${rel.padEnd(10)} ${String(checks).padStart(6)}  ${String(bad).padStart(10)}  ←`,
    );
  }
  if (shown.length === 0) lines.push("  (no stack violated)");
  if (rest > 0) lines.push(`  … and ${rest} further stack(s) with no violation`);

  lines.push("─".repeat(80));
  lines.push(
    `${"TOTAL".padEnd(48)} ${"".padEnd(10)} ${String(totalChecks).padStart(6)}  ${String(r.violations.length).padStart(10)}`,
  );
  lines.push(`  ${totalAbandoned} stack application(s) abandoned mid-way (step not applicable, or no-op).`);
  return lines.join("\n");
}

/**
 * Every composite violation in full.
 *
 * The per-step breakdown is the part that makes one actionable: knowing that
 * `zero-width+benign-padding+quoted-reply` slipped through is a bug report,
 * but the reader still has to find WHICH step shed the points. Rescoring each
 * prefix costs one call per step and turns the report into the diagnosis.
 */
export async function formatCompositeViolations(
  r: CompositeResult,
  cases: EvalCase[],
  suspiciousAs: SuspiciousPolicy,
): Promise<string> {
  if (r.violations.length === 0) return "\nNo composite violations.\n";

  const byId = new Map(cases.map((c) => [c.id, c]));
  const lines = [`\nComposite violations (${r.violations.length}):`];

  for (const v of r.violations) {
    const arrow = v.relation === "equal" ? "must match" : "must not weaken";
    lines.push("");
    lines.push(`  ${v.caseId}  [${v.region}]  ${v.stack} — ${arrow}`);
    lines.push(`    ${v.before.verdict} (${v.before.score}) → ${v.after.verdict} (${v.after.score})`);

    const c = byId.get(v.caseId);
    if (c) {
      let content = c.content;
      const trail: string[] = [`${v.before.verdict} (${v.before.score}) original`];
      for (const id of v.steps) {
        const t = TRANSFORMS.find((x) => x.id === id);
        const next = t?.apply(content);
        if (!next) break;
        content = next;
        const s = await scoreContent(content, c.region, suspiciousAs);
        trail.push(`${s.verdict} (${s.score}) after ${id}`);
      }
      lines.push(`    steps: ${trail.join("  →  ")}`);
    }

    lines.push(`    before: ${clip(v.original)}`);
    lines.push(`    after:  ${clip(v.transformed)}`);
  }
  return lines.join("\n");
}
