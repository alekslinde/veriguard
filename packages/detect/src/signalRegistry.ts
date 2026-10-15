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
// ## Status: the phone channel is converted
//
// Incremental extraction, smallest surface first. Done:
//
//   1. The types and the scorer, consuming nothing.
//   2. `checkPhone` — its 7 observation signals, now `signals/phone.ts`. The
//      proof the shape holds, and the step that found its first limit: see the
//      note at the end of that file. The registry holds independent weighted
//      observations cleanly and has no shape yet for a signal whose weight
//      depends on the rest of the evidence list — which is why the other 3 of
//      the function's 10 sites stayed in the entry point.
//
//   3. The gated composites, in progress. Each entry's signal declares its own
//      channel weight, and `UNDISCOUNTED_COMPOSITES` loses an entry rather than
//      gaining one — four entries down to three. The ClickFix pair went first as
//      the smallest; the splice rule second, because it is the one whose scoring
//      shape does NOT fit the default. It finds a SET and scores it once, where
//      `registryScore` scores each hit at the declared weight, so the obvious
//      conversion turns a three-word splice into 75 points. One hit carrying the
//      word list in its prose is the answer, and the general lesson is that
//      `scale` is for a signal whose strength varies with what it found — not
//      every signal that finds more than one thing. See `signals/splicedWording`.
//
//      Both conversions hit the SAME defect, and neither was visible in the
//      code: `checkEmail` merges the whole SMS sub-result at 0.7, so a weight
//      the signal declared arrived multiplied by something that never knew the
//      signal existed — ClickFix's 50 as 35, the splice rule's 25 as 17. Found
//      both times by pinning the scores first and reading the failure. The fix
//      is for the entry point to score the registry's share outside the merge,
//      which is what keeps "a weight read from the registry is the weight that
//      reaches the score" true rather than merely intended.
//
// Remaining:
//
//   4. The remaining single-condition signals, mechanically.
//   5. Serialise the registry in CI as the signal inventory.
//
// ## The order-dependence question, answered
//
// Step 2 ended by recording that the registry had no shape for a signal whose
// weight depends on the rest of the evidence list, and three live instances.
// The answer, settled before converting anything in step 3 rather than during:
//
// **Those three stay in the entry point, and the field below is not for them.**
// The spoofing assessment, the "nothing found" floor and the clamp are
// pass-level policy — facts about a finished evidence list, not observations
// about the input — and `checkSms`'s deferred authority-mention rule already has
// a mechanism built for exactly its question (`addDeferred`/`resolveDeferred`,
// which settles once, after every rule has run, because asking mid-scan answers
// a different question and that distinction already cost a defect).
//
// This is option (b) from the note at the end of `signals/phone.ts`, with the
// risk that note names taken seriously rather than waved at: *the risk is that
// it becomes the default and the registry ends up holding only the easy half.*
// So the criterion is written down, and it is about the question a rule asks,
// not about how hard it is to convert:
//
//   · **A signal** reports an observation about the input. Its weight is a fact
//     it declares. It can be read, scored and inventoried without knowing what
//     else fired. → the registry.
//   · **Pass-level policy** answers a question about the finished list: what the
//     ceiling is, what the floor is, whether anything corroborated anything.
//     It owns no row of its own and cannot declare a weight. → the entry point,
//     and if it needs corroboration, `addDeferred` already exists.
//
// A signal that wants to know what else scored is one of those two things
// mislabelled, and the test for which is whether it has a weight of its own.
//
// What step 3 *did* need was narrower than the question step 2 asked, and it is
// worth separating because conflating them is how (b) becomes a dumping ground:
// the ClickFix variants are not order-dependent, they are **two readings of one
// fact**, where scoring both counts one lure twice. That is precedence, each
// weight still a declared fact — see `supersedes`. Had it been folded into the
// deferred mechanism it would have made a pure, inventoriable signal look like
// a rule that reads the scored rows, which is the opposite of the property this
// file is buying.
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

import type { EmailHeaders } from "./emailHeaders";
import type { SignalSource } from "./engineTypes";
import type { PhoneIntel } from "./phoneIntel";
import type { RegionPack } from "./regions";
import { CLICKFIX_SIGNALS } from "./signals/clickfix";
import { FAMILY_IMPERSONATION_SIGNALS } from "./signals/familyImpersonation";
import { PHONE_SIGNALS } from "./signals/phone";
import { SPLICED_WORDING_SIGNALS } from "./signals/splicedWording";
import { TASK_PAYMENT_SIGNALS } from "./signals/taskPayment";

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
  | "phone"
  /**
   * The engine's shared pack-entry matcher, for a signal that consults a pack
   * list rather than its own regex.
   *
   * The odd one out on this axis, and listed anyway. Every other member names
   * *text*; this names the rule by which an entry is found in text. It is here
   * because the alternative was measured and was worse: as a bare optional field
   * off this union, a signal needing it and a caller omitting it type-checked,
   * `registryProblems` reported nothing, `missingReads` reported nothing, and a
   * real scam scored **zero rows** with nothing anywhere saying why. That is
   * inert coverage the inventory reports as real — the exact shape this file
   * exists to make inexpressible, and the shape the channel-call check catches
   * in the other dimension.
   *
   * Declared, `registryScore`'s input gate skips the signal the same way it does
   * for a message with no hostname, and the omission is visible where an author
   * is already looking. Step 4 converts 75 keyword rules that all consult a pack
   * list, so this is the input most of the registry will end up declaring.
   */
  | "matches";

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
  /**
   * `body` split on the shared tokeniser. One source, so overlap is declarable.
   *
   * Optional, and absent rather than `[]` where the caller has not tokenised.
   * The distinction is load-bearing: an empty array says "tokenised, found no
   * words", which no real input produces, so a signal declaring `reads:
   * ["words"]` would be handed a clean answer to a question nobody asked and
   * score nothing — a silent miss, from a context that looked complete. Absent
   * means "not supplied here", and `registryScore` skips the signal, the same
   * way it does for a message with no hostname. Every other optional field on
   * this object already works that way; this one was a required field a caller
   * could satisfy with a plausible lie.
   */
  words?: readonly string[];

  /** Lowercased, trailing root dot stripped. Absent when there is no URL. */
  hostname?: string;
  /** The full lowercased URL, when one was parsed. */
  url?: string;
  /** Parsed From / Reply-To / Return-Path. Absent off the email channel. */
  headers?: EmailHeaders;
  /** The number and its libphonenumber-derived intel. Absent off the phone channel. */
  phone?: PhoneIntel;

  /**
   * How a pack entry is matched against text — the engine's shared matcher,
   * supplied rather than reimplemented.
   *
   * **Declared in `reads` as `"matches"`, and the first draft did not declare
   * it.** The argument then was that this is a capability rather than an input:
   * a signal using it still reads `body`, and what this names is the *rule* by
   * which an entry is found there. That reasoning is still why it sits oddly on
   * that union — but it was wrong about the consequence, and review measured it.
   * Undeclared, a signal needing the matcher and a caller omitting it
   * type-checked, `registryProblems` reported nothing, `missingReads` reported
   * nothing, and a real scam scored **zero rows** with nothing saying why.
   * Inert coverage the inventory reports as real, which is the shape this file
   * exists to make inexpressible — so the taxonomy bends and the input gate
   * holds. See `Reads`.
   *
   * It is a function on the context for one reason: the matcher it carries
   * (`mentions`) is ~250 lines in the entry point, memoises per message, and is
   * consulted by nearly every rule in the engine. A signal module cannot import
   * it without a cycle, and the third option — restating the rule locally — is
   * the single most expensive pattern in this repo, eight defects across three
   * rules. The rule itself is not restatable: it switches on whether the entry
   * is a single token, tolerates a closed set of inflections above a length
   * threshold, folds accents on both sides, and falls back to a stemmer on
   * English only. Every pack entry the family gate matches is multi-word
   * *today*, so the multi-word branch alone would pass every test here — and a
   * pack author adding a one-word pretext would silently cross into a branch the
   * copy never had. That is a rule with a silent expiry date, which this repo
   * has paid for four times.
   *
   * Step 4 converts 75 single-condition keyword rules, and all of them need this
   * same answer, so deciding it at one gate is the cheap place to decide it.
   * Passing the matcher keeps the alternative — moving the engine's most
   * load-bearing matcher in the same change as a composite conversion — out of a
   * step whose whole safety argument is one change at a time.
   *
   * Optional, and absent rather than a permissive stub where the caller has not
   * supplied it, for the reason `words` is: a stub that always returned false
   * would answer a question nobody asked and score nothing, which is a silent
   * miss from a context that looked complete.
   *
   * A signal that needs it declares `reads: ["matches", …]`, so `registryScore`
   * skips it on a context without one. The guard inside `evaluate` stays, and is
   * not redundant: it is what narrows the type, and deleting it is a type error.
   */
  matches?: (text: string, entry: string) => boolean;
}

/**
 * Which `Reads` this context can actually answer.
 *
 * Derived from what is present rather than from the channel, because the two
 * are not the same question: an SMS carrying a link has a hostname, and an
 * email whose headers failed to parse does not have headers. A rule that
 * inferred availability from the channel would be the restated-guard move this
 * file exists to remove — a judgement the context already decides properly,
 * approximated somewhere else.
 */
function available(ctx: Context): Set<Reads> {
  const set = new Set<Reads>(["original", "body"]);
  if (ctx.words !== undefined) set.add("words");
  if (ctx.matches !== undefined) set.add("matches");
  if (ctx.hostname !== undefined) set.add("hostname");
  if (ctx.url !== undefined) set.add("url");
  if (ctx.headers !== undefined) set.add("headers");
  if (ctx.phone !== undefined) set.add("phone");
  return set;
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
   * Ids this signal silences when it fires.
   *
   * For two signals that are readings of the SAME underlying fact, where firing
   * both would score one thing twice. The ClickFix pair is the case that forced
   * it: the Windows and macOS variants are one campaign described twice, and
   * campaigns ship per-OS instructions on one page, so a lure naming both is
   * the normal shape rather than a contrived input. Inline that was an
   * `else if`; two independent signals would both fire and score 100 for one
   * lure.
   *
   * **This is precedence, not order-dependence, and the distinction is the
   * whole reason it is a field.** A superseding signal's weight is still its
   * own declared fact — it does not change based on what else scored, so
   * `evaluate` stays pure and the inventory stays readable without running
   * anything. What is declared here is that two ids describe one fact and the
   * named one is the redundant reading. Resolved in `registryScore` from the
   * declarations, so the relationship is visible in the inventory instead of
   * living in the shape of an `if`/`else` chain somebody has to read.
   *
   * It is deliberately NOT the answer to the deferred-row question — see the
   * note below — and `registryProblems` rejects the shapes that would let it
   * drift into one.
   */
  supersedes?: readonly SignalId[];
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
 * entry, else `default`, else 0. Nothing is multiplied after this, which is the
 * point — a weight read here is the weight that reaches the score.
 *
 * Total and non-throwing, on the same terms as `duplicateIds`: the registry is
 * module-level data, so a throw from here fires at import time and takes down
 * every consumer including the test that would name the problem. The authoring
 * error it would have thrown on — a channel listed in `channels` with no weight
 * to go with it — is reported by `undeclaredWeights` instead.
 */
export function weightFor(def: SignalDef, channel: Channel): number {
  if (typeof def.weight === "number") return def.weight;
  return def.weight[channel] ?? def.weight.default ?? 0;
}

/**
 * Channels a signal says it runs on without saying what it is worth there.
 *
 * `weightFor` falls to 0 for these, which scores nothing and is the safe
 * direction — every guard here fails toward saying nothing. But silent is the
 * wrong *visibility*: a forgotten weight and a deliberate zero-point
 * contextual note are indistinguishable at the call site, and a signal in the
 * inventory with a channel listed and 0 against it reads as coverage that does
 * not exist. That is the shape of a defect this repo has paid for before — a
 * partial check reporting a clean sweep it never performed.
 *
 * A deliberate zero is declared as one (`{ sms: 0 }`), which says it on
 * purpose, where the author is already looking.
 */
export function undeclaredWeights(def: SignalDef): Channel[] {
  if (typeof def.weight === "number") return [];
  const weight = def.weight;
  if (weight.default !== undefined) return [];
  return CHANNELS.filter((c) => runsOn(def, c) && weight[c] === undefined);
}

/**
 * Inputs a signal declares that this particular context cannot supply.
 *
 * **A non-empty result is not a defect.** A signal reading `hostname` on a
 * message with no link is simply a signal that does not fire, which is the
 * common case and the reason `registryScore` skips rather than scores. Use
 * `unsatisfiableReads` to ask the authoring question.
 */
export function missingReads(def: SignalDef, ctx: Context): Reads[] {
  const supplied = available(ctx);
  return def.reads.filter((r) => !supplied.has(r));
}

/**
 * Inputs a signal declares that no context on its declared channels can ever
 * supply.
 *
 * This is the authoring error, and it is a different question from
 * `missingReads` — which was the whole of a review finding against the first
 * version of this file, where one function answered both and so could express
 * neither. "This email has no parsed headers" and "this signal reads headers on
 * the SMS channel" are not the same fault: the first is a signal correctly
 * staying quiet, the second is a signal that can never fire and will sit in the
 * inventory looking like coverage.
 *
 * Answered from the channel rather than from a context, because the claim is
 * about every context the signal will ever see. A signal declaring `"all"`
 * reaches the phone channel, where there is no body to match against — hence
 * `phone`-only reads being satisfiable only where the phone channel is among
 * those declared.
 *
 * **`words` is the one input the channel cannot answer for**, and that is new:
 * it became optional when both production callers turned out to supply a
 * plausible fake (`[number]`, `[]`) rather than a real tokenisation. Whether it
 * is available is now a fact about the *caller*, not the channel, so claiming
 * here that every channel can carry it would make this function assert
 * reachability it cannot see — the "partial check reporting a clean sweep"
 * shape, in the function whose whole job is to catch that. `tokenisedChannels`
 * is the parameter that lets a caller state what it actually supplies, and
 * `registryProblems` forwards it, so the escape hatch is reachable from the
 * check that is actually asserted rather than from this function alone.
 *
 * That forwarding was missing for one commit, and the gap is worth keeping a
 * note of because of its shape rather than its cost: this comment named a
 * `unsuppliedReads` that was never written, so the parameter had no production
 * route and the first `reads: ["words"]` signal would have been rejected with no
 * way to declare otherwise. **A comment naming the thing that enforces a rule is
 * not that thing** — the defect this file's own header is about, reproduced in
 * the file, two paragraphs below a warning about it. Nothing failed, because a
 * prose reference type-checks perfectly.
 */
export function unsatisfiableReads(
  def: SignalDef,
  /**
   * Channels on which some caller really does supply `words`.
   *
   * Defaults to none, which is the truth today: no production call site
   * tokenises. The default is deliberately the strict one — a signal declaring
   * `reads: ["words"]` is reported until a caller exists to feed it, rather
   * than passing quietly and sitting in the inventory looking like coverage.
   */
  tokenisedChannels: readonly Channel[] = [],
): Reads[] {
  const channels = def.channels === "all" ? CHANNELS : def.channels;
  /** Could a context on ANY declared channel carry this input? */
  const reachable = (r: Reads): boolean => {
    switch (r) {
      // Every channel has text, even if the phone channel's is a number.
      case "original":
      case "body":
        return true;
      case "words":
        return channels.some((c) => tokenisedChannels.includes(c));
      // A pack-entry match needs prose to match against, which every channel
      // but `phone` has. Answered from the channel rather than deferred to a
      // caller-supplied list the way `words` is, and the difference is that
      // every message entry point already holds this matcher — it is the engine's
      // own, not something a caller has to build — so "can a context on this
      // channel carry it" really is a fact about the channel. A signal declaring
      // it on `phone` alone can never fire.
      case "matches":
        return channels.some((c) => c !== "phone");
      // A link can appear in an SMS, an email or free text, and is the whole
      // input on the url channel. Never on the phone channel.
      case "hostname":
      case "url":
        return channels.some((c) => c !== "phone");
      case "headers":
        return channels.includes("email");
      case "phone":
        return channels.includes("phone");
    }
  };
  return def.reads.filter((r) => !reachable(r));
}

/**
 * The registry: every signal, by id.
 *
 * A signal is registered here only once its scoring has moved out of
 * `scamDetector.ts`. A signal present in both places would score twice, which
 * is the defect class this exists to prevent, so the two halves of each
 * conversion — the registration and the deletion of the inline site — belong in
 * one commit.
 *
 * Converted so far: the phone channel; the ClickFix pair and the spliced-wording
 * rule on the sms, email and custom channels; and the family-impersonation and
 * task-payment gates on sms and email. `scamDetector.ts` still owns the rest.
 */
export const SIGNALS: readonly SignalDef[] = [
  ...PHONE_SIGNALS,
  ...CLICKFIX_SIGNALS,
  ...SPLICED_WORDING_SIGNALS,
  ...FAMILY_IMPERSONATION_SIGNALS,
  ...TASK_PAYMENT_SIGNALS,
];

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

/**
 * Ways a `supersedes` declaration can be wrong.
 *
 * The field buys precedence without order-dependence, and these are the shapes
 * that would spend that back. Every one is silent at runtime — a signal that
 * quietly never scores, or a set that silence each other and all stay quiet —
 * which is the failure mode this repo keeps paying for: a partial check
 * reporting a clean sweep it never performed.
 *
 *   · **A dangling id.** Supersession that names nothing silences nothing, so
 *     the pair scores twice. This is what a rename produces, and renaming an
 *     id is cheap precisely because the registry made ids addressable.
 *   · **A cycle, of any length** — including a signal superseding itself, and
 *     including the mutual pair that was once the only case checked here. Every
 *     member is silenced by another, so none of them scores: a lure they all
 *     fire on scores zero. See `supersessionCycles`, and note that the
 *     two-member version is not a shorter form of this check — it was the bug.
 *   · **Supersession across channels.** Two signals that never run on the same
 *     channel cannot both fire, so the declaration is either a mistake about
 *     what the signals read or coverage being deleted on a channel where only
 *     one of them was ever going to speak.
 *
 * Reported rather than thrown, on the same terms as `duplicateIds`.
 */
export function supersessionProblems(defs: readonly SignalDef[] = SIGNALS): string[] {
  const problems: string[] = [];
  const byId = new Map(defs.map((d) => [d.id, d]));
  for (const def of defs) {
    for (const id of def.supersedes ?? []) {
      const target = byId.get(id);
      if (!target) {
        problems.push(`${def.id}: supersedes ${id}, which is not registered`);
        continue;
      }
      // Self-supersession is a cycle of length one and is reported as one, by
      // `supersessionCycles` alone — not here as well. The channel check below
      // would also be vacuously true of it (a signal always shares every
      // channel with itself), so letting it fall through would report the same
      // fault twice and under the wrong name.
      if (id === def.id) continue;
      const shared = CHANNELS.filter((c) => runsOn(def, c) && runsOn(target, c));
      if (shared.length === 0) {
        problems.push(`${def.id}: supersedes ${id}, which shares no channel with it`);
      }
    }
  }
  problems.push(...supersessionCycles(defs));
  return problems;
}

/**
 * Every id that lies on a supersession cycle, of any length.
 *
 * Shared by the authoring check and the scorer so the two cannot disagree about
 * what a cycle is — the scorer silences exactly the set this names, and
 * `supersessionProblems` reports exactly the same set as a fault. Two
 * independent notions of "cyclic" is how a guard ends up reporting a clean sweep
 * of something the runtime handled differently.
 *
 * Takes the edges as a map so both callers can pass what they have: the whole
 * registry when authoring, only the signals that fired when scoring. Each
 * caller drops edges to ids its own map does not hold — a dangling target is
 * reported separately and silences nothing.
 */
function cyclicMembers(edges: ReadonlyMap<SignalId, readonly SignalId[]>): Set<SignalId> {
  // An id is on a cycle exactly when it can reach itself. Computed as
  // reachability rather than by a depth-first walk carrying its path: the walk
  // needs a "already explored, skip" rule to stay cheap, and that rule is what
  // makes it miss a cycle reachable only through an already-finished node. The
  // registry is tens of signals with at most a couple of edges each, so the
  // direct formulation is both correct and free.
  const reach = new Map<SignalId, Set<SignalId>>();
  for (const id of edges.keys()) reach.set(id, new Set(edges.get(id) ?? []));
  // Transitive closure. Repeats until nothing new appears, which is bounded by
  // the number of pairs.
  let grew = true;
  while (grew) {
    grew = false;
    for (const targets of reach.values()) {
      for (const via of [...targets]) {
        for (const onward of reach.get(via) ?? []) {
          if (!targets.has(onward)) {
            targets.add(onward);
            grew = true;
          }
        }
      }
    }
  }
  return new Set([...reach.keys()].filter((id) => reach.get(id)?.has(id)));
}

/** The edges `cyclicMembers` walks, as the authoring check sees them. */
const edgesOf = (defs: readonly SignalDef[]): Map<SignalId, readonly SignalId[]> =>
  new Map(defs.map((d) => [d.id, (d.supersedes ?? []).filter((id) => defs.some((o) => o.id === id))]));

/**
 * Supersession cycles, of any length.
 *
 * The first version compared each pair and so saw only direct mutual
 * supersession, while its own comment claimed to catch cyclic. A three-signal
 * cycle passed clean and made `registryScore` return **nothing** — every member
 * silenced by the one before it, so a lure every signal in the cycle fired on
 * scored zero. Total, silent loss of coverage, which is precisely what the
 * check exists to prevent; the two-member special case was the shape of the bug
 * rather than a short version of the fix.
 *
 * Reported as the cycle's members, sorted, once per cycle: the fault belongs to
 * the set of declarations, and naming one member as the culprit would send a
 * reader to whichever file happened to be first.
 */
function supersessionCycles(defs: readonly SignalDef[]): string[] {
  const members = cyclicMembers(edgesOf(defs));
  if (members.size === 0) return [];
  // Named as one finding listing every id involved, sorted. The fault belongs to
  // the set of declarations, so singling out a member would send a reader to
  // whichever file happened to be declared first — and reporting once per
  // member would make one mistake look like three.
  const named = [...members].sort((a, b) => a.localeCompare(b, "en")).join(" → ");
  return [
    `${named}: supersession cycle, so every member silences another and none can score`,
  ];
}

/**
 * Every authoring error in a signal list, as one answer.
 *
 * The questions a registry entry can get wrong — a duplicate id, a read nothing
 * can satisfy, a channel with no weight, a supersession that silences the wrong
 * thing or nothing — asked together, because a caller that has to remember four
 * calls will eventually make three. A test asserts this is empty, so no step
 * from 2 onward can register a broken signal.
 */
export function registryProblems(
  defs: readonly SignalDef[] = SIGNALS,
  /**
   * Channels on which some caller really does supply `words`.
   *
   * Forwarded to `unsatisfiableReads`, which is the only way a `reads:
   * ["words"]` signal can ever pass authoring — reachability for that one input
   * is a fact about the caller, not the channel, so somebody has to state it.
   * Omitted, it is the strict `[]`, which is the truth today: no production call
   * site tokenises.
   *
   * Step 4 of the conversion is where this gets an argument, from whichever
   * entry point first builds a real `Context.words`. Until then the default is
   * what should be passed, and a signal reading `words` is correctly reported
   * rather than sitting in the inventory looking like coverage.
   */
  tokenisedChannels: readonly Channel[] = [],
): string[] {
  const problems: string[] = [];
  for (const id of duplicateIds(defs)) problems.push(`${id}: registered more than once`);
  for (const def of defs) {
    const unreachable = unsatisfiableReads(def, tokenisedChannels);
    if (unreachable.length) {
      problems.push(`${def.id}: reads ${unreachable.join(", ")}, unreachable on its channels`);
    }
    const unweighted = undeclaredWeights(def);
    if (unweighted.length) {
      problems.push(`${def.id}: runs on ${unweighted.join(", ")} with no weight declared`);
    }
  }
  problems.push(...supersessionProblems(defs));
  return problems;
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
 * Evaluate everything, then resolve supersession, then score — so that neither
 * what fires nor what it is worth depends on where a signal sits in the list.
 *
 * Returns rows rather than a total. The caller clamps — the ceiling is each
 * entry point's policy, not collection's — and records the clamp as its own
 * visible row, because evidence that does not sum to the headline score reads as
 * a bug to anyone checking our arithmetic, and we invite them to.
 */
export function registryScore(ctx: Context, defs: readonly SignalDef[] = SIGNALS): ScoredHit[] {
  // Which signals fired, evaluated once, before anything is scored.
  //
  // **Two passes, and the second one is not an optimisation to collapse.** The
  // first version resolved supersession inline, in registration order, and a
  // test caught what the behavioural pin could not: a superseded signal listed
  // BEFORE the one superseding it had already scored by the time the winner was
  // reached. That makes the order of a list a scoring rule — the
  // implicit-in-control-flow property this whole file exists to delete,
  // reappearing one level down, and invisible because the live registry's order
  // happened to be the safe one. Deciding from the finished set of hits is what
  // makes `supersedes` a declaration rather than a side effect of where a
  // signal was declared.
  //
  // `evaluate` is called exactly once per signal, here, so a pure function is
  // never run twice for one check and a silenced signal costs one call, not two.
  const fired = new Map<SignalId, { def: SignalDef; hits: Hit[] }>();
  for (const def of defs) {
    if (!runsOn(def, ctx.channel)) continue;
    // An input the context cannot supply means the signal cannot have looked,
    // so it does not get to score. Enforced here rather than left to each
    // `evaluate` to remember: a signal reading `hostname` on a message with no
    // link would otherwise depend on its own body guarding a field the type
    // says is optional, and "every evaluate checks its own inputs" is exactly
    // the kind of rule stated in a comment that this file exists to turn into
    // something the code enforces.
    if (missingReads(def, ctx).length > 0) continue;
    const hits = def.evaluate(ctx);
    if (hits.length > 0) fired.set(def.id, { def, hits });
  }

  // Only a signal that fired AND survived gets to silence another.
  //
  // "Fired" alone is not enough, and the difference is a real loss of coverage
  // rather than a tidiness point. With `a supersedes b` and `b supersedes c` all
  // firing, silencing straight from the fired set lets `b` suppress `c` even
  // though `b` was itself suppressed and scores nothing — so one hit is
  // deduplicated into zero hits by a signal the reader never sees. A silenced
  // signal is one the engine decided was the redundant reading; it does not then
  // get a say in what else is redundant.
  //
  const silencedBy = (id: SignalId): readonly SignalId[] => fired.get(id)?.def.supersedes ?? [];
  /** Who, among the fired, declares they supersede this one. */
  const claimants = (id: SignalId): SignalId[] =>
    [...fired.keys()].filter((other) => silencedBy(other).includes(id));

  // Resolved by memoised recursion on the one-sentence rule, so the answer is a
  // property of the declarations and not of the order they are visited in:
  //
  //   survives(x)  ⟺  no claimant of x survives
  //
  // A signal nothing claims survives (the base case, vacuously). Otherwise it
  // survives exactly when every signal declaring it redundant has itself been
  // ruled out. Memoised per call, so each signal is decided once.
  //
  // A cycle has no base case to unwind to, so its members are identified first
  // and all of them silenced, before the recursion runs. Cutting the recursion
  // instead — answering "does not survive" on re-entry — gives an answer that
  // depends on which member the walk happened to start from, which is the exact
  // property this field was added to avoid. `supersessionProblems` rejects every
  // cycle so none reaches production; this is deterministic anyway, because "the
  // other check prevents it" is the kind of rule stated in a comment that this
  // file exists to stop relying on.
  //
  // Two earlier formulations were wrong in ways worth not repeating. Sweeping
  // the silenced set off repeatedly oscillated on a cycle's parity — a 3-cycle
  // resolved to "all score", a 2-cycle to "none". Growing a surviving set
  // greedily ("nothing surviving claims it *yet*") let whichever cycle member
  // was visited first survive, and broke the chain case in reverse declaration
  // order.
  const inCycle = cyclicMembers(
    new Map([...fired].map(([id, { def }]) => [
      id,
      (def.supersedes ?? []).filter((target) => fired.has(target)),
    ])),
  );
  const decided = new Map<SignalId, boolean>();
  const survives = (id: SignalId): boolean => {
    const memo = decided.get(id);
    if (memo !== undefined) return memo;
    // Settled before recursing, so a cycle can neither be entered nor
    // contribute: silenced is the conservative direction, scoring nothing
    // rather than twice.
    if (inCycle.has(id)) {
      decided.set(id, false);
      return false;
    }
    // Provisional entry guards nothing here — the graph is acyclic once cycle
    // members are out — but keeps a malformed graph from recursing forever.
    decided.set(id, false);
    const answer = !claimants(id).some(survives);
    decided.set(id, answer);
    return answer;
  };
  const silenced = new Set([...fired.keys()].filter((id) => !survives(id)));

  const rows: ScoredHit[] = [];
  // Scored in registration order, which is the order the evidence list renders
  // in and the order the inline branches this replaces were written in.
  for (const def of defs) {
    const entry = fired.get(def.id);
    if (!entry) continue;
    if (silenced.has(def.id)) continue;
    const { hits } = entry;
    const weight = weightFor(def, ctx.channel);
    // Rounded once over the signal's whole contribution, with each row taking
    // the running remainder, so the rows sum to the rounded total exactly.
    // Rounding per row instead let a fractional `scale` drift off the declared
    // weight — two hits at `scale: 0.5` against weight 25 gave 13 + 13 = 26,
    // which is a signal scoring more than it declared. The evidence list is
    // rendered to a reader who is invited to check that it adds up, so a row
    // that does not belong to a visible total is the failure mode here.
    let handed = 0;
    hits.forEach((hit, i) => {
      const cumulative = hits
        .slice(0, i + 1)
        .reduce((n, h) => n + weight * (h.scale ?? 1), 0);
      const points = Math.round(cumulative) - handed;
      handed += points;
      rows.push({ ...hit, id: def.id, points });
    });
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
  /**
   * Always present, `[]` where nothing is superseded.
   *
   * Serialised because without it the inventory reads two ClickFix signals at
   * 50 each as 100 of available score against one lure, which is the kind of
   * wrong number item 1's margin report would then build on. A key that appears
   * only sometimes also makes a diff of this artefact noisier than the change
   * it is reporting.
   */
  supersedes: SignalId[];
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
        // Sorted for the same reason the entries are: this file exists to be
        // diffed, and a list whose order follows the declaration would report a
        // change when a declaration was merely reordered.
        supersedes: [...(def.supersedes ?? [])].sort((a, b) => a.localeCompare(b, "en")),
      };
    })
    // Collation pinned, not defaulted. This artefact exists to be diffed
    // across commits, so a sort that follows the runtime's locale reports a
    // change that did not happen whenever a dev machine and CI disagree —
    // a spurious diff in the one file whose only job is to make a real diff
    // visible. `phoneIntel` pins `["en"]` on Intl for the same reason.
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
}
