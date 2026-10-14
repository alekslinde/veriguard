// SPDX-FileCopyrightText: 2026 Aleksandr Linde
// SPDX-License-Identifier: Apache-2.0

// A signal as a value, not a call site.
//
// Scoring today lives inline: 84 `sig.add` sites spread across four
// near-parallel `check*` functions in scamDetector.ts. A signal is therefore not
// a thing you can hold — it is a few lines in the middle of a large function —
// and anything that needs to reason about signals *as a set* has to reconstruct
// them by reading code. Three recurring defect classes share that one root:
//
//   · **A blanket channel multiplier.** The email path scores the body at 0.7×,
//     which is right for keyword-frequency signals and wrong for a gated
//     composite. Keeping it correct needs an exemption list matched by string
//     prefix, which has reached six entries — and this repo already knows that
//     shape: an exclusion list growing one entry per incident says the rule is
//     wrong, not that the list is short.
//   · **Restated guards.** Eight defects across three rules, all the same move:
//     a judgement already exists nearby in guarded form, and new code restates
//     it locally instead of calling it. The guard was not a callable thing.
//   · **Invisible overlap.** The body-splice rule and the hostname script-mixing
//     rule were written as counterparts, then double-scored one Cyrillic
//     character because a shared tokeniser handed both the same token. No signal
//     declares what it reads, so the overlap lived in neither rule.
//
// Each is a *structural* defect — the fault is in the seam between rules, not in
// any rule — and no harness here can see one, because every relation starts from
// a rule. The fix is therefore by construction rather than by measurement: make
// a signal declare its channels, its weight and its inputs, and all three defect
// classes stop being expressible.
//
// ## Status: declared, consuming nothing
//
// **Nothing in this file is wired into scoring yet, and that is deliberate.**
// It is step 1 of an incremental extraction: define the shape, convert nothing,
// so the shape can be reviewed against the existing engine before any scoring
// path moves. The region-pack language axis landed the same way — the type and
// its reasoning first, its first consumer a release later — and that ordering is
// what made the axis cheap to get right.
//
// The conversion order after this, smallest surface first:
//
//   2. `checkPhone` (88 lines, 10 sites) — the proof the shape holds.
//   3. The gated composites, where the channel-multiplier defects live. Each
//      entry's signal declares its own channel weight, and the exemption list is
//      deleted rather than extended.
//   4. The remaining single-condition signals, mechanically.
//   5. Serialise the registry in CI as the signal inventory.
//
// Every step is pinned by test before it is made, and verified by injecting the
// defect it should now prevent. A green suite is not evidence here: the splice
// rule shipped with five injection-verified guards and both harnesses green
// while its worst defect was a guard that did not exist.
//
// ## What does NOT change
//
// `checkUrl`, `checkSms`, `checkEmail`, `checkPhone`, `checkCustom` and
// `analyzeContent` keep their signatures. They are published on npm and bundled
// in a shipped extension, so merging them into one entry point — the right call
// for a greenfield build — would break a published API for an internal
// tidiness gain. Each `check*` becomes a channel preset over one signal list;
// the list goes in underneath.

import type { SignalSource } from "./engineTypes";
import type { RegionPack } from "./regions";

/**
 * Which surface the text arrived on.
 *
 * Today this exists only as `MessageCheckOptions.channel` (`"sms" | "email"`),
 * consulted by one guard, with the email path's weighting applied as a single
 * multiplier over a whole sub-result. Naming every channel here is what lets
 * weighting be a per-signal fact instead: the four `check*` entry points are
 * four channels over one list, not four implementations.
 *
 * `"custom"` is free text with no known provenance, which is weaker evidence
 * about *context* than an SMS — the user pasted something they cannot classify
 * — while saying nothing either way about the text itself.
 */
export type Channel = "url" | "sms" | "email" | "phone" | "custom";

export const CHANNELS: readonly Channel[] = ["url", "sms", "email", "phone", "custom"];

/**
 * What a signal reads.
 *
 * Declared so overlap becomes a lint rather than a probe finding. Two signals
 * consuming the same derived token from the same tokeniser is the shape that
 * double-scored a single Cyrillic character across the body-splice and
 * hostname-script rules, and it was invisible because the overlap was in neither
 * rule — it was in what they shared.
 *
 * The axis is the *input* a signal consumes, not the subject it reports on.
 * `SignalSource` (link, message, sender, phone, …) already names the surface a
 * reader can go look at themselves, and the two deliberately differ: the splice
 * rule reads `words` and reports on `message`.
 */
export type Reads =
  /** The registrable hostname, lowercased, trailing root dot stripped. */
  | "hostname"
  /** The full URL, lowercased — path and query included. */
  | "url"
  /** Message text, normalised and lowercased, for keyword matching. */
  | "body"
  /** Message text split into words — the shared tokeniser. */
  | "words"
  /** The text exactly as submitted, before any normalisation. */
  | "original"
  /** Parsed From / Reply-To / Return-Path. */
  | "headers"
  /** The phone number and its libphonenumber-derived intel. */
  | "phone";

/**
 * A signal's weight, per channel where it differs.
 *
 * A bare number means the same weight everywhere the signal runs. A partial
 * record states the exceptions, and the `default` key carries the rest.
 *
 * **This is the field that deletes the exemption list.** The email discount is
 * right for a keyword-frequency signal — a longer message has more room to use
 * an ordinary word, so a keyword hit really is weaker evidence there — and wrong
 * for a gated composite, whose false-positive rate does not rise with length.
 * Expressed as a blanket multiplier plus exemptions, that distinction lives
 * somewhere the signal's author is not looking, and six composites have had to
 * be added to the list one incident at a time. One of them, pitched at 25 to
 * clear `suspicious`, landed at 17 on the channel where the evasion it catches
 * is commonest.
 *
 * Stated here, the author declares the discount or declines it at the point they
 * are already choosing the number.
 */
export type Weight = number | ({ default?: number } & Partial<Record<Channel, number>>);

/**
 * Everything a signal is allowed to read, built once per check.
 *
 * The lossy-normalisation defect class is a missing context object and nothing
 * more. `new URL()` punycodes a non-ASCII hostname on parse, so by the time any
 * caller has normalised — which it must, to close percent-encoding tricks — the
 * Cyrillic characters that make a homoglyph domain detectable are gone, replaced
 * by an all-ASCII `xn--` label. A lookalike domain and an ordinary
 * internationalised one become indistinguishable. That produced five defects
 * from one root cause across three call sites, each fixed by threading the
 * original through to the one rule that needed it.
 *
 * Carrying both forms side by side is the fix stated once: `body` is normalised
 * because that is what keyword matching needs, `original` is untouched because
 * that is what character-shape rules need, and a signal says in `reads` which
 * one it is asking for. No rule re-derives either, so no rule can re-derive one
 * wrongly.
 */
export interface Context {
  channel: Channel;
  pack: RegionPack;

  /** As submitted. Never normalised — see the note above. */
  original: string;
  /** Normalised and lowercased, for keyword matching. */
  body: string;
  /** `body` split on the shared tokeniser. One source, so overlap is declarable. */
  words: readonly string[];

  /** Lowercased, trailing root dot stripped. Absent when there is no URL. */
  hostname?: string;
  /** The full lowercased URL, when one was parsed. */
  url?: string;
}

/** A signal's id. Stable and enumerable — the inventory is these, serialised. */
export type SignalId = string;

/**
 * One thing a signal found.
 *
 * Scores nothing: the weight is the signal's, declared once, so a hit cannot
 * disagree with it. `text` is reader-facing and already defanged where it quotes
 * user content.
 *
 * `scale` is for the signals whose strength genuinely varies with what they
 * found — a hosting provider with a per-provider score, a keyword rule counting
 * hits. It multiplies the declared weight. Defaulting to 1 keeps the common case
 * (a signal that either fires or does not) free of arithmetic.
 */
export interface Hit {
  text: string;
  source: SignalSource;
  scale?: number;
}

/**
 * A signal: an id, what it reads, where it runs, what it is worth, and a pure
 * function that finds it.
 *
 * `evaluate` returns hits and scores nothing, which is what makes the registry
 * serialisable as an inventory — every scoring fact is a field, readable without
 * running anything.
 */
export interface SignalDef {
  id: SignalId;
  /** The inputs this signal consumes. Checked against `Context` by `reads`. */
  reads: readonly Reads[];
  /** Channels this signal runs on. `"all"` is every channel in `CHANNELS`. */
  channels: readonly Channel[] | "all";
  weight: Weight;
  /**
   * Whether this signal is a claim about the world (a brand name, an agency, an
   * allowlist, a trusted suffix) or a rule that cannot go stale (character
   * shape, structure). The inventory separates them because the first kind needs
   * re-checking against reality on a schedule and the second does not.
   */
  kind: "structural" | "epistemic";
  /** Pure. Must not throw; a check that cannot answer returns no hits. */
  evaluate(ctx: Context): Hit[];
}

/** Does this signal run on this channel? */
export function runsOn(def: SignalDef, channel: Channel): boolean {
  return def.channels === "all" || def.channels.includes(channel);
}

/**
 * The weight this signal carries on this channel.
 *
 * A bare number is channel-independent. A record is read as: this channel's own
 * entry, else `default`, else 0 — and 0 means "declared not to run here", which
 * `runsOn` should already have decided. Nothing is multiplied after this, which
 * is the point: a weight read here is the weight that reaches the score.
 */
export function weightFor(def: SignalDef, channel: Channel): number {
  if (typeof def.weight === "number") return def.weight;
  return def.weight[channel] ?? def.weight.default ?? 0;
}

/**
 * Inputs a signal declares that this context cannot supply.
 *
 * A signal reading `hostname` on a context with no URL is not a bug — it simply
 * does not fire — but a signal reading `headers` that is declared to run on the
 * SMS channel is an authoring error, and this is what a test asks.
 */
export function missingReads(def: SignalDef, ctx: Context): Reads[] {
  const available = new Set<Reads>(["original", "body", "words"]);
  if (ctx.hostname !== undefined) available.add("hostname");
  if (ctx.url !== undefined) available.add("url");
  if (ctx.channel === "email") available.add("headers");
  if (ctx.channel === "phone") available.add("phone");
  return def.reads.filter((r) => !available.has(r));
}

/**
 * The registry: every signal, by id.
 *
 * **Empty, and the type is what matters until step 2.** A signal is registered
 * here only once its scoring has moved out of `scamDetector.ts` — a signal
 * present in both places would score twice, which is the defect class this
 * exists to prevent. The emptiness is therefore load-bearing, not a to-do:
 * `registryScore` over an empty list returns 0 and contributes nothing, so
 * results are identical to today's by construction.
 */
export const SIGNALS: readonly SignalDef[] = [];

/**
 * Ids registered more than once.
 *
 * An id is the inventory's primary key and the handle a test or a margin report
 * holds a signal by, so a duplicate silently makes one of them unaddressable.
 * Returned rather than thrown: the registry is module-level data, and a throw at
 * import time takes down every consumer including the test that would name the
 * problem.
 */
export function duplicateIds(defs: readonly SignalDef[] = SIGNALS): SignalId[] {
  const seen = new Set<SignalId>();
  const dupes = new Set<SignalId>();
  for (const def of defs) {
    if (seen.has(def.id)) dupes.add(def.id);
    seen.add(def.id);
  }
  return [...dupes];
}

/** One scored row: a hit, with the weight its signal declared. */
export interface ScoredHit extends Hit {
  id: SignalId;
  points: number;
}

/**
 * Score a context against a signal list.
 *
 * This is the whole scorer, and its shape is the argument for the refactor: the
 * channel appears exactly once, in `weightFor`, so there is no second place for
 * a multiplier to be applied and no list of signals to exempt from one. Signals
 * that do not run on this channel are skipped, not discounted.
 *
 * Returns rows rather than a total. The caller clamps — the ceiling is each
 * entry point's policy, not collection's — and records the clamp as its own
 * visible row, because evidence that does not sum to the headline score reads as
 * a bug to anyone checking our arithmetic, and we invite them to.
 */
export function registryScore(ctx: Context, defs: readonly SignalDef[] = SIGNALS): ScoredHit[] {
  const rows: ScoredHit[] = [];
  for (const def of defs) {
    if (!runsOn(def, ctx.channel)) continue;
    const weight = weightFor(def, ctx.channel);
    for (const hit of def.evaluate(ctx)) {
      rows.push({ ...hit, id: def.id, points: Math.round(weight * (hit.scale ?? 1)) });
    }
  }
  return rows;
}

/**
 * The registry as data — item 1's signal inventory, generated rather than
 * maintained.
 *
 * Deliberately excludes `evaluate`: the inventory is for diffing the scoring
 * surface across commits, and a function body is not comparable. Everything a
 * reader needs to ask "what does this engine score, on which channel, at what
 * weight" is a field, which is the property that makes the inventory free.
 */
export interface SignalInventoryEntry {
  id: SignalId;
  reads: Reads[];
  channels: Channel[];
  weights: Record<Channel, number>;
  kind: SignalDef["kind"];
}

export function signalInventory(defs: readonly SignalDef[] = SIGNALS): SignalInventoryEntry[] {
  return defs
    .map((def) => {
      const channels = CHANNELS.filter((c) => runsOn(def, c));
      return {
        id: def.id,
        reads: [...def.reads],
        channels,
        weights: Object.fromEntries(
          CHANNELS.map((c) => [c, channels.includes(c) ? weightFor(def, c) : 0]),
        ) as Record<Channel, number>,
        kind: def.kind,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
