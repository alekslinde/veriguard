// Composite metamorphic transforms — stacks of the single transforms in
// metamorphic.ts, applied one after another to the same case.
//
// Why this exists as its own family
// ─────────────────────────────────
// The single transforms ask "does this one trick work?". Every one of them
// currently holds. That is a weaker result than it looks, because a relation
// holding individually does not make it hold in composition: each step may
// legitimately shed a few points — an obfuscation penalty that does not fire
// twice, a keyword discount, a rule that stops matching — while no single step
// crosses a verdict threshold. Stack four and the sum can cross it, with every
// constituent check still green.
//
// That is also what an evader actually does. Nobody picks one trick; they
// rewrite the message until it gets through, which means zero-width spaces AND
// a homoglyph AND benign padding AND a forward wrapper, on one text. The
// single-transform suite cannot see that message, and `forwarded-prefix` says
// so in its own comment: it is scoped narrowly precisely because the composites
// are where it was meant to earn its keep.
//
// What makes a composite sound
// ────────────────────────────
// Three things, all of which the runner enforces rather than assumes:
//
//   1. The relation of a stack is its WEAKEST member. equal ∘ equal is equal —
//      two meaning-preserving rewrites still mean the same thing. Any noWeaker
//      in the stack makes the whole stack noWeaker, because that step is
//      permitted to raise the score and the composite inherits the permission.
//
//   2. Applicability is re-checked at every step, against the CURRENT text
//      rather than the original. `applies` takes a case, so step 2 is asked
//      about a case whose content is step 1's output — not the corpus content.
//      Skipping that produces "transformed" inputs that were only partly
//      transformed, and a violation reported against one of those is the
//      harness's bug, not the engine's.
//
//   3. A step that no-ops abandons the whole stack rather than shortening it.
//      A depth-3 stack that silently became depth-1 would be reported under a
//      label naming three transforms, and the reproduction would not match.
//
// Ordering is part of the attack, not an implementation detail: defanging a URL
// and then recasing the host is a different string from recasing then defanging
// (the second may not find a URL to defang at all). So stacks are ordered
// samples, and the id records the order.

import { TRANSFORMS, type Relation, type Transform } from "./metamorphic";
import type { EvalCase } from "./schema";

/** A stack of single transforms, applied left to right. */
export interface Composite {
  /** Stable id naming the members in order: "zero-width+benign-padding". */
  id: string;
  members: Transform[];
  /** The weakest member's relation — see note 1 above. */
  relation: Relation;
}

/**
 * The weakest relation in a stack.
 *
 * `equal` is the strong claim (the verdict may not move at all) and `noWeaker`
 * the weak one (it may rise but not fall), so any single `noWeaker` member
 * relaxes the whole composite. Asserting `equal` over a stack containing an
 * obfuscation step would file every correct obfuscation penalty as a failure —
 * the same trap the single-transform suite avoids by scoping relations per
 * transform.
 */
export function weakestRelation(members: Transform[]): Relation {
  return members.some((m) => m.relation === "noWeaker") ? "noWeaker" : "equal";
}

/**
 * Deterministic PRNG (mulberry32).
 *
 * Sampling stacks at random needs the run to be reproducible: a violation found
 * in CI has to be replayable locally from the seed alone, and a suite whose
 * membership changes per run would ratchet against itself. Node has no seedable
 * Math.random, and a 32-bit generator is ample for choosing list indices.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over a copy, drawing from the supplied PRNG. */
function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Sample distinct stacks of the given depths.
 *
 * Sampled rather than exhaustive: depth 2 and 3 over 14 transforms is 182 +
 * 2184 ordered stacks, and running all of them against every case would take
 * the suite from hundreds of checks to hundreds of thousands. A sample large
 * enough to find a systematic composition failure is the right trade, and the
 * seed makes it reproducible; raise `count` to search harder.
 *
 * Members within a stack are distinct. Applying `zero-width` twice tests the
 * transform's own idempotence, not composition, and most such stacks no-op at
 * step 2 and get discarded anyway.
 */
export function sampleComposites(
  count: number,
  depths: readonly number[],
  seed: number,
  pool: readonly Transform[] = TRANSFORMS,
): Composite[] {
  const rand = mulberry32(seed);
  const seen = new Set<string>();
  const out: Composite[] = [];

  // Bounded rather than while(out.length < count): at small pool sizes or high
  // depth the distinct-stack space can be smaller than `count`, and an
  // unbounded loop would spin forever rather than returning what exists.
  const maxAttempts = count * 50;
  for (let attempt = 0; attempt < maxAttempts && out.length < count; attempt++) {
    const depth = depths[Math.floor(rand() * depths.length)];
    if (pool.length < depth) continue;
    const members = shuffled(pool, rand).slice(0, depth);
    const id = members.map((m) => m.id).join("+");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, members, relation: weakestRelation(members) });
  }
  return out;
}

/** Why a stack produced no check, for coverage reporting. */
export type StackOutcome =
  | { ok: true; content: string; steps: string[] }
  | { ok: false; reason: "not-applicable" | "no-op"; failedAt: string };

/**
 * Run a stack over one case, re-deriving applicability at each step.
 *
 * The synthetic case handed to `applies` carries the running content with every
 * other field of the original left intact. Both halves matter: `type` and
 * `label` decide scope for most transforms and are properties of the case
 * rather than the text, while `content` must be the current string so a
 * transform that needs a URL is asked whether THIS text still has one.
 */
export function applyStack(c: EvalCase, comp: Composite): StackOutcome {
  let content = c.content;
  const steps: string[] = [];

  for (const t of comp.members) {
    if (!t.applies({ ...c, content })) {
      return { ok: false, reason: "not-applicable", failedAt: t.id };
    }
    const next = t.apply(content);
    if (next === null || next === content) {
      return { ok: false, reason: "no-op", failedAt: t.id };
    }
    content = next;
    steps.push(t.id);
  }

  return { ok: true, content, steps };
}
